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

from ag_ui.core import StateDeltaEvent, StateSnapshotEvent
from ag_ui.encoder import EventEncoder
from agent_framework import MCPStreamableHTTPTool
from agent_framework_ag_ui._agent import AgentConfig
from agent_framework_ag_ui._agent_run import run_agent_stream
from agent_framework_ag_ui._types import AGUIRequest
from agents.chat_agent import create_chat_agent
from agents.stateful_agent import create_stateful_agent

load_dotenv()

logger = logging.getLogger(__name__)

# MCP tool - connected in lifespan
mcp_tool: MCPStreamableHTTPTool | None = None

# Shared pending approvals registry across requests
pending_approvals: OrderedDict[str, str] = OrderedDict()

# --- State Diff Middleware ---
# Per-thread state cache for computing deltas across runs
_thread_states: dict[str, dict[str, Any]] = {}
_MAX_THREAD_CACHE = 100  # Evict oldest threads when cache exceeds this


def _evict_thread_cache() -> None:
    """Simple eviction: remove oldest entries when cache is too large."""
    while len(_thread_states) > _MAX_THREAD_CACHE:
        oldest = next(iter(_thread_states))
        del _thread_states[oldest]


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
    """Middleware that converts STATE_SNAPSHOT → STATE_DELTA when the diff is smaller.

    Shadow state is seeded from the request's state (canonical) and ONLY updated
    from STATE_SNAPSHOT events.

    When smart deltas is ON and we already have state (not the first chart):
    - Predictive STATE_DELTAs (framework's full /key replaces during streaming)
      are SUPPRESSED — the chart stays stable at the current version.
    - STATE_SNAPSHOT is converted to a granular STATE_DELTA with only the changed
      fields (e.g., /chart/series/0/color instead of replacing the entire /chart).

    When smart deltas is OFF or this is the first chart (no shadow):
    - All events pass through unchanged — full predictive streaming experience.
    """
    # Seed shadow from the canonical client state, with thread cache as fallback
    shadow = _normalize_state(copy.deepcopy(request_state)) if request_state else {}
    if not shadow and thread_id in _thread_states:
        shadow = copy.deepcopy(_thread_states[thread_id])

    # When we have prior state + smart deltas, suppress predictive streaming
    # to avoid sending the full chart twice (once predictive, once as delta)
    suppress_predictive = use_smart_delta and bool(shadow)

    async for event in events_gen:
        if isinstance(event, StateDeltaEvent):
            if suppress_predictive:
                logger.debug("[state-diff] Suppressing predictive STATE_DELTA")
                continue
            yield event

        elif isinstance(event, StateSnapshotEvent):
            normalized = _normalize_state(event.snapshot)

            if use_smart_delta and shadow:
                try:
                    patch = jsonpatch.make_patch(shadow, normalized)
                    ops = list(patch)

                    if not ops:
                        # Shadow matches snapshot — suppress redundant snapshot
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
                        _thread_states[thread_id] = copy.deepcopy(normalized)
                        _evict_thread_cache()
                        continue
                except Exception as e:
                    logger.warning(
                        f"[state-diff] Diff failed, passing snapshot through: {e}"
                    )

            # Emit normalized snapshot (parsed JSON strings → objects)
            yield StateSnapshotEvent(snapshot=normalized)
            shadow = copy.deepcopy(normalized)
            _thread_states[thread_id] = copy.deepcopy(normalized)
            _evict_thread_cache()

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

    logger.info(
        f"[/chat] model_mode={model_mode}, hitl={hitl}, "
        f"messages={len(input_data.get('messages', []))}"
    )

    base_agent = create_chat_agent(
        model_mode=model_mode,
        hitl=hitl,
        mcp_tools=mcp_tool,
    )
    config = AgentConfig(require_confirmation=hitl)
    encoder = EventEncoder()

    async def event_generator() -> AsyncGenerator[str]:
        event_count = 0
        try:
            async for event in run_agent_stream(
                input_data, base_agent, config,
                pending_approvals=pending_approvals if hitl else None,
            ):
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
    """Shared state endpoint with smart delta middleware.

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

    # Create a fresh stateful agent per request
    stateful_agent_wrapper = create_stateful_agent()
    base_agent = stateful_agent_wrapper.agent
    config = AgentConfig(
        state_schema=stateful_agent_wrapper.config.state_schema,
        predict_state_config=stateful_agent_wrapper.config.predict_state_config,
    )

    encoder = EventEncoder()

    async def event_generator() -> AsyncGenerator[str]:
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
