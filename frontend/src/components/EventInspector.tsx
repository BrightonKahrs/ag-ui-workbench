import { useEffect, useMemo, useRef, useState } from "react";
import type { TimestampedEvent } from "../types/ag-ui";
import { AGUIEventType } from "../types/ag-ui";

interface Props {
  events: TimestampedEvent[];
}

// --- Helpers ---

function getCategoryPrefix(type: string): string {
  if (type.startsWith("TEXT_MESSAGE")) return "TEXT_MESSAGE";
  if (type.startsWith("TOOL_CALL")) return "TOOL_CALL";
  if (type.startsWith("STATE_")) return "STATE";
  if (type.startsWith("STEP_")) return "STEP";
  if (type.startsWith("REASONING")) return "REASONING";
  if (type.startsWith("RUN_")) return "RUN";
  return type; // CUSTOM, RAW, MESSAGES_SNAPSHOT etc. stay as-is
}

function getCategoryColor(cat: string): string {
  switch (cat) {
    case "RUN": return "text-blue-400 bg-blue-950 border-blue-900";
    case "TEXT_MESSAGE": return "text-green-400 bg-green-950 border-green-900";
    case "TOOL_CALL": return "text-yellow-400 bg-yellow-950 border-yellow-900";
    case "STATE": return "text-purple-400 bg-purple-950 border-purple-900";
    case "STEP": return "text-cyan-400 bg-cyan-950 border-cyan-900";
    case "REASONING": return "text-orange-400 bg-orange-950 border-orange-900";
    default: return "text-gray-400 bg-gray-800 border-gray-700";
  }
}

function getEventColor(type: string): string {
  return getCategoryColor(getCategoryPrefix(type));
}

function getCategoryIcon(cat: string): string {
  switch (cat) {
    case "RUN": return "▶️";
    case "TEXT_MESSAGE": return "💬";
    case "TOOL_CALL": return "🔧";
    case "STATE": return "📸";
    case "STEP": return "👣";
    case "REASONING": return "🧠";
    case "CUSTOM": return "⚡";
    default: return "📡";
  }
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
    case AGUIEventType.CUSTOM: return "⚡";
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
    case AGUIEventType.CUSTOM:
      return `${event.name}: ${JSON.stringify(event.value).slice(0, 50)}`;
    default:
      return "";
  }
}

// --- Contiguous Group Model ---
// Groups consecutive events that share the same category prefix.
// Preserves chronological order while reducing noise.

interface EventGroup {
  id: string;
  category: string;
  events: TimestampedEvent[];
  firstTimestamp: number;
  lastTimestamp: number;
}

function groupContiguousEvents(events: TimestampedEvent[]): EventGroup[] {
  if (events.length === 0) return [];
  const groups: EventGroup[] = [];
  let currentCat = getCategoryPrefix(events[0].event.type);
  let currentGroup: TimestampedEvent[] = [events[0]];

  for (let i = 1; i < events.length; i++) {
    const cat = getCategoryPrefix(events[i].event.type);
    if (cat === currentCat) {
      currentGroup.push(events[i]);
    } else {
      groups.push({
        id: `grp-${currentGroup[0].id}`,
        category: currentCat,
        events: currentGroup,
        firstTimestamp: currentGroup[0].timestamp,
        lastTimestamp: currentGroup[currentGroup.length - 1].timestamp,
      });
      currentCat = cat;
      currentGroup = [events[i]];
    }
  }
  // Push the last group
  groups.push({
    id: `grp-${currentGroup[0].id}`,
    category: currentCat,
    events: currentGroup,
    firstTimestamp: currentGroup[0].timestamp,
    lastTimestamp: currentGroup[currentGroup.length - 1].timestamp,
  });
  return groups;
}

// Summarize what happened in a group (shown on the collapsed header)
function getGroupSummary(group: EventGroup): string {
  const { category, events } = group;
  const subtypes = new Map<string, number>();
  for (const e of events) {
    subtypes.set(e.event.type, (subtypes.get(e.event.type) || 0) + 1);
  }
  switch (category) {
    case "TOOL_CALL": {
      const starts = events.filter(e => e.event.type === AGUIEventType.TOOL_CALL_START);
      const names = starts.map(e => (e.event as { toolCallName?: string }).toolCallName).filter(Boolean);
      const hasError = events.some(e => {
        if (e.event.type === AGUIEventType.TOOL_CALL_RESULT) {
          return (e.event as { content?: string }).content?.startsWith("Error");
        }
        return false;
      });
      return names.length > 0
        ? `${names.join(", ")}${hasError ? " ⚠️" : ""}`
        : "";
    }
    case "TEXT_MESSAGE": {
      const contentEvents = events.filter(e => e.event.type === AGUIEventType.TEXT_MESSAGE_CONTENT);
      const totalChars = contentEvents.reduce((sum, e) => sum + ((e.event as { delta?: string }).delta?.length || 0), 0);
      return totalChars > 0 ? `${totalChars} chars streamed` : "";
    }
    case "STATE": {
      const snaps = subtypes.get(AGUIEventType.STATE_SNAPSHOT) || 0;
      const deltas = subtypes.get(AGUIEventType.STATE_DELTA) || 0;
      const parts: string[] = [];
      if (snaps) parts.push(`${snaps} snapshot${snaps > 1 ? "s" : ""}`);
      if (deltas) parts.push(`${deltas} delta${deltas > 1 ? "s" : ""}`);
      return parts.join(", ");
    }
    default:
      return "";
  }
}

export default function EventInspector({ events }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [fullyExpandedGroups, setFullyExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const MAX_VISIBLE_CHILDREN = 5;

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filteredEvents = filter
    ? events.filter((e) =>
        e.event.type.toLowerCase().includes(filter.toLowerCase()) ||
        getEventSummary(e.event).toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  // When filtering, show flat list. Otherwise, show grouped view.
  const groups = useMemo(
    () => (filter ? null : groupContiguousEvents(filteredEvents)),
    [filteredEvents, filter]
  );

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Also reset "show all" when collapsing
        setFullyExpandedGroups((fp) => {
          const nfp = new Set(fp);
          nfp.delete(id);
          return nfp;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Render a single event row
  const renderEvent = (te: TimestampedEvent, indent: boolean = false) => (
    <div
      key={te.id}
      className={`rounded px-2 py-1 cursor-pointer transition-colors hover:opacity-90 ${getEventColor(
        te.event.type
      )} ${indent ? "ml-3 border-l-2 border-current/20" : ""}`}
      onClick={(e) => { e.stopPropagation(); toggleEvent(te.id); }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs">{getEventIcon(te.event.type)}</span>
        <span className="text-[11px] font-mono font-bold flex-1 truncate">
          {te.event.type}
        </span>
        <span className="text-[10px] opacity-60 font-mono">
          {formatTimestamp(te.timestamp)}
        </span>
      </div>
      <div className="text-[10px] opacity-70 mt-0.5 truncate pl-5">
        {getEventSummary(te.event)}
      </div>
      {expandedEvents.has(te.id) && (
        <pre className="mt-1 text-[10px] bg-black/30 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
          {JSON.stringify(te.event, null, 2)}
        </pre>
      )}
    </div>
  );

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
        ) : groups ? (
          /* Grouped view — contiguous events collapsed by category */
          groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const isSingleton = group.events.length === 1;
            // Singletons render directly without a group wrapper
            if (isSingleton) {
              return renderEvent(group.events[0]);
            }
            const summary = getGroupSummary(group);
            return (
              <div key={group.id} className="space-y-0.5">
                {/* Group header */}
                <div
                  className={`rounded px-2 py-1.5 cursor-pointer transition-colors border ${getCategoryColor(group.category)} hover:opacity-90`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] opacity-60 select-none">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                    <span className="text-xs">
                      {getCategoryIcon(group.category)}
                    </span>
                    <span className="text-xs font-mono font-bold">
                      {group.category}
                    </span>
                    <span className="text-[10px] font-mono bg-black/30 rounded px-1.5 py-0.5">
                      {group.events.length}
                    </span>
                    {summary && (
                      <span className="text-[10px] opacity-60 truncate flex-1">
                        {summary}
                      </span>
                    )}
                    <span className="text-[10px] opacity-50 font-mono">
                      {formatTimestamp(group.firstTimestamp)}
                    </span>
                  </div>
                </div>
                {/* Expanded children — capped unless fully expanded */}
                {isExpanded && (
                  <div className="space-y-0.5">
                    {(() => {
                      const isFullyExpanded = fullyExpandedGroups.has(group.id);
                      const visibleEvents = isFullyExpanded
                        ? group.events
                        : group.events.slice(0, MAX_VISIBLE_CHILDREN);
                      const hiddenCount = group.events.length - MAX_VISIBLE_CHILDREN;
                      return (
                        <>
                          {visibleEvents.map((te) => renderEvent(te, true))}
                          {!isFullyExpanded && hiddenCount > 0 && (
                            <button
                              className="ml-3 text-[10px] text-gray-500 hover:text-gray-300 py-1 px-2 rounded bg-gray-800/50 hover:bg-gray-800 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFullyExpandedGroups((prev) => new Set([...prev, group.id]));
                              }}
                            >
                              Show all {group.events.length} events (+{hiddenCount} more)
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* Flat view — when filtering */
          filteredEvents.map((te) => renderEvent(te))
        )}
      </div>
    </div>
  );
}
