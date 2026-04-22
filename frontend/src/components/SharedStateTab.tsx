import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureToggles, TimestampedEvent } from "../types/ag-ui";
import { useSharedState } from "../hooks/useSharedState";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Props {
  onEvents: (events: TimestampedEvent[]) => void;
  toggles: FeatureToggles;
}

interface DataPointRaw {
  label: string;
  values: Record<string, number>;
}

interface SeriesConfig {
  key: string;
  name: string;
  color: string;
}

interface ChartState {
  title?: string;
  chart_type?: string;
  x_label?: string;
  y_label?: string;
  series?: SeriesConfig[];
  data?: DataPointRaw[];
  show_legend?: boolean;
  show_grid?: boolean;
  stacked?: boolean;
}

// Flatten data for Recharts: [{label, revenue: 42, cost: 31}, ...]
function flattenData(data: DataPointRaw[]): Record<string, unknown>[] {
  return data.map((dp) => ({
    name: dp.label,
    ...dp.values,
  }));
}

const PIE_COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7c7c", "#00a4ef",
  "#a2aaad", "#4285f4", "#ff9900", "#36cfc9", "#f759ab",
];

function ChartRenderer({ chart }: { chart: ChartState }) {
  const {
    chart_type = "bar",
    series = [],
    data = [],
    x_label = "",
    y_label = "",
    show_legend = true,
    show_grid = true,
    stacked = false,
  } = chart;

  if (!data.length || !series.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Waiting for data...
      </div>
    );
  }

  const flatData = flattenData(data);

  switch (chart_type) {
    case "bar":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={flatData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} label={x_label ? { value: x_label, position: "bottom", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <YAxis stroke="#9ca3af" fontSize={11} label={y_label ? { value: y_label, angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} itemStyle={{ color: "#d1d5db" }} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? "stack" : undefined} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={flatData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} label={x_label ? { value: x_label, position: "bottom", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <YAxis stroke="#9ca3af" fontSize={11} label={y_label ? { value: y_label, angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} itemStyle={{ color: "#d1d5db" }} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case "area":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={flatData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} label={x_label ? { value: x_label, position: "bottom", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <YAxis stroke="#9ca3af" fontSize={11} label={y_label ? { value: y_label, angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} itemStyle={{ color: "#d1d5db" }} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.3} stackId={stacked ? "stack" : undefined} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );

    case "pie": {
      const pieKey = series[0]?.key || "value";
      const pieData = data.map((dp, i) => ({
        name: dp.label,
        value: dp.values[pieKey] || 0,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" outerRadius="70%" innerRadius="40%" dataKey="value" nameKey="name" label={(props) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`} labelLine={{ stroke: "#6b7280" }} fontSize={11}>
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} itemStyle={{ color: "#d1d5db" }} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case "scatter":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} name={x_label || "X"} label={x_label ? { value: x_label, position: "bottom", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <YAxis stroke="#9ca3af" fontSize={11} name={y_label || "Y"} label={y_label ? { value: y_label, angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 11 } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} itemStyle={{ color: "#d1d5db" }} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Scatter key={s.key} name={s.name} data={flatData} fill={s.color} dataKey={s.key} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      );

    // Composed: render first series as bars, rest as lines
    case "composed":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={flatData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
            <YAxis stroke="#9ca3af" fontSize={11} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} itemStyle={{ color: "#d1d5db" }} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.slice(0, 1).map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[2, 2, 0, 0]} />
            ))}
            {series.slice(1).map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    default:
      return (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          Unknown chart type: {chart_type}
        </div>
      );
  }
}

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
  const [editorOpen, setEditorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Buffer: keep last valid chart to avoid blanking during streaming updates (use ref to prevent re-render loops)
  const lastValidChartRef = useRef<ChartState | undefined>(undefined);
  // Track the last chart state that was sent to (or received from) the backend
  const lastSyncedChartRef = useRef<string>("");
  // Force re-render counter when lastValidChart changes (needed since ref doesn't trigger render)
  const [, setChartTick] = useState(0);

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
    lastValidChartRef.current = undefined;
    lastSyncedChartRef.current = "";
    setChartTick((t) => t + 1);
  };

  /** Update a chart property locally — syncs to backend on the next message. */
  const updateChart = useCallback(
    (patch: Partial<ChartState>) => {
      updateState((prev) => {
        const current =
          typeof prev.chart === "string"
            ? (() => { try { return JSON.parse(prev.chart as string); } catch { return {}; } })()
            : prev.chart ?? {};
        return { ...prev, chart: { ...current, ...patch } };
      });
    },
    [updateState],
  );

  // state.chart may be a JSON string (from predict_state streaming chart_json)
  // or an object (from STATE_SNAPSHOT after full parsing). Handle both.
  // Memoize to prevent new object references on every render
  const rawChart = state.chart;
  const currentChart = useMemo<ChartState | undefined>(() => {
    if (typeof rawChart === "string") {
      try {
        return JSON.parse(rawChart) as ChartState;
      } catch {
        return undefined; // Partial JSON still streaming
      }
    }
    if (rawChart && typeof rawChart === "object") {
      return rawChart as ChartState;
    }
    return undefined;
  }, [rawChart]);

  // Update lastValidChart ref synchronously (no useEffect needed — avoids infinite loops)
  if (currentChart && currentChart.data && currentChart.series) {
    lastValidChartRef.current = currentChart;
    // Track what backend sent so we can show "unsent changes" badge
    if (isRunning) {
      lastSyncedChartRef.current = JSON.stringify(currentChart);
    }
  }
  // Clear buffer when run finishes with no chart
  if (!isRunning && state.chart === undefined && lastValidChartRef.current) {
    lastValidChartRef.current = undefined;
  }

  // Display: prefer current valid chart, fall back to buffered one
  const displayChart = currentChart ?? lastValidChartRef.current;
  const isStreamingChart = isRunning && !currentChart && !!lastValidChartRef.current;

  // Detect local edits not yet sent to backend
  const hasUnsentChanges = useMemo(() => {
    if (!displayChart || !lastSyncedChartRef.current) return false;
    return JSON.stringify(displayChart) !== lastSyncedChartRef.current;
  }, [displayChart]);

  const CHART_TYPES = ["bar", "line", "area", "pie", "scatter", "composed"] as const;

  return (
    <div className="flex-1 flex flex-col">
      {/* Tab Description */}
      <div className="bg-gray-850 border-b border-gray-800 px-4 py-2">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Shared State Tab</strong> — Bidirectional state sync:
          backend streams STATE_SNAPSHOT/STATE_DELTA → frontend renders live.
          Edit chart properties below → changes update local state instantly →
          sent to backend in the <code className="text-purple-400">state</code> field on your next message.
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="w-80 flex flex-col border-r border-gray-800">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 py-6">
                <p className="text-lg mb-2">📊 Data Viz Builder</p>
                <p className="text-xs">
                  Ask the agent to create charts. Watch state stream in real-time.
                </p>
                <div className="mt-3 space-y-1 text-[10px] text-gray-700 text-left px-2">
                  <p>Try:</p>
                  <p className="text-gray-500">"Show me monthly revenue data"</p>
                  <p className="text-gray-500">"Create a pie chart of market share"</p>
                  <p className="text-gray-500">"Make it a line chart instead"</p>
                  <p className="text-gray-500">"Add a new series for Q3 projections"</p>
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
                placeholder="Describe a visualization..."
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
                title="Reset chart"
              >
                ↺
              </button>
            </form>
          </div>
        </div>

        {/* Right: Chart Visualization + Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chart Header with Edit Toggle */}
          <div className="px-4 pt-3 pb-1 flex items-start justify-between">
            <div className="flex-1">
              {displayChart?.title ? (
                <>
                  <h2 className="text-sm font-semibold text-white">
                    {displayChart.title}
                    {isStreamingChart && (
                      <span className="ml-2 text-[10px] text-purple-400 animate-pulse">● Updating...</span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded uppercase">
                      {displayChart.chart_type || "bar"}
                    </span>
                    {displayChart.stacked && (
                      <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded">
                        stacked
                      </span>
                    )}
                    {displayChart.data && (
                      <span className="text-[10px] text-gray-600">
                        {displayChart.data.length} points · {displayChart.series?.length || 0} series
                      </span>
                    )}
                    {hasUnsentChanges && (
                      <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                        ⚡ Edited locally
                        <span className="text-amber-500">(syncs on next message)</span>
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <h2 className="text-sm text-gray-500">No chart yet</h2>
              )}
            </div>
            {displayChart && (
              <button
                onClick={() => setEditorOpen(!editorOpen)}
                className={`ml-2 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  editorOpen
                    ? "bg-purple-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
                title="Edit chart properties"
              >
                ✏️ Edit
              </button>
            )}
          </div>

          {/* Chart Editor Panel (collapsible) */}
          {editorOpen && displayChart && (
            <div className="mx-3 mb-2 border border-gray-700 rounded-lg bg-gray-900/80 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Chart Editor — Frontend State
                </span>
                <span className="text-[10px] text-gray-600">
                  Changes update state locally · Sent to backend on next message
                </span>
              </div>
              <div className="p-3 grid grid-cols-2 gap-3">
                {/* Title */}
                <div className="col-span-2">
                  <label className="block text-[10px] text-gray-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={displayChart.title || ""}
                    onChange={(e) => updateChart({ title: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Chart Type */}
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Chart Type</label>
                  <div className="flex flex-wrap gap-1">
                    {CHART_TYPES.map((ct) => (
                      <button
                        key={ct}
                        onClick={() => updateChart({ chart_type: ct })}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          (displayChart.chart_type || "bar") === ct
                            ? "bg-purple-600 text-white"
                            : "bg-gray-800 text-gray-400 hover:text-white"
                        }`}
                      >
                        {ct}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Axis Labels */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-500 mb-1">X Label</label>
                    <input
                      type="text"
                      value={displayChart.x_label || ""}
                      onChange={(e) => updateChart({ x_label: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-500 mb-1">Y Label</label>
                    <input
                      type="text"
                      value={displayChart.y_label || ""}
                      onChange={(e) => updateChart({ y_label: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Display Options</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["show_legend", "Legend"],
                      ["show_grid", "Grid"],
                      ["stacked", "Stacked"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={displayChart[key] ?? (key !== "stacked")}
                          onChange={(e) => updateChart({ [key]: e.target.checked })}
                          className="rounded bg-gray-800 border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 w-3 h-3"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Series Colors */}
                {displayChart.series && displayChart.series.length > 0 && (
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Series Colors</label>
                    <div className="flex flex-wrap gap-2">
                      {displayChart.series.map((s, i) => (
                        <label key={s.key} className="flex items-center gap-1 text-[10px] text-gray-400">
                          <input
                            type="color"
                            value={s.color || "#8884d8"}
                            onChange={(e) => {
                              const newSeries = [...displayChart.series!];
                              newSeries[i] = { ...newSeries[i], color: e.target.value };
                              updateChart({ series: newSeries });
                            }}
                            className="w-4 h-4 rounded border-0 cursor-pointer bg-transparent"
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chart Area */}
          <div className="flex-1 p-3 min-h-[200px] min-w-[200px] relative">
            {!displayChart ? (
              <div className="flex items-center justify-center h-full text-gray-600">
                <div className="text-center">
                  <div className="text-4xl mb-2">📈</div>
                  <p className="text-sm">No visualization yet</p>
                  <p className="text-xs text-gray-700 mt-1">
                    Ask the agent to create a chart
                  </p>
                </div>
              </div>
            ) : (
              <>
                <ChartRenderer chart={displayChart} />
                {isStreamingChart && (
                  <div className="absolute inset-0 bg-gray-900/30 flex items-center justify-center rounded pointer-events-none">
                    <div className="bg-gray-800/90 px-3 py-1.5 rounded-full text-xs text-purple-300 flex items-center gap-2">
                      <span className="animate-spin">⟳</span>
                      Streaming new data...
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Raw State (collapsible) */}
          <details className="border-t border-gray-800">
            <summary className="px-3 py-2 text-[10px] text-gray-500 cursor-pointer hover:text-gray-400 select-none">
              Raw State JSON {hasUnsentChanges && <span className="text-amber-400 ml-1">● modified</span>}
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

