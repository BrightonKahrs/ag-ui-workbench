import { useEffect, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent } from "../types/ag-ui";
import { useAgentStream, type ToolCall } from "../hooks/useAgentStream";

interface Props {
  toggles: FeatureToggles;
  onEvents: (events: TimestampedEvent[]) => void;
}

/** Pretty-print JSON args, collapse if too long */
function FormatArgs({ args }: { args: string }) {
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    const pretty = JSON.stringify(parsed, null, 2);
    return <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">{pretty}</pre>;
  } catch {
    return <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">{args}</pre>;
  }
}

function ToolCallCard({ tc, toggles }: { tc: ToolCall; toggles: FeatureToggles }) {
  const [expanded, setExpanded] = useState(false);

  // Skip confirm_changes synthetic tool (shown as approval dialog instead)
  if (tc.name === "confirm_changes") return null;
  if (!toggles.toolCalls) return null;

  const isActive = tc.status === "calling";
  const isApproval = tc.status === "awaiting_approval";
  const isRejected = tc.status === "rejected";
  const isError = tc.status === "error" || (tc.result && tc.result.startsWith("Error"));

  const borderColor = isActive
    ? "border-yellow-800 bg-yellow-950"
    : isApproval
    ? "border-amber-700 bg-amber-950"
    : isRejected || isError
    ? "border-red-800 bg-red-950"
    : "border-green-800 bg-green-950";

  const iconColor = isActive
    ? "text-yellow-400"
    : isApproval
    ? "text-amber-400"
    : isRejected || isError
    ? "text-red-400"
    : "text-green-400";

  const icon = isActive ? "⏳" : isApproval ? "🔐" : isRejected || isError ? "✗" : "✓";

  return (
    <div className="flex justify-start">
      <div className={`border rounded-lg px-4 py-2 max-w-[80%] ${borderColor}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`text-xs font-semibold mb-1 flex items-center gap-1.5 w-full text-left ${iconColor}`}
        >
          <span>{icon}</span>
          <span>
            {isActive ? "Calling" : isApproval ? "Awaiting approval" : isRejected ? "Rejected" : isError ? "Error" : "Called"}:
          </span>
          <span className="font-mono">{tc.name}</span>
          <span className="ml-auto text-gray-600 text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        {expanded && (
          <div className="space-y-2 mt-1 pt-1 border-t border-white/10">
            {tc.args && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-semibold mb-0.5">Arguments</div>
                <FormatArgs args={tc.args} />
              </div>
            )}
            {tc.result && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-semibold mb-0.5">Result</div>
                <pre className={`text-xs overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto ${
                  isError ? "text-red-400" : "text-gray-300"
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

export default function ChatTab({ toggles, onEvents }: Props) {
  const {
    messages,
    toolCalls,
    events,
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
      <div className="bg-gray-850 border-b border-gray-800 px-4 py-2">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Chat Tab</strong> — Demonstrates streaming text,
          tool calls, and human-in-the-loop approvals via AG-UI protocol events.
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 py-12">
            <p className="text-lg mb-2">👋 Welcome to the AG-UI Playground</p>
            <p className="text-sm">
              Send a message to see AG-UI events in action. Try asking about
              the weather, a math calculation, or the current time.
            </p>
            {toggles.humanInTheLoop && (
              <p className="text-xs text-amber-600 mt-2">
                🔐 Human-in-the-Loop is ON — tool calls will require your approval.
              </p>
            )}
          </div>
        )}

        {messages
          .filter((msg) => msg.role === "user" || msg.content || msg.isStreaming)
          .map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                msg.role === "user"
                  ? "bg-purple-700 text-white"
                  : "bg-gray-800 text-gray-200"
              }`}
            >
              <div className="text-xs text-gray-400 mb-1 font-semibold uppercase">
                {msg.role}
              </div>
              <div className="text-sm whitespace-pre-wrap">
                {msg.content}
                {msg.isStreaming && (
                  <span className="cursor-blink text-purple-400">▌</span>
                )}
              </div>
              {msg.reasoningTokens && msg.reasoningTokens > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-orange-400 bg-orange-950/50 border border-orange-900/50 rounded px-2 py-1">
                  <span>🧠</span>
                  <span className="font-mono font-semibold">{msg.reasoningTokens}</span>
                  <span className="opacity-70">reasoning tokens used</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Tool Calls — show all, not just active */}
        {toolCalls.map((tc) => (
          <ToolCallCard key={tc.id} tc={tc} toggles={toggles} />
        ))}

        {/* HITL Approval Dialog */}
        {pendingApproval && (
          <div className="flex justify-start">
            <div className="bg-amber-950 border-2 border-amber-600 rounded-lg px-4 py-3 max-w-[80%] shadow-lg shadow-amber-900/20">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-2">
                <span className="text-lg">🔐</span>
                <span>Approval Required</span>
              </div>
              <p className="text-xs text-amber-200 mb-2">
                The agent wants to call <code className="bg-amber-900/50 px-1.5 py-0.5 rounded font-mono">{pendingApproval.functionName}</code>
              </p>
              {Object.keys(pendingApproval.functionArguments).length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-amber-400/70 uppercase font-semibold mb-1">Arguments</div>
                  <pre className="text-xs text-amber-200/80 bg-amber-900/30 rounded p-2 overflow-x-auto">
                    {JSON.stringify(pendingApproval.functionArguments, null, 2)}
                  </pre>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => respondToApproval(true)}
                  className="flex-1 px-3 py-1.5 bg-green-700 text-white rounded text-xs font-semibold hover:bg-green-600 transition-colors"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => respondToApproval(false)}
                  className="flex-1 px-3 py-1.5 bg-red-700 text-white rounded text-xs font-semibold hover:bg-red-600 transition-colors"
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            <div className="text-xs text-red-400 font-semibold">❌ Error</div>
            <div className="text-sm text-red-200">{error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-800 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pendingApproval ? "Waiting for approval..." : "Ask about weather, do a calculation, or just chat..."}
            disabled={isRunning || !!pendingApproval}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          {isRunning && !pendingApproval ? (
            <button
              type="button"
              onClick={cancelRun}
              className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !!pendingApproval}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
          <button
            type="button"
            onClick={() => { clearMessages(); clearEvents(); }}
            className="px-3 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:text-white hover:bg-gray-700"
          >
            Clear
          </button>
        </form>
      </div>
    </div>
  );
}
