/**
 * DashboardGrid — Multi-widget dashboard with drag-and-resize grid.
 *
 * Uses react-grid-layout for drag/resize. Each widget renders a ChartRenderer.
 * Click a widget to select it and open the per-widget editor.
 * Layout changes are persisted to the dashboard state and synced on next message.
 */

import { useCallback, useMemo } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import ChartRenderer from "./ChartRenderer";

// --- Types ---

export interface SeriesConfig {
  key: string;
  name: string;
  color: string;
}

export interface DataPointRaw {
  label: string;
  values: Record<string, number>;
}

export interface WidgetState {
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

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface DashboardState {
  title?: string;
  widgets: Record<string, WidgetState>;
  layout: LayoutItem[];
  nextId?: number;
}

interface DashboardGridProps {
  dashboard: DashboardState;
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  onLayoutChange: (layout: LayoutItem[]) => void;
  onRemoveWidget: (id: string) => void;
}

const CHART_TYPES = ["bar", "line", "area", "pie", "scatter", "composed"] as const;

// --- Widget Card ---

function WidgetCard({
  widgetId,
  widget,
  isSelected,
  onSelect,
  onRemove,
}: {
  widgetId: string;
  widget: WidgetState;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`h-full flex flex-col bg-white rounded-lg border transition-colors overflow-hidden ${
        isSelected
          ? "border-brand-500 shadow-lg shadow-brand-500/10"
          : "border-gray-200 hover:border-gray-400"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Widget Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] text-gray-400 font-mono">{widgetId}</span>
          <span className="text-[10px] text-gray-600 truncate font-medium">
            {widget.title || "Untitled"}
          </span>
          <span className="text-[9px] bg-gray-100 text-gray-400 px-1 rounded">
            {widget.chart_type || "bar"}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-gray-400 hover:text-red-700 text-[10px] px-1 transition-colors"
          title="Remove widget"
        >
          ✕
        </button>
      </div>

      {/* Chart Area */}
      <div className="flex-1 p-1 min-h-0">
        {widget.data?.length && widget.series?.length ? (
          <ChartRenderer chart={widget} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-[10px]">
            No data
          </div>
        )}
      </div>
    </div>
  );
}

// --- Widget Editor ---

export function WidgetEditor({
  widgetId,
  widget,
  onUpdate,
  onClose,
}: {
  widgetId: string;
  widget: WidgetState;
  onUpdate: (patch: Partial<WidgetState>) => void;
  onClose: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white/80 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Edit Widget
          </span>
          <span className="text-[10px] font-mono text-brand-500">{widgetId}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-900 text-xs px-1"
        >
          ✕
        </button>
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">
        {/* Title */}
        <div className="col-span-2">
          <label className="block text-[10px] text-gray-400 mb-1">Title</label>
          <input
            type="text"
            value={widget.title || ""}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full bg-gray-100 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-brand-300"
          />
        </div>

        {/* Chart Type */}
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">Chart Type</label>
          <div className="flex flex-wrap gap-1">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct}
                onClick={() => onUpdate({ chart_type: ct })}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  (widget.chart_type || "bar") === ct
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-500 hover:text-gray-900"
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
            <label className="block text-[10px] text-gray-400 mb-1">X Label</label>
            <input
              type="text"
              value={widget.x_label || ""}
              onChange={(e) => onUpdate({ x_label: e.target.value })}
              className="w-full bg-gray-100 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-brand-300"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] text-gray-400 mb-1">Y Label</label>
            <input
              type="text"
              value={widget.y_label || ""}
              onChange={(e) => onUpdate({ y_label: e.target.value })}
              className="w-full bg-gray-100 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-brand-300"
            />
          </div>
        </div>

        {/* Toggles */}
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">Display</label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["show_legend", "Legend"],
                ["show_grid", "Grid"],
                ["stacked", "Stacked"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={widget[key] ?? key !== "stacked"}
                  onChange={(e) => onUpdate({ [key]: e.target.checked })}
                  className="rounded bg-gray-100 border-gray-300 text-brand-500 focus:ring-brand-500 focus:ring-offset-0 w-3 h-3"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Series Colors */}
        {widget.series && widget.series.length > 0 && (
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">Series Colors</label>
            <div className="flex flex-wrap gap-2">
              {widget.series.map((s, i) => (
                <label
                  key={s.key}
                  className="flex items-center gap-1 text-[10px] text-gray-500"
                >
                  <input
                    type="color"
                    value={s.color || "#8884d8"}
                    onChange={(e) => {
                      const newSeries = [...widget.series!];
                      newSeries[i] = { ...newSeries[i], color: e.target.value };
                      onUpdate({ series: newSeries });
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
  );
}

// --- Dashboard Grid ---

export default function DashboardGrid({
  dashboard,
  selectedWidgetId,
  onSelectWidget,
  onLayoutChange,
  onRemoveWidget,
}: DashboardGridProps) {
  const widgets = dashboard.widgets || {};
  const layout = dashboard.layout || [];
  const widgetIds = useMemo(() => Object.keys(widgets), [widgets]);

  const gridLayout = useMemo(() => {
    // Build layout items, using stored positions or defaults
    const layoutMap = new Map(layout.map((l) => [l.i, l]));
    return widgetIds.map((id, idx) => {
      const stored = layoutMap.get(id);
      if (stored) return stored;
      // Fallback: auto-position
      return {
        i: id,
        x: (idx * 6) % 12,
        y: Math.floor((idx * 6) / 12) * 4,
        w: 6,
        h: 4,
        minW: 3,
        minH: 2,
      };
    });
  }, [widgetIds, layout]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const mapped: LayoutItem[] = newLayout
        .filter((l) => l.i in widgets)
        .map((l) => ({
          i: l.i,
          x: l.x,
          y: l.y,
          w: l.w,
          h: l.h,
          minW: l.minW ?? 3,
          minH: l.minH ?? 2,
        }));
      onLayoutChange(mapped);
    },
    [widgets, onLayoutChange],
  );

  const { width, containerRef, mounted } = useContainerWidth();

  if (widgetIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-sm">No widgets yet</p>
          <p className="text-xs text-gray-700 mt-1">
            Ask the agent to create a dashboard with charts
          </p>
          <div className="mt-3 space-y-1 text-[10px] text-gray-700 text-left px-2">
            <p>Try:</p>
            <p className="text-gray-400">"Create a dashboard with revenue and cost charts"</p>
            <p className="text-gray-400">"Add a pie chart of market share"</p>
            <p className="text-gray-400">"Show me monthly sales data as a line chart"</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto" onClick={() => onSelectWidget(null)}>
      {mounted && (
        <Responsive
          className="layout"
          width={width}
          layouts={{ lg: gridLayout }}
          breakpoints={{ lg: 800, md: 600, sm: 0 }}
          cols={{ lg: 12, md: 12, sm: 6 }}
          rowHeight={80}
          dragConfig={{ enabled: true, handle: ".widget-drag-handle" }}
          resizeConfig={{ enabled: true }}
          onLayoutChange={handleLayoutChange}
          margin={[8, 8]}
        >
          {widgetIds.map((id) => (
            <div key={id} className="relative group">
              {/* Invisible drag handle overlaid on header */}
              <div className="widget-drag-handle absolute top-0 left-0 right-8 h-7 cursor-grab z-10" />
              <WidgetCard
                widgetId={id}
                widget={widgets[id]}
                isSelected={selectedWidgetId === id}
                onSelect={() => onSelectWidget(id)}
                onRemove={() => onRemoveWidget(id)}
              />
            </div>
          ))}
        </Responsive>
      )}
    </div>
  );
}
