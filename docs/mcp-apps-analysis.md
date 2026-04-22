# MCP Apps Implementation Analysis

## How AG-UI + MCP Apps Work Together

AG-UI is **not** a generative UI specification — it's a user interaction protocol providing
the bidirectional runtime connection between agent and application. AG-UI explicitly supports
all generative UI standards (A2UI, Open-JSON-UI, **MCP-UI/Apps**) through its flexible event
system.

**There is no dedicated AG-UI event type for MCP Apps.** The correct integration pattern is:

1. Tool calls flow through standard AG-UI events (`TOOL_CALL_START/ARGS/END/RESULT`)
2. MCP App metadata is surfaced via `CUSTOM` events (our `"McpApp"` event)
3. The frontend handles rendering the interactive UI based on the custom event data

This means **our approach of using CUSTOM events is the correct and recommended pattern**.

---

## Architecture Assessment

### What We Got Right ✅

| Area | Implementation | Status |
|------|---------------|--------|
| **CUSTOM event approach** | `McpApp` CUSTOM event for MCP App metadata | ✅ Correct — AG-UI has no native MCP Apps event |
| **PostMessageTransport params** | `(iframe.contentWindow, iframe.contentWindow)` host-side | ✅ Correct — matches official SDK examples |
| **App-side PostMessageTransport** | `(window.parent, window.parent)` | ✅ Correct — 2nd param is eventSource for validation |
| **AppBridge initialization sequence** | `oninitialized → sendToolInput → sendToolResult` | ✅ Correct lifecycle |
| **Vite single-file bundles** | `vite-plugin-singlefile` for self-contained HTML | ✅ Standard pattern |
| **Resource MIME type** | `text/html;profile=mcp-app` | ✅ Matches `RESOURCE_MIME_TYPE` constant from SDK |
| **Tool metadata** | `meta={"ui": {"resourceUri": "ui://..."}}` | ✅ Correct (new nested format) |
| **structuredContent** | Tool returns both `content` (text) and `structuredContent` (dict) | ✅ Correct separation of model vs UI data |
| **AppBridge with null client** | `new AppBridge(null, hostInfo, capabilities)` | ✅ Works — client only needed for advanced features |
| **Static HTML serving** | `/app-html/{name}` endpoint, no data in URL | ✅ Clean separation of code and data |

### Compliance Gaps ⚠️

#### 1. Iframe Sandbox Missing `allow-same-origin`

**Current:** `sandbox="allow-scripts"`
**Spec requires:** `sandbox="allow-scripts allow-same-origin"`

The MCP Apps specification states the host **must** include `allow-same-origin` in the sandbox
attribute. Without it, the iframe has an opaque origin which can cause issues with:
- `localStorage` / `sessionStorage` access
- Cookie-based authentication
- Certain PostMessage origin checks

**Fix:** Add `allow-same-origin` to the iframe sandbox attribute.

#### 2. No Host Context Sent on Initialization

The MCP Apps spec defines host context that should be sent during AppBridge initialization:
```typescript
bridge.setHostContext({
  theme: { mode: "dark" },
  locale: "en-US",
  containerDimensions: { width: 800, height: 420 },
  css: { /* CSS variables for theming */ }
});
```

Our apps use hardcoded dark theme CSS. Sending host context would enable apps to adapt
to the host's theme dynamically.

**Impact:** Low — our apps work fine with hardcoded styles, but it's not spec-compliant
for theme interop.

#### 3. No CSP Declarations on Resources

The spec allows servers to declare Content Security Policy requirements:
```python
# Server can declare what domains the app needs access to
_meta.ui.csp = {
    "connectDomains": ["https://api.example.com"],
    "resourceDomains": ["https://cdn.example.com"]
}
```

Our apps are fully self-contained (no external fetches), so this isn't causing issues,
but a production implementation should declare CSP requirements.

**Impact:** None currently — our apps have no external dependencies.

#### 4. No Tool Visibility Filtering

The MCP Apps spec supports `visibility` on tool metadata:
```json
{
  "_meta": {
    "ui": {
      "resourceUri": "ui://...",
      "visibility": ["app"]     // app-only, not sent to model
    }
  }
}
```

Tools with `visibility: ["app"]` should not be included in the model's tool list.
We're not filtering based on visibility.

**Impact:** Low — all our app tools are also useful for the model to call.

#### 5. Redundant Data in CallToolResult

```python
CallToolResult(
    content=[TextContent(type="text", text=json.dumps(data))],  # For model context
    structuredContent=data,                                       # For UI rendering
)
```

Per spec, `content` is for the **model** (text summary) and `structuredContent` is for
the **UI** (structured data). They should have different content:
- `content` → Brief text summary: `"Sales dataset: 20 rows, 5 columns"`
- `structuredContent` → Full data dict with rows, columns, etc.

Currently we duplicate the full JSON in both, which wastes model context tokens.

**Impact:** Medium — wastes tokens by putting full data into model context.

#### 6. Brittle Envelope Parsing in Backend Middleware

The `mcp_app_stream` middleware tries three different ways to extract structured data from
`event.content`:
1. Check for `structuredContent` key (CallToolResult envelope)
2. Fall back to `content[0].text` parsing
3. Fall back to full parsed object

This defensive approach exists because `MCPStreamableHTTPTool` from Agent Framework
may serialize the CallToolResult differently depending on the version. The parsing
should be simplified once the data format is stabilized.

**Impact:** Low — works correctly, but fragile.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ USER: "Explore the sales dataset"                       │
└─────────────────────────┬───────────────────────────────┘
                          │ POST /chat (AG-UI request)
                          ▼
┌─────────────────────────────────────────────────────────┐
│ BACKEND (server.py)                                     │
│  → Agent decides to call explore_dataset_app("sales")   │
│  → AG-UI emits: TOOL_CALL_START, TOOL_CALL_ARGS         │
│  → MCPStreamableHTTPTool → MCP Server                   │
└─────────────────────────┬───────────────────────────────┘
                          │ MCP Streamable HTTP
                          ▼
┌─────────────────────────────────────────────────────────┐
│ MCP SERVER (mcp/server.py)                              │
│  explore_dataset_app("sales", 10) →                     │
│  CallToolResult(                                        │
│    content=[TextContent(text=json.dumps(data))],        │
│    structuredContent=data                               │
│  )                                                      │
└─────────────────────────┬───────────────────────────────┘
                          │ Tool result back to backend
                          ▼
┌─────────────────────────────────────────────────────────┐
│ BACKEND MIDDLEWARE (mcp_app_stream)                      │
│  1. Yield TOOL_CALL_RESULT event (standard AG-UI)       │
│  2. Detect: tool is in MCP_APP_TOOL_NAMES               │
│  3. Parse event.content → extract structuredContent     │
│  4. Emit CUSTOM "McpApp" event:                         │
│     { toolCallId, appId, structuredContent, toolArgs }  │
└─────────────────────────┬───────────────────────────────┘
                          │ SSE stream to frontend
                          ▼
┌─────────────────────────────────────────────────────────┐
│ FRONTEND (useAgentStream hook)                          │
│  onEvent("CUSTOM") → name === "McpApp"                  │
│  → setMcpApps([...prev, appData])                       │
│  → ChatTab matches mcpApp.toolCallId to tool call       │
└─────────────────────────┬───────────────────────────────┘
                          │ React render
                          ▼
┌─────────────────────────────────────────────────────────┐
│ McpAppViewer COMPONENT                                  │
│  1. Fetch HTML: GET /mcp-api/app-html/{appId}           │
│  2. Render: <iframe srcDoc={html} sandbox="...">        │
│  3. On load: Create AppBridge + PostMessageTransport    │
│  4. oninitialized:                                      │
│     → bridge.sendToolInput({ arguments })               │
│     → bridge.sendToolResult({ structuredContent })      │
└─────────────────────────┬───────────────────────────────┘
                          │ PostMessage
                          ▼
┌─────────────────────────────────────────────────────────┐
│ IFRAME APP (e.g. dataset-explorer.ts)                   │
│  App.ontoolresult = (params) => {                       │
│    data = params.structuredContent                      │
│    render()  // Interactive table, chart, etc.          │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Comparison: Our Pattern vs Official MCP Apps Spec

| Spec Requirement | Our Implementation | Verdict |
|------------------|--------------------|---------|
| Resource MIME: `text/html;profile=mcp-app` | ✅ Matches | Correct |
| Resource URI: `ui://` scheme | ✅ `ui://ag-ui-playground/...` | Correct |
| Tool meta: `_meta.ui.resourceUri` | ✅ Nested format | Correct |
| CallToolResult with structuredContent | ✅ Both content + structuredContent | Correct |
| Host: AppBridge + PostMessageTransport | ✅ Implemented | Correct |
| App: App + PostMessageTransport | ✅ All 3 apps use SDK | Correct |
| Initialization: init → toolInput → toolResult | ✅ oninitialized callback | Correct |
| Sandbox: `allow-scripts allow-same-origin` | ⚠️ Missing `allow-same-origin` | Fix needed |
| Host context (theme, locale, dimensions) | ❌ Not implemented | Nice-to-have |
| CSP declarations | ❌ Not declared (not needed) | N/A |
| Tool visibility filtering | ❌ Not implemented | Nice-to-have |
| content vs structuredContent separation | ⚠️ Duplicated (should differ) | Should fix |
| Vite single-file bundle | ✅ vite-plugin-singlefile | Correct |
| Size change handling | ✅ bridge.onsizechange | Correct |

---

## Priority Fixes

### P0 — Must Fix
1. **Add `allow-same-origin` to iframe sandbox** — Spec requirement, may cause PostMessage issues

### P1 — Should Fix
2. **Separate content vs structuredContent** — Stop duplicating full data in model context
3. **Add deduplication** for McpApp events in useAgentStream hook

### P2 — Nice to Have
4. **Send host context** (theme, dimensions) during AppBridge init
5. **Simplify envelope parsing** in backend middleware
6. **Add error recovery** in iframe apps (try-catch around render)
7. **Tool visibility metadata** for completeness

---

## Summary

**Overall grade: B+**

The implementation follows the correct MCP Apps architecture pattern. The key decisions
(CUSTOM events for AG-UI integration, AppBridge for data delivery, Vite single-file
bundles, structuredContent for UI data) are all aligned with the official spec. The main
gaps are minor compliance issues (sandbox attribute, content separation) rather than
architectural problems.
