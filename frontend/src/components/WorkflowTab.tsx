/**
 * WorkflowTab — Demonstrates AG-UI STEP and ACTIVITY_SNAPSHOT events
 * via a 3-stage Research Pipeline workflow.
 *
 * Shows a pipeline visualizer with executor cards that update in real-time
 * as STEP_STARTED/STEP_FINISHED and ACTIVITY_SNAPSHOT events arrive,
 * plus a chat thread showing user questions and stage outputs.
 */

import { useEffect, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent } from "../types/ag-ui";
import {
  useAgentStream,
  type ActivityItem,
  type ChatMessage,
} from "../hooks/useAgentStream";
import MarkdownContent from "./MarkdownContent";

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
    idle: "border-gray-200",
    running: "border-yellow-500 animate-pulse",
    completed: "border-green-500",
    failed: "border-red-500",
  }[status];

  const bgColor = {
    idle: "bg-white",
    running: "bg-yellow-50",
    completed: "bg-green-50",
    failed: "bg-red-50",
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
        <span className="text-lg font-semibold text-gray-900">{stage.label}</span>
        <span className="text-xl">{statusIcon}</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{stage.description}</p>
      {activity && (
        <div className="text-xs text-gray-400 mt-1">
          <span className={
            status === "completed" ? "text-green-700" :
            status === "failed" ? "text-red-700" :
            status === "running" ? "text-yellow-700" : "text-gray-500"
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

  const [pipelineOpen, setPipelineOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar with panel toggles */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <p className="text-xs text-gray-400">
          <strong className="text-gray-500">Workflow</strong> — Research pipeline with STEP and ACTIVITY events.
        </p>
        <div className="flex items-center gap-1">
          <InlineToggle label="Pipeline" isOpen={pipelineOpen} onClick={() => setPipelineOpen(!pipelineOpen)} />
          <InlineToggle label="Output" isOpen={outputOpen} onClick={() => setOutputOpen(!outputOpen)} />
        </div>
      </div>

      {/* Pipeline Visualizer — flies in/out from top */}
      <div
        className={`border-b border-gray-200 bg-gray-50 transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
          pipelineOpen ? "max-h-64 opacity-100 p-4" : "max-h-0 opacity-0 p-0 border-b-0"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Research Pipeline
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-400">
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
                  <svg width="32" height="24" viewBox="0 0 32 24" fill="none" className="text-gray-400 flex-shrink-0">
                    <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat + Stage Outputs — flies in/out */}
      <div
        className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${
          outputOpen ? "opacity-100" : "opacity-0 max-h-0 overflow-hidden"
        }`}
      >
        <div ref={outputRef} className="p-4 space-y-4 h-full overflow-y-auto">
          {messages.length === 0 && !isRunning && (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-4xl mb-4">🔬</p>
              <p className="text-lg font-medium">Research Pipeline</p>
              <p className="text-sm mt-2 max-w-md mx-auto">
                Ask a question and watch it flow through 3 stages.
              </p>
            </div>
          )}

          {messages
            .filter((msg: ChatMessage) => msg.role === "user" || msg.content)
            .map((msg: ChatMessage) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-brand-500 text-white shadow-soft"
                      : "bg-white text-gray-800 border border-gray-200 shadow-soft"
                  }`}
                >
                  {msg.role !== "user" && (
                    <div className="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">
                      Pipeline
                    </div>
                  )}
                  <div className="text-sm leading-relaxed">
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <MarkdownContent content={msg.content} />
                    )}
                    {msg.isStreaming && (
                      <span className={`cursor-blink ${msg.role === "user" ? "text-white/70" : "text-brand-400"}`}>▌</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

          {isRunning && messages.some((m: ChatMessage) => m.role === "assistant") && (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <span className="animate-pulse">⏳</span>
              <span>Pipeline running...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 bg-white shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a research question..."
            disabled={isRunning}
            className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isRunning || !input.trim()}
            className="px-5 py-2.5 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? "Running..." : "Research"}
          </button>
          <button
            type="button"
            onClick={() => { clearMessages(); clearEvents(); }}
            className="px-3 py-2.5 bg-gray-100 text-gray-500 rounded-lg text-sm hover:text-gray-900 hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
        </form>
      </div>
    </div>
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
