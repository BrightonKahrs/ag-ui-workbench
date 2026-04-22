"""MCP Server for the AG-UI Playground.

Exposes demo tools via the Model Context Protocol over Streamable HTTP.
Includes MCP App tools with interactive UIs served as resources.

Run: `cd backend && uv run python ../mcp/server.py`
The chat agent connects via MCPStreamableHTTPTool at /mcp.
"""

import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

from fastmcp import FastMCP
from mcp.types import CallToolResult, TextContent
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, Response

# --- Constants ---

RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"
UI_DIST_DIR = Path(__file__).parent / "ui" / "dist"

DATASET_EXPLORER_URI = "ui://ag-ui-playground/dataset-explorer.html"
STATISTICS_DASHBOARD_URI = "ui://ag-ui-playground/statistics-dashboard.html"
INTERACTIVE_CHART_URI = "ui://ag-ui-playground/interactive-chart.html"

# Registry of MCP App tool names (used by backend middleware)
MCP_APP_TOOLS = {"explore_dataset_app", "visualize_statistics_app", "create_chart_app"}

mcp = FastMCP(
    name="PlaygroundMCPServer",
    instructions="Local MCP server with data & knowledge tools for the AG-UI Playground.",
)


# ─────────────────────────────────────────────────────────────────────────────
# Knowledge Base Tools
# ─────────────────────────────────────────────────────────────────────────────

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
    """
    query_lower = query.lower()
    results = []
    for key, entry in KNOWLEDGE_BASE.items():
        if (query_lower in key
                or query_lower in entry["title"].lower()
                or query_lower in entry["content"].lower()):
            results.append(f"### {entry['title']}\n{entry['content']}")
    if not results:
        return f"No entries found for '{query}'. Available topics: {', '.join(KNOWLEDGE_BASE.keys())}"
    return "\n\n".join(results)


# ─────────────────────────────────────────────────────────────────────────────
# Dataset Tools
# ─────────────────────────────────────────────────────────────────────────────

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
    """List all available datasets in the playground data store."""
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
    """
    if dataset_id not in DATASETS:
        return f"Dataset '{dataset_id}' not found. Available: {', '.join(DATASETS.keys())}"
    ds = DATASETS[dataset_id]
    limit = min(limit, ds["row_count"])
    rows = _generate_rows(dataset_id, limit)
    return json.dumps(rows, indent=2)


def _generate_rows(dataset_id: str, count: int) -> list[dict]:
    """Generate realistic sample data for a dataset."""
    random.seed(42)
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


# ─────────────────────────────────────────────────────────────────────────────
# Utility Tools
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool()
def compute_statistics(numbers: list[float]) -> str:
    """Compute descriptive statistics for a list of numbers.

    Args:
        numbers: A list of numeric values.
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
    """Get information about this MCP server and its capabilities."""
    return json.dumps({
        "name": "PlaygroundMCPServer",
        "protocol": "MCP (Model Context Protocol)",
        "transport": "Streamable HTTP",
        "port": 8889,
        "tools": [
            "search_knowledge_base", "list_datasets", "query_dataset",
            "compute_statistics", "get_server_info",
            "explore_dataset_app", "visualize_statistics_app", "create_chart_app",
        ],
        "mcp_apps": list(MCP_APP_TOOLS),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# MCP App Tools — Tools with interactive UI
#
# Each app tool:
#   1. Has meta={"ui": {"resourceUri": ...}} linking to a UI resource
#   2. Returns CallToolResult with content + structuredContent
#   3. The UI resource is a Vite-bundled single-file HTML served from ui/dist/
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool(meta={"ui": {"resourceUri": DATASET_EXPLORER_URI}})
def explore_dataset_app(dataset_id: str, limit: int = 10) -> CallToolResult:
    """Explore a dataset with an interactive table UI.

    This is an MCP App tool — it returns data AND provides an interactive
    HTML interface for exploring, sorting, and filtering the dataset.

    Args:
        dataset_id: The dataset to explore (sales, users, or products).
        limit: Number of rows to display (default 10, max 20).
    """
    if dataset_id not in DATASETS:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Dataset '{dataset_id}' not found.")],
        )
    ds = DATASETS[dataset_id]
    limit = min(limit, ds["row_count"])
    rows = _generate_rows(dataset_id, limit)

    data = {
        "dataset_id": dataset_id,
        "name": ds["name"],
        "description": ds["description"],
        "columns": ds["columns"],
        "rows": rows,
        "total_rows": ds["row_count"],
    }
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(data))],
        structuredContent=data,
    )


@mcp.tool(meta={"ui": {"resourceUri": STATISTICS_DASHBOARD_URI}})
def visualize_statistics_app(numbers: list[float], label: str = "Dataset") -> CallToolResult:
    """Compute statistics and visualize them in an interactive dashboard.

    This is an MCP App tool — it returns statistics AND provides an interactive
    HTML dashboard with charts and distribution visualization.

    Args:
        numbers: A list of numeric values to analyze.
        label: A label for the dataset (default "Dataset").
    """
    if not numbers:
        return CallToolResult(
            content=[TextContent(type="text", text="Empty list provided")],
        )

    n = len(numbers)
    sorted_nums = sorted(numbers)
    mean = sum(numbers) / n
    median = (sorted_nums[n // 2] if n % 2 == 1
              else (sorted_nums[n // 2 - 1] + sorted_nums[n // 2]) / 2)
    variance = sum((x - mean) ** 2 for x in numbers) / n
    std_dev = math.sqrt(variance)

    bucket_count = min(10, n)
    min_val, max_val = min(numbers), max(numbers)
    bucket_width = (max_val - min_val) / bucket_count if max_val != min_val else 1
    histogram = [0] * bucket_count
    for x in numbers:
        idx = min(int((x - min_val) / bucket_width), bucket_count - 1)
        histogram[idx] += 1

    data = {
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
    }
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(data))],
        structuredContent=data,
    )


@mcp.tool(meta={"ui": {"resourceUri": INTERACTIVE_CHART_URI}})
def create_chart_app(chart_json: str) -> CallToolResult:
    """Create an interactive chart visualization as an MCP App.

    This is the preferred tool for any data visualization request (line charts,
    bar charts, area charts, scatter plots, pie charts).

    Args:
        chart_json: JSON string with chart configuration:
            {
                "title": "Chart Title",
                "type": "line" | "bar" | "area" | "scatter" | "pie",
                "xKey": "name of x-axis field",
                "series": [
                    {"dataKey": "field_name", "label": "Display Name", "color": "#hex"}
                ],
                "data": [
                    {"x_field": "Jan", "field_name": 100, ...},
                    ...
                ]
            }
    """
    try:
        chart = json.loads(chart_json)
    except json.JSONDecodeError:
        return CallToolResult(
            content=[TextContent(type="text", text="Invalid JSON in chart_json")],
        )

    required = ["title", "type", "data", "series"]
    for key in required:
        if key not in chart:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Missing required field: {key}")],
            )

    valid_types = ["line", "bar", "area", "scatter", "pie"]
    if chart["type"] not in valid_types:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Invalid chart type. Use: {valid_types}")],
        )

    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(chart))],
        structuredContent=chart,
    )


# ─────────────────────────────────────────────────────────────────────────────
# MCP App Resources — serve bundled HTML from ui/dist/
# ─────────────────────────────────────────────────────────────────────────────

def _read_dist_html(filename: str) -> str:
    """Read a compiled HTML file from ui/dist/."""
    html_path = UI_DIST_DIR / filename
    if not html_path.exists():
        return f"<html><body><p>Build error: {filename} not found. Run `npm run build` in mcp/ui/.</p></body></html>"
    return html_path.read_text(encoding="utf-8")


@mcp.resource(DATASET_EXPLORER_URI, name="Dataset Explorer UI", mime_type=RESOURCE_MIME_TYPE)
async def dataset_explorer_resource() -> str:
    """Returns the bundled dataset explorer HTML for MCP Apps hosts."""
    return _read_dist_html("dataset-explorer.html")


@mcp.resource(STATISTICS_DASHBOARD_URI, name="Statistics Dashboard UI", mime_type=RESOURCE_MIME_TYPE)
async def statistics_dashboard_resource() -> str:
    """Returns the bundled statistics dashboard HTML for MCP Apps hosts."""
    return _read_dist_html("statistics-dashboard.html")


@mcp.resource(INTERACTIVE_CHART_URI, name="Interactive Chart UI", mime_type=RESOURCE_MIME_TYPE)
async def interactive_chart_resource() -> str:
    """Returns the bundled interactive chart HTML for MCP Apps hosts."""
    return _read_dist_html("interactive-chart.html")


# ─────────────────────────────────────────────────────────────────────────────
# Custom HTTP Routes — for AG-UI frontend (which can't speak MCP protocol)
# ─────────────────────────────────────────────────────────────────────────────

# Map app tool name → dist HTML filename
_APP_HTML_FILES = {
    "explore_dataset_app": "dataset-explorer.html",
    "visualize_statistics_app": "statistics-dashboard.html",
    "create_chart_app": "interactive-chart.html",
}


@mcp.custom_route("/app-html/{tool_name}", methods=["GET"])
async def get_app_html(request: Request) -> Response:
    """Serve compiled MCP App HTML for the AG-UI frontend.

    The frontend fetches this static HTML and renders it in an iframe.
    Data is passed separately via PostMessage (not in URL params).
    """
    tool_name = request.path_params["tool_name"]
    filename = _APP_HTML_FILES.get(tool_name)
    if not filename:
        return JSONResponse({"error": f"No app for tool '{tool_name}'"}, status_code=404)
    html = _read_dist_html(filename)
    return HTMLResponse(html)


@mcp.custom_route("/health", methods=["GET"])
async def health(request: Request) -> Response:
    return JSONResponse({"status": "ok", "tools": list(MCP_APP_TOOLS)})


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="127.0.0.1", port=8889)
