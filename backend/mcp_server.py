"""Local MCP server for the AG-UI Playground.

Exposes demo tools via the Model Context Protocol over Streamable HTTP.
Also exposes MCP App tools — tools with interactive UI served as HTML.
Run separately: `uv run python mcp_server.py`
The chat agent connects to this via MCPStreamableHTTPTool at /mcp.
"""

import html
import json
import math
import random
from datetime import datetime, timezone

from fastmcp import FastMCP

mcp = FastMCP(
    name="PlaygroundMCPServer",
    instructions="Local MCP server with data & knowledge tools for the AG-UI Playground.",
)


# --- Knowledge Base Tools ---

KNOWLEDGE_BASE = {
    "ag-ui": {
        "title": "AG-UI Protocol",
        "content": (
            "AG-UI (Agent-User Interaction) is an open protocol for streaming "
            "agent responses to frontends. It uses Server-Sent Events (SSE) over "
            "HTTP POST with ~16+ event types: RUN_STARTED/FINISHED, TEXT_MESSAGE_*, "
            "TOOL_CALL_*, STATE_SNAPSHOT/DELTA, STEP_*, REASONING_*, and CUSTOM events. "
            "State management uses JSON Patch (RFC 6902) for incremental updates."
        ),
    },
    "agent-framework": {
        "title": "Microsoft Agent Framework",
        "content": (
            "Microsoft Agent Framework is a Python SDK for building AI agents. "
            "Key components: Agent (core), FoundryChatClient (Azure AI Foundry), "
            "@tool decorator, MCPStdioTool/MCPStreamableHTTPTool for MCP integration, "
            "and agent-framework-ag-ui for AG-UI protocol streaming."
        ),
    },
    "mcp": {
        "title": "Model Context Protocol (MCP)",
        "content": (
            "MCP is an open standard for connecting AI assistants to external tools "
            "and data sources. It supports stdio, streamable HTTP, and WebSocket transports. "
            "MCP servers expose tools and prompts; MCP clients (like agent frameworks) "
            "discover and invoke them. FastMCP is a high-level Python framework for "
            "building MCP servers."
        ),
    },
    "recharts": {
        "title": "Recharts",
        "content": (
            "Recharts is a React charting library built on D3. It provides composable "
            "chart components: BarChart, LineChart, AreaChart, PieChart, ScatterChart, "
            "and ComposedChart. Charts are responsive via ResponsiveContainer and "
            "support tooltips, legends, and grid lines."
        ),
    },
}


@mcp.tool()
def search_knowledge_base(query: str) -> str:
    """Search the playground knowledge base for information about technologies used.

    Args:
        query: Search term (e.g., 'ag-ui', 'mcp', 'agent-framework', 'recharts')

    Returns:
        Matching knowledge base entries as formatted text.
    """
    query_lower = query.lower()
    results = []
    for key, entry in KNOWLEDGE_BASE.items():
        if (query_lower in key or
            query_lower in entry["title"].lower() or
            query_lower in entry["content"].lower()):
            results.append(f"### {entry['title']}\n{entry['content']}")

    if not results:
        return f"No knowledge base entries found for '{query}'. Available topics: {', '.join(KNOWLEDGE_BASE.keys())}"
    return "\n\n".join(results)


# --- Dataset Tools ---

DATASETS = {
    "sales": {
        "name": "Quarterly Sales",
        "description": "Regional sales data by quarter",
        "columns": ["region", "quarter", "revenue", "units_sold", "profit_margin"],
        "row_count": 20,
    },
    "users": {
        "name": "User Metrics",
        "description": "Monthly active users and engagement metrics",
        "columns": ["month", "active_users", "new_signups", "churn_rate", "avg_session_min"],
        "row_count": 12,
    },
    "products": {
        "name": "Product Catalog",
        "description": "Product inventory and pricing",
        "columns": ["product_id", "name", "category", "price", "stock", "rating"],
        "row_count": 15,
    },
}


@mcp.tool()
def list_datasets() -> str:
    """List all available datasets in the playground data store.

    Returns:
        JSON array of dataset metadata.
    """
    result = []
    for key, ds in DATASETS.items():
        result.append({
            "id": key,
            "name": ds["name"],
            "description": ds["description"],
            "columns": ds["columns"],
            "row_count": ds["row_count"],
        })
    return json.dumps(result, indent=2)


@mcp.tool()
def query_dataset(dataset_id: str, limit: int = 5) -> str:
    """Query a dataset and return sample rows.

    Args:
        dataset_id: The dataset to query (sales, users, or products).
        limit: Maximum number of rows to return (default 5, max 20).

    Returns:
        JSON array of data rows.
    """
    if dataset_id not in DATASETS:
        return f"Dataset '{dataset_id}' not found. Available: {', '.join(DATASETS.keys())}"

    ds = DATASETS[dataset_id]
    limit = min(limit, ds["row_count"])
    rows = _generate_rows(dataset_id, limit)
    return json.dumps(rows, indent=2)


def _generate_rows(dataset_id: str, count: int) -> list[dict]:
    """Generate realistic sample data for a dataset."""
    random.seed(42)  # Deterministic for demo
    if dataset_id == "sales":
        regions = ["North", "South", "East", "West"]
        quarters = ["Q1", "Q2", "Q3", "Q4"]
        return [
            {
                "region": regions[i % len(regions)],
                "quarter": quarters[i // len(regions) % len(quarters)],
                "revenue": round(random.uniform(50000, 200000), 2),
                "units_sold": random.randint(100, 500),
                "profit_margin": round(random.uniform(0.1, 0.4), 2),
            }
            for i in range(count)
        ]
    elif dataset_id == "users":
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        base_users = 10000
        return [
            {
                "month": months[i % 12],
                "active_users": base_users + i * random.randint(200, 800),
                "new_signups": random.randint(500, 2000),
                "churn_rate": round(random.uniform(0.02, 0.08), 3),
                "avg_session_min": round(random.uniform(5, 25), 1),
            }
            for i in range(count)
        ]
    else:  # products
        categories = ["Electronics", "Clothing", "Home", "Sports", "Books"]
        return [
            {
                "product_id": f"PROD-{1000 + i}",
                "name": f"Product {chr(65 + i)}",
                "category": categories[i % len(categories)],
                "price": round(random.uniform(9.99, 299.99), 2),
                "stock": random.randint(0, 500),
                "rating": round(random.uniform(3.0, 5.0), 1),
            }
            for i in range(count)
        ]


# --- Utility Tools ---

@mcp.tool()
def compute_statistics(numbers: list[float]) -> str:
    """Compute descriptive statistics for a list of numbers.

    Args:
        numbers: A list of numeric values.

    Returns:
        JSON object with mean, median, std_dev, min, max, count.
    """
    if not numbers:
        return json.dumps({"error": "Empty list"})

    n = len(numbers)
    sorted_nums = sorted(numbers)
    mean = sum(numbers) / n
    median = (sorted_nums[n // 2] if n % 2 == 1
              else (sorted_nums[n // 2 - 1] + sorted_nums[n // 2]) / 2)
    variance = sum((x - mean) ** 2 for x in numbers) / n
    std_dev = math.sqrt(variance)

    return json.dumps({
        "count": n,
        "mean": round(mean, 4),
        "median": round(median, 4),
        "std_dev": round(std_dev, 4),
        "min": min(numbers),
        "max": max(numbers),
        "sum": round(sum(numbers), 4),
    }, indent=2)


@mcp.tool()
def get_server_info() -> str:
    """Get information about this MCP server and its capabilities.

    Returns:
        JSON object with server metadata.
    """
    return json.dumps({
        "name": "PlaygroundMCPServer",
        "protocol": "MCP (Model Context Protocol)",
        "transport": "Streamable HTTP",
        "port": 8889,
        "tools": ["search_knowledge_base", "list_datasets", "query_dataset",
                   "compute_statistics", "get_server_info"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


# ---------- MCP App Tools ----------
# These tools return structured data AND have an interactive HTML UI.
# The HTML is served via GET /app-html/{name}?data=<json> for frontend iframes.

# Registry of which tools are MCP App tools (used by backend to detect them)
MCP_APP_TOOLS = {"explore_dataset_app", "visualize_statistics_app"}


@mcp.tool()
def explore_dataset_app(dataset_id: str, limit: int = 10) -> str:
    """Explore a dataset with an interactive table UI.

    This is an MCP App tool — it returns data AND provides an interactive
    HTML interface for exploring, sorting, and filtering the dataset.

    Args:
        dataset_id: The dataset to explore (sales, users, or products).
        limit: Number of rows to display (default 10, max 20).
    """
    if dataset_id not in DATASETS:
        return json.dumps({"error": f"Dataset '{dataset_id}' not found. Available: {', '.join(DATASETS.keys())}"})

    ds = DATASETS[dataset_id]
    limit = min(limit, ds["row_count"])
    rows = _generate_rows(dataset_id, limit)
    return json.dumps({
        "dataset_id": dataset_id,
        "name": ds["name"],
        "description": ds["description"],
        "columns": ds["columns"],
        "rows": rows,
        "total_rows": ds["row_count"],
        "_mcp_app": "explore_dataset_app",
    })


@mcp.tool()
def visualize_statistics_app(numbers: list[float], label: str = "Dataset") -> str:
    """Compute statistics and visualize them in an interactive dashboard.

    This is an MCP App tool — it returns statistics AND provides an interactive
    HTML dashboard with charts and distribution visualization.

    Args:
        numbers: A list of numeric values to analyze.
        label: A label for the dataset (default "Dataset").
    """
    if not numbers:
        return json.dumps({"error": "Empty list provided"})

    n = len(numbers)
    sorted_nums = sorted(numbers)
    mean = sum(numbers) / n
    median = (sorted_nums[n // 2] if n % 2 == 1
              else (sorted_nums[n // 2 - 1] + sorted_nums[n // 2]) / 2)
    variance = sum((x - mean) ** 2 for x in numbers) / n
    std_dev = math.sqrt(variance)

    # Build histogram buckets
    bucket_count = min(10, n)
    min_val, max_val = min(numbers), max(numbers)
    bucket_width = (max_val - min_val) / bucket_count if max_val != min_val else 1
    histogram = [0] * bucket_count
    for x in numbers:
        idx = min(int((x - min_val) / bucket_width), bucket_count - 1)
        histogram[idx] += 1

    return json.dumps({
        "label": label,
        "count": n,
        "mean": round(mean, 4),
        "median": round(median, 4),
        "std_dev": round(std_dev, 4),
        "min": min_val,
        "max": max_val,
        "sum": round(sum(numbers), 4),
        "histogram": histogram,
        "bucket_width": round(bucket_width, 4),
        "numbers": numbers,
        "_mcp_app": "visualize_statistics_app",
    })


# ---------- HTML Generators for MCP App Tools ----------

def _generate_dataset_explorer_html(data: dict) -> str:
    """Generate self-contained HTML for the dataset explorer app."""
    data_json = html.escape(json.dumps(data), quote=True)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0f172a; color: #e2e8f0; padding: 16px; }}
  h2 {{ font-size: 16px; margin-bottom: 4px; color: #a78bfa; }}
  .desc {{ font-size: 12px; color: #94a3b8; margin-bottom: 12px; }}
  .controls {{ display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }}
  .controls input {{ background: #1e293b; border: 1px solid #334155; color: #e2e8f0;
                     padding: 6px 10px; border-radius: 6px; font-size: 12px; flex: 1; }}
  .controls select {{ background: #1e293b; border: 1px solid #334155; color: #e2e8f0;
                      padding: 6px 10px; border-radius: 6px; font-size: 12px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
  th {{ background: #1e293b; padding: 8px 10px; text-align: left; cursor: pointer;
       user-select: none; border-bottom: 2px solid #334155; color: #a78bfa;
       white-space: nowrap; }}
  th:hover {{ background: #334155; }}
  th .arrow {{ opacity: 0.5; margin-left: 4px; }}
  th.sorted .arrow {{ opacity: 1; color: #c4b5fd; }}
  td {{ padding: 6px 10px; border-bottom: 1px solid #1e293b; }}
  tr:hover td {{ background: #1e293b; }}
  .badge {{ display: inline-block; background: #7c3aed; color: white; font-size: 10px;
           padding: 2px 8px; border-radius: 10px; margin-left: 8px; }}
  .empty {{ text-align: center; padding: 24px; color: #64748b; }}
</style>
</head>
<body>
<h2>📊 <span id="name"></span><span class="badge" id="count"></span></h2>
<div class="desc" id="desc"></div>
<div class="controls">
  <input type="text" id="filter" placeholder="Filter rows..." />
  <select id="col-filter"><option value="">All columns</option></select>
</div>
<table><thead><tr id="header"></tr></thead><tbody id="tbody"></tbody></table>
<script>
const DATA = JSON.parse('{data_json}');
let sortCol = null, sortAsc = true;
const nameEl = document.getElementById('name');
const countEl = document.getElementById('count');
const descEl = document.getElementById('desc');
const headerEl = document.getElementById('header');
const tbodyEl = document.getElementById('tbody');
const filterEl = document.getElementById('filter');
const colFilterEl = document.getElementById('col-filter');

nameEl.textContent = DATA.name;
countEl.textContent = DATA.rows.length + ' / ' + DATA.total_rows + ' rows';
descEl.textContent = DATA.description;

DATA.columns.forEach(c => {{
  const opt = document.createElement('option');
  opt.value = c; opt.textContent = c;
  colFilterEl.appendChild(opt);
}});

function render() {{
  let rows = [...DATA.rows];
  const q = filterEl.value.toLowerCase();
  const colF = colFilterEl.value;
  if (q) {{
    rows = rows.filter(r => {{
      const vals = colF ? [String(r[colF])] : Object.values(r).map(String);
      return vals.some(v => v.toLowerCase().includes(q));
    }});
  }}
  if (sortCol) {{
    rows.sort((a, b) => {{
      const va = a[sortCol], vb = b[sortCol];
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    }});
  }}
  headerEl.innerHTML = DATA.columns.map(c => {{
    const sorted = sortCol === c;
    const arrow = sorted ? (sortAsc ? '▲' : '▼') : '⇅';
    return '<th class="' + (sorted ? 'sorted' : '') + '" data-col="' + c + '">' + c + '<span class="arrow">' + arrow + '</span></th>';
  }}).join('');
  if (rows.length === 0) {{
    tbodyEl.innerHTML = '<tr><td colspan="' + DATA.columns.length + '" class="empty">No matching rows</td></tr>';
  }} else {{
    tbodyEl.innerHTML = rows.map(r =>
      '<tr>' + DATA.columns.map(c => '<td>' + (r[c] ?? '') + '</td>').join('') + '</tr>'
    ).join('');
  }}
  headerEl.querySelectorAll('th').forEach(th => {{
    th.onclick = () => {{
      const col = th.dataset.col;
      if (sortCol === col) sortAsc = !sortAsc;
      else {{ sortCol = col; sortAsc = true; }}
      render();
    }};
  }});
}}
filterEl.oninput = render;
colFilterEl.onchange = render;
render();
</script>
</body>
</html>"""


def _generate_statistics_dashboard_html(data: dict) -> str:
    """Generate self-contained HTML for the statistics dashboard app."""
    data_json = html.escape(json.dumps(data), quote=True)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0f172a; color: #e2e8f0; padding: 16px; }}
  h2 {{ font-size: 16px; color: #a78bfa; margin-bottom: 12px; }}
  .stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
                 gap: 8px; margin-bottom: 16px; }}
  .stat-card {{ background: #1e293b; border: 1px solid #334155; border-radius: 8px;
               padding: 10px; text-align: center; }}
  .stat-label {{ font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }}
  .stat-value {{ font-size: 18px; font-weight: bold; color: #c4b5fd; margin-top: 2px; }}
  .chart-container {{ background: #1e293b; border: 1px solid #334155; border-radius: 8px;
                     padding: 12px; margin-bottom: 12px; }}
  .chart-title {{ font-size: 12px; color: #94a3b8; margin-bottom: 8px; }}
  .histogram {{ display: flex; align-items: flex-end; gap: 2px; height: 100px; }}
  .bar {{ flex: 1; background: #7c3aed; border-radius: 2px 2px 0 0; min-width: 6px;
         position: relative; transition: background 0.2s; cursor: pointer; }}
  .bar:hover {{ background: #a78bfa; }}
  .bar-label {{ position: absolute; bottom: -16px; left: 50%; transform: translateX(-50%);
               font-size: 8px; color: #64748b; white-space: nowrap; }}
  .bar-val {{ position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
             font-size: 9px; color: #a78bfa; font-weight: bold; }}
  .dot-plot {{ display: flex; flex-wrap: wrap; gap: 3px; padding: 8px 0; }}
  .dot {{ width: 8px; height: 8px; border-radius: 50%; background: #7c3aed; opacity: 0.7; }}
</style>
</head>
<body>
<h2>📈 <span id="label"></span></h2>
<div class="stats-grid" id="stats"></div>
<div class="chart-container">
  <div class="chart-title">Distribution Histogram</div>
  <div class="histogram" id="histogram"></div>
</div>
<div class="chart-container">
  <div class="chart-title">Data Points</div>
  <div class="dot-plot" id="dots"></div>
</div>
<script>
const D = JSON.parse('{data_json}');
document.getElementById('label').textContent = D.label + ' (' + D.count + ' values)';

const statsEl = document.getElementById('stats');
const statItems = [
  ['Mean', D.mean], ['Median', D.median], ['Std Dev', D.std_dev],
  ['Min', D.min], ['Max', D.max], ['Sum', D.sum],
];
statsEl.innerHTML = statItems.map(([l, v]) =>
  '<div class="stat-card"><div class="stat-label">' + l + '</div><div class="stat-value">' +
  (typeof v === 'number' ? v.toLocaleString(undefined, {{maximumFractionDigits: 2}}) : v) + '</div></div>'
).join('');

const histEl = document.getElementById('histogram');
const maxH = Math.max(...D.histogram);
histEl.innerHTML = D.histogram.map((count, i) => {{
  const pct = maxH > 0 ? (count / maxH * 100) : 0;
  const lo = (D.min + i * D.bucket_width).toFixed(1);
  return '<div class="bar" style="height:' + Math.max(pct, 2) + '%">' +
    '<span class="bar-val">' + count + '</span>' +
    '<span class="bar-label">' + lo + '</span></div>';
}}).join('');

const dotsEl = document.getElementById('dots');
const range = D.max - D.min || 1;
dotsEl.innerHTML = D.numbers.map(n => {{
  const hue = 260 + ((n - D.min) / range) * 40;
  return '<div class="dot" style="background:hsl(' + hue + ',70%,60%)" title="' + n + '"></div>';
}}).join('');
</script>
</body>
</html>"""


# Map app tool names → HTML generator functions
_APP_HTML_GENERATORS = {
    "explore_dataset_app": _generate_dataset_explorer_html,
    "visualize_statistics_app": _generate_statistics_dashboard_html,
}


# ---------- Custom HTTP Routes (via FastMCP custom_route) ----------

from starlette.requests import Request
from starlette.responses import HTMLResponse as StarletteHTML, JSONResponse, Response


@mcp.custom_route("/app-html/{tool_name}", methods=["GET"])
async def get_app_html(request: Request) -> Response:
    """Serve self-contained HTML for an MCP App tool.

    The frontend fetches this and renders it in a sandboxed iframe.
    The `data` query param is the JSON tool result from the tool call.
    """
    tool_name = request.path_params["tool_name"]
    data_param = request.query_params.get("data")
    if not data_param:
        return JSONResponse({"error": "Missing 'data' query parameter"}, status_code=400)

    generator = _APP_HTML_GENERATORS.get(tool_name)
    if not generator:
        return JSONResponse({"error": f"No app HTML for tool '{tool_name}'"}, status_code=404)

    try:
        parsed_data = json.loads(data_param)
    except json.JSONDecodeError:
        return JSONResponse({"error": "Invalid JSON in 'data' parameter"}, status_code=400)

    html_content = generator(parsed_data)
    return StarletteHTML(html_content)


@mcp.custom_route("/health", methods=["GET"])
async def health(request: Request) -> Response:
    return JSONResponse({"status": "ok", "tools": list(MCP_APP_TOOLS)})


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="127.0.0.1", port=8889)
