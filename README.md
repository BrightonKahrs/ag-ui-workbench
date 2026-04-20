# AG-UI Playground

An educational demo showcasing the **AG-UI (Agent-User Interaction) Protocol** with **Microsoft Agent Framework** (Python) and **Azure AI Foundry**. Toggle features, inspect events, and understand how AG-UI works in real-time.

## What is AG-UI?

AG-UI is an open, event-based protocol that standardizes how AI agents stream responses to frontends. It sits alongside MCP (tools) and A2A (agent-to-agent) in the modern agentic protocol stack:

- **MCP** gives agents tools
- **A2A** lets agents talk to other agents
- **AG-UI** brings agents into user-facing applications

## Features Demonstrated

| Feature | AG-UI Events | Tab |
|---------|-------------|-----|
| Streaming Chat | `TEXT_MESSAGE_START/CONTENT/END` | Chat |
| Tool Calls | `TOOL_CALL_START/ARGS/END/RESULT` | Chat |
| MCP Server Tools | `TOOL_CALL_*` (via MCP) | Chat |
| Reasoning Tokens | `CUSTOM` (usage with `openai.reasoning_tokens`) | Chat |
| Shared State | `STATE_SNAPSHOT`, `STATE_DELTA` | State |
| Predictive Updates | Streaming tool args → state | State |
| Data Visualization | Live Recharts from shared state | State |
| Step Tracking | `STEP_STARTED/STEP_FINISHED` | Both |
| Event Observability | Collapsible grouped events in inspector | Both |

## Architecture

```
┌──────────────────────────────────────────────┐
│  React Frontend (Vite + TypeScript)          │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Chat Tab │ │State Tab │ │Event Inspector│ │
│  │ + tools  │ │ + charts │ │ (grouped)    │  │
│  └─────┬────┘ └─────┬────┘ └─────────────┘  │
│        │ Raw SSE     │                        │
│        │ (fetch API) │                        │
└────────┼─────────────┼───────────────────────┘
         │ HTTP POST + SSE
         ▼
┌──────────────────────────────────────────────┐
│  Python Backend (FastAPI) :8888              │
│  ┌─────────┐ ┌───────────┐ ┌──────────────┐ │
│  │ /chat   │ │/reasoning │ │ /state       │ │
│  │ +local  │ │ o4-mini   │ │ DataVizAgent │ │
│  │ +MCP    │ │ +🧠tokens │ │ +Recharts    │ │
│  └────┬────┘ └─────┬─────┘ └──────┬───────┘ │
│       └─────┬──────┘               │         │
│             ▼                      │         │
│   agent-framework-ag-ui           │         │
│   (SSE event bridge)              │         │
└──────┬──────────────────────┬─────┘─────────┘
       │                      │
       ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ MCP Server   │    │ Azure AI Foundry │
│ :8889        │    │ gpt-4.1-mini     │
│ (FastMCP)    │    │ o4-mini          │
└──────────────┘    └──────────────────┘
```

## Quick Start

### Prerequisites

- **Python 3.10+** and [UV](https://docs.astral.sh/uv/) (Python package manager)
- **Node.js 20+**
- **Azure CLI** authenticated (`az login`)
- **Azure AI Foundry** resource with model deployments

### 1. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your Foundry endpoint and model deployment names:

```env
FOUNDRY_PROJECT_ENDPOINT=https://your-resource.services.ai.azure.com/
FOUNDRY_MODEL_CHAT=gpt-4.1-mini
FOUNDRY_MODEL_REASONING=o4-mini
```

### 2. Install Dependencies

```bash
# Backend (uses UV)
cd backend
uv sync

# Frontend
cd ../frontend
npm install
```

### 3. Run (3 terminals)

**Terminal 1 — MCP Server** (local tool server on `:8889`):
```bash
cd backend
uv run python mcp_server.py
```

**Terminal 2 — Backend** (FastAPI + AG-UI on `:8888`):
```bash
cd backend
uv run uvicorn server:app --port 8888
```

**Terminal 3 — Frontend** (Vite dev server on `:5173`):
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** — the frontend proxies `/api/*` to the backend.

> **Note:** The MCP server is optional. If it's not running, the backend starts without MCP tools and logs a warning.

## How It Works

### The AG-UI Protocol

Communication flows via **HTTP POST** (client → server) and **Server-Sent Events** (server → client):

1. Frontend sends a POST with messages and optional state
2. Backend streams back typed JSON events via SSE
3. Frontend parses events and updates UI in real-time

### Event Inspector

The right panel shows **every AG-UI event** grouped by category with collapsible headers and running counts:
- 🔵 **Lifecycle** — `RUN_STARTED`, `RUN_FINISHED`
- 🟢 **Text Messages** — streaming tokens with char count
- 🟡 **Tool Calls** — function name + args + result
- 🟣 **State** — snapshots and JSON Patch deltas
- 🟠 **Reasoning** — reasoning token usage from `CUSTOM` events
- ⚡ **Custom** — usage telemetry, metadata

Click any group to expand (first 5 shown, then "Show all N"). Click any event for full JSON.

### Model Modes

Toggle between models in the left sidebar:
- **Chat** (`gpt-4.1-mini`) — standard streaming
- **Reasoning** (`o4-mini`) — reasoning model with 🧠 token badge on messages

### MCP Server Integration

The local MCP server (`mcp_server.py`) provides tools via the Model Context Protocol:
- `search_knowledge_base` — search info about AG-UI, MCP, Agent Framework
- `list_datasets` / `query_dataset` — browse and query sample data
- `compute_statistics` — descriptive stats on numeric data
- `get_server_info` — MCP server metadata

These appear as standard `TOOL_CALL` events in the inspector, demonstrating MCP's role in the agentic stack.

### Shared State & Data Visualization

The **State** tab demonstrates bidirectional state sync:
1. Chat with the DataViz agent to create charts
2. Agent calls `set_chart` with a JSON config
3. Predictive state updates stream the chart as it's generated
4. Frontend renders live Recharts visualization (bar, line, area, pie, scatter, composed)

## AG-UI Event Types Reference

```typescript
enum AGUIEventType {
  // Lifecycle
  RUN_STARTED, RUN_FINISHED, RUN_ERROR,
  STEP_STARTED, STEP_FINISHED,

  // Text Messages (streaming)
  TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END,

  // Tool Calls
  TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_RESULT,

  // State Management
  STATE_SNAPSHOT,  // Full state replacement
  STATE_DELTA,     // JSON Patch (RFC 6902) incremental update

  // Other
  MESSAGES_SNAPSHOT, CUSTOM, RAW
}
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/mcp_server.py` | Local MCP server (FastMCP) with knowledge + data tools |
| `backend/server.py` | FastAPI server with AG-UI endpoints + MCP lifecycle |
| `backend/agents/chat_agent.py` | Chat/reasoning agent with local + MCP tools |
| `backend/agents/stateful_agent.py` | Data viz agent with Pydantic-validated set_chart |
| `backend/tools/demo_tools.py` | Local demo tools (weather, calculate, time) |
| `frontend/src/utils/sse-client.ts` | Raw SSE parser — AG-UI wire protocol |
| `frontend/src/hooks/useAgentStream.ts` | React hook for AG-UI events + reasoning tokens |
| `frontend/src/hooks/useSharedState.ts` | JSON Patch state sync for STATE_DELTA |
| `frontend/src/components/EventInspector.tsx` | Collapsible grouped event visualization |
| `frontend/src/components/SharedStateTab.tsx` | Recharts data viz from shared state |

## License

MIT
