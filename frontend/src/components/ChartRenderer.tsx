/**
 * ChartRenderer — Renders a Recharts chart from a WidgetState / ChartState object.
 *
 * Supports: bar, line, area, pie, scatter, composed.
 */

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

export interface SeriesConfig {
  key: string;
  name: string;
  color: string;
}

export interface DataPointRaw {
  label: string;
  values: Record<string, number>;
}

export interface ChartState {
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

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 },
  labelStyle: { color: "#e5e7eb" },
  itemStyle: { color: "#d1d5db" },
};

export default function ChartRenderer({ chart }: { chart: ChartState }) {
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
  const xLabel = x_label ? { value: x_label, position: "bottom" as const, fill: "#9ca3af", fontSize: 11 } : undefined;
  const yLabel = y_label ? { value: y_label, angle: -90, position: "insideLeft" as const, fill: "#9ca3af", fontSize: 11 } : undefined;

  switch (chart_type) {
    case "bar":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={flatData} margin={{ top: 5, right: 20, left: 5, bottom: 15 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} label={xLabel} />
            <YAxis stroke="#9ca3af" fontSize={10} label={yLabel} />
            <Tooltip {...TOOLTIP_STYLE} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? "stack" : undefined} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={flatData} margin={{ top: 5, right: 20, left: 5, bottom: 15 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} label={xLabel} />
            <YAxis stroke="#9ca3af" fontSize={10} label={yLabel} />
            <Tooltip {...TOOLTIP_STYLE} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case "area":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={flatData} margin={{ top: 5, right: 20, left: 5, bottom: 15 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} label={xLabel} />
            <YAxis stroke="#9ca3af" fontSize={10} label={yLabel} />
            <Tooltip {...TOOLTIP_STYLE} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
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
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius="70%"
              innerRadius="40%"
              dataKey="value"
              nameKey="name"
              label={(props) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={{ stroke: "#6b7280" }}
              fontSize={10}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip {...TOOLTIP_STYLE} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case "scatter":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 20, left: 5, bottom: 15 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} name={x_label || "X"} label={xLabel} />
            <YAxis stroke="#9ca3af" fontSize={10} name={y_label || "Y"} label={yLabel} />
            <Tooltip {...TOOLTIP_STYLE} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {series.map((s) => (
              <Scatter key={s.key} name={s.name} data={flatData} fill={s.color} dataKey={s.key} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      );

    case "composed":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={flatData} margin={{ top: 5, right: 20, left: 5, bottom: 15 }}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" />}
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} />
            <YAxis stroke="#9ca3af" fontSize={10} />
            <Tooltip {...TOOLTIP_STYLE} />
            {show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
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
