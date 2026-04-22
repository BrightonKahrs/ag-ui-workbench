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

  return (
    <div className="flex-1 flex flex-col">
      {/* Tab Description */}
      <div className="bg-gray-850 border-b border-gray-800 px-4 py-2">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Plan Tab</strong> — Demonstrates task
          planning with shared state. Complex requests trigger plan creation with
          real-time task status updates via STATE_DELTA events.
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="w-80 flex flex-col border-r border-gray-800">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 py-6">
                <p className="text-lg mb-2">📋 Task Planner</p>
                <p className="text-xs">
                  Give the agent a complex task. It will create a plan and work
                  through each step.
                </p>
                <div className="mt-3 space-y-1 text-[10px] text-gray-700 text-left px-2">
                  <p>Try:</p>
                  <p className="text-gray-500">
                    "Compare the weather in NYC, London, and Tokyo"
                  </p>
                  <p className="text-gray-500">
                    "Calculate compound interest for 3 different scenarios"
                  </p>
                  <p className="text-gray-500">
                    "What time is it in 5 different time zones?"
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
                      ? "bg-purple-700 text-white"
                      : "bg-gray-800 text-gray-200"
                  }`}
                >
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">
                    {msg.role}
                  </div>
                  <div className="text-xs whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-3 py-2">
                <div className="text-[10px] text-red-400">❌ {error}</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-2">
            <form onSubmit={handleSubmit} className="flex gap-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Give a complex task..."
                disabled={isRunning}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isRunning}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-500 disabled:opacity-50"
              >
                {isRunning ? "..." : "Send"}
              </button>
              <button
                type="button"
                onClick={clearState}
                className="px-2 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white"
                title="Reset plan"
              >
                ↺
              </button>
            </form>
          </div>
        </div>

        {/* Right: Plan Visualization */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-4 overflow-y-auto">
            {!planState ? (
              <div className="flex items-center justify-center h-full text-gray-600">
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

          {/* Raw State (collapsible) */}
          <details className="border-t border-gray-800">
            <summary className="px-3 py-2 text-[10px] text-gray-500 cursor-pointer hover:text-gray-400 select-none">
              Raw State JSON
            </summary>
            <pre className="text-[10px] text-gray-600 bg-gray-950 p-3 overflow-auto max-h-32 mx-3 mb-3 rounded">
              {JSON.stringify(state, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
