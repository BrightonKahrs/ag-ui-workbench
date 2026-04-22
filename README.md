# AG-UI Playground

An educational demo showcasing the **AG-UI (Agent-User Interaction) Protocol** with **Microsoft Agent Framework** (Python) and **Azure AI Foundry**. Toggle features, inspect events, and understand how AG-UI works in real-time.

## What is AG-UI?

AG-UI is an open, event-based protocol that standardizes how AI agents stream responses to frontends. It sits alongside MCP (tools) and A2A (agent-to-agent) in the modern agentic protocol stack:

- **MCP** gives agents tools
- **A2A** lets agents talk to other agents
- **AG-UI** brings agents into user-facing applications

## Features Demonstrated

| Feature | AG-UI Events | Tab | Toggle |
|---------|-------------|-----|--------|
| Streaming Chat | `TEXT_MESSAGE_START/CONTENT/END` | Chat | `streaming` |
| Tool Calls | `TOOL_CALL_START/ARGS/END/RESULT` | Chat | `toolCalls` |
| MCP Server Tools | `TOOL_CALL_*` (via MCP) | Chat | `toolCalls` |
| Human-in-the-Loop | `TOOL_CALL_END` → `confirm_changes` + `RUN_FINISHED(interrupt)` | Chat | `humanInTheLoop` |
| Reasoning | `REASONING_START/MESSAGE_START/CONTENT/END/MESSAGE_END/END` | Chat | `modelMode: reasoning` |
| Reasoning Token Badge | `CUSTOM(usage)` with `openai.reasoning_tokens` | Chat | `modelMode: reasoning` |
| Shared State | `STATE_SNAPSHOT`, `STATE_DELTA` | State | `sharedState` |
| Smart Deltas | `STATE_DELTA` (JSON Patch, RFC 6902) | State | `smartDelta` |
| Predictive Updates | Streaming tool args → state | State | `predictiveUpdates` |
| Data Visualization | Live Recharts from shared state | State | `sharedState` |
| Step Tracking | `STEP_STARTED/STEP_FINISHED` | Both | `stepEvents` |
| Event Observability | All events in collapsible grouped inspector | Both | — |

> **21 of 25 non-deprecated AG-UI event types** are handled by this playground (84% coverage).
> See [docs/ag-ui-event-reference.md](docs/ag-ui-event-reference.md) for the full protocol analysis.

## Architecture

```
┌──────────────────────────────────────────────┐
│  React Frontend (Vite + TypeScript)          │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Chat Tab │ │State Tab │ │Event Inspector│ │
│  │ + tools  │ │ + charts │ │ (grouped)    │  │
│  │ + HITL   │ │ + deltas │ │              │  │
│  │ + reason │ │          │ │              │  │
│  └─────┬────┘ └─────┬────┘ └─────────────┘  │
│        │ Raw SSE     │                        │
│        │ (fetch API) │                        │
└────────┼─────────────┼───────────────────────┘
         │ HTTP POST + SSE
         ▼
┌──────────────────────────────────────────────┐
│  Python Backend (FastAPI) :8888              │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │ /chat            │  │ /state           │  │
│  │ ChatAgent        │  │ DataVizAgent     │  │
│  │ +local tools     │  │ +Recharts tools  │  │
│  │ +MCP tools       │  │ +state_diff_stream│ │
│  │ +HITL approval   │  │ +predict_state   │  │
│  └────┬─────────────┘  └──────┬───────────┘  │
│       └─────┬──────────────────┘              │
│             ▼                                 │
│   agent-framework-ag-ui                       │
│   (SSE event bridge)                          │
└──────┬──────────────────────┬────────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ MCP Server   │    │ Azure AI Foundry │
│ :8889        │    │ gpt-4.1-mini     │
│ (FastMCP)    │    │ gpt-5-mini       │
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
FOUNDRY_MODEL_REASONING=gpt-5-mini
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
- **Chat** (`gpt-4.1-mini`) — standard streaming with tool calls
- **Reasoning** (`gpt-5-mini`) — native reasoning events with 🧠 collapsible thinking block and token badge

The reasoning model uses `reasoning.summary: "auto"` to stream readable reasoning summaries as `REASONING_*` events before the final response.

### MCP Server Integration

The local MCP server (`mcp_server.py`) provides tools via the Model Context Protocol:
- `search_knowledge_base` — search info about AG-UI, MCP, Agent Framework
- `list_datasets` / `query_dataset` — browse and query sample data
- `compute_statistics` — descriptive stats on numeric data
- `get_server_info` — MCP server metadata

These appear as standard `TOOL_CALL` events in the inspector, demonstrating MCP's role in the agentic stack.

### Human-in-the-Loop (HITL) Approval

Enable the **Human-in-the-Loop** toggle to require approval before tool execution:
1. Agent decides to call a tool → framework emits `CUSTOM(function_approval_request)`
2. Backend wraps the call in a `confirm_changes` pseudo-tool
3. Frontend shows an amber approval dialog with the function name, arguments, and step descriptions
4. User clicks **Approve** or **Reject** → resume request sent with interrupt response
5. `RUN_FINISHED` includes `interrupt` array when waiting for approval

This demonstrates the full AG-UI interrupt/resume pattern.

### Shared State & Data Visualization

The **State** tab demonstrates bidirectional state sync:
1. Chat with the DataViz agent to create charts
2. Agent calls `set_chart` with a JSON config
3. Predictive state updates stream the chart as it's generated
4. Frontend renders live Recharts visualization (bar, line, area, pie, scatter, composed)

## AG-UI Event Types Reference

The AG-UI spec defines 33 event types. This playground handles 21 of the 25 non-deprecated types:

```
LIFECYCLE (3)     ✅ RUN_STARTED, RUN_FINISHED, RUN_ERROR
STEPS (2)         ✅ STEP_STARTED, STEP_FINISHED

TEXT (3+1)        ✅ TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END
                  — TEXT_MESSAGE_CHUNK (convenience, not used)

TOOLS (4+1)       ✅ TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_RESULT
                  — TOOL_CALL_CHUNK (convenience, not used)

STATE (3)         ✅ STATE_SNAPSHOT, STATE_DELTA, MESSAGES_SNAPSHOT

REASONING (6+1)   ✅ REASONING_START, REASONING_MESSAGE_START, REASONING_MESSAGE_CONTENT,
                     REASONING_MESSAGE_END, REASONING_END
                  ⚙️ REASONING_ENCRYPTED_VALUE (requires ZDR endpoint)
                  — REASONING_MESSAGE_CHUNK (convenience, not used)

ACTIVITY (2)      ❌ ACTIVITY_SNAPSHOT, ACTIVITY_DELTA (workflow-only, not demonstrated)

SPECIAL (2)       ✅ CUSTOM (usage, approval, PredictState)
                  — RAW (type defined, not actively used)
```

For a complete deep dive, see **[docs/ag-ui-event-reference.md](docs/ag-ui-event-reference.md)** — includes framework implementation details, event lifecycles, payload schemas, and coverage gap analysis.

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
