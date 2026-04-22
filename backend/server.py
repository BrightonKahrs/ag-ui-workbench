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
    CustomEvent,
    StateDeltaEvent,
    StateSnapshotEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)
from ag_ui.encoder import EventEncoder
from agent_framework import MCPStreamableHTTPTool
from agent_framework_ag_ui._agent import AgentConfig
from agent_framework_ag_ui._agent_run import run_agent_stream
from agent_framework_ag_ui._workflow_run import run_workflow_stream
from agent_framework_ag_ui._types import AGUIRequest
from agents.chat_agent import create_chat_agent
from agents.plan_agent import create_plan_agent
from agents.stateful_agent import create_stateful_agent
from agents.workflow_agent import create_workflow

import state_store

load_dotenv()

logger = logging.getLogger(__name__)

# MCP tool - connected in lifespan
mcp_tool: MCPStreamableHTTPTool | None = None

# Shared pending approvals registry across requests
pending_approvals: OrderedDict[str, str] = OrderedDict()

# --- MCP App Registry ---
# Tools that produce interactive HTML UIs. After their TOOL_CALL_RESULT,
# the /chat endpoint emits a CUSTOM "McpApp" event with the app HTML URL.
MCP_APP_TOOL_NAMES = {"explore_dataset_app", "visualize_statistics_app"}
MCP_SERVER_BASE_URL = os.environ.get("MCP_SERVER_URL", "http://127.0.0.1:8889").rstrip("/mcp").rstrip("/")

# --- State Diff Middleware ---

# --- MCP App Middleware ---


async def mcp_app_stream(
    events_gen: AsyncGenerator,
) -> AsyncGenerator:
    """Middleware that detects MCP App tool results and emits CUSTOM McpApp events.

    Tracks active tool calls by name. When a TOOL_CALL_RESULT arrives for an
    MCP App tool, emits a CUSTOM event with the tool call ID and the URL where
    the frontend can fetch the interactive HTML.
    """
    import urllib.parse

    # Map tool_call_id → tool_name for active calls
    active_tool_names: dict[str, str] = {}

    async for event in events_gen:
        # Track tool call names
        if isinstance(event, ToolCallStartEvent):
            active_tool_names[event.tool_call_id] = event.tool_call_name
            yield event
            continue

        # Check if this is a result from an MCP App tool
        if isinstance(event, ToolCallResultEvent):
            yield event
            tool_name = active_tool_names.pop(event.tool_call_id, None)
            if tool_name and tool_name in MCP_APP_TOOL_NAMES:
                # Build URL for the app HTML endpoint
                encoded_result = urllib.parse.quote(event.content, safe="")
                html_url = f"{MCP_SERVER_BASE_URL}/app-html/{tool_name}?data={encoded_result}"
                logger.info(f"[mcp-app] Emitting McpApp event for {tool_name} (call {event.tool_call_id})")
                yield CustomEvent(
                    name="McpApp",
                    value={
                        "toolCallId": event.tool_call_id,
                        "appId": tool_name,
                        "htmlUrl": html_url,
                    },
                )
            continue

        yield event



def _sync_state_store(state: dict[str, Any], thread_id: str) -> None:
    """Sync known namespaces from a state snapshot to state_store."""
    for ns in ("chart", "plan"):
        if ns in state and state[ns] is not None:
            state_store.store_state(ns, state[ns], thread_id)


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

    # Track tool calls that modify state_store directly (no predict_state_config)
    _STORE_MUTATING_TOOLS = {"patch_chart", "create_plan", "update_task"}
    active_store_call_id: str | None = None
    suppress_next_snapshot = False

    async for event in events_gen:
        # --- Track tool call names ---
        if isinstance(event, ToolCallStartEvent):
            if event.tool_call_name in _STORE_MUTATING_TOOLS:
                active_store_call_id = event.tool_call_id
                logger.info(f"[state-diff] {event.tool_call_name} started: {event.tool_call_id}")
            yield event
            continue

        # --- After tool result: emit state from store for store-mutating tools ---
        if isinstance(event, ToolCallResultEvent):
            yield event
            if active_store_call_id and event.tool_call_id == active_store_call_id:
                # Tool completed — read updated state from store
                updated_state = state_store.get_full_state(thread_id)
                if updated_state and updated_state != shadow:
                    if use_smart_delta and shadow:
                        try:
                            patch = jsonpatch.make_patch(shadow, updated_state)
                            ops = list(patch)
                            if ops:
                                logger.info(
                                    f"[state-diff] store-tool: emitting {len(ops)} "
                                    f"delta ops from state_store"
                                )
                                yield StateDeltaEvent(delta=ops)
                        except Exception:
                            yield StateSnapshotEvent(snapshot=updated_state)
                    else:
                        yield StateSnapshotEvent(snapshot=updated_state)
                    shadow = copy.deepcopy(updated_state)
                suppress_next_snapshot = True
                active_store_call_id = None
            else:
                # Non-store tool result: don't suppress next snapshot
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
                        _sync_state_store(normalized, thread_id)
                        continue
                except Exception as e:
                    logger.warning(
                        f"[state-diff] Diff failed, passing snapshot through: {e}"
                    )

            # Emit normalized snapshot
            yield StateSnapshotEvent(snapshot=normalized)
            shadow = copy.deepcopy(normalized)
            _sync_state_store(normalized, thread_id)

        else:
            yield event


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
        # Wrap with MCP App middleware to detect app tool results
        events_with_apps = mcp_app_stream(raw_events)
        try:
            async for event in events_with_apps:
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


@app.post("/plan", tags=["AG-UI"])
async def plan_endpoint(request_body: AGUIRequest) -> StreamingResponse:
    """Plan endpoint — creates and tracks task plans via shared state.

    Uses STATE_SNAPSHOT/STATE_DELTA to sync plan state to the frontend.
    The agent creates plans with create_plan and updates tasks with update_task.
    """
    input_data = request_body.model_dump(exclude_none=True)

    thread_id = input_data.get("thread_id") or input_data.get("threadId") or "default"
    request_state = input_data.get("state")

    logger.info(
        f"[/plan] thread={thread_id[:8]}, "
        f"messages={len(input_data.get('messages', []))}"
    )

    # Seed state_store from client state
    if request_state:
        normalized = _normalize_state(copy.deepcopy(request_state))
        for ns in ("plan",):
            if ns in normalized and isinstance(normalized[ns], dict):
                state_store.store_state(ns, normalized[ns], thread_id)

    # Ensure state is non-empty (framework bug workaround — same as /state)
    if not input_data.get("state"):
        input_data["state"] = {"plan": None}

    agent = create_plan_agent(mcp_tools=mcp_tool)
    # No predict_state_config — plan tools write directly to state_store.
    # The middleware reads from state_store after each tool call and emits
    # STATE_SNAPSHOT/STATE_DELTA. This avoids the shape mismatch between
    # the LLM's array-based plan_json and our map-based state_store format.
    config = AgentConfig()

    encoder = EventEncoder()

    async def event_generator() -> AsyncGenerator[str]:
        token = state_store.set_active_thread(thread_id)
        event_count = 0
        raw_events = run_agent_stream(input_data, agent, config)

        processed_events = state_diff_stream(
            raw_events,
            thread_id=thread_id,
            request_state=request_state,
            use_smart_delta=True,
        )

        try:
            async for event in processed_events:
                event_count += 1
                event_type_name = getattr(event, "type", type(event).__name__)
                if any(k in str(event_type_name) for k in ("STATE", "RUN", "TOOL")):
                    logger.info(f"[/plan] Event {event_count}: {event_type_name}")
                try:
                    yield encoder.encode(event)
                except Exception as encode_error:
                    logger.exception("[/plan] Failed to encode event %s", event_type_name)
                    from ag_ui.core import RunErrorEvent
                    try:
                        yield encoder.encode(RunErrorEvent(
                            message="Internal error while streaming events.",
                            code=type(encode_error).__name__,
                        ))
                    except Exception:
                        pass
                    return
            logger.info(f"[/plan] Completed streaming {event_count} events")
        except Exception:
            logger.exception("[/plan] Streaming failed")
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


@app.post("/workflow", tags=["AG-UI"])
async def workflow_endpoint(request_body: AGUIRequest) -> StreamingResponse:
    """Workflow endpoint demonstrating STEP and ACTIVITY_SNAPSHOT events.

    Runs a 3-stage Research Pipeline (Researcher → Analyzer → Synthesizer).
    Each stage transition emits STEP_STARTED/STEP_FINISHED and ACTIVITY_SNAPSHOT.
    """
    input_data = request_body.model_dump(exclude_none=True)

    logger.info(
        f"[/workflow] messages={len(input_data.get('messages', []))}"
    )

    # Fresh workflow per request (stateless)
    workflow = create_workflow()
    encoder = EventEncoder()

    async def event_generator() -> AsyncGenerator[str]:
        event_count = 0
        try:
            async for event in run_workflow_stream(input_data, workflow):
                event_count += 1
                event_type_name = getattr(event, "type", type(event).__name__)
                if any(k in str(event_type_name) for k in ("STEP", "ACTIVITY", "RUN")):
                    logger.info(f"[/workflow] Event {event_count}: {event_type_name}")
                try:
                    yield encoder.encode(event)
                except Exception as encode_error:
                    logger.exception("[/workflow] Failed to encode event %s", event_type_name)
                    from ag_ui.core import RunErrorEvent
                    try:
                        yield encoder.encode(RunErrorEvent(
                            message="Internal error while streaming events.",
                            code=type(encode_error).__name__,
                        ))
                    except Exception:
                        pass
                    return
            logger.info(f"[/workflow] Completed streaming {event_count} events")
        except Exception:
            logger.exception("[/workflow] Streaming failed")
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
        "agents": ["/chat", "/state", "/workflow"],
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
