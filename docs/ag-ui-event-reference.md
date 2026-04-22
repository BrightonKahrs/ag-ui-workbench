# AG-UI Protocol Event Reference

A comprehensive reference for all AG-UI event types, how Microsoft Agent Framework implements them, and how this playground demonstrates each one.

---

## Protocol Overview

The AG-UI (Agent-User Interaction) Protocol is an open, event-driven standard for real-time communication between AI agent backends and user-facing frontends. Events stream over SSE (Server-Sent Events) as typed JSON objects.

Every event inherits from a common base:

```json
{
  "type": "EVENT_TYPE",
  "timestamp": 1713794638000
}
```

The spec defines **33 event types** across 9 categories. Excluding 5 deprecated and 3 convenience-chunk events, there are **25 production event types**.

---

## Event Coverage Matrix

| # | Event Type | Category | Framework | Playground | Notes |
|---|-----------|----------|-----------|------------|-------|
| 1 | `RUN_STARTED` | Lifecycle | ✅ Native | ✅ Both tabs | Thread/run ID capture, inspector icon |
| 2 | `RUN_FINISHED` | Lifecycle | ✅ Native | ✅ Both tabs | Interrupt detection for HITL resume |
| 3 | `RUN_ERROR` | Lifecycle | ✅ Native | ✅ Chat tab | Red error banner in chat UI |
| 4 | `STEP_STARTED` | Steps | ⚙️ Workflows | ✅ Inspector | Toggle-controlled, 👣 icon |
| 5 | `STEP_FINISHED` | Steps | ⚙️ Workflows | ✅ Inspector | Lifecycle grouping in grouped view |
| 6 | `TEXT_MESSAGE_START` | Text | ✅ Native | ✅ Chat tab | Creates streaming message bubble |
| 7 | `TEXT_MESSAGE_CONTENT` | Text | ✅ Native | ✅ Chat tab | Token-by-token streaming with cursor |
| 8 | `TEXT_MESSAGE_END` | Text | ✅ Native | ✅ Chat tab | Removes cursor, locks message |
| 9 | `TEXT_MESSAGE_CHUNK` | Text | ❌ | ❌ | Convenience event — framework uses explicit lifecycle |
| 10 | `TOOL_CALL_START` | Tools | ✅ Native | ✅ Chat tab | Yellow tool card with ⏳ icon |
| 11 | `TOOL_CALL_ARGS` | Tools | ✅ Native | ✅ Chat tab | Streaming JSON args, pretty-printed |
| 12 | `TOOL_CALL_END` | Tools | ✅ Native | ✅ Chat tab | HITL detection for `confirm_changes` |
| 13 | `TOOL_CALL_RESULT` | Tools | ✅ Native | ✅ Chat tab | Green ✓, expandable result panel |
| 14 | `TOOL_CALL_CHUNK` | Tools | ❌ | ❌ | Convenience event — framework uses explicit lifecycle |
| 15 | `STATE_SNAPSHOT` | State | ✅ Native | ✅ State tab | Full state replacement, chart re-render |
| 16 | `STATE_DELTA` | State | ⚙️ Middleware | ✅ State tab | JSON Patch via `state_diff_stream()` middleware |
| 17 | `MESSAGES_SNAPSHOT` | State | ✅ Native | ⚙️ Internal | Captured for resume; not user-visible |
| 18 | `REASONING_START` | Reasoning | ✅ Native | ✅ Chat tab | Opens 🧠 collapsible reasoning block |
| 19 | `REASONING_MESSAGE_START` | Reasoning | ✅ Native | ⚙️ Inspector | Type defined, icon assigned, no chat handler |
| 20 | `REASONING_MESSAGE_CONTENT` | Reasoning | ✅ Native | ✅ Chat tab | Streams reasoning text in orange block |
| 21 | `REASONING_MESSAGE_END` | Reasoning | ✅ Native | ✅ Chat tab | Handled alongside REASONING_END |
| 22 | `REASONING_MESSAGE_CHUNK` | Reasoning | ❌ | ❌ | Convenience event — framework uses explicit lifecycle |
| 23 | `REASONING_END` | Reasoning | ✅ Native | ✅ Chat tab | Closes reasoning block |
| 24 | `REASONING_ENCRYPTED_VALUE` | Reasoning | ✅ Native | ❌ | Requires ZDR-configured endpoint |
| 25 | `ACTIVITY_SNAPSHOT` | Activity | ⚙️ Workflows | ❌ | Only emitted in workflow orchestration |
| 26 | `ACTIVITY_DELTA` | Activity | ❌ | ❌ | Not emitted by framework |
| 27 | `CUSTOM` | Special | ✅ Native | ✅ Chat tab | Usage tracking, 🧠 reasoning token badge |
| 28 | `RAW` | Special | ❌ | ⚙️ Type only | Type/icon defined, no active use |
| 29 | `THINKING_START` | Deprecated | ❌ | ❌ | Replaced by REASONING_START |
| 30 | `THINKING_END` | Deprecated | ❌ | ❌ | Replaced by REASONING_END |
| 31 | `THINKING_TEXT_MESSAGE_START` | Deprecated | ❌ | ❌ | Replaced by REASONING_MESSAGE_START |
| 32 | `THINKING_TEXT_MESSAGE_CONTENT` | Deprecated | ❌ | ❌ | Replaced by REASONING_MESSAGE_CONTENT |
| 33 | `THINKING_TEXT_MESSAGE_END` | Deprecated | ❌ | ❌ | Replaced by REASONING_MESSAGE_END |

### Legend
- ✅ **Native** — Framework emits automatically; playground actively demonstrates
- ⚙️ **Partial** — Requires specific conditions (workflows, middleware, internal only)
- ❌ **Not present** — Not emitted or not handled

---

## Category Deep Dives

### 1. Run Lifecycle Events

The outermost event boundary. Every agent interaction starts with `RUN_STARTED` and ends with `RUN_FINISHED` or `RUN_ERROR`.

```
RUN_STARTED → (streaming events) → RUN_FINISHED
                                 → RUN_ERROR (on failure)
```

**Key fields:**
- `RUN_STARTED`: `threadId`, `runId` — assigned by the framework after first model response
- `RUN_FINISHED`: `interrupt?` — array of interrupts when HITL approval is pending
- `RUN_ERROR`: `message`, `code?`

**Playground implementation:**
- Chat & State tabs capture `threadId` for resume capability
- `RUN_FINISHED` with interrupts triggers the HITL approval dialog
- `RUN_ERROR` shows a red error banner in the chat UI
- Event Inspector shows ▶️ / ✅ / ❌ icons per run

---

### 2. Step Events

Mark phases within a run. In the AG-UI spec, steps are sub-units of work within a larger run.

```
STEP_STARTED → (events) → STEP_FINISHED
```

**Framework behavior:** Only emitted by `_workflow_run.py` for multi-agent workflow orchestration:
- `superstep:{iteration}` — workflow iteration boundaries
- `{executor_id}` — individual executor invocations

**Playground:** Toggle-controlled via `stepEvents` feature flag. Visible in Event Inspector with 👣 icon and lifecycle grouping.

---

### 3. Text Message Events

The core streaming mechanism. Messages arrive as a stream of deltas between start and end markers.

```
TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT (×N) → TEXT_MESSAGE_END
```

**Key fields:**
- `START`: `messageId`, `role` (assistant/user/system/tool)
- `CONTENT`: `messageId`, `delta` (non-empty text chunk)
- `END`: `messageId`

**Playground implementation:**
- Message bubbles appear on `START` with a streaming cursor (▌)
- Deltas accumulate in real-time on `CONTENT`
- Cursor disappears on `END`, message is locked
- Framework also auto-creates `START` for tool-only responses (so tool calls have parent message context)

**Note on TEXT_MESSAGE_CHUNK:** This is a convenience event that auto-expands to START+CONTENT+END. The framework always uses the explicit lifecycle, which is preferred for educational clarity.

---

### 4. Tool Call Events

Tool invocations stream their arguments incrementally and report results.

```
TOOL_CALL_START → TOOL_CALL_ARGS (×N) → TOOL_CALL_END → TOOL_CALL_RESULT
```

**Key fields:**
- `START`: `toolCallId`, `toolCallName`, `parentMessageId?`
- `ARGS`: `toolCallId`, `delta` (JSON fragment)
- `END`: `toolCallId`
- `RESULT`: `toolCallId`, `content`, `role?`

**Playground implementation:**
- Yellow tool card appears on `START` with function name
- JSON arguments stream and pretty-print on `ARGS`
- `END` triggers HITL detection — if tool is `confirm_changes`, shows approval dialog
- `RESULT` turns card green with expandable result
- Supports local tools (weather, calculate, time) and MCP tools

**Framework extras:**
- MCP tool calls arrive complete (not streamed) but emit START→ARGS→END for consistency
- Declaration-only tools get `TOOL_CALL_END` at run end to maintain UI consistency
- `confirm_changes` pseudo-tool implements the HITL approval pattern

---

### 5. State Management Events

Bidirectional state sync between agent and frontend.

```
STATE_SNAPSHOT (full)  →  STATE_DELTA (incremental, RFC 6902 JSON Patch)
```

**Key fields:**
- `STATE_SNAPSHOT`: `snapshot` (complete state object)
- `STATE_DELTA`: `delta` (array of JSON Patch operations)
- `MESSAGES_SNAPSHOT`: `messages` (conversation history for resume)

**Playground implementation:**
- State tab renders live Recharts visualizations from shared state
- `STATE_SNAPSHOT` replaces full state and re-renders chart
- `STATE_DELTA` applies JSON Patch operations incrementally (via `fast-json-patch`)
- "Smart Deltas" toggle controls whether middleware converts snapshots to deltas
- `MESSAGES_SNAPSHOT` captured internally for resume capability

**Framework gap:** Agent Framework only emits `STATE_SNAPSHOT` natively. Our `state_diff_stream()` middleware bridges this by:
1. Tracking a shadow copy of the last emitted state
2. Computing JSON Patch diffs between consecutive snapshots
3. Emitting `STATE_DELTA` when the diff is smaller than 80% of the full snapshot
4. Falling through to full `STATE_SNAPSHOT` for large changes

---

### 6. Reasoning Events

Full lifecycle for model reasoning/thinking content. Introduced to replace the deprecated `THINKING_*` events.

```
REASONING_START → REASONING_MESSAGE_START → REASONING_MESSAGE_CONTENT (×N) → REASONING_MESSAGE_END → REASONING_END
```

**Key fields:**
- `START`/`END`: `messageId` — outer block boundary
- `MESSAGE_START`: `messageId`, `role` ("reasoning")
- `MESSAGE_CONTENT`: `messageId`, `delta` (reasoning text)
- `MESSAGE_END`: `messageId`
- `ENCRYPTED_VALUE`: `subtype` ("message"/"tool-call"), `entityId`, `encryptedValue`

**Playground implementation:**
- Toggle "Reasoning" model mode to use gpt-5-mini with `reasoning.summary: "auto"`
- `REASONING_START` creates a collapsible 🧠 reasoning block above the assistant message
- `REASONING_MESSAGE_CONTENT` streams thinking text in orange
- `REASONING_END` closes the block
- `CUSTOM(usage)` with `openai.reasoning_tokens` adds a token badge to the message

**Model notes:**
- `gpt-5-mini` with `reasoning: {"effort": "medium", "summary": "auto"}` streams readable reasoning summaries
- `o4-mini` requires organization verification for `reasoning.summary`
- Framework converts `response.reasoning_summary_text.delta` → `Content.from_text_reasoning()` → AG-UI REASONING_* events natively

---

### 7. Activity Events

Progress/status updates between regular messages. Designed for multi-step workflows.

```
ACTIVITY_SNAPSHOT (full)  →  ACTIVITY_DELTA (incremental)
```

**Framework behavior:**
- `ACTIVITY_SNAPSHOT` emitted in `_workflow_run.py` for executor invocations (status: in_progress/completed/failed)
- `ACTIVITY_DELTA` is not emitted by the framework

**Playground:** Not demonstrated — would require workflow orchestration.

---

### 8. Special Events

Extension points for custom and raw data.

**CUSTOM** — Structured extension with `name` + `value`:
- Framework emits 7 custom event types: `usage`, `function_approval_request`, `oauth_consent_request`, `PredictState`, `request_info`, `WorkflowInterruptEvent`, `status`
- Playground handles `usage` events with `openai.reasoning_tokens` to show token badges

**RAW** — Unstructured passthrough with `event` + `source?`:
- Not emitted by the framework
- Type and icon defined in playground but not actively used

---

### 9. Deprecated Events

The original `THINKING_*` family (5 events) has been replaced by `REASONING_*`. These are still defined in the Python SDK but should not be used in new implementations.

| Deprecated | Replacement |
|-----------|-------------|
| `THINKING_START` | `REASONING_START` |
| `THINKING_END` | `REASONING_END` |
| `THINKING_TEXT_MESSAGE_START` | `REASONING_MESSAGE_START` |
| `THINKING_TEXT_MESSAGE_CONTENT` | `REASONING_MESSAGE_CONTENT` |
| `THINKING_TEXT_MESSAGE_END` | `REASONING_MESSAGE_END` |

---

## Framework Implementation Details

### 10 Emit Functions in `_run_common.py`

| Function | Events Emitted |
|----------|---------------|
| `_emit_run_started()` | RUN_STARTED |
| `_emit_run_finished()` | RUN_FINISHED (with interrupts) |
| `_emit_run_error()` | RUN_ERROR |
| `_emit_text()` | TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END |
| `_emit_tool_call()` | TOOL_CALL_START, TOOL_CALL_ARGS |
| `_emit_tool_call_end()` | TOOL_CALL_END |
| `_emit_tool_result()` | TOOL_CALL_RESULT |
| `_emit_text_reasoning()` | REASONING_START, MESSAGE_START, MESSAGE_CONTENT |
| `_close_reasoning_block()` | REASONING_MESSAGE_END, REASONING_END |
| `_emit_state()` | STATE_SNAPSHOT |
| `_emit_messages_snapshot()` | MESSAGES_SNAPSHOT |

### Content Type Router

The framework's `_emit_content()` routes content objects by type:

```
Content.type → handler
─────────────────────────
text              → _emit_text()
function_call     → _emit_tool_call()
function_result   → _emit_tool_result()
text_reasoning    → _emit_text_reasoning()
function_approval → _emit_approval() (CUSTOM event)
usage             → _emit_usage() (CUSTOM event)
mcp_server_tool_* → _emit_tool_call/result()
```

### Predictive State Pipeline

When `predict_state_config` is set, the framework:
1. Emits `CUSTOM(PredictState)` after `RUN_STARTED` with the config
2. Extracts state values from tool arguments as they stream
3. Emits `STATE_SNAPSHOT` after tool result with updated state
4. Suppresses intermediate `MESSAGES_SNAPSHOT` for predictive tools without confirmation

---

## Coverage Summary

### By the Numbers

Of **25 non-deprecated, non-convenience** event types:
- **19 fully supported** by Microsoft Agent Framework (76%)
- **4 partially supported** (16%) — Step events (workflows only), Activity Snapshot (workflows only), State Delta (via middleware), Messages Snapshot (internal)
- **2 not supported** (8%) — Activity Delta, Raw

**Effective framework coverage: 92%**

### Playground Demonstration

Of the same 25 event types:
- **17 actively demonstrated** to the user (68%)
- **4 handled internally** (16%) — Messages Snapshot, Reasoning Message Start, Raw, Step events
- **4 not demonstrated** (16%) — Activity Snapshot/Delta, Reasoning Encrypted Value, Raw

**Playground demonstration coverage: 84%**

### What Would Complete the Picture

| Gap | What's Needed | Difficulty |
|-----|--------------|------------|
| Activity events | Workflow orchestration backend | High — requires multi-agent workflow |
| Reasoning Encrypted Value | ZDR-configured Foundry endpoint | Medium — config change only |
| Step events (active demo) | Manual emission or workflow | Medium |
| Chunk events | Intentionally skipped — framework uses explicit lifecycle | N/A |
