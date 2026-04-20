import { useEffect, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent } from "../types/ag-ui";
import { useAgentStream } from "../hooks/useAgentStream";

interface Props {
  toggles: FeatureToggles;
  onEvents: (events: TimestampedEvent[]) => void;
}

export default function ChatTab({ toggles, onEvents }: Props) {
  const {
    messages,
    toolCalls,
    events,
    isRunning,
    error,
    sendMessage,
    clearMessages,
    clearEvents,
    cancelRun,
  } = useAgentStream("/chat", toggles);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Forward events to inspector
  useEffect(() => {
    onEvents(events);
  }, [events, onEvents]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex-1 flex flex-col">
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
              {/* Reasoning token indicator */}
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

        {/* Tool Calls */}
        {toolCalls
          .filter((tc) => tc.status === "calling")
          .map((tc) => (
            <div key={tc.id} className="flex justify-start">
              <div className="bg-yellow-950 border border-yellow-800 rounded-lg px-4 py-2 max-w-[70%]">
                <div className="text-xs text-yellow-400 font-semibold mb-1">
                  🔧 Calling: {tc.name}
                </div>
                {tc.args && (
                  <pre className="text-xs text-yellow-200/70 overflow-x-auto">
                    {tc.args}
                  </pre>
                )}
              </div>
            </div>
          ))}

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
            placeholder="Ask about weather, do a calculation, or just chat..."
            disabled={isRunning}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          {isRunning ? (
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
              disabled={!input.trim()}
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
