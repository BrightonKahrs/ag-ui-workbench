import { useEffect, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent, ToolDisplayMode, ReasoningDisplayMode } from "../types/ag-ui";
import { useAgentStream, type ToolCall } from "../hooks/useAgentStream";
import McpAppViewer from "./McpAppViewer";

interface Props {
  toggles: FeatureToggles;
  onEvents: (events: TimestampedEvent[]) => void;
}

/** Pretty-print JSON args */
function FormatArgs({ args }: { args: string }) {
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    const pretty = JSON.stringify(parsed, null, 2);
    return <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap font-mono">{pretty}</pre>;
  } catch {
    return <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap font-mono">{args}</pre>;
  }
}

// ─── Tool Call Display: INLINE ───────────────────────────────────────────────

function ToolCallInline({ tc }: { tc: ToolCall }) {
  if (tc.name === "confirm_changes") return null;
  const isActive = tc.status === "calling";
  const isError = tc.status === "error" || (tc.result && tc.result.startsWith("Error"));

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
        isActive ? "bg-amber-400 animate-pulse" : isError ? "bg-red-400" : "bg-green-400"
      }`} />
      <span className="font-medium text-gray-600">{tc.name}</span>
      {isActive && <span className="text-gray-400">running…</span>}
      {!isActive && tc.result && (
        <span className="text-gray-400 truncate max-w-[200px]">
          → {tc.result.slice(0, 60)}{tc.result.length > 60 ? "…" : ""}
        </span>
      )}
    </div>
  );
}

// ─── Tool Call Display: CARD ─────────────────────────────────────────────────

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  if (tc.name === "confirm_changes") return null;

  const isActive = tc.status === "calling";
  const isApproval = tc.status === "awaiting_approval";
  const isRejected = tc.status === "rejected";
  const isError = tc.status === "error" || (tc.result && tc.result.startsWith("Error"));

  const borderColor = isActive
    ? "border-amber-200 bg-amber-50"
    : isApproval
    ? "border-orange-200 bg-orange-50"
    : isRejected || isError
    ? "border-red-200 bg-red-50"
    : "border-green-200 bg-green-50";

  const iconColor = isActive
    ? "text-amber-600"
    : isApproval
    ? "text-orange-600"
    : isRejected || isError
    ? "text-red-600"
    : "text-green-600";

  const icon = isActive ? "⏳" : isApproval ? "🔐" : isRejected || isError ? "✗" : "✓";

  return (
    <div className="flex justify-start">
      <div className={`border rounded-xl px-4 py-2.5 max-w-[80%] shadow-soft ${borderColor}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`text-xs font-medium flex items-center gap-1.5 w-full text-left ${iconColor}`}
        >
          <span>{icon}</span>
          <span>
            {isActive ? "Calling" : isApproval ? "Awaiting approval" : isRejected ? "Rejected" : isError ? "Error" : "Called"}:
          </span>
          <span className="font-mono text-gray-700">{tc.name}</span>
          <span className="ml-auto text-gray-400 text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        {expanded && (
          <div className="space-y-2 mt-2 pt-2 border-t border-gray-200">
            {tc.args && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Arguments</div>
                <FormatArgs args={tc.args} />
              </div>
            )}
            {tc.result && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Result</div>
                <pre className={`text-xs overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto font-mono ${
                  isError ? "text-red-600" : "text-gray-600"
                }`}>
                  {tc.result}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool Call Display: TIMELINE ─────────────────────────────────────────────

function ToolCallTimeline({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  if (tc.name === "confirm_changes") return null;

  const isActive = tc.status === "calling";
  const isError = tc.status === "error" || (tc.result && tc.result.startsWith("Error"));

  const dotColor = isActive
    ? "bg-amber-400 ring-amber-100"
    : isError
    ? "bg-red-400 ring-red-100"
    : "bg-green-400 ring-green-100";

  return (
    <div className="flex gap-3 pl-2">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full ring-4 ${dotColor} mt-1`} />
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>
      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm text-gray-700 font-medium w-full text-left"
        >
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{tc.name}</span>
          {isActive && <span className="text-xs text-amber-600">running…</span>}
          <span className="ml-auto text-gray-400 text-[10px]">{expanded ? "▾" : "▸"}</span>
        </button>
        {expanded && (
          <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
            {tc.args && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Args</div>
                <FormatArgs args={tc.args} />
              </div>
            )}
            {tc.result && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Result</div>
                <pre className={`text-xs overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto font-mono ${
                  isError ? "text-red-600" : "text-gray-600"
                }`}>
                  {tc.result}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool Call Router ─────────────────────────────────────────────────────────

function ToolCallDisplay({ tc, mode }: { tc: ToolCall; mode: ToolDisplayMode }) {
  switch (mode) {
    case "inline":
      return <ToolCallInline tc={tc} />;
    case "card":
      return <ToolCallCard tc={tc} />;
    case "timeline":
      return <ToolCallTimeline tc={tc} />;
  }
}

// ─── Reasoning Display: SUMMARY ──────────────────────────────────────────────

function ReasoningSummary({ content, isActive, tokenCount }: { content: string; isActive: boolean; tokenCount?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-brand-600 hover:text-brand-700 transition-colors"
      >
        <span className={`inline-block w-4 h-4 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[9px] ${isActive ? "animate-pulse" : ""}`}>
          🧠
        </span>
        <span className="font-medium">{isActive ? "Thinking…" : "Reasoning"}</span>
        {tokenCount && tokenCount > 0 && (
          <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-full font-mono">
            {tokenCount} tokens
          </span>
        )}
        <span className="text-gray-400 text-[10px]">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 pl-5 border-l-2 border-brand-200 text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
          {content}
          {isActive && <span className="cursor-blink text-brand-400">▌</span>}
        </div>
      )}
    </div>
  );
}

// ─── Reasoning Display: STREAMING ────────────────────────────────────────────

function ReasoningStreaming({ content, isActive }: { content: string; isActive: boolean }) {
  return (
    <div className="mb-3 bg-brand-50/50 border border-brand-100 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-brand-600 mb-1.5">
        <span className={isActive ? "animate-pulse" : ""}>🧠</span>
        <span className="font-medium">{isActive ? "Thinking…" : "Reasoning complete"}</span>
      </div>
      <div className="text-xs text-gray-600 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
        {content}
        {isActive && <span className="cursor-blink text-brand-400">▌</span>}
      </div>
    </div>
  );
}

// ─── Reasoning Router ────────────────────────────────────────────────────────

function ReasoningDisplay({
  mode,
  content,
  isActive,
  tokenCount,
}: {
  mode: ReasoningDisplayMode;
  content: string;
  isActive: boolean;
  tokenCount?: number;
}) {
  if (!content) return null;
  switch (mode) {
    case "hidden":
      return null;
    case "summary":
      return <ReasoningSummary content={content} isActive={isActive} tokenCount={tokenCount} />;
    case "streaming":
      return <ReasoningStreaming content={content} isActive={isActive} />;
  }
}

// ─── Token Usage Badge ───────────────────────────────────────────────────────

function TokenBadge({ reasoningTokens }: { reasoningTokens?: number }) {
  if (!reasoningTokens || reasoningTokens <= 0) return null;
  return (
    <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
      <span>📊</span>
      <span className="font-mono font-medium">{reasoningTokens}</span>
      <span className="opacity-70">reasoning tokens</span>
    </div>
  );
}

// ─── Main ChatTab ────────────────────────────────────────────────────────────

export default function ChatTab({ toggles, onEvents }: Props) {
  const {
    messages,
    toolCalls,
    events,
    mcpApps,
    isRunning,
    error,
    pendingApproval,
    sendMessage,
    respondToApproval,
    clearMessages,
    clearEvents,
    cancelRun,
  } = useAgentStream("/chat", toggles);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onEvents(events);
  }, [events, onEvents]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolCalls, pendingApproval]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Tab Description */}
      <div className="bg-white border-b border-gray-200 px-5 py-2.5">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-700">Chat</strong> — Streaming text,
          tool calls, and human-in-the-loop approvals via AG-UI events.
        </p>
      </div>

      {/* Messages and Tool Calls — interleaved by order */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && !toolCalls.length && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-brand-500 text-2xl">◆</span>
              </div>
              <p className="text-lg font-medium text-gray-800 mb-2">Welcome to AG-UI Workbench</p>
              <p className="text-sm text-gray-400 leading-relaxed">
                Configure your experience using the settings panel, then send a message to see AG-UI protocol events in action.
              </p>
              {toggles.humanInTheLoop && (
                <p className="text-xs text-orange-600 mt-4 bg-orange-50 inline-block px-3 py-1.5 rounded-full">
                  🔐 Human-in-the-Loop is ON — tool calls will require your approval.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Build interleaved timeline from messages and tool calls sorted by order */}
        {(() => {
          type TimelineItem =
            | { kind: "message"; data: typeof messages[0] }
            | { kind: "toolcall"; data: typeof toolCalls[0] };

          const timeline: TimelineItem[] = [
            ...messages
              .filter((msg) => msg.role === "user" || msg.content || msg.isStreaming || msg.reasoningContent)
              .map((m) => ({ kind: "message" as const, data: m })),
            ...(toggles.toolCalls
              ? toolCalls.map((tc) => ({ kind: "toolcall" as const, data: tc }))
              : []),
          ].sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));

          return timeline.map((item) => {
            if (item.kind === "message") {
              const msg = item.data;
              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-brand-500 text-white shadow-soft"
                        : "bg-white text-gray-800 border border-gray-200 shadow-soft"
                    }`}
                  >
                    {msg.role !== "user" && (
                      <div className="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">
                        Assistant
                      </div>
                    )}
                    {msg.reasoningContent && (
                      <ReasoningDisplay
                        mode={toggles.reasoningDisplayMode}
                        content={msg.reasoningContent}
                        isActive={!!msg.isReasoning}
                        tokenCount={msg.reasoningTokens}
                      />
                    )}
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                      {msg.isStreaming && (
                        <span className={`cursor-blink ${msg.role === "user" ? "text-white/70" : "text-brand-400"}`}>▌</span>
                      )}
                    </div>
                    {toggles.showTokenUsage && msg.role !== "user" && (
                      <TokenBadge reasoningTokens={msg.reasoningTokens} />
                    )}
                  </div>
                </div>
              );
            } else {
              const tc = item.data;
              const appForTool = mcpApps.find((a) => a.toolCallId === tc.id);
              return (
                <div key={tc.id}>
                  <ToolCallDisplay tc={tc} mode={toggles.toolDisplayMode} />
                  {appForTool && <McpAppViewer app={appForTool} />}
                </div>
              );
            }
          });
        })()}

        {/* HITL Approval Dialog */}
        {pendingApproval && (
          <div className="flex justify-start">
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl px-5 py-4 max-w-[80%] shadow-card">
              <div className="flex items-center gap-2 text-orange-700 font-semibold text-sm mb-2">
                <span className="text-lg">🔐</span>
                <span>Approval Required</span>
              </div>
              <p className="text-xs text-gray-600 mb-2">
                The agent wants to call <code className="bg-orange-100 px-1.5 py-0.5 rounded font-mono text-orange-800">{pendingApproval.functionName}</code>
              </p>
              {Object.keys(pendingApproval.functionArguments).length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Arguments</div>
                  <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-2.5 overflow-x-auto font-mono">
                    {JSON.stringify(pendingApproval.functionArguments, null, 2)}
                  </pre>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => respondToApproval(true)}
                  className="flex-1 px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 transition-colors shadow-soft"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => respondToApproval(false)}
                  className="flex-1 px-3 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors shadow-soft"
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <div className="text-xs text-red-600 font-semibold">❌ Error</div>
            <div className="text-sm text-red-700 mt-0.5">{error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-100 bg-white p-4">
        <form onSubmit={handleSubmit} className="flex gap-2.5 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pendingApproval ? "Waiting for approval..." : "Send a message…"}
            disabled={isRunning || !!pendingApproval}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-300 disabled:opacity-50 transition-all"
          />
          {isRunning && !pendingApproval ? (
            <button
              type="button"
              onClick={cancelRun}
              className="px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !!pendingApproval}
              className="px-5 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          )}
          <button
            type="button"
            onClick={() => { clearMessages(); clearEvents(); }}
            className="px-3 py-2.5 text-gray-400 rounded-xl text-sm hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Clear conversation"
          >
            Clear
          </button>
        </form>
      </div>
    </div>
  );
}
