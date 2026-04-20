# AG-UI Playground

An educational demo application showcasing the **AG-UI (Agent-User Interaction) Protocol** integrated with **Microsoft Agent Framework** (Python). This playground lets you visualize, toggle, and understand AG-UI features in real-time.

## What is AG-UI?

AG-UI is an open, lightweight, event-based protocol that standardizes how AI agents connect to user-facing applications. It sits alongside MCP (tools) and A2A (agent-to-agent) in the modern agentic protocol stack:

- **MCP** gives agents tools
- **A2A** lets agents talk to other agents  
- **AG-UI** brings agents into user-facing applications

## Features Demonstrated

| Feature | AG-UI Events | Tab |
|---------|-------------|-----|
| Streaming Chat | `TEXT_MESSAGE_START/CONTENT/END` | Chat |
| Tool Calls | `TOOL_CALL_START/ARGS/END/RESULT` | Chat |
| Human-in-the-Loop | Approval interrupts | Chat |
| Shared State | `STATE_SNAPSHOT`, `STATE_DELTA` | State |
| Predictive Updates | Streaming tool args → state | State |
| Step Tracking | `STEP_STARTED/STEP_FINISHED` | Both |
| Event Observability | All raw events in inspector | Both |

## Architecture

```
┌─────────────────────────────────────────┐
│  React Frontend (Vite + TypeScript)     │
│  ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ Chat Tab │ │State Tab │ │Inspector│  │
│  └─────┬────┘ └─────┬────┘ └────────┘  │
│        │ Raw SSE     │                   │
│        │ (fetch API) │                   │
└────────┼─────────────┼──────────────────┘
         │ HTTP POST + SSE
         ▼
┌─────────────────────────────────────────┐
│  Python Backend (FastAPI)               │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ /chat       │  │ /state           │  │
│  │ ChatAgent   │  │ AgentFramework   │  │
│  │ + tools     │  │ Agent + state    │  │
│  └──────┬──────┘  └────────┬─────────┘  │
│         │                   │            │
│         └─────────┬─────────┘            │
│                   ▼                      │
│         agent-framework-ag-ui            │
│         (SSE event bridge)               │
└───────────────────┬─────────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ Azure AI Foundry │
         │ (GPT-4o-mini)    │
         └──────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 20+
- Azure OpenAI endpoint (via Azure AI Foundry)
- Azure CLI authenticated (`az login`)

### Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Azure OpenAI endpoint

# Run
python server.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 - the frontend proxies `/api/*` to the backend at `:8888`.

## How It Works

### The AG-UI Protocol

Communication flows via **HTTP POST** (client → server) and **Server-Sent Events** (server → client):

1. Frontend sends a POST with messages and optional state
2. Backend streams back typed JSON events via SSE
3. Frontend parses events and updates UI in real-time

### Event Inspector

The right panel shows **every raw AG-UI event** as it streams in, color-coded by type:
- 🔵 Blue: Lifecycle events (RUN_STARTED, RUN_FINISHED)
- 🟢 Green: Text messages (streaming tokens)
- 🟡 Yellow: Tool calls (function invocations)
- 🟣 Purple: State events (snapshots and deltas)
- 🔴 Red: Errors

Click any event to see its full JSON payload.

### Feature Toggles

The left panel lets you enable/disable AG-UI features to see how they affect the event stream.

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
  MESSAGES_SNAPSHOT, RAW, CUSTOM
}
```

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/utils/sse-client.ts` | Raw SSE parser showing AG-UI wire protocol |
| `frontend/src/hooks/useAgentStream.ts` | React hook managing AG-UI event handling |
| `frontend/src/hooks/useSharedState.ts` | JSON Patch state sync for STATE_DELTA |
| `frontend/src/components/EventInspector.tsx` | Real-time event visualization |
| `backend/server.py` | FastAPI server with AG-UI endpoints |
| `backend/agents/stateful_agent.py` | Shared state agent with predictive updates |

## License

MIT
