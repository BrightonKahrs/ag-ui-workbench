/**
 * Dataset Explorer — MCP App
 *
 * Interactive sortable/filterable table for exploring datasets.
 * Receives data via MCP Apps SDK (ontoolresult → structuredContent).
 */
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import "./dataset-explorer.css";

interface DatasetData {
  dataset_id: string;
  name: string;
  description: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
}

const appEl = document.getElementById("app")!;

let data: DatasetData | null = null;
let sortCol: string | null = null;
let sortAsc = true;
let filterText = "";
let filterCol = "";

function render() {
  if (!data) {
    appEl.innerHTML = '<p class="loading">Waiting for data…</p>';
    return;
  }

  let rows = [...data.rows];

  // Filter
  if (filterText) {
    const q = filterText.toLowerCase();
    rows = rows.filter((r) => {
      const vals = filterCol
        ? [String(r[filterCol] ?? "")]
        : Object.values(r).map(String);
      return vals.some((v) => v.toLowerCase().includes(q));
    });
  }

  // Sort
  if (sortCol) {
    const col = sortCol;
    rows.sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va ?? "").localeCompare(String(vb ?? ""));
      return sortAsc ? cmp : -cmp;
    });
  }

  const colOptions = data.columns
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");

  appEl.innerHTML = `
    <h2>📊 ${data.name}<span class="badge">${rows.length} / ${data.total_rows} rows</span></h2>
    <p class="desc">${data.description}</p>
    <div class="controls">
      <input type="text" id="filter" placeholder="Filter rows…" value="${filterText}" />
      <select id="col-filter">
        <option value="">All columns</option>
        ${colOptions}
      </select>
    </div>
    <table>
      <thead><tr>${data.columns
        .map((c) => {
          const sorted = sortCol === c;
          const arrow = sorted ? (sortAsc ? "▲" : "▼") : "⇅";
          return `<th class="${sorted ? "sorted" : ""}" data-col="${c}">${c}<span class="arrow">${arrow}</span></th>`;
        })
        .join("")}</tr></thead>
      <tbody>${
        rows.length === 0
          ? `<tr><td colspan="${data.columns.length}" class="empty">No matching rows</td></tr>`
          : rows
              .map(
                (r) =>
                  `<tr>${data!.columns.map((c) => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`
              )
              .join("")
      }</tbody>
    </table>`;

  // Bind events
  const filterInput = document.getElementById("filter") as HTMLInputElement;
  filterInput.oninput = () => {
    filterText = filterInput.value;
    render();
  };

  const colSelect = document.getElementById("col-filter") as HTMLSelectElement;
  colSelect.value = filterCol;
  colSelect.onchange = () => {
    filterCol = colSelect.value;
    render();
  };

  appEl.querySelectorAll("th[data-col]").forEach((th) => {
    (th as HTMLElement).onclick = () => {
      const col = (th as HTMLElement).dataset.col!;
      if (sortCol === col) sortAsc = !sortAsc;
      else {
        sortCol = col;
        sortAsc = true;
      }
      render();
    };
  });
}

// --- MCP App SDK Connection ---
const app = new App({ name: "Dataset Explorer", version: "1.0.0" });

app.ontoolresult = (params) => {
  const sc = params.structuredContent as DatasetData | undefined;
  if (sc && sc.columns && sc.rows) {
    data = sc;
    render();
  }
};

app.onerror = (err) => console.error("[dataset-explorer]", err);

app.connect(new PostMessageTransport(window.parent, window.parent));
