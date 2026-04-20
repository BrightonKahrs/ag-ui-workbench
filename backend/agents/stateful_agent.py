"""Stateful agent with shared state for the AG-UI Playground — Data Visualization."""

import json
import os
from typing import Optional

from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import AgentFrameworkAgent
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel, Field


# --- State Models (Pydantic) ---
# These define the EXACT schema the LLM must produce for the chart.
# The frontend reads this shape from shared state to render Recharts components.


class DataSeries(BaseModel):
    """Metadata for one visual series on the chart."""
    key: str = Field(..., description="Key in each DataPoint.values dict this series reads")
    name: str = Field(..., description="Human-readable legend label")
    color: str = Field(..., description="Hex color, e.g. '#8884d8'")


class DataPoint(BaseModel):
    """A single data point (one bar group / one x-tick / one pie slice)."""
    label: str = Field(..., description="Category or x-axis label, e.g. 'Jan', 'Product A'")
    values: dict[str, float] = Field(
        ...,
        description="Named numeric values keyed by series key. E.g. {'revenue': 42, 'cost': 31}",
    )


class ChartConfig(BaseModel):
    """Complete chart configuration — this IS the shared state object."""
    title: str = Field(..., description="Chart title displayed above the chart")
    chart_type: str = Field(
        default="bar",
        description="One of: bar, line, area, pie, scatter, composed",
    )
    x_label: str = Field(default="", description="X-axis label")
    y_label: str = Field(default="", description="Y-axis label")
    series: list[DataSeries] = Field(..., description="Series definitions (at least one)")
    data: list[DataPoint] = Field(..., description="Data points to plot (at least one)")
    show_legend: bool = Field(default=True, description="Whether to show the legend")
    show_grid: bool = Field(default=True, description="Whether to show grid lines")
    stacked: bool = Field(default=False, description="Whether bar/area charts should stack")


# --- Tools ---


def _coerce_chart(raw: dict | str | ChartConfig) -> ChartConfig:
    """Safely coerce whatever the framework hands us into a ChartConfig."""
    if isinstance(raw, ChartConfig):
        return raw
    if isinstance(raw, str):
        raw = json.loads(raw)
    return ChartConfig.model_validate(raw)


@tool
def set_chart(chart: dict) -> str:
    """Set the entire chart configuration. Use this to create or replace a visualization.

    The `chart` argument must match this schema:
    {
        "title": str,
        "chart_type": "bar" | "line" | "area" | "pie" | "scatter" | "composed",
        "series": [{"key": str, "name": str, "color": str (hex)}, ...],
        "data": [{"label": str, "values": {"<series_key>": number, ...}}, ...],
        "x_label"?: str,
        "y_label"?: str,
        "show_legend"?: bool (default true),
        "show_grid"?: bool (default true),
        "stacked"?: bool (default false)
    }

    Args:
        chart: Complete chart configuration dict.

    Returns:
        Confirmation message.
    """
    config = _coerce_chart(chart)
    return f"Chart set: '{config.title}' ({config.chart_type}) — {len(config.data)} points, {len(config.series)} series."


@tool
def update_chart_style(
    chart_type: Optional[str] = None,
    title: Optional[str] = None,
    x_label: Optional[str] = None,
    y_label: Optional[str] = None,
    show_legend: Optional[bool] = None,
    show_grid: Optional[bool] = None,
    stacked: Optional[bool] = None,
) -> str:
    """Update chart styling without modifying data. Use for visual tweaks.

    Args:
        chart_type: New chart type (bar, line, area, pie, scatter, composed).
        title: New chart title.
        x_label: New x-axis label.
        y_label: New y-axis label.
        show_legend: Show or hide legend.
        show_grid: Show or hide grid.
        stacked: Enable or disable stacking.

    Returns:
        Confirmation message.
    """
    changes = []
    if chart_type:
        changes.append(f"type→{chart_type}")
    if title:
        changes.append(f"title→'{title}'")
    if x_label is not None:
        changes.append(f"x_label→'{x_label}'")
    if y_label is not None:
        changes.append(f"y_label→'{y_label}'")
    if show_legend is not None:
        changes.append(f"legend→{show_legend}")
    if show_grid is not None:
        changes.append(f"grid→{show_grid}")
    if stacked is not None:
        changes.append(f"stacked→{stacked}")
    return f"Chart style updated: {', '.join(changes)}" if changes else "No style changes."


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
a Recharts component directly from the state you produce via set_chart.

WORKFLOW — always call set_chart with a COMPLETE chart dict:
1. You receive the current chart state (if any) in the system context
2. To create or replace a visualization, call `set_chart` with the full chart dict
3. To change only styling (type, title, labels, legend, grid, stacked), use `update_chart_style`
4. When modifying, include ALL existing data + your additions in set_chart
5. After calling a tool, give a brief 1-2 sentence summary of what you did

CHART TYPES: bar, line, area, pie, scatter, composed

COLOR PALETTE (use for attractive charts):
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

When the user asks for sample data, generate realistic data directly in the set_chart call.
Keep responses concise.""",
        client=chat_client,
        tools=[set_chart, update_chart_style],
    )

    stateful_agent = AgentFrameworkAgent(
        agent=base_agent,
        name="DataVizAgent",
        description="Creates and modifies data visualizations with streaming state updates",
        state_schema={
            "chart": {"type": "object", "description": "The current chart configuration"},
        },
        predict_state_config={
            "chart": {"tool": "set_chart", "tool_argument": "chart"},
        },
    )

    return stateful_agent


# --- Tools ---


@tool
def set_chart(chart: dict) -> str:
    """Set the entire chart configuration. Use this when creating or replacing a visualization.

    The chart dict MUST include these keys:
    - title (str): Chart title
    - chart_type (str): One of bar, line, area, pie, scatter, composed
    - series (list): List of series objects, each with: key, name, color
    - data (list): List of data points, each with: label, values (dict of name→number)

    Optional keys: x_label, y_label, show_legend, show_grid, stacked

    Example:
    {
        "title": "Revenue",
        "chart_type": "bar",
        "series": [{"key": "revenue", "name": "Revenue", "color": "#8884d8"}],
        "data": [{"label": "Jan", "values": {"revenue": 42}}]
    }

    Args:
        chart: Complete chart configuration dict.

    Returns:
        Confirmation message.
    """
    # Handle case where framework passes a JSON string instead of dict
    if isinstance(chart, str):
        chart = json.loads(chart)
    title = chart.get("title", "Untitled")
    data = chart.get("data", [])
    series = chart.get("series", [])
    return f"Chart set: '{title}' with {len(data)} data points and {len(series)} series."


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
a Recharts component directly from the state you produce via set_chart.

WORKFLOW — always call set_chart with a COMPLETE chart dict:
1. You receive the current chart state (if any) in the system context
2. To create or replace a visualization, call `set_chart` with the full chart dict
3. To change only styling (type, title, labels, legend, grid, stacked), use `update_chart_style`
4. When modifying, include ALL existing data + your additions in set_chart
5. After calling a tool, give a brief 1-2 sentence summary of what you did

CHART TYPES: bar, line, area, pie, scatter, composed

COLOR PALETTE (use for attractive charts):
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

When the user asks for sample data, generate realistic data directly in the set_chart call.
Keep responses concise.""",
        client=chat_client,
        tools=[set_chart, update_chart_style],
    )

    stateful_agent = AgentFrameworkAgent(
        agent=base_agent,
        name="DataVizAgent",
        description="Creates and modifies data visualizations with streaming state updates",
        state_schema={
            "chart": {"type": "object", "description": "The current chart configuration"},
        },
        predict_state_config={
            "chart": {"tool": "set_chart", "tool_argument": "chart"},
        },
    )

    return stateful_agent

