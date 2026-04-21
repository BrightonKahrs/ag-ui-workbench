"""Stateful agent with shared state for the AG-UI Playground — Data Visualization."""

import json
import os

from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import AgentFrameworkAgent
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel


# --- Pydantic models (used for validation, NOT as tool param types) ---


class DataSeries(BaseModel):
    key: str
    name: str
    color: str


class DataPoint(BaseModel):
    label: str
    values: dict[str, float]


class ChartConfig(BaseModel):
    title: str
    chart_type: str = "bar"
    x_label: str = ""
    y_label: str = ""
    series: list[DataSeries]
    data: list[DataPoint]
    show_legend: bool = True
    show_grid: bool = True
    stacked: bool = False


# --- Tools ---
# IMPORTANT: The @tool decorator cannot handle `dict` params with complex nested
# structures — the framework's argument parser chokes on them. Instead, accept
# the chart as a JSON **string** so the framework only needs to pass a string,
# and we parse + validate it ourselves with Pydantic.


@tool
def set_chart(chart_json: str) -> str:
    """Set the entire chart configuration. Use this to CREATE a new chart or make
    MAJOR changes (new data, restructure, completely different visualization).

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

    Required keys: title, series, data.
    Optional keys: chart_type (default "bar"), x_label, y_label, show_legend, show_grid, stacked.
    chart_type must be one of: bar, line, area, pie, scatter, composed.

    Args:
        chart_json: A JSON string containing the complete chart configuration.

    Returns:
        Confirmation message.
    """
    try:
        raw = json.loads(chart_json) if isinstance(chart_json, str) else chart_json
        config = ChartConfig.model_validate(raw)
        return f"Chart set: '{config.title}' ({config.chart_type}) — {len(config.data)} points, {len(config.series)} series."
    except Exception as e:
        return f"Error parsing chart: {e}. Please send a valid JSON string."


@tool
def patch_chart(patches_json: str) -> str:
    """Apply JSON Patch (RFC 6902) operations to modify the EXISTING chart.

    Use this instead of set_chart for SMALL, targeted changes like colors, title,
    chart type, axis labels, or boolean flags. Much more efficient — avoids
    regenerating the entire chart with all data points.

    The server-side middleware will apply these patches to the current chart state
    and validate the result. If the patch produces an invalid chart, it will be
    rejected.

    Args:
        patches_json: A JSON array of RFC 6902 patch operations.

    Common patch paths (relative to the chart object):
    - /title                  — Chart title (string)
    - /chart_type             — Chart type: bar, line, area, pie, scatter, composed
    - /series/0/color         — Color of first series (hex string like "#22c55e")
    - /series/0/name          — Display name of first series
    - /x_label, /y_label      — Axis labels
    - /show_legend             — Boolean
    - /show_grid               — Boolean
    - /stacked                 — Boolean

    Example — change first series color to green:
        [{"op": "replace", "path": "/series/0/color", "value": "#22c55e"}]

    Example — change title and chart type:
        [
            {"op": "replace", "path": "/title", "value": "Updated Title"},
            {"op": "replace", "path": "/chart_type", "value": "area"}
        ]

    Returns:
        JSON result: {"ok": true, "applied": N} or {"ok": false, "error": "..."}
    """
    try:
        patches = json.loads(patches_json) if isinstance(patches_json, str) else patches_json
        if not isinstance(patches, list):
            return json.dumps({"ok": False, "error": "patches_json must be a JSON array"})
        for p in patches:
            if not isinstance(p, dict) or "op" not in p or "path" not in p:
                return json.dumps({"ok": False, "error": f"Invalid patch operation: {p}"})
        return json.dumps({"ok": True, "applied": len(patches)})
    except Exception as e:
        return json.dumps({"ok": False, "error": str(e)})


# --- Agent Creation ---


def create_stateful_agent() -> AgentFrameworkAgent:
    """Create a stateful agent for data visualization with shared state management."""
    project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    model = os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4.1-mini")
    credential = DefaultAzureCredential()

    chat_client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=credential,
    )

    base_agent = Agent(
        name="DataVizAgent",
        instructions="""You are a data visualization assistant in the AG-UI Playground.
You create and modify interactive charts using shared state. The frontend renders
a Recharts component directly from the state you produce.

TOOL SELECTION (critical):
- Use set_chart to CREATE a new chart or make MAJOR changes (new data, restructure,
  completely different visualization). It takes a full chart JSON string.
- Use patch_chart for SMALL, targeted changes to an EXISTING chart (color, title,
  chart_type, axis labels, boolean flags). It takes a JSON Patch array — much more
  efficient because it avoids regenerating the entire chart with all data points.

RULES:
1. set_chart takes a SINGLE argument called chart_json which is a JSON STRING.
2. patch_chart takes a SINGLE argument called patches_json which is a JSON array
   of RFC 6902 operations (e.g. [{"op": "replace", "path": "/series/0/color", "value": "#22c55e"}]).
3. After calling a tool, give a brief 1-2 sentence summary of what you did.
4. When a chart already exists, PREFER patch_chart for localized changes.

CHART TYPES: bar, line, area, pie, scatter, composed

COLOR PALETTE:
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

When asked for sample data, generate realistic data directly in the set_chart call.
Keep responses concise.""",
        client=chat_client,
        tools=[set_chart, patch_chart],
    )

    stateful_agent = AgentFrameworkAgent(
        agent=base_agent,
        name="DataVizAgent",
        description="Creates and modifies data visualizations with streaming state updates",
        state_schema={
            "chart": {"type": "object", "description": "The current chart configuration"},
        },
        predict_state_config={
            "chart": {"tool": "set_chart", "tool_argument": "chart_json"},
        },
    )

    return stateful_agent

