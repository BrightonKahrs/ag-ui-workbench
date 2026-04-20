"""AG-UI Playground Backend Server.

Exposes AG-UI endpoints:
- /chat      - Basic streaming chat with tool calls (chat model)
- /reasoning - Chat with reasoning model (emits REASONING events)
- /state     - Shared state agent (recipe builder) with predictive updates

Managed with UV: `uv run server.py`
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_framework_ag_ui import add_agent_framework_fastapi_endpoint
from agents.chat_agent import create_chat_agent
from agents.stateful_agent import create_stateful_agent

load_dotenv()

app = FastAPI(
    title="AG-UI Playground",
    description="Educational demo of the AG-UI protocol with Microsoft Agent Framework",
    version="1.0.0",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create agents with different model modes
chat_agent = create_chat_agent(model_mode="chat")
reasoning_agent = create_chat_agent(model_mode="reasoning")
stateful_agent = create_stateful_agent()

# Register AG-UI endpoints
add_agent_framework_fastapi_endpoint(app, chat_agent, "/chat")
add_agent_framework_fastapi_endpoint(app, reasoning_agent, "/reasoning")
add_agent_framework_fastapi_endpoint(app, stateful_agent, "/state")


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
