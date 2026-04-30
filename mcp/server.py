"""Sales Data MCP Server for the AG-UI Playground.

Exposes sales/CRM data tools via the Model Context Protocol over Streamable HTTP.
Backed by a SQLite database with customers, deals, orders, products, and activities.
Includes MCP App tools with interactive UIs served as resources.

Run: `cd mcp && python server.py`
The chat agent connects via MCPStreamableHTTPTool at /mcp.
"""

import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastmcp import FastMCP
from mcp.types import CallToolResult, TextContent
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, Response

# --- Constants ---

DB_PATH = Path(__file__).parent / "sales_data.db"
RESOURCE_MIME_TYPE = "text/html"
UI_DIST_DIR = Path(__file__).parent / "ui" / "dist"

DATASET_EXPLORER_URI = "ui://ag-ui-playground/dataset-explorer.html"
STATISTICS_DASHBOARD_URI = "ui://ag-ui-playground/statistics-dashboard.html"
INTERACTIVE_CHART_URI = "ui://ag-ui-playground/interactive-chart.html"

# Registry of MCP App tool names (used by backend middleware)
MCP_APP_TOOLS = {"explore_dataset_app", "visualize_statistics_app", "create_chart_app"}

mcp = FastMCP(
    name="SalesDataMCPServer",
    instructions=(
        "Sales & CRM data MCP server for the AG-UI Playground. "
        "Provides tools to query customers, deals, orders, products, activities, "
        "pipeline summaries, rep performance, and revenue analytics from a SQLite database."
    ),
)


# ─────────────────────────────────────────────────────────────────────────────
# Database Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_db() -> sqlite3.Connection:
    """Get a read-only database connection."""
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    """Convert sqlite3.Row objects to plain dicts."""
    return [dict(row) for row in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Sales Data Tools
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool()
def query_sales(query: str) -> str:
    """Run a read-only SQL query against the sales database. Returns results as JSON.

    Available tables: customers, sales_reps, deals, orders, products, activities.
    Only SELECT statements are allowed.

    Args:
        query: A SQL SELECT query to execute.
    """
    query_stripped = query.strip().rstrip(";")
    if not query_stripped.upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed."})
    try:
        conn = _get_db()
        cursor = conn.execute(query_stripped)
        rows = cursor.fetchall()
        result = _rows_to_dicts(rows)
        conn.close()
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def get_pipeline_summary() -> str:
    """Return the deal pipeline grouped by stage with count and total value."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT stage, COUNT(*) as deal_count, ROUND(SUM(value), 2) as total_value,
               ROUND(AVG(probability), 2) as avg_probability
        FROM deals
        GROUP BY stage
        ORDER BY CASE stage
            WHEN 'prospecting' THEN 1
            WHEN 'qualification' THEN 2
            WHEN 'proposal' THEN 3
            WHEN 'negotiation' THEN 4
            WHEN 'closed_won' THEN 5
            WHEN 'closed_lost' THEN 6
        END
    """).fetchall()
    conn.close()
    return json.dumps(_rows_to_dicts(rows), indent=2)


@mcp.tool()
def get_top_customers(limit: int = 10) -> str:
    """Return top customers ranked by total order value.

    Args:
        limit: Number of customers to return (default 10).
    """
    conn = _get_db()
    rows = conn.execute("""
        SELECT c.id, c.name, c.company, c.industry, c.tier,
               COUNT(o.id) as order_count,
               ROUND(SUM(o.total), 2) as total_revenue
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id
        ORDER BY total_revenue DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return json.dumps(_rows_to_dicts(rows), indent=2)


@mcp.tool()
def get_sales_rep_performance() -> str:
    """Return each sales rep's total deals, wins, closed revenue, and quota attainment."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT
            sr.id, sr.name, sr.region, sr.quota,
            COUNT(d.id) as total_deals,
            SUM(CASE WHEN d.stage = 'closed_won' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN d.stage = 'closed_lost' THEN 1 ELSE 0 END) as losses,
            ROUND(SUM(CASE WHEN d.stage = 'closed_won' THEN d.value ELSE 0 END), 2) as closed_revenue,
            ROUND(
                SUM(CASE WHEN d.stage = 'closed_won' THEN d.value ELSE 0 END) / sr.quota * 100, 1
            ) as quota_attainment_pct
        FROM sales_reps sr
        LEFT JOIN deals d ON d.sales_rep_id = sr.id
        GROUP BY sr.id
        ORDER BY closed_revenue DESC
    """).fetchall()
    conn.close()
    return json.dumps(_rows_to_dicts(rows), indent=2)


@mcp.tool()
def search_customers(term: str) -> str:
    """Search customers by name, company, or industry.

    Args:
        term: Search term to match against customer name, company, or industry.
    """
    conn = _get_db()
    like = f"%{term}%"
    rows = conn.execute("""
        SELECT id, name, company, email, phone, industry, tier, created_at
        FROM customers
        WHERE name LIKE ? OR company LIKE ? OR industry LIKE ?
        ORDER BY company
    """, (like, like, like)).fetchall()
    conn.close()
    return json.dumps(_rows_to_dicts(rows), indent=2)


@mcp.tool()
def get_customer_360(customer_id: int) -> str:
    """Full 360-degree customer view: info, deals, orders, and activities.

    Args:
        customer_id: The customer ID to look up.
    """
    conn = _get_db()
    customer = conn.execute(
        "SELECT * FROM customers WHERE id = ?", (customer_id,)
    ).fetchone()
    if not customer:
        conn.close()
        return json.dumps({"error": f"Customer {customer_id} not found."})

    deals = conn.execute(
        "SELECT * FROM deals WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,)
    ).fetchall()
    orders = conn.execute(
        "SELECT * FROM orders WHERE customer_id = ? ORDER BY order_date DESC", (customer_id,)
    ).fetchall()
    activities = conn.execute(
        "SELECT * FROM activities WHERE customer_id = ? ORDER BY date DESC LIMIT 20", (customer_id,)
    ).fetchall()
    conn.close()

    result = {
        "customer": dict(customer),
        "deals": _rows_to_dicts(deals),
        "orders": _rows_to_dicts(orders),
        "recent_activities": _rows_to_dicts(activities),
    }
    return json.dumps(result, indent=2)


@mcp.tool()
def get_revenue_by_month() -> str:
    """Return monthly revenue from orders, sorted chronologically."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT
            strftime('%Y-%m', order_date) as month,
            COUNT(*) as order_count,
            ROUND(SUM(total), 2) as revenue
        FROM orders
        WHERE status != 'returned'
        GROUP BY month
        ORDER BY month
    """).fetchall()
    conn.close()
    return json.dumps(_rows_to_dicts(rows), indent=2)


@mcp.tool()
def get_deals_by_stage(stage: str = None) -> str:
    """List deals, optionally filtered by pipeline stage.

    Args:
        stage: Filter by stage (prospecting/qualification/proposal/negotiation/closed_won/closed_lost). If None, returns all.
    """
    conn = _get_db()
    if stage:
        rows = conn.execute("""
            SELECT d.id, d.title, d.value, d.stage, d.probability, d.created_at, d.close_date,
                   c.company as customer_company, sr.name as rep_name
            FROM deals d
            JOIN customers c ON c.id = d.customer_id
            JOIN sales_reps sr ON sr.id = d.sales_rep_id
            WHERE d.stage = ?
            ORDER BY d.value DESC
        """, (stage,)).fetchall()
    else:
        rows = conn.execute("""
            SELECT d.id, d.title, d.value, d.stage, d.probability, d.created_at, d.close_date,
                   c.company as customer_company, sr.name as rep_name
            FROM deals d
            JOIN customers c ON c.id = d.customer_id
            JOIN sales_reps sr ON sr.id = d.sales_rep_id
            ORDER BY d.value DESC
        """).fetchall()
    conn.close()
    return json.dumps(_rows_to_dicts(rows), indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# Dataset / Utility Tools (adapted for sales data)
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool()
def list_datasets() -> str:
    """List all available tables in the sales SQLite database."""
    conn = _get_db()
    tables = conn.execute("""
        SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    """).fetchall()
    result = []
    for t in tables:
        table_name = t["name"]
        count = conn.execute(f"SELECT COUNT(*) as cnt FROM {table_name}").fetchone()["cnt"]
        cols = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        result.append({
            "id": table_name,
            "name": table_name,
            "description": f"Sales database table: {table_name}",
            "columns": [c["name"] for c in cols],
            "row_count": count,
        })
    conn.close()
    return json.dumps(result, indent=2)


@mcp.tool()
def get_server_info() -> str:
    """Get information about this MCP server and its capabilities."""
    return json.dumps({
        "name": "SalesDataMCPServer",
        "protocol": "MCP (Model Context Protocol)",
        "transport": "Streamable HTTP",
        "port": 8889,
        "database": str(DB_PATH),
        "tools": [
            "query_sales", "get_pipeline_summary", "get_top_customers",
            "get_sales_rep_performance", "search_customers", "get_customer_360",
            "get_revenue_by_month", "get_deals_by_stage",
            "list_datasets", "get_server_info",
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
def explore_dataset_app(table_name: str, limit: int = 10) -> CallToolResult:
    """Explore a sales database table with an interactive table UI.

    This is an MCP App tool — it returns data AND provides an interactive
    HTML interface for exploring, sorting, and filtering the data.

    Args:
        table_name: The database table to explore (customers, sales_reps, deals, orders, products, activities).
        limit: Number of rows to display (default 10, max 100).
    """
    allowed_tables = {"customers", "sales_reps", "deals", "orders", "products", "activities"}
    if table_name not in allowed_tables:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Table '{table_name}' not found. Available: {', '.join(sorted(allowed_tables))}")],
        )

    conn = _get_db()
    cols = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    column_names = [c["name"] for c in cols]
    limit = min(limit, 100)
    rows = conn.execute(f"SELECT * FROM {table_name} LIMIT ?", (limit,)).fetchall()
    total = conn.execute(f"SELECT COUNT(*) as cnt FROM {table_name}").fetchone()["cnt"]
    conn.close()

    data = {
        "dataset_id": table_name,
        "name": table_name,
        "description": f"Sales database table: {table_name}",
        "columns": column_names,
        "rows": _rows_to_dicts(rows),
        "total_rows": total,
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
