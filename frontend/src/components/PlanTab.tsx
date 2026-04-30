/**
 * PlanTab — demonstrates task planning via shared state.
 *
 * The agent creates structured plans for complex tasks and works
 * through each task sequentially. Plan state syncs in real-time
 * via STATE_SNAPSHOT/STATE_DELTA events.
 */

import { useEffect, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent } from "../types/ag-ui";
import { useSharedState } from "../hooks/useSharedState";
import TaskPlan from "./TaskPlan";
import MarkdownContent from "./MarkdownContent";

interface Props {
  onEvents: (events: TimestampedEvent[]) => void;
  toggles: FeatureToggles;
}

interface PlanState {
  id?: string;
  title: string;
  status: "in_progress" | "completed" | "failed";
  taskOrder: string[];
  tasks: Record<
    string,
    {
      id: string;
      title: string;
      description?: string;
      status: "pending" | "in_progress" | "done" | "failed" | "cancelled";
      result?: string | null;
    }
  >;
}

export default function PlanTab({ onEvents, toggles }: Props) {
  const { state, events, isRunning, error, sendMessage, clearState, messages } =
    useSharedState("/plan", toggles);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Forward events to inspector
  useEffect(() => {
    onEvents(events);
  }, [events, onEvents]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;
    sendMessage(input.trim());
    setInput("");
  };

  // Extract plan from state — may be a JSON string during predictive streaming
  // or an object after STATE_SNAPSHOT
  const planState: PlanState | undefined = (() => {
    const raw = state.plan;
    if (!raw) return undefined;
    // If it's a string (predictive streaming), try to parse it
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "tasks" in parsed) {
          return parsed as PlanState;
        }
      } catch {
        return undefined; // Partial JSON still streaming
      }
    }
    // If it's already an object
    if (typeof raw === "object" && "tasks" in (raw as object)) {
      return raw as PlanState;
    }
    return undefined;
  })();

  const [chatOpen, setChatOpen] = useState(true);
  const [rawStateOpen, setRawStateOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col">
      {/* Tab Description with panel toggles */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          <strong className="text-gray-500">Plan Tab</strong> — Demonstrates task
          planning with shared state and real-time task status updates.
        </p>
        <div className="flex items-center gap-1">
          <InlineToggle label="JSON" isOpen={rawStateOpen} onClick={() => setRawStateOpen(!rawStateOpen)} />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat — flies in/out */}
        <div
          className={`flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out overflow-hidden ${
            chatOpen ? "w-80" : "w-0 border-r-0"
          }`}
        >
          <div className="w-80 flex-1 flex flex-col">
            {/* Collapse arrow inside panel */}
            <div className="flex justify-end px-2 pt-1 shrink-0">
              <button
                onClick={() => setChatOpen(false)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Hide Chat"
              >
                <span className="text-xs">‹</span>
              </button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-2">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 py-6">
                  <p className="text-lg mb-2">📋 Task Planner</p>
                  <p className="text-xs">
                    Give the agent a complex task. It will create a plan and work
                    through each step.
                  </p>
                  <div className="mt-3 space-y-1 text-[10px] text-gray-700 text-left px-2">
                    <p>Try:</p>
                    <p className="text-gray-400">
                      "Compare the weather in NYC, London, and Tokyo"
                    </p>
                    <p className="text-gray-400">
                      "Calculate compound interest for 3 different scenarios"
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-lg px-3 py-2 ${
                      msg.role === "user"
                        ? "bg-brand-600 text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    <div className="text-[10px] text-gray-500 font-semibold uppercase">
                      {msg.role}
                    </div>
                    <div className="text-xs"><MarkdownContent content={msg.content} /></div>
                  </div>
                </div>
              ))}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-red-700">❌ {error}</div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-2">
              <form onSubmit={handleSubmit} className="flex gap-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Give a complex task..."
                  disabled={isRunning}
                  className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-300 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isRunning}
                  className="px-3 py-1.5 bg-brand-500 text-white rounded-lg text-xs font-medium hover:bg-brand-600 disabled:opacity-50"
                >
                  {isRunning ? "..." : "Send"}
                </button>
                <button
                  type="button"
                  onClick={clearState}
                  className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs hover:text-gray-900"
                  title="Reset plan"
                >
                  ↺
                </button>
              </form>
            </div>
          </div>
        </div>
        {/* Chat expand tab (only when closed) */}
        {!chatOpen && (
          <ExpandTab label="Chat" side="left" onClick={() => setChatOpen(true)} />
        )}

        {/* Right: Plan Visualization */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 p-4 overflow-y-auto">
            {!planState ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">📋</div>
                  <p className="text-sm">No plan yet</p>
                  <p className="text-xs text-gray-700 mt-1">
                    Ask the agent a complex task to see a plan appear
                  </p>
                </div>
              </div>
            ) : (
              <TaskPlan plan={planState} />
            )}
          </div>

          {/* Raw State — flies in from bottom */}
          <div
            className={`border-t border-gray-200 shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
              rawStateOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0 border-t-0"
            }`}
          >
            <div className="px-3 py-2">
              <span className="text-[10px] text-gray-400 font-medium">Raw State JSON</span>
            </div>
            <pre className="text-[10px] text-gray-400 bg-gray-50 p-3 overflow-auto max-h-28 mx-3 mb-3 rounded">
              {JSON.stringify(state, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Expand tab shown only when a panel is collapsed */
function ExpandTab({ label, side, onClick }: { label: string; side: "left" | "right"; onClick: () => void }) {
  const arrow = side === "left" ? "›" : "‹";
  return (
    <button
      onClick={onClick}
      className={`flex items-start pt-28 justify-center px-1.5 bg-white border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-gray-500 hover:text-indigo-600 self-stretch shrink-0 ${
        side === "left" ? "rounded-r-md border-l-0" : "rounded-l-md border-r-0"
      }`}
      title={`Show ${label}`}
    >
      <span
        className="text-[10px] font-medium tracking-wide"
        style={{ writingMode: "vertical-lr", transform: side === "left" ? "rotate(180deg)" : "none" }}
      >
        {label} {arrow}
      </span>
    </button>
  );
}

/** Small inline toggle for toolbar — shows label only when closed */
function InlineToggle({ label, isOpen, onClick }: { label: string; isOpen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-200 flex items-center gap-1 ${
        isOpen
          ? "bg-brand-50 text-brand-600 border border-brand-200"
          : "bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-600"
      }`}
      title={isOpen ? `Hide ${label}` : `Show ${label}`}
    >
      <span>{isOpen ? "▾" : "▸"}</span>
      {isOpen ? "" : label}
    </button>
  );
}
