/**
 * Interactive Chart — MCP App
 *
 * Renders line/bar/area/scatter/pie charts using Chart.js with type switching.
 * Receives data via MCP Apps SDK (ontoolresult → structuredContent).
 */
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import { Chart, registerables } from "chart.js";
import "./interactive-chart.css";

Chart.register(...registerables);

interface ChartSeries {
  dataKey: string;
  label?: string;
  color?: string;
}

interface ChartData {
  title: string;
  type: string;
  xKey?: string;
  series: ChartSeries[];
  data: Record<string, unknown>[];
}

const CHART_TYPES = ["line", "bar", "area", "scatter", "pie"] as const;
const COLORS = [
  "#7c3aed", "#06b6d4", "#f59e0b", "#ef4444",
  "#10b981", "#f472b6", "#8b5cf6", "#14b8a6",
];

const appEl = document.getElementById("app")!;

let chartData: ChartData | null = null;
let currentType = "line";
let chartInstance: Chart | null = null;

function renderChart() {
  if (!chartData) return;

  const d = chartData;
  const xKey = d.xKey || (d.data.length > 0 ? Object.keys(d.data[0])[0] : "x");
  const labels = d.data.map((row) => String(row[xKey] ?? ""));
  const series = d.series || [];

  // Assign default colors
  series.forEach((s, i) => {
    if (!s.color) s.color = COLORS[i % COLORS.length];
  });

  const isPie = currentType === "pie";
  const isArea = currentType === "area";
  const chartType = isArea ? "line" : isPie ? "pie" : currentType;

  let datasets: any[];
  if (isPie) {
    const s = series[0] || { dataKey: Object.keys(d.data[0])[1] };
    datasets = [
      {
        data: d.data.map((row) => row[s.dataKey]),
        backgroundColor: d.data.map((_, i) => COLORS[i % COLORS.length]),
        borderColor: "#0f172a",
        borderWidth: 2,
      },
    ];
  } else {
    datasets = series.map((s) => ({
      label: s.label || s.dataKey,
      data: d.data.map((row) => row[s.dataKey]),
      borderColor: s.color,
      backgroundColor: isArea
        ? s.color + "33"
        : currentType === "bar"
          ? s.color + "cc"
          : s.color,
      fill: isArea,
      tension: currentType === "line" || isArea ? 0.3 : 0,
      pointRadius: currentType === "scatter" ? 5 : 3,
      pointHoverRadius: 6,
      borderWidth: 2,
    }));
  }

  // Destroy previous chart
  if (chartInstance) chartInstance.destroy();

  const canvas = document.getElementById("chart-canvas") as HTMLCanvasElement;
  chartInstance = new Chart(canvas, {
    type: chartType as any,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#334155",
          borderWidth: 1,
          cornerRadius: 6,
        },
      },
      scales: isPie
        ? {}
        : {
            x: {
              ticks: { color: "#64748b", font: { size: 10 } },
              grid: { color: "#1e293b" },
            },
            y: {
              ticks: { color: "#64748b", font: { size: 10 } },
              grid: { color: "#1e293b" },
              beginAtZero: currentType === "bar",
            },
          },
    },
  });

  // Custom legend
  const legendEl = document.getElementById("legend")!;
  if (isPie) {
    legendEl.innerHTML = labels
      .map(
        (l, i) =>
          `<span class="legend-item"><span class="legend-dot" style="background:${COLORS[i % COLORS.length]}"></span>${l}</span>`
      )
      .join("");
  } else {
    legendEl.innerHTML = series
      .map(
        (s) =>
          `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.label || s.dataKey}</span>`
      )
      .join("");
  }
}

function renderFull(d: ChartData) {
  chartData = d;
  currentType = d.type || "line";

  appEl.innerHTML = `
    <h2 id="title">${d.title || "Chart"}</h2>
    <div class="subtitle">${d.data.length} data points · ${(d.series || []).length} series · ${currentType} chart</div>
    <div class="controls" id="controls"></div>
    <div class="chart-wrap"><canvas id="chart-canvas"></canvas></div>
    <div class="legend" id="legend"></div>`;

  // Type switcher buttons
  const ctrlEl = document.getElementById("controls")!;
  CHART_TYPES.forEach((t) => {
    const btn = document.createElement("button");
    btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    btn.classList.toggle("active", t === currentType);
    btn.onclick = () => {
      currentType = t;
      ctrlEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sub = appEl.querySelector(".subtitle");
      if (sub) sub.textContent = `${d.data.length} data points · ${(d.series || []).length} series · ${currentType} chart`;
      renderChart();
    };
    ctrlEl.appendChild(btn);
  });

  renderChart();
}

// --- MCP App SDK Connection ---
const app = new App({ name: "Interactive Chart", version: "1.0.0" });

app.ontoolresult = (params) => {
  const sc = params.structuredContent as ChartData | undefined;
  if (sc && sc.data && sc.series) {
    renderFull(sc);
  }
};

app.onerror = (err) => console.error("[interactive-chart]", err);

app.connect(new PostMessageTransport(window.parent, window.parent));
