import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent } from "../types/ag-ui";
import { useSharedState } from "../hooks/useSharedState";
import DashboardGrid, {
  WidgetEditor,
  type DashboardState,
  type WidgetState,
  type LayoutItem,
} from "./DashboardGrid";

interface Props {
  onEvents: (events: TimestampedEvent[]) => void;
  toggles: FeatureToggles;
}

const EMPTY_DASHBOARD: DashboardState = {
  title: "Dashboard",
  widgets: {},
  layout: [],
  nextId: 1,
};

export default function SharedStateTab({ onEvents, toggles }: Props) {
  const {
    state,
    events,
    isRunning,
    error,
    sendMessage,
    updateState,
    clearState,
    messages,
  } = useSharedState("/state", toggles);

  const [input, setInput] = useState("");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSyncedRef = useRef<string>("");

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

  const handleClear = () => {
    clearState();
    setSelectedWidgetId(null);
    lastSyncedRef.current = "";
  };

  // Parse dashboard from state — handles both direct object and JSON string
  const dashboard = useMemo<DashboardState>(() => {
    const raw = state.dashboard;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as DashboardState;
      } catch {
        return EMPTY_DASHBOARD;
      }
    }
    if (raw && typeof raw === "object") {
      return raw as DashboardState;
    }
    return EMPTY_DASHBOARD;
  }, [state.dashboard]);

  // Track what backend sent for "unsent changes" detection
  if (isRunning) {
    lastSyncedRef.current = JSON.stringify(dashboard);
  }

  const hasUnsentChanges = useMemo(() => {
    if (!lastSyncedRef.current) return false;
    return JSON.stringify(dashboard) !== lastSyncedRef.current;
  }, [dashboard]);

  const widgetCount = Object.keys(dashboard.widgets || {}).length;

  // Selected widget
  const selectedWidget: WidgetState | null = selectedWidgetId
    ? (dashboard.widgets || {})[selectedWidgetId] ?? null
    : null;

  // Update a widget property locally
  const updateWidget = useCallback(
    (widgetId: string, patch: Partial<WidgetState>) => {
      updateState((prev) => {
        const current =
          typeof prev.dashboard === "string"
            ? (() => {
                try {
                  return JSON.parse(prev.dashboard as string);
                } catch {
                  return { ...EMPTY_DASHBOARD };
                }
              })()
            : prev.dashboard ?? { ...EMPTY_DASHBOARD };
        const widgets = { ...current.widgets };
        widgets[widgetId] = { ...widgets[widgetId], ...patch };
        return { ...prev, dashboard: { ...current, widgets } };
      });
    },
    [updateState],
  );

  // Update dashboard layout
  const updateLayout = useCallback(
    (newLayout: LayoutItem[]) => {
      updateState((prev) => {
        const current =
          typeof prev.dashboard === "string"
            ? (() => {
                try {
                  return JSON.parse(prev.dashboard as string);
                } catch {
                  return { ...EMPTY_DASHBOARD };
                }
              })()
            : prev.dashboard ?? { ...EMPTY_DASHBOARD };
        return { ...prev, dashboard: { ...current, layout: newLayout } };
      });
    },
    [updateState],
  );

  // Remove a widget locally
  const removeWidget = useCallback(
    (widgetId: string) => {
      if (selectedWidgetId === widgetId) setSelectedWidgetId(null);
      updateState((prev) => {
        const current =
          typeof prev.dashboard === "string"
            ? (() => {
                try {
                  return JSON.parse(prev.dashboard as string);
                } catch {
                  return { ...EMPTY_DASHBOARD };
                }
              })()
            : prev.dashboard ?? { ...EMPTY_DASHBOARD };
        const widgets = { ...current.widgets };
        delete widgets[widgetId];
        const layout = (current.layout || []).filter(
          (l: LayoutItem) => l.i !== widgetId,
        );
        return { ...prev, dashboard: { ...current, widgets, layout } };
      });
    },
    [selectedWidgetId, updateState],
  );

  return (
    <div className="flex-1 flex flex-col">
      {/* Tab Description */}
      <div className="bg-gray-850 border-b border-gray-800 px-4 py-2">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Dashboard Builder</strong> —
          Multi-widget dashboard with shared state. Backend streams
          STATE_SNAPSHOT/STATE_DELTA → widgets render live. Edit widgets below →
          layout syncs on your next message.
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="w-80 flex flex-col border-r border-gray-800">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 py-6">
                <p className="text-lg mb-2">📊 Dashboard Builder</p>
                <p className="text-xs">
                  Ask the agent to create widgets. Watch state stream in
                  real-time.
                </p>
                <div className="mt-3 space-y-1 text-[10px] text-gray-700 text-left px-2">
                  <p>Try:</p>
                  <p className="text-gray-500">
                    "Create a dashboard with monthly revenue and cost charts"
                  </p>
                  <p className="text-gray-500">
                    "Add a pie chart of market share"
                  </p>
                  <p className="text-gray-500">
                    "Change the first chart to a line chart"
                  </p>
                  <p className="text-gray-500">
                    "Remove the second widget"
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
                placeholder="Describe your dashboard..."
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
                onClick={handleClear}
                className="px-2 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white"
                title="Reset dashboard"
              >
                ↺
              </button>
            </form>
          </div>
        </div>

        {/* Right: Dashboard Grid + Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Dashboard Header */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">
                {dashboard.title || "Dashboard"}
              </h2>
              <span className="text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded">
                {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
              </span>
              {isRunning && (
                <span className="text-[10px] text-purple-400 animate-pulse">
                  ● Streaming...
                </span>
              )}
              {hasUnsentChanges && (
                <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded">
                  ⚡ Edited locally (syncs on next message)
                </span>
              )}
            </div>
          </div>

          {/* Widget Editor (when selected) */}
          {selectedWidget && selectedWidgetId && (
            <div className="mx-3 mb-1 shrink-0">
              <WidgetEditor
                widgetId={selectedWidgetId}
                widget={selectedWidget}
                onUpdate={(patch) => updateWidget(selectedWidgetId, patch)}
                onClose={() => setSelectedWidgetId(null)}
              />
            </div>
          )}

          {/* Grid Area */}
          <div className="flex-1 min-h-0 overflow-auto">
            <DashboardGrid
              dashboard={dashboard}
              selectedWidgetId={selectedWidgetId}
              onSelectWidget={setSelectedWidgetId}
              onLayoutChange={updateLayout}
              onRemoveWidget={removeWidget}
            />
          </div>

          {/* Raw State (collapsible) */}
          <details className="border-t border-gray-800 shrink-0">
            <summary className="px-3 py-2 text-[10px] text-gray-500 cursor-pointer hover:text-gray-400 select-none">
              Raw State JSON
              {hasUnsentChanges && (
                <span className="text-amber-400 ml-1">● modified</span>
              )}
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

