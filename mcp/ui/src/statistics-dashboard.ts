/**
 * Statistics Dashboard — MCP App
 *
 * Stats cards, histogram, and dot plot visualization.
 * Receives data via MCP Apps SDK (ontoolresult → structuredContent).
 */
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import "./statistics-dashboard.css";

interface StatsData {
  label: string;
  count: number;
  mean: number;
  median: number;
  std_dev: number;
  min: number;
  max: number;
  sum: number;
  histogram: number[];
  bucket_width: number;
  numbers: number[];
}

const appEl = document.getElementById("app")!;

function render(d: StatsData) {
  const stats = [
    ["Mean", d.mean],
    ["Median", d.median],
    ["Std Dev", d.std_dev],
    ["Min", d.min],
    ["Max", d.max],
    ["Sum", d.sum],
  ];

  const maxH = Math.max(...d.histogram);
  const range = d.max - d.min || 1;

  appEl.innerHTML = `
    <h2>📈 ${d.label} <span class="sub">(${d.count} values)</span></h2>
    <div class="stats-grid">
      ${stats
        .map(
          ([label, val]) => `
        <div class="stat-card">
          <div class="stat-label">${label}</div>
          <div class="stat-value">${typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : val}</div>
        </div>`
        )
        .join("")}
    </div>
    <div class="chart-container">
      <div class="chart-title">Distribution Histogram</div>
      <div class="histogram">
        ${d.histogram
          .map((count, i) => {
            const pct = maxH > 0 ? (count / maxH) * 100 : 0;
            const lo = (d.min + i * d.bucket_width).toFixed(1);
            return `<div class="bar" style="height:${Math.max(pct, 2)}%">
              <span class="bar-val">${count}</span>
              <span class="bar-label">${lo}</span>
            </div>`;
          })
          .join("")}
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-title">Data Points</div>
      <div class="dot-plot">
        ${d.numbers
          .map((n) => {
            const hue = 260 + ((n - d.min) / range) * 40;
            return `<div class="dot" style="background:hsl(${hue},70%,60%)" title="${n}"></div>`;
          })
          .join("")}
      </div>
    </div>`;
}

// --- MCP App SDK Connection ---
const app = new App({ name: "Statistics Dashboard", version: "1.0.0" });

app.ontoolresult = (params) => {
  const sc = params.structuredContent as StatsData | undefined;
  if (sc && sc.histogram) {
    render(sc);
  }
};

app.onerror = (err) => console.error("[statistics-dashboard]", err);

app.connect(new PostMessageTransport(window.parent, window.parent));
