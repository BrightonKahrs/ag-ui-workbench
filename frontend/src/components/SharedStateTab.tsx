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

  const [chatOpen, setChatOpen] = useState(true);
  const [rawStateOpen, setRawStateOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          <strong className="text-gray-500">Dashboard Builder</strong> —
          Multi-widget dashboard with shared state.
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Left: Chat Panel — slides in/out */}
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
                  <p className="text-lg mb-2">📊 Dashboard Builder</p>
                  <p className="text-xs">
                    Ask the agent to create widgets. Watch state stream in
                    real-time.
                  </p>
                  <div className="mt-3 space-y-1 text-[10px] text-gray-700 text-left px-2">
                    <p>Try:</p>
                    <p className="text-gray-400">
                      "Create a dashboard with monthly revenue and cost charts"
                    </p>
                    <p className="text-gray-400">
                      "Add a pie chart of market share"
                    </p>
                    <p className="text-gray-400">
                      "Change the first chart to a line chart"
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
                    <div className="text-xs whitespace-pre-wrap">{msg.content}</div>
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
                  placeholder="Describe your dashboard..."
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
                  onClick={handleClear}
                  className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs hover:text-gray-900"
                  title="Reset dashboard"
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

        {/* Left: Raw JSON State panel — flies in/out */}
        <div
          className={`flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out overflow-hidden min-h-0 ${
            rawStateOpen ? "w-72" : "w-0 border-r-0"
          }`}
        >
          <div className="w-72 flex-1 flex flex-col min-h-0">
            {/* Collapse arrow inside panel */}
            <div className="flex justify-end px-2 pt-1 shrink-0">
              <button
                onClick={() => setRawStateOpen(false)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Hide Raw JSON"
              >
                <span className="text-xs">‹</span>
              </button>
            </div>
            <div className="px-3 pb-1 flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-gray-500 font-medium">
                Raw State JSON
              </span>
              {hasUnsentChanges && (
                <span className="text-[10px] text-amber-700">● modified</span>
              )}
            </div>
            <pre className="flex-1 min-h-0 text-[10px] text-gray-500 bg-gray-50 p-3 overflow-auto mx-3 mb-3 rounded font-mono">
              {JSON.stringify(state, null, 2)}
            </pre>
          </div>
        </div>
        {/* Raw JSON expand tab (only when closed) */}
        {!rawStateOpen && (
          <ExpandTab label="Raw JSON" side="left" onClick={() => setRawStateOpen(true)} />
        )}

        {/* Center: Dashboard Grid + Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Dashboard Header */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                {dashboard.title || "Dashboard"}
              </h2>
              <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded">
                {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
              </span>
              {isRunning && (
                <span className="text-[10px] text-brand-500 animate-pulse">
                  ● Streaming...
                </span>
              )}
              {hasUnsentChanges && (
                <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                  ⚡ Edited locally (syncs on next message)
                </span>
              )}
            </div>
          </div>

          {/* Widget Editor — flies in from top */}
          <div
            className={`mx-3 shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
              selectedWidget && selectedWidgetId
                ? "max-h-48 opacity-100 mb-1"
                : "max-h-0 opacity-0 mb-0"
            }`}
          >
            {selectedWidget && selectedWidgetId && (
              <WidgetEditor
                widgetId={selectedWidgetId}
                widget={selectedWidget}
                onUpdate={(patch) => updateWidget(selectedWidgetId, patch)}
                onClose={() => setSelectedWidgetId(null)}
              />
            )}
          </div>

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

