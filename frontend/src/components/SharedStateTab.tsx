import { useEffect, useRef, useState } from "react";
import type { TimestampedEvent } from "../types/ag-ui";
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

export default function SharedStateTab({ onEvents }: Props) {
  const {
    state,
    events,
    isRunning,
    error,
    sendMessage,
    clearState,
    messages,
  } = useSharedState("/state");

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

  const chart = state.chart as ChartState | undefined;

  return (
    <div className="flex-1 flex flex-col">
      {/* Tab Description */}
      <div className="bg-gray-850 border-b border-gray-800 px-4 py-2">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Shared State Tab</strong> — Demonstrates
          bidirectional state sync using STATE_SNAPSHOT and STATE_DELTA events.
          The chart renders live from shared state as the agent streams tool arguments.
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
                onClick={clearState}
                className="px-2 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white"
                title="Reset chart"
              >
                ↺
              </button>
            </form>
          </div>
        </div>

        {/* Right: Chart Visualization */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chart Header */}
          {chart?.title && (
            <div className="px-4 pt-3 pb-1">
              <h2 className="text-sm font-semibold text-white">{chart.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded uppercase">
                  {chart.chart_type || "bar"}
                </span>
                {chart.stacked && (
                  <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded">
                    stacked
                  </span>
                )}
                {chart.data && (
                  <span className="text-[10px] text-gray-600">
                    {chart.data.length} points · {chart.series?.length || 0} series
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Chart Area */}
          <div className="flex-1 p-3 min-h-0">
            {!chart ? (
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
              <ChartRenderer chart={chart} />
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

