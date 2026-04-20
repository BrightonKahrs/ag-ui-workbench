"""AG-UI Playground Backend Server.

Exposes AG-UI endpoints:
- /chat      - Basic streaming chat with tool calls + MCP tools (chat model)
- /reasoning - Chat with reasoning model (emits CUSTOM usage events with reasoning tokens)
- /state     - Shared state agent (data viz) with predictive updates

Managed with UV: `uv run server.py`
MCP server must be running on :8889: `uv run python mcp_server.py`
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_framework import MCPStreamableHTTPTool
from agent_framework_ag_ui import add_agent_framework_fastapi_endpoint
from agents.chat_agent import create_chat_agent
from agents.stateful_agent import create_stateful_agent

load_dotenv()

# MCP tool - connected in lifespan
mcp_tool: MCPStreamableHTTPTool | None = None


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

        # Create agents with MCP tools available
        chat_agent = create_chat_agent(model_mode="chat", mcp_tools=mcp_tool)
        reasoning_agent = create_chat_agent(model_mode="reasoning", mcp_tools=mcp_tool)
        stateful_agent = create_stateful_agent()

        # Register AG-UI endpoints
        add_agent_framework_fastapi_endpoint(app, chat_agent, "/chat")
        add_agent_framework_fastapi_endpoint(app, reasoning_agent, "/reasoning")
        add_agent_framework_fastapi_endpoint(app, stateful_agent, "/state")

        print(f"✅ MCP server connected at {mcp_url}")
        yield
    except Exception as e:
        # Fall back without MCP if server isn't running
        print(f"⚠️  MCP connection failed ({e}), starting without MCP tools")
        chat_agent = create_chat_agent(model_mode="chat")
        reasoning_agent = create_chat_agent(model_mode="reasoning")
        stateful_agent = create_stateful_agent()

        add_agent_framework_fastapi_endpoint(app, chat_agent, "/chat")
        add_agent_framework_fastapi_endpoint(app, reasoning_agent, "/reasoning")
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


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "agents": ["/chat", "/reasoning", "/state"],
        "models": {
            "chat": os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4o-mini"),
            "reasoning": os.environ.get("FOUNDRY_MODEL_REASONING", "o3-mini"),
        },
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8888"))
    uvicorn.run(app, host="127.0.0.1", port=port)
