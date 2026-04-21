"""AG-UI Playground Backend Server.

Exposes AG-UI endpoints:
- /chat      - Dynamic chat endpoint (reads forwardedProps for model mode, HITL, etc.)
- /state     - Shared state agent (data viz) with predictive updates + smart deltas

Managed with UV: `uv run server.py`
MCP server must be running on :8889: `uv run python mcp_server.py`
"""

import copy
import json
import logging
import os
from collections import OrderedDict
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import jsonpatch
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from ag_ui.core import (
    ReasoningEndEvent,
    ReasoningMessageContentEvent,
    ReasoningMessageEndEvent,
    ReasoningMessageStartEvent,
    ReasoningStartEvent,
    StateDeltaEvent,
    StateSnapshotEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)
from ag_ui.encoder import EventEncoder
from agent_framework import MCPStreamableHTTPTool
from agent_framework_ag_ui._agent import AgentConfig
from agent_framework_ag_ui._agent_run import run_agent_stream
from agent_framework_ag_ui._types import AGUIRequest
from agents.chat_agent import create_chat_agent
from agents.stateful_agent import create_stateful_agent

import state_store

load_dotenv()

logger = logging.getLogger(__name__)

# MCP tool - connected in lifespan
mcp_tool: MCPStreamableHTTPTool | None = None

# Shared pending approvals registry across requests
pending_approvals: OrderedDict[str, str] = OrderedDict()

# --- State Diff Middleware ---


def _normalize_state(state: dict[str, Any]) -> dict[str, Any]:
    """Parse JSON string values in state to enable structural diffing.

    The predict_state_config mechanism stores tool arguments directly in state.
    For set_chart(chart_json: str), this means state.chart is a JSON STRING,
    not a parsed object. jsonpatch treats strings as atomic, so diffing two
    JSON strings always yields a full replace. By parsing them here, we enable
    granular sub-path diffs like /chart/series/0/color.
    """
    result = {}
    for key, value in state.items():
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, (dict, list)):
                    result[key] = parsed
                else:
                    result[key] = value
            except (json.JSONDecodeError, TypeError):
                result[key] = value
        else:
            result[key] = value
    return result


async def state_diff_stream(
    events_gen: AsyncGenerator,
    thread_id: str,
    request_state: dict[str, Any] | None = None,
    use_smart_delta: bool = True,
) -> AsyncGenerator:
    """Middleware that converts STATE_SNAPSHOT → STATE_DELTA and handles patch_chart.

    Two responsibilities:
    1. Smart deltas: convert STATE_SNAPSHOT to granular JSON Patch STATE_DELTA
       when the diff is smaller than the full snapshot.
    2. patch_chart support: after a patch_chart tool completes, read the patched
       state from state_store and emit STATE_DELTA/SNAPSHOT. Suppress the framework's
       stale StateSnapshotEvent that follows (flow.current_state wasn't updated
       because patch_chart has no predict_state_config mapping).

    Shadow state is seeded from request state, then updated from state_store
    and framework STATE_SNAPSHOT events.
    """
    # Seed shadow from request state or state_store
    shadow = _normalize_state(copy.deepcopy(request_state)) if request_state else {}
    if not shadow:
        stored = state_store.get_full_state(thread_id)
        if stored:
            shadow = stored

    # When we have prior state + smart deltas, suppress predictive STATE_DELTAs
    # (framework's full /key replaces during set_chart streaming)
    suppress_predictive = use_smart_delta and bool(shadow)

    # Track patch_chart tool calls
    active_patch_call_id: str | None = None
    suppress_next_snapshot = False

    async for event in events_gen:
        # --- Track tool call names ---
        if isinstance(event, ToolCallStartEvent):
            if event.tool_call_name == "patch_chart":
                active_patch_call_id = event.tool_call_id
                logger.info(f"[state-diff] patch_chart started: {event.tool_call_id}")
            yield event
            continue

        # --- After tool result: emit state from store for patch_chart ---
        if isinstance(event, ToolCallResultEvent):
            yield event
            if active_patch_call_id and event.tool_call_id == active_patch_call_id:
                # patch_chart completed — read patched state from store
                patched_state = state_store.get_full_state(thread_id)
                if patched_state and patched_state != shadow:
                    if use_smart_delta and shadow:
                        try:
                            patch = jsonpatch.make_patch(shadow, patched_state)
                            ops = list(patch)
                            if ops:
                                logger.info(
                                    f"[state-diff] patch_chart: emitting {len(ops)} "
                                    f"delta ops from state_store"
                                )
                                yield StateDeltaEvent(delta=ops)
                        except Exception:
                            yield StateSnapshotEvent(snapshot=patched_state)
                    else:
                        yield StateSnapshotEvent(snapshot=patched_state)
                    shadow = copy.deepcopy(patched_state)
                suppress_next_snapshot = True
                active_patch_call_id = None
            else:
                # Non-patch tool result: don't suppress next snapshot
                suppress_next_snapshot = False
            continue

        # --- Handle STATE_DELTA (predictive streaming from set_chart) ---
        if isinstance(event, StateDeltaEvent):
            if suppress_predictive:
                logger.debug("[state-diff] Suppressing predictive STATE_DELTA")
                continue
            yield event

        # --- Handle STATE_SNAPSHOT ---
        elif isinstance(event, StateSnapshotEvent):
            if suppress_next_snapshot:
                # Framework emitted stale snapshot after patch_chart — skip it
                logger.debug("[state-diff] Suppressing stale post-patch_chart snapshot")
                suppress_next_snapshot = False
                continue

            normalized = _normalize_state(event.snapshot)

            if use_smart_delta and shadow:
                try:
                    patch = jsonpatch.make_patch(shadow, normalized)
                    ops = list(patch)

                    if not ops:
                        logger.debug("[state-diff] Suppressing no-op snapshot")
                        continue

                    patch_json = json.dumps(ops, separators=(",", ":"))
                    snapshot_json = json.dumps(normalized, separators=(",", ":"))
                    patch_bytes = len(patch_json.encode())
                    snapshot_bytes = len(snapshot_json.encode())

                    if patch_bytes < snapshot_bytes * 0.8 and snapshot_bytes > 256:
                        logger.info(
                            f"[state-diff] Converting STATE_SNAPSHOT to STATE_DELTA: "
                            f"{patch_bytes}B delta vs {snapshot_bytes}B snapshot "
                            f"({len(ops)} ops, {patch_bytes/snapshot_bytes:.0%} of full)"
                        )
                        yield StateDeltaEvent(delta=ops)
                        shadow = copy.deepcopy(normalized)
                        # Sync state_store from framework snapshot
                        if "chart" in normalized:
                            state_store.store_chart(normalized["chart"], thread_id)
                        continue
                except Exception as e:
                    logger.warning(
                        f"[state-diff] Diff failed, passing snapshot through: {e}"
                    )

            # Emit normalized snapshot
            yield StateSnapshotEvent(snapshot=normalized)
            shadow = copy.deepcopy(normalized)
            # Sync state_store from framework snapshot
            if "chart" in normalized:
                state_store.store_chart(normalized["chart"], thread_id)

        else:
            yield event


import uuid


async def reasoning_event_stream(
    raw_events: AsyncGenerator,
    is_reasoning_model: bool,
) -> AsyncGenerator:
    """Inject AG-UI REASONING events for reasoning models.

    Azure AI Foundry doesn't stream readable reasoning content, but we know
    reasoning happens (ResponseReasoningItem arrives before text). This
    middleware emits proper REASONING_START → CONTENT → END events so the
    frontend and event inspector show the complete AG-UI reasoning lifecycle.
    """
    if not is_reasoning_model:
        async for event in raw_events:
            yield event
        return

    reasoning_msg_id = str(uuid.uuid4())
    reasoning_emitted = False
    reasoning_closed = False

    async for event in raw_events:
        event_type_raw = getattr(event, "type", "")
        event_type = event_type_raw.value if hasattr(event_type_raw, "value") else str(event_type_raw)

        # After RUN_STARTED, emit REASONING_START before any other content
        if event_type == "RUN_STARTED":
            yield event
            reasoning_emitted = True
            yield ReasoningStartEvent(messageId=reasoning_msg_id)
            yield ReasoningMessageStartEvent(messageId=reasoning_msg_id, role="assistant")
            yield ReasoningMessageContentEvent(
                messageId=reasoning_msg_id,
                delta="Reasoning over the problem…",
            )
            continue

        # Close reasoning block before the first text message starts
        if event_type == "TEXT_MESSAGE_START" and reasoning_emitted and not reasoning_closed:
            reasoning_closed = True
            yield ReasoningMessageEndEvent(messageId=reasoning_msg_id)
            yield ReasoningEndEvent(messageId=reasoning_msg_id)

        # If CUSTOM usage arrives with reasoning tokens, enrich the content
        if event_type == "CUSTOM" and not reasoning_closed and reasoning_emitted:
            name = getattr(event, "name", "")
            value = getattr(event, "value", {})
            if name == "usage" and isinstance(value, dict):
                tokens = value.get("openai.reasoning_tokens", 0)
                if tokens > 0:
                    yield ReasoningMessageContentEvent(
                        messageId=reasoning_msg_id,
                        delta=f" Used {tokens} reasoning tokens.",
                    )

        yield event

    # Safety: close reasoning if stream ends without text message
    if reasoning_emitted and not reasoning_closed:
        yield ReasoningMessageEndEvent(messageId=reasoning_msg_id)
        yield ReasoningEndEvent(messageId=reasoning_msg_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage MCP tool connection lifecycle."""
    global mcp_tool
    mcp_url = os.environ.get("MCP_SERVER_URL", "http://127.0.0.1:8889/mcp")
    try:
        mcp_tool = MCPStreamableHTTPTool(
            name="playground-mcp",
            url=mcp_url,
            description="Local MCP server with knowledge base, datasets, and statistics tools",
        )
        await mcp_tool.__aenter__()
        print(f"✅ MCP server connected at {mcp_url}")
        yield
    except Exception as e:
        print(f"⚠️  MCP connection failed ({e}), starting without MCP tools")
        mcp_tool = None
        yield
    finally:
        if mcp_tool:
            try:
                await mcp_tool.__aexit__(None, None, None)
            except Exception:
                pass


app = FastAPI(
    title="AG-UI Playground",
    description="Educational demo of the AG-UI protocol with Microsoft Agent Framework",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat", tags=["AG-UI"])
async def dynamic_chat_endpoint(request_body: AGUIRequest) -> StreamingResponse:
    """Dynamic chat endpoint that reads forwardedProps for HITL, model mode, etc."""
    input_data = request_body.model_dump(exclude_none=True)

    forwarded = input_data.get("forwarded_props") or {}
    playground = forwarded.get("playground", {})

    model_mode = playground.get("modelMode", "chat")
    hitl = playground.get("humanInTheLoop", False)
    reasoning_effort = playground.get("reasoningEffort", "medium")

    logger.info(
        f"[/chat] model_mode={model_mode}, hitl={hitl}, reasoning_effort={reasoning_effort}, "
        f"messages={len(input_data.get('messages', []))}"
    )

    base_agent = create_chat_agent(
        model_mode=model_mode,
        hitl=hitl,
        mcp_tools=mcp_tool,
        reasoning_effort=reasoning_effort,
    )
    config = AgentConfig(require_confirmation=hitl)
    encoder = EventEncoder()

    async def event_generator() -> AsyncGenerator[str]:
        event_count = 0
        raw_events = run_agent_stream(
            input_data, base_agent, config,
            pending_approvals=pending_approvals if hitl else None,
        )
        # Wrap through reasoning middleware for reasoning models
        processed_events = reasoning_event_stream(
            raw_events, is_reasoning_model=(model_mode == "reasoning"),
        )
        try:
            async for event in processed_events:
                event_count += 1
                event_type_name = getattr(event, "type", type(event).__name__)
                if "TOOL_CALL" in str(event_type_name) or "RUN" in str(event_type_name):
                    logger.info(f"[/chat] Event {event_count}: {event_type_name}")
                try:
                    yield encoder.encode(event)
                except Exception as encode_error:
                    logger.exception("[/chat] Failed to encode event %s", event_type_name)
                    from ag_ui.core import RunErrorEvent
                    try:
                        yield encoder.encode(RunErrorEvent(
                            message="Internal error while streaming events.",
                            code=type(encode_error).__name__,
                        ))
                    except Exception:
                        pass
                    return
            logger.info(f"[/chat] Completed streaming {event_count} events")
        except Exception:
            logger.exception("[/chat] Streaming failed")
            from ag_ui.core import RunErrorEvent
            try:
                yield encoder.encode(RunErrorEvent(
                    message="Internal error while streaming events.",
                    code="StreamError",
                ))
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.post("/state", tags=["AG-UI"])
async def stateful_endpoint(request_body: AGUIRequest) -> StreamingResponse:
    """Shared state endpoint with smart delta middleware and patch_chart support.

    Reads forwardedProps.playground.smartDelta to toggle STATE_SNAPSHOT → STATE_DELTA
    conversion. When enabled, small state changes are sent as JSON Patch operations
    instead of full snapshots.
    """
    input_data = request_body.model_dump(exclude_none=True)

    forwarded = input_data.get("forwarded_props") or {}
    playground = forwarded.get("playground", {})
    smart_delta = playground.get("smartDelta", True)

    thread_id = input_data.get("thread_id") or input_data.get("threadId") or "default"
    request_state = input_data.get("state")

    logger.info(
        f"[/state] smart_delta={smart_delta}, thread={thread_id[:8]}, "
        f"messages={len(input_data.get('messages', []))}"
    )

    # Seed state_store from client state so patch_chart can read it
    if request_state:
        normalized = _normalize_state(copy.deepcopy(request_state))
        if "chart" in normalized and isinstance(normalized["chart"], dict):
            state_store.store_chart(normalized["chart"], thread_id)

    # WORKAROUND: Framework bug — PredictiveStateHandler.__init__ does
    # `self.current_state = current_state or {}` which creates a DETACHED dict
    # when current_state is empty (falsy). This breaks the reference to
    # flow.current_state, so apply_pending_updates() never updates the flow,
    # and StateSnapshotEvent is never emitted after tool completion.
    # Fix: ensure input_data["state"] is non-empty so flow.current_state starts
    # truthy and the reference is preserved.
    if not input_data.get("state"):
        input_data["state"] = {"chart": None}

    # Create a fresh stateful agent per request
    stateful_agent_wrapper = create_stateful_agent()
    base_agent = stateful_agent_wrapper.agent
    config = AgentConfig(
        predict_state_config=stateful_agent_wrapper.config.predict_state_config,
    )

    encoder = EventEncoder()

    async def event_generator() -> AsyncGenerator[str]:
        # Set active thread for tool functions (patch_chart, get_chart_info)
        token = state_store.set_active_thread(thread_id)
        event_count = 0
        raw_events = run_agent_stream(input_data, base_agent, config)

        # Wrap through state diff middleware
        processed_events = state_diff_stream(
            raw_events,
            thread_id=thread_id,
            request_state=request_state,
            use_smart_delta=smart_delta,
        )

        try:
            async for event in processed_events:
                event_count += 1
                event_type_name = getattr(event, "type", type(event).__name__)
                if "STATE" in str(event_type_name) or "RUN" in str(event_type_name):
                    logger.info(f"[/state] Event {event_count}: {event_type_name}")
                try:
                    yield encoder.encode(event)
                except Exception as encode_error:
                    logger.exception("[/state] Failed to encode event %s", event_type_name)
                    from ag_ui.core import RunErrorEvent
                    try:
                        yield encoder.encode(RunErrorEvent(
                            message="Internal error while streaming events.",
                            code=type(encode_error).__name__,
                        ))
                    except Exception:
                        pass
                    return
            logger.info(f"[/state] Completed streaming {event_count} events")
        except Exception:
            logger.exception("[/state] Streaming failed")
            from ag_ui.core import RunErrorEvent
            try:
                yield encoder.encode(RunErrorEvent(
                    message="Internal error while streaming events.",
                    code="StreamError",
                ))
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "agents": ["/chat", "/state"],
        "models": {
            "chat": os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4.1-mini"),
            "reasoning": os.environ.get("FOUNDRY_MODEL_REASONING", "o4-mini"),
        },
        "mcp_connected": mcp_tool is not None,
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8888"))
    uvicorn.run(app, host="127.0.0.1", port=port)
