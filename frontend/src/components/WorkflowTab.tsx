/**
 * WorkflowTab — Demonstrates AG-UI STEP and ACTIVITY_SNAPSHOT events
 * via a 3-stage Research Pipeline workflow.
 *
 * Shows a pipeline visualizer with executor cards that update in real-time
 * as STEP_STARTED/STEP_FINISHED and ACTIVITY_SNAPSHOT events arrive.
 */

import { useEffect, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent } from "../types/ag-ui";
import {
  useAgentStream,
  type ActivityItem,
  type ChatMessage,
} from "../hooks/useAgentStream";

interface Props {
  toggles: FeatureToggles;
  onEvents: (events: TimestampedEvent[]) => void;
}

const PIPELINE_STAGES = [
  { id: "researcher", label: "📚 Researcher", description: "Gathers facts and findings" },
  { id: "analyzer", label: "🔍 Analyzer", description: "Extracts key insights" },
  { id: "synthesizer", label: "✨ Synthesizer", description: "Produces final answer" },
];

type StageStatus = "idle" | "running" | "completed" | "failed";

function getStageStatus(
  stageId: string,
  activities: ActivityItem[],
): StageStatus {
  // Find the latest activity for this executor
  const matching = activities.filter((a) => a.executorId === stageId);
  if (matching.length === 0) return "idle";
  const latest = matching[matching.length - 1];
  if (latest.status === "completed") return "completed";
  if (latest.status === "failed") return "failed";
  return "running";
}

function StageCard({
  stage,
  status,
  activity,
}: {
  stage: (typeof PIPELINE_STAGES)[number];
  status: StageStatus;
  activity: ActivityItem | undefined;
}) {
  const borderColor = {
    idle: "border-gray-700",
    running: "border-yellow-500 animate-pulse",
    completed: "border-green-500",
    failed: "border-red-500",
  }[status];

  const bgColor = {
    idle: "bg-gray-900",
    running: "bg-yellow-950",
    completed: "bg-green-950",
    failed: "bg-red-950",
  }[status];

  const statusIcon = {
    idle: "⏸️",
    running: "⏳",
    completed: "✅",
    failed: "❌",
  }[status];

  return (
    <div className={`rounded-lg border-2 p-4 ${borderColor} ${bgColor} transition-all duration-300`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-semibold text-white">{stage.label}</span>
        <span className="text-xl">{statusIcon}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{stage.description}</p>
      {activity && (
        <div className="text-xs text-gray-500 mt-1">
          <span className={
            status === "completed" ? "text-green-400" :
            status === "failed" ? "text-red-400" :
            status === "running" ? "text-yellow-400" : "text-gray-400"
          }>
            {status === "running" ? "Processing..." :
             status === "completed" ? "Done" :
             status === "failed" ? `Failed: ${activity.details ?? "unknown"}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

export default function WorkflowTab({ toggles, onEvents }: Props) {
  const {
    messages,
    events,
    activities,
    isRunning,
    error,
    sendMessage,
    clearMessages,
    clearEvents,
  } = useAgentStream("/workflow", toggles);

  const [input, setInput] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  // Sync events to parent (for inspector)
  useEffect(() => {
    onEvents(events);
  }, [events, onEvents]);

  // Auto-scroll output area
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    setInput("");
    sendMessage(trimmed);
  };

  // Get stage outputs from assistant messages
  const stageOutputs = messages.filter(
    (m: ChatMessage) => m.role === "assistant" && m.content,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Pipeline Visualizer */}
      <div className="p-4 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Research Pipeline
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-500"></span> STEP events
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span> ACTIVITY events
            </span>
          </div>
        </div>

        {/* Horizontal pipeline cards */}
        <div className="flex items-center gap-3">
          {PIPELINE_STAGES.map((stage, idx) => {
            const status = getStageStatus(stage.id, activities);
            const latestActivity = [...activities]
              .reverse()
              .find((a) => a.executorId === stage.id);

            return (
              <div key={stage.id} className="flex items-center gap-3 flex-1">
                <div className="flex-1">
                  <StageCard stage={stage} status={status} activity={latestActivity} />
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <svg width="32" height="24" viewBox="0 0 32 24" fill="none" className="text-gray-600 flex-shrink-0">
                    <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Outputs */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {stageOutputs.length === 0 && !isRunning && (
          <div className="text-center text-gray-500 mt-12">
            <p className="text-4xl mb-4">🔬</p>
            <p className="text-lg font-medium">Research Pipeline</p>
            <p className="text-sm mt-2 max-w-md mx-auto">
              Ask a question and watch it flow through 3 stages.
              Each stage emits <span className="text-cyan-400">STEP_STARTED/FINISHED</span> and{" "}
              <span className="text-teal-400">ACTIVITY_SNAPSHOT</span> events.
            </p>
          </div>
        )}

        {stageOutputs.map((msg: ChatMessage) => (
          <div
            key={msg.id}
            className="bg-gray-800 rounded-lg p-4 border border-gray-700"
          >
            <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
              {msg.content}
            </div>
          </div>
        ))}

        {isRunning && stageOutputs.length > 0 && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <span className="animate-pulse">⏳</span>
            <span>Pipeline running...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-800 bg-gray-900">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a research question..."
            disabled={isRunning}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isRunning || !input.trim()}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? "Running..." : "Research"}
          </button>
          <button
            type="button"
            onClick={() => { clearMessages(); clearEvents(); }}
            className="px-3 py-2.5 bg-gray-800 text-gray-400 rounded-lg text-sm hover:text-white hover:bg-gray-700 transition-colors"
          >
            Clear
          </button>
        </form>
      </div>
    </div>
  );
}
