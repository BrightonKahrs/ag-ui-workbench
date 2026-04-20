import { useEffect, useRef, useState } from "react";
import type { TimestampedEvent } from "../types/ag-ui";
import { AGUIEventType } from "../types/ag-ui";

interface Props {
  events: TimestampedEvent[];
}

function getEventColor(type: string): string {
  if (type.startsWith("RUN_")) return "text-blue-400 bg-blue-950";
  if (type.startsWith("TEXT_MESSAGE")) return "text-green-400 bg-green-950";
  if (type.startsWith("TOOL_CALL")) return "text-yellow-400 bg-yellow-950";
  if (type.startsWith("STATE_")) return "text-purple-400 bg-purple-950";
  if (type.startsWith("STEP_")) return "text-cyan-400 bg-cyan-950";
  if (type.startsWith("REASONING")) return "text-orange-400 bg-orange-950";
  if (type === "RUN_ERROR") return "text-red-400 bg-red-950";
  return "text-gray-400 bg-gray-800";
}

function getEventIcon(type: string): string {
  switch (type) {
    case AGUIEventType.RUN_STARTED: return "▶️";
    case AGUIEventType.RUN_FINISHED: return "✅";
    case AGUIEventType.RUN_ERROR: return "❌";
    case AGUIEventType.TEXT_MESSAGE_START: return "💬";
    case AGUIEventType.TEXT_MESSAGE_CONTENT: return "📝";
    case AGUIEventType.TEXT_MESSAGE_END: return "🏁";
    case AGUIEventType.TOOL_CALL_START: return "🔧";
    case AGUIEventType.TOOL_CALL_ARGS: return "📦";
    case AGUIEventType.TOOL_CALL_END: return "🔨";
    case AGUIEventType.TOOL_CALL_RESULT: return "📋";
    case AGUIEventType.STATE_SNAPSHOT: return "📸";
    case AGUIEventType.STATE_DELTA: return "🔀";
    case AGUIEventType.STEP_STARTED: return "👣";
    case AGUIEventType.STEP_FINISHED: return "👟";
    case AGUIEventType.REASONING_START: return "🧠";
    case AGUIEventType.REASONING_MESSAGE_START: return "💭";
    case AGUIEventType.REASONING_MESSAGE_CONTENT: return "💡";
    case AGUIEventType.REASONING_MESSAGE_END: return "🎯";
    case AGUIEventType.REASONING_END: return "🧠";
    default: return "📡";
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function getEventSummary(event: TimestampedEvent["event"]): string {
  switch (event.type) {
    case AGUIEventType.RUN_STARTED:
      return `thread: ${event.threadId?.slice(0, 8)}...`;
    case AGUIEventType.RUN_FINISHED:
      return `run complete`;
    case AGUIEventType.RUN_ERROR:
      return event.message;
    case AGUIEventType.TEXT_MESSAGE_START:
      return `role: ${event.role}`;
    case AGUIEventType.TEXT_MESSAGE_CONTENT:
      return event.delta.length > 40
        ? event.delta.slice(0, 40) + "..."
        : event.delta;
    case AGUIEventType.TEXT_MESSAGE_END:
      return `msg: ${event.messageId?.slice(0, 8)}...`;
    case AGUIEventType.TOOL_CALL_START:
      return event.toolCallName;
    case AGUIEventType.TOOL_CALL_ARGS:
      return event.delta.length > 30
        ? event.delta.slice(0, 30) + "..."
        : event.delta;
    case AGUIEventType.TOOL_CALL_RESULT:
      return event.content?.slice(0, 40) + "...";
    case AGUIEventType.STATE_SNAPSHOT:
      return `${Object.keys(event.snapshot).length} keys`;
    case AGUIEventType.STATE_DELTA:
      return `${event.delta.length} operation(s)`;
    default:
      return "";
  }
}

export default function EventInspector({ events }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filteredEvents = filter
    ? events.filter((e) =>
        e.event.type.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-300">
            📡 Event Inspector
          </h2>
          <span className="text-xs text-gray-500">{events.length} events</span>
        </div>
        <input
          type="text"
          placeholder="Filter events..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500"
        />
        <label className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-purple-500"
          />
          Auto-scroll
        </label>
      </div>

      {/* Event List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto event-scroll p-2 space-y-1">
        {filteredEvents.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8">
            No events yet. Send a message to see AG-UI events stream in.
          </div>
        ) : (
          filteredEvents.map((te) => (
            <div
              key={te.id}
              className={`rounded px-2 py-1.5 cursor-pointer transition-colors hover:opacity-90 ${getEventColor(
                te.event.type
              )}`}
              onClick={() => toggleExpand(te.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">{getEventIcon(te.event.type)}</span>
                <span className="text-xs font-mono font-bold flex-1 truncate">
                  {te.event.type}
                </span>
                <span className="text-[10px] opacity-60 font-mono">
                  {formatTimestamp(te.timestamp)}
                </span>
              </div>
              <div className="text-[11px] opacity-70 mt-0.5 truncate pl-5">
                {getEventSummary(te.event)}
              </div>
              {/* Expanded JSON view */}
              {expanded.has(te.id) && (
                <pre className="mt-2 text-[10px] bg-black/30 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                  {JSON.stringify(te.event, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
