"""AG-UI Playground Backend Server.

Exposes AG-UI endpoints:
- /chat      - Dynamic chat endpoint (reads forwardedProps for model mode, HITL, etc.)
- /state     - Shared state agent (data viz) with predictive updates

Managed with UV: `uv run server.py`
MCP server must be running on :8889: `uv run python mcp_server.py`
"""

import logging
import os
from collections import OrderedDict
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from ag_ui.encoder import EventEncoder
from agent_framework import MCPStreamableHTTPTool
from agent_framework_ag_ui import add_agent_framework_fastapi_endpoint
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
# This allows the resume flow to find approvals emitted during the initial request
pending_approvals: OrderedDict[str, str] = OrderedDict()


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

        # Register stateful agent endpoint (fixed - no dynamic config needed)
        stateful_agent = create_stateful_agent()
        add_agent_framework_fastapi_endpoint(app, stateful_agent, "/state")

        print(f"✅ MCP server connected at {mcp_url}")
        yield
    except Exception as e:
        print(f"⚠️  MCP connection failed ({e}), starting without MCP tools")
        mcp_tool = None

        stateful_agent = create_stateful_agent()
        add_agent_framework_fastapi_endpoint(app, stateful_agent, "/state")
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
    """Dynamic chat endpoint that reads forwardedProps for HITL, model mode, etc.

    This replaces the static endpoint registration to support per-request
    configuration of model mode, human-in-the-loop approval, and reasoning options.
    """
    input_data = request_body.model_dump(exclude_none=True)

    # Extract playground options from forwardedProps
    forwarded = input_data.get("forwarded_props") or {}
    playground = forwarded.get("playground", {})

    model_mode = playground.get("modelMode", "chat")
    hitl = playground.get("humanInTheLoop", False)

    logger.info(
        f"[/chat] model_mode={model_mode}, hitl={hitl}, "
        f"messages={len(input_data.get('messages', []))}"
    )

    # Create agent dynamically based on request options
    base_agent = create_chat_agent(
        model_mode=model_mode,
        hitl=hitl,
        mcp_tools=mcp_tool,
    )

    # Build config for this request
    config = AgentConfig(
        require_confirmation=hitl,
    )

    encoder = EventEncoder()

    async def event_generator() -> AsyncGenerator[str]:
        event_count = 0
        try:
            # Use run_agent_stream directly with shared pending_approvals
            # so approval registry persists across initial request and resume
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

                    run_error = RunErrorEvent(
                        message="Internal error while streaming events.",
                        code=type(encode_error).__name__,
                    )
                    try:
                        yield encoder.encode(run_error)
                    except Exception:
                        pass
                    return

            logger.info(f"[/chat] Completed streaming {event_count} events")
        except Exception:
            logger.exception("[/chat] Streaming failed")
            from ag_ui.core import RunErrorEvent

            run_error = RunErrorEvent(
                message="Internal error while streaming events.",
                code="StreamError",
            )
            try:
                yield encoder.encode(run_error)
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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
