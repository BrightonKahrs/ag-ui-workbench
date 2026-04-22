import { useEffect, useMemo, useRef, useState } from "react";
import type { TimestampedEvent } from "../types/ag-ui";
import { AGUIEventType } from "../types/ag-ui";

interface Props {
  events: TimestampedEvent[];
}

// --- Helpers ---

function getCategoryPrefix(type: string): string {
  if (type === "REQUEST_SENT") return "REQUEST";
  if (type.startsWith("TEXT_MESSAGE")) return "TEXT_MESSAGE";
  if (type.startsWith("TOOL_CALL")) return "TOOL_CALL";
  if (type.startsWith("STATE_")) return "STATE";
  if (type.startsWith("STEP_")) return "STEP";
  if (type.startsWith("REASONING")) return "REASONING";
  if (type.startsWith("ACTIVITY")) return "ACTIVITY";
  if (type.startsWith("RUN_")) return "RUN";
  return type; // CUSTOM, RAW, MESSAGES_SNAPSHOT etc. stay as-is
}

function getCategoryColor(cat: string): string {
  switch (cat) {
    case "REQUEST": return "text-amber-400 bg-amber-950 border-amber-900";
    case "RUN": return "text-blue-400 bg-blue-950 border-blue-900";
    case "TEXT_MESSAGE": return "text-green-400 bg-green-950 border-green-900";
    case "TOOL_CALL": return "text-yellow-400 bg-yellow-950 border-yellow-900";
    case "STATE": return "text-purple-400 bg-purple-950 border-purple-900";
    case "STEP": return "text-cyan-400 bg-cyan-950 border-cyan-900";
    case "ACTIVITY": return "text-teal-400 bg-teal-950 border-teal-900";
    case "REASONING": return "text-orange-400 bg-orange-950 border-orange-900";
    default: return "text-gray-400 bg-gray-800 border-gray-700";
  }
}

function getEventColor(type: string): string {
  return getCategoryColor(getCategoryPrefix(type));
}

function getCategoryIcon(cat: string): string {
  switch (cat) {
    case "REQUEST": return "📤";
    case "RUN": return "▶️";
    case "TEXT_MESSAGE": return "💬";
    case "TOOL_CALL": return "🔧";
    case "STATE": return "📸";
    case "STEP": return "👣";
    case "ACTIVITY": return "📊";
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
    case AGUIEventType.ACTIVITY_SNAPSHOT: return "📊";
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
    case AGUIEventType.STATE_DELTA: {
      const ops = event.delta;
      if (ops.length === 1) {
        const op = ops[0];
        return `${op.op} ${op.path}`;
      }
      return `${ops.length} ops: ${ops.map((o) => `${o.op} ${o.path}`).join(", ").slice(0, 60)}`;
    }
    case AGUIEventType.CUSTOM:
      return `${event.name}: ${JSON.stringify(event.value).slice(0, 50)}`;
    case AGUIEventType.ACTIVITY_SNAPSHOT: {
      const content = event.content as Record<string, unknown>;
      const status = content?.status ?? "";
      return `${event.activityType}: ${status}`;
    }
    case AGUIEventType.STEP_STARTED:
      return `→ ${event.stepName}`;
    case AGUIEventType.STEP_FINISHED:
      return `✓ ${event.stepName}`;
    default:
      return "";
  }
}

// --- Per-Run Chain Model ---
// Groups all events between RUN_STARTED and RUN_FINISHED/RUN_ERROR into a single "run chain".
// Within each chain, consecutive events of the same category are sub-grouped.
// Events before the first RUN_STARTED are placed in a "pre-run" group.

interface RunChain {
  kind: "run";
  id: string;
  runId: string | null;
  threadId: string | null;
  events: TimestampedEvent[];
  subGroups: EventGroup[];
  firstTimestamp: number;
  lastTimestamp: number;
  isComplete: boolean;
  hasError: boolean;
}

interface RequestEntry {
  kind: "request";
  id: string;
  entry: TimestampedEvent;
}

type InspectorItem = RunChain | RequestEntry;

function buildRunChains(events: TimestampedEvent[], viewMode: ViewMode): InspectorItem[] {
  if (events.length === 0) return [];

  const items: InspectorItem[] = [];
  let currentChain: TimestampedEvent[] = [];
  let currentRunId: string | null = null;
  let currentThreadId: string | null = null;
  let chainStarted = false;
  let runCounter = 0;

  const flushChain = (complete: boolean, hasError: boolean) => {
    if (currentChain.length === 0) return;
    items.push({
      kind: "run",
      id: `run-${runCounter++}`,
      runId: currentRunId,
      threadId: currentThreadId,
      events: currentChain,
      subGroups: buildSubGroups(currentChain, viewMode),
      firstTimestamp: currentChain[0].timestamp,
      lastTimestamp: currentChain[currentChain.length - 1].timestamp,
      isComplete: complete,
      hasError,
    });
    currentChain = [];
    currentRunId = null;
    currentThreadId = null;
    chainStarted = false;
  };

  for (const te of events) {
    // Request entries are standalone — flush any open chain, emit request, continue
    if (te.request) {
      if (currentChain.length > 0) {
        flushChain(chainStarted ? false : false, false);
      }
      items.push({ kind: "request", id: te.id, entry: te });
    } else if (te.event.type === AGUIEventType.RUN_STARTED) {
      // Flush any preceding events as an incomplete chain
      if (currentChain.length > 0 && chainStarted) {
        flushChain(false, false);
      } else if (currentChain.length > 0) {
        flushChain(false, false);
      }
      chainStarted = true;
      currentRunId = (te.event as { runId?: string }).runId || null;
      currentThreadId = (te.event as { threadId?: string }).threadId || null;
      currentChain.push(te);
    } else if (te.event.type === AGUIEventType.RUN_FINISHED) {
      currentChain.push(te);
      flushChain(true, false);
    } else if (te.event.type === AGUIEventType.RUN_ERROR) {
      currentChain.push(te);
      flushChain(true, true);
    } else {
      currentChain.push(te);
    }
  }

  // Flush remaining (incomplete/still running)
  if (currentChain.length > 0) {
    flushChain(false, false);
  }

  return items;
}

interface EventGroup {
  id: string;
  category: string;
  events: TimestampedEvent[];
  firstTimestamp: number;
  lastTimestamp: number;
}

type ViewMode = "sequential" | "grouped";

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
  groups.push({
    id: `grp-${currentGroup[0].id}`,
    category: currentCat,
    events: currentGroup,
    firstTimestamp: currentGroup[0].timestamp,
    lastTimestamp: currentGroup[currentGroup.length - 1].timestamp,
  });
  return groups;
}

// --- Lifecycle-based grouping (grouped mode) ---
// Groups events by their logical lifecycle (start → end) regardless of interleaving.
// E.g., TEXT_MESSAGE_START and TEXT_MESSAGE_END are always in the same group even
// if CUSTOM or STATE events appear between them in the stream.

const LIFECYCLE_CATS = new Set(["TEXT_MESSAGE", "TOOL_CALL", "REASONING", "STEP"]);

const START_EVENTS = new Set<string>([
  AGUIEventType.TEXT_MESSAGE_START,
  AGUIEventType.TOOL_CALL_START,
  AGUIEventType.REASONING_START,
  AGUIEventType.STEP_STARTED,
]);

const END_EVENTS = new Set<string>([
  AGUIEventType.TEXT_MESSAGE_END,
  AGUIEventType.TOOL_CALL_RESULT,
  AGUIEventType.REASONING_END,
  AGUIEventType.STEP_FINISHED,
]);

function groupByLifecycle(events: TimestampedEvent[]): EventGroup[] {
  if (events.length === 0) return [];

  // Phase 1: assign each event to a lifecycle group or mark standalone
  const lifecycleOf = new Map<number, string>(); // event index → lifecycle id
  const lifecycles = new Map<string, { cat: string; indices: number[] }>();
  const open = new Map<string, string>(); // category → active lifecycle id
  let nextLc = 0;

  for (let i = 0; i < events.length; i++) {
    const type = events[i].event.type;
    const cat = getCategoryPrefix(type);

    if (START_EVENTS.has(type)) {
      const id = `lc-${nextLc++}`;
      open.set(cat, id);
      lifecycles.set(id, { cat, indices: [i] });
      lifecycleOf.set(i, id);
    } else if (open.has(cat) && LIFECYCLE_CATS.has(cat)) {
      const id = open.get(cat)!;
      lifecycles.get(id)!.indices.push(i);
      lifecycleOf.set(i, id);
      if (END_EVENTS.has(type)) {
        open.delete(cat);
      }
    }
  }

  // Phase 2: emit groups in order — lifecycle group at position of its first event
  const result: EventGroup[] = [];
  const emitted = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const lcId = lifecycleOf.get(i);
    if (lcId && !emitted.has(lcId)) {
      const lc = lifecycles.get(lcId)!;
      const groupEvents = lc.indices.map((idx) => events[idx]);
      result.push({
        id: `grp-${groupEvents[0].id}`,
        category: lc.cat,
        events: groupEvents,
        firstTimestamp: groupEvents[0].timestamp,
        lastTimestamp: groupEvents[groupEvents.length - 1].timestamp,
      });
      emitted.add(lcId);
    } else if (!lcId) {
      // Standalone event — not part of any lifecycle
      result.push({
        id: `grp-${events[i].id}`,
        category: getCategoryPrefix(events[i].event.type),
        events: [events[i]],
        firstTimestamp: events[i].timestamp,
        lastTimestamp: events[i].timestamp,
      });
    }
  }

  return result;
}

function buildSubGroups(events: TimestampedEvent[], mode: ViewMode): EventGroup[] {
  return mode === "grouped" ? groupByLifecycle(events) : groupContiguousEvents(events);
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
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [fullyExpandedGroups, setFullyExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("sequential");

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
        getEventSummary(e.event).toLowerCase().includes(filter.toLowerCase()) ||
        (e.request && "request".includes(filter.toLowerCase()))
      )
    : events;

  // When filtering, show flat list. Otherwise, show per-run chains.
  const runChains = useMemo(
    () => (filter ? null : buildRunChains(filteredEvents, viewMode)),
    [filteredEvents, filter, viewMode]
  );

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
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

  const toggleRun = (id: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
  const renderEvent = (te: TimestampedEvent, indent: boolean = false) => {
    const isRequest = !!te.request;
    const colorClass = isRequest
      ? "text-amber-400 bg-amber-950 border-amber-900"
      : getEventColor(te.event.type);
    const icon = isRequest ? "📤" : getEventIcon(te.event.type);
    const label = isRequest ? "POST Request → Backend" : te.event.type;
    const summary = isRequest
      ? (() => {
          const stateKeys = te.request?.state
            ? Object.keys(te.request.state).filter((k) => te.request!.state![k] != null)
            : [];
          const parts: string[] = [];
          if (te.request?.threadId) parts.push(`thread: ${te.request.threadId.slice(0, 12)}…`);
          if (stateKeys.length) parts.push(`state: {${stateKeys.join(", ")}}`);
          parts.push(`${te.request?.messages?.length ?? 0} messages`);
          return parts.join(" · ");
        })()
      : getEventSummary(te.event);
    // For requests, show the full request body when expanded
    const expandedContent = isRequest ? te.request : te.event;

    return (
      <div
        key={te.id}
        className={`rounded px-2 py-1 cursor-pointer transition-colors hover:opacity-90 ${colorClass} ${indent ? "ml-3 border-l-2 border-current/20" : ""}`}
        onClick={(e) => { e.stopPropagation(); toggleEvent(te.id); }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs">{icon}</span>
          <span className="text-[11px] font-mono font-bold flex-1 truncate">
            {label}
          </span>
          <span className="text-[10px] opacity-60 font-mono">
            {formatTimestamp(te.timestamp)}
          </span>
        </div>
        <div className="text-[10px] opacity-70 mt-0.5 truncate pl-5">
          {summary}
        </div>
        {expandedEvents.has(te.id) && (
          <pre className="mt-1 text-[10px] bg-black/30 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
            {JSON.stringify(expandedContent, null, 2)}
          </pre>
        )}
      </div>
    );
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
        <div className="flex items-center gap-1 mt-2">
          <span className="text-[10px] text-gray-500 mr-1">View:</span>
          {(["sequential", "grouped"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                viewMode === mode
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-gray-300"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Event List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto event-scroll p-2 space-y-1">
        {filteredEvents.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8">
            No events yet. Send a message to see AG-UI events stream in.
          </div>
        ) : runChains ? (
          /* Per-run chain view with interleaved request entries */
          (() => {
            let runNumber = 0;
            return runChains.map((item) => {
              // Standalone request entry
              if (item.kind === "request") {
                return renderEvent(item.entry, false);
              }

              // Run chain
              const chain = item;
              runNumber++;
              const thisRunNumber = runNumber;
              const isRunExpanded = expandedRuns.has(chain.id);
              const statusIcon = chain.hasError ? "❌" : chain.isComplete ? "✅" : "⏳";
              const statusColor = chain.hasError
                ? "border-red-800 bg-red-950/50"
                : chain.isComplete
                ? "border-blue-800 bg-blue-950/50"
                : "border-yellow-800 bg-yellow-950/50";
              const statusText = chain.hasError
                ? "text-red-400"
                : chain.isComplete
                ? "text-blue-400"
                : "text-yellow-400";

              return (
                <div key={chain.id} className="space-y-0.5">
                  {/* Run chain header */}
                  <div
                    className={`rounded-lg px-2 py-1.5 cursor-pointer transition-colors border ${statusColor} hover:opacity-90`}
                    onClick={() => toggleRun(chain.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] opacity-60 select-none">
                        {isRunExpanded ? "▼" : "▶"}
                      </span>
                      <span className="text-xs">{statusIcon}</span>
                      <span className={`text-xs font-bold ${statusText}`}>
                        Run {thisRunNumber}
                      </span>
                      <span className="text-[10px] font-mono bg-black/30 rounded px-1.5 py-0.5">
                        {chain.events.length}
                      </span>
                      {chain.threadId && (
                        <span className="text-[10px] opacity-40 font-mono truncate">
                          {chain.threadId.slice(0, 12)}…
                        </span>
                      )}
                      <span className="text-[10px] opacity-50 font-mono ml-auto">
                        {formatTimestamp(chain.firstTimestamp)}
                      </span>
                    </div>
                  </div>

                {/* Expanded run — show sub-groups at same indent level */}
                {isRunExpanded && (
                  <div className="pl-3 space-y-0.5">
                    {chain.subGroups.map((group) => {
                      const isExpanded = expandedGroups.has(group.id);
                      const isSingleton = group.events.length === 1;

                      if (isSingleton) {
                        return renderEvent(group.events[0], false);
                      }

                      const summary = getGroupSummary(group);
                      return (
                        <div key={group.id} className="space-y-0.5">
                          <div
                            className={`rounded px-2 py-1 cursor-pointer transition-colors border ${getCategoryColor(group.category)} hover:opacity-90`}
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
                          {isExpanded && (
                            <div className="pl-3 border-l-2 border-current/20 ml-1 space-y-0.5">
                              {(() => {
                                const isFullyExpanded = fullyExpandedGroups.has(group.id);
                                const visibleEvents = isFullyExpanded
                                  ? group.events
                                  : group.events.slice(0, MAX_VISIBLE_CHILDREN);
                                const hiddenCount = group.events.length - MAX_VISIBLE_CHILDREN;
                                return (
                                  <>
                                    {visibleEvents.map((te) => renderEvent(te, false))}
                                    {!isFullyExpanded && hiddenCount > 0 && (
                                      <button
                                        className="text-[10px] text-gray-500 hover:text-gray-300 py-1 px-2 rounded bg-gray-800/50 hover:bg-gray-800 transition-colors"
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
                    })}
                  </div>
                )}
              </div>
            );
          });
          })()
        ) : (
          /* Flat view — when filtering */
          filteredEvents.map((te) => renderEvent(te))
        )}
      </div>
    </div>
  );
}
