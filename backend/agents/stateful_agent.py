"""Stateful agent with shared state for the AG-UI Playground — Data Visualization."""

import json
import os
from typing import Optional

from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import AgentFrameworkAgent
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel, Field


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
    """Set the entire chart configuration. Use this to create or replace a visualization.

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

CRITICAL RULES:
1. The set_chart tool takes a SINGLE argument called chart_json which is a JSON STRING.
2. You MUST pass a valid JSON string, NOT a raw object. Wrap the entire chart config in a string.
3. After calling a tool, give a brief 1-2 sentence summary of what you did.
4. To change only styling, use update_chart_style (it takes simple scalar args).

CHART TYPES: bar, line, area, pie, scatter, composed

COLOR PALETTE:
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

When asked for sample data, generate realistic data directly in the set_chart call.
Keep responses concise — 1-2 sentences after each tool call.""",
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
            "chart": {"tool": "set_chart", "tool_argument": "chart_json"},
        },
    )

    return stateful_agent

