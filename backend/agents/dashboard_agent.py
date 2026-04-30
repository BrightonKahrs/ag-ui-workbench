"""Dashboard agent with multi-widget shared state for the AG-UI Playground."""

import json
import os
import sqlite3
from pathlib import Path

import jsonpatch
from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import AgentFrameworkAgent
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel

import state_store

# --- Sales Database Path ---
SALES_DB_PATH = Path(__file__).parent.parent.parent / "mcp" / "sales_data.db"


def _get_sales_db() -> sqlite3.Connection:
    """Get a read-only connection to the sales SQLite database."""
    conn = sqlite3.connect(f"file:{SALES_DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    """Convert sqlite3.Row objects to plain dicts."""
    return [dict(row) for row in rows]

# --- Pydantic models (validation only, NOT used as tool param types) ---


class DataSeries(BaseModel):
    key: str
    name: str
    color: str


class DataPoint(BaseModel):
    label: str
    values: dict[str, float]


class WidgetConfig(BaseModel):
    title: str
    chart_type: str = "bar"
    x_label: str = ""
    y_label: str = ""
    series: list[DataSeries] = []
    data: list[DataPoint] = []
    show_legend: bool = True
    show_grid: bool = True
    stacked: bool = False


# --- Layout helpers ---

DEFAULT_WIDGET_W = 6
DEFAULT_WIDGET_H = 4
GRID_COLS = 12


def _auto_position(layout: list[dict]) -> dict:
    """Find the next open position on a 12-column grid."""
    if not layout:
        return {"x": 0, "y": 0, "w": DEFAULT_WIDGET_W, "h": DEFAULT_WIDGET_H}

    max_y_bottom = 0
    for item in layout:
        bottom = item.get("y", 0) + item.get("h", DEFAULT_WIDGET_H)
        if bottom > max_y_bottom:
            max_y_bottom = bottom

    # Try to fit beside the last widget on the bottom row
    last_row_items = [it for it in layout if it.get("y", 0) + it.get("h", 0) == max_y_bottom]
    if last_row_items:
        rightmost = max(it.get("x", 0) + it.get("w", 0) for it in last_row_items)
        if rightmost + DEFAULT_WIDGET_W <= GRID_COLS:
            return {
                "x": rightmost,
                "y": max_y_bottom - DEFAULT_WIDGET_H,
                "w": DEFAULT_WIDGET_W,
                "h": DEFAULT_WIDGET_H,
            }

    # New row
    return {"x": 0, "y": max_y_bottom, "w": DEFAULT_WIDGET_W, "h": DEFAULT_WIDGET_H}


# --- Tools ---


@tool
def add_widget(widget_json: str) -> str:
    """Add a new chart widget to the dashboard.

    Pass a JSON STRING with this structure:
    {
        "title": "My Chart",
        "chart_type": "bar",
        "series": [{"key": "revenue", "name": "Revenue", "color": "#8884d8"}],
        "data": [{"label": "Jan", "values": {"revenue": 42}}],
        "x_label": "Month",
        "y_label": "USD",
        "show_legend": true,
        "show_grid": true,
        "stacked": false
    }

    Required: title, series, data.
    chart_type: bar, line, area, pie, scatter, composed.

    Args:
        widget_json: A JSON string of the complete widget configuration.

    Returns:
        Confirmation with the new widget ID.
    """
    try:
        raw = json.loads(widget_json) if isinstance(widget_json, str) else widget_json
        config = WidgetConfig.model_validate(raw)
    except Exception as e:
        return f"Error parsing widget: {e}. Please send a valid JSON string."

    def _add(dashboard: dict) -> None:
        wid = f"w-{dashboard.get('nextId', 1)}"
        dashboard["nextId"] = dashboard.get("nextId", 1) + 1

        widgets = dashboard.setdefault("widgets", {})
        widgets[wid] = config.model_dump()

        layout = dashboard.setdefault("layout", [])
        pos = _auto_position(layout)
        layout.append({"i": wid, **pos, "minW": 3, "minH": 2})

    result = state_store.mutate_dashboard(_add)
    # Find the widget we just added (highest ID)
    wids = sorted(result.get("widgets", {}).keys())
    new_id = wids[-1] if wids else "?"
    total = len(result.get("widgets", {}))
    return (
        f"Added widget '{config.title}' as {new_id} "
        f"({config.chart_type}, {len(config.data)} points, {len(config.series)} series). "
        f"Dashboard now has {total} widget(s)."
    )


@tool
def update_widget(widget_id: str, widget_json: str) -> str:
    """Completely replace a widget's data. Use for major changes or new data.

    Args:
        widget_id: The widget ID (e.g. "w-1").
        widget_json: A JSON string of the complete new widget configuration.

    Returns:
        Confirmation.
    """
    try:
        raw = json.loads(widget_json) if isinstance(widget_json, str) else widget_json
        config = WidgetConfig.model_validate(raw)
    except Exception as e:
        return f"Error parsing widget: {e}."

    def _update(dashboard: dict) -> None:
        widgets = dashboard.get("widgets", {})
        if widget_id not in widgets:
            raise KeyError(widget_id)
        widgets[widget_id] = config.model_dump()

    try:
        state_store.mutate_dashboard(_update)
    except KeyError:
        return f"Widget '{widget_id}' not found. Use get_dashboard_info to see available widgets."

    return f"Updated widget {widget_id}: '{config.title}' ({config.chart_type})."


@tool
def patch_widget(widget_id: str, patches_json: str) -> str:
    """Apply small changes to one widget using JSON Patch (RFC 6902).

    Much more efficient than update_widget for minor tweaks like changing colors,
    titles, or toggling options. Only sends the changes.

    Pass a JSON STRING array of patch operations:
    [
        {"op": "replace", "path": "/title", "value": "New Title"},
        {"op": "replace", "path": "/series/0/color", "value": "#0000FF"}
    ]

    Paths are relative to the widget root. Common paths:
    - /title, /chart_type, /x_label, /y_label
    - /series/0/color, /series/0/name
    - /show_legend, /show_grid, /stacked
    - /data/0/values/key_name

    Args:
        widget_id: The widget ID (e.g. "w-1").
        patches_json: JSON string array of RFC 6902 patch operations.

    Returns:
        Confirmation.
    """
    try:
        patches = json.loads(patches_json) if isinstance(patches_json, str) else patches_json
        if not isinstance(patches, list):
            return "Error: patches_json must be a JSON array of patch operations."
    except Exception as e:
        return f"Error parsing patches: {e}."

    changes: list[str] = []

    def _patch(dashboard: dict) -> None:
        widgets = dashboard.get("widgets", {})
        if widget_id not in widgets:
            raise KeyError(widget_id)
        patched = jsonpatch.apply_patch(widgets[widget_id], patches)
        validated = WidgetConfig.model_validate(patched).model_dump()
        widgets[widget_id] = validated

        for p in patches:
            path = p.get("path", "?")
            val = p.get("value", "")
            if isinstance(val, str) and len(val) > 40:
                val = val[:40] + "..."
            changes.append(f"{p.get('op', '?')} {path} = {val}")

    try:
        state_store.mutate_dashboard(_patch)
    except KeyError:
        return f"Widget '{widget_id}' not found."
    except jsonpatch.JsonPatchException as e:
        return f"Patch error: {e}."

    return f"Patched {widget_id}: {'; '.join(changes)}"


@tool
def remove_widget(widget_id: str) -> str:
    """Remove a widget from the dashboard.

    Args:
        widget_id: The widget ID to remove (e.g. "w-1").

    Returns:
        Confirmation.
    """
    removed_title = "?"

    def _remove(dashboard: dict) -> None:
        nonlocal removed_title
        widgets = dashboard.get("widgets", {})
        if widget_id not in widgets:
            raise KeyError(widget_id)
        removed_title = widgets[widget_id].get("title", widget_id)
        del widgets[widget_id]
        dashboard["layout"] = [
            item for item in dashboard.get("layout", []) if item.get("i") != widget_id
        ]

    try:
        result = state_store.mutate_dashboard(_remove)
    except KeyError:
        return f"Widget '{widget_id}' not found."

    remaining = len(result.get("widgets", {}))
    return f"Removed widget {widget_id} ('{removed_title}'). {remaining} widget(s) remain."


@tool
def patch_dashboard(patches_json: str) -> str:
    """Apply changes to dashboard-level properties (title, layout).

    Use JSON Patch targeting the dashboard root:
    [
        {"op": "replace", "path": "/title", "value": "Sales Dashboard"}
    ]

    Do NOT patch /widgets or /layout through this — use the widget-specific
    tools for those.

    Args:
        patches_json: JSON string array of RFC 6902 patch operations.

    Returns:
        Confirmation.
    """
    try:
        patches = json.loads(patches_json) if isinstance(patches_json, str) else patches_json
        if not isinstance(patches, list):
            return "Error: patches_json must be a JSON array."
    except Exception as e:
        return f"Error parsing patches: {e}."

    def _patch(dashboard: dict) -> None:
        patched = jsonpatch.apply_patch(dashboard, patches)
        dashboard.clear()
        dashboard.update(patched)

    try:
        state_store.mutate_dashboard(_patch)
    except Exception as e:
        return f"Patch error: {e}."

    return f"Applied {len(patches)} dashboard-level patch(es)."


@tool
def get_dashboard_info() -> str:
    """Get a summary of the current dashboard: all widgets with their IDs, types, and positions.

    Use this to check widget IDs before patching or removing.

    Returns:
        Dashboard summary.
    """
    dashboard = state_store.get_dashboard()
    widgets = dashboard.get("widgets", {})
    layout = dashboard.get("layout", [])
    title = dashboard.get("title", "Dashboard")

    if not widgets:
        return f"Dashboard '{title}' is empty — no widgets yet."

    layout_map = {item["i"]: item for item in layout}
    lines = [f"Dashboard: '{title}' — {len(widgets)} widget(s)"]

    # Sort by layout position (top-left first) for natural ordering
    sorted_ids = sorted(
        widgets.keys(),
        key=lambda wid: (
            layout_map.get(wid, {}).get("y", 999),
            layout_map.get(wid, {}).get("x", 999),
        ),
    )

    for idx, wid in enumerate(sorted_ids, 1):
        w = widgets[wid]
        pos = layout_map.get(wid, {})
        series_info = ", ".join(s.get("key", "?") for s in w.get("series", []))
        lines.append(
            f"  {idx}. {wid}: '{w.get('title', '?')}' "
            f"({w.get('chart_type', 'bar')}, {len(w.get('data', []))} pts, "
            f"series=[{series_info}], "
            f"pos=({pos.get('x', '?')},{pos.get('y', '?')}) "
            f"size={pos.get('w', '?')}×{pos.get('h', '?')})"
        )

    return "\n".join(lines)


# --- Sales Data Query Tools ---


@tool
def query_sales_data(query: str) -> str:
    """Run a read-only SQL query against the sales database. Returns results as JSON.

    Available tables: customers, sales_reps, deals, orders, products, activities.
    Only SELECT statements are allowed.

    Args:
        query: A SQL SELECT query to execute.

    Returns:
        JSON string of query results.
    """
    query_stripped = query.strip().rstrip(";")
    if not query_stripped.upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed."})
    try:
        conn = _get_sales_db()
        cursor = conn.execute(query_stripped)
        rows = cursor.fetchall()
        result = _rows_to_dicts(rows)
        conn.close()
        return json.dumps(result[:100], indent=2) if len(result) > 100 else json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_pipeline_summary() -> str:
    """Return the deal pipeline grouped by stage with count and total value.

    Returns:
        JSON with stages, deal counts, total values, and average probabilities.
    """
    conn = _get_sales_db()
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


@tool
def get_revenue_by_month() -> str:
    """Return monthly revenue from orders, sorted chronologically.

    Returns:
        JSON with month, order_count, and revenue for each month.
    """
    conn = _get_sales_db()
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


@tool
def get_top_customers(limit: str = "10") -> str:
    """Return top customers ranked by total order value.

    Args:
        limit: Number of customers to return (default "10").

    Returns:
        JSON with customer details and total revenue.
    """
    try:
        n = int(limit)
    except ValueError:
        n = 10
    conn = _get_sales_db()
    rows = conn.execute("""
        SELECT c.id, c.name, c.company, c.industry, c.tier,
               COUNT(o.id) as order_count,
               ROUND(SUM(o.total), 2) as total_revenue
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id
        ORDER BY total_revenue DESC
        LIMIT ?
    """, (n,)).fetchall()
    conn.close()
    return json.dumps(_rows_to_dicts(rows), indent=2)


@tool
def get_sales_rep_performance() -> str:
    """Return each sales rep's total deals, wins, closed revenue, and quota attainment.

    Returns:
        JSON with rep performance metrics.
    """
    conn = _get_sales_db()
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


@tool
def get_deals_by_stage(stage: str = "") -> str:
    """List deals, optionally filtered by pipeline stage.

    Args:
        stage: Filter by stage (prospecting/qualification/proposal/negotiation/closed_won/closed_lost). Empty string returns all.

    Returns:
        JSON with deal details including customer and rep info.
    """
    conn = _get_sales_db()
    if stage and stage.strip():
        rows = conn.execute("""
            SELECT d.id, d.title, d.value, d.stage, d.probability, d.created_at, d.close_date,
                   c.company as customer_company, sr.name as rep_name
            FROM deals d
            JOIN customers c ON c.id = d.customer_id
            JOIN sales_reps sr ON sr.id = d.sales_rep_id
            WHERE d.stage = ?
            ORDER BY d.value DESC
        """, (stage.strip(),)).fetchall()
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


# --- Agent Creation ---


def create_dashboard_agent() -> AgentFrameworkAgent:
    """Create a dashboard agent for multi-widget data visualization."""
    project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    model = os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4.1-mini")
    credential = DefaultAzureCredential()

    chat_client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=credential,
    )

    base_agent = Agent(
        name="DashboardAgent",
        instructions="""You are a dashboard builder in the AG-UI Workbench.
You create and manage a multi-widget dashboard with interactive charts,
powered by REAL sales data from a SQLite database.

DATA TOOLS (query real sales/CRM data):
- query_sales_data: Run any SELECT query against the sales DB.
  Tables: customers, sales_reps, deals, orders, products, activities.
- get_pipeline_summary: Deal pipeline by stage (count, value, probability).
- get_revenue_by_month: Monthly revenue from orders.
- get_top_customers: Top customers ranked by total order value.
- get_sales_rep_performance: Rep metrics (deals, wins, revenue, quota%).
- get_deals_by_stage: List deals, optionally filtered by stage.

DASHBOARD TOOLS (create/modify charts):
- add_widget: Add a NEW chart widget to the dashboard grid.
- update_widget: REPLACE a widget entirely (new data or major restructure).
- patch_widget: Apply SMALL changes to one widget (color, title, label, toggle).
  Much more efficient — use this whenever possible.
- remove_widget: Delete a widget from the dashboard.
- patch_dashboard: Change dashboard-level properties (title).
- get_dashboard_info: List all widgets with IDs and positions.

WORKFLOW:
1. When user asks for a chart/dashboard, FIRST query the real data using data tools.
2. Then use the dashboard tools to create/update widgets with the REAL data.
3. NEVER make up fake data — always query it from the database first.

RULES:
1. For NEW widgets: query data first, then use add_widget with complete chart JSON.
2. For SMALL CHANGES: use patch_widget with JSON Patch ops.
3. If unsure about IDs/structure, call get_dashboard_info first.
4. After calling any tool, give a brief 1-2 sentence summary.
5. When user says "first chart", "second chart" etc, call get_dashboard_info
   to find the correct widget ID (ordered top-left to bottom-right).
6. Each widget has a unique ID like w-1, w-2, etc.

CHART TYPES: bar, line, area, pie, scatter, composed

COLOR PALETTE:
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

Keep responses concise.""",
        client=chat_client,
        tools=[
            # Sales data tools
            query_sales_data,
            get_pipeline_summary,
            get_revenue_by_month,
            get_top_customers,
            get_sales_rep_performance,
            get_deals_by_stage,
            # Dashboard manipulation tools
            add_widget,
            update_widget,
            patch_widget,
            remove_widget,
            patch_dashboard,
            get_dashboard_info,
        ],
    )

    return AgentFrameworkAgent(
        agent=base_agent,
        name="DashboardAgent",
        description="Creates and manages multi-widget dashboard with streaming state updates",
    )
