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
    """Set the entire chart configuration. Use this for ALL chart changes — both
    creating new charts and modifying existing ones.

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
2. You MUST pass a valid JSON string, NOT a raw object.
3. After calling a tool, give a brief 1-2 sentence summary of what you did.
4. ALWAYS use set_chart for ANY chart change — creating, modifying style, changing
   data, or any other update. This is the ONLY tool that updates the shared state.
5. For small changes (color, title, chart_type), reuse all existing data and series
   from the current state — only change the specific fields requested.

CHART TYPES: bar, line, area, pie, scatter, composed

COLOR PALETTE:
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

When asked for sample data, generate realistic data directly in the set_chart call.
Keep responses concise.""",
        client=chat_client,
        tools=[set_chart],
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

