"""Stateful agent with shared state for the AG-UI Playground — Data Visualization."""

import json
import os

import jsonpatch
from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import AgentFrameworkAgent
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel

import state_store

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
    """Create or completely replace the chart configuration.

    Use this for NEW charts or MAJOR changes (new data, restructuring series).
    For small changes (color, title, style), prefer patch_chart instead.

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
    chart_type must be one of: bar, line, area, pie, scatter, composed.

    Args:
        chart_json: A JSON string containing the complete chart configuration.

    Returns:
        Confirmation message.
    """
    try:
        raw = json.loads(chart_json) if isinstance(chart_json, str) else chart_json
        config = ChartConfig.model_validate(raw)
        # Store validated chart for patch_chart to use later
        state_store.store_chart(config.model_dump())
        return f"Chart set: '{config.title}' ({config.chart_type}) — {len(config.data)} points, {len(config.series)} series."
    except Exception as e:
        return f"Error parsing chart: {e}. Please send a valid JSON string."


@tool
def patch_chart(patches_json: str) -> str:
    """Apply small changes to the existing chart using JSON Patch (RFC 6902).

    MUCH more efficient than set_chart for minor modifications like changing
    colors, titles, labels, or toggling options. Only sends the changes.

    Pass a JSON STRING that is an array of JSON Patch operations:
    [
        {"op": "replace", "path": "/series/0/color", "value": "#0000FF"},
        {"op": "replace", "path": "/title", "value": "New Title"}
    ]

    Supported ops: replace, add, remove
    Common paths:
    - /title, /chart_type, /x_label, /y_label
    - /series/0/color, /series/0/name, /series/0/key
    - /show_legend, /show_grid, /stacked
    - /data/0/values/key_name

    Args:
        patches_json: JSON string array of RFC 6902 patch operations.

    Returns:
        Confirmation of applied patches.
    """
    try:
        patches = json.loads(patches_json) if isinstance(patches_json, str) else patches_json
        if not isinstance(patches, list):
            return "Error: patches_json must be a JSON array of patch operations."

        current = state_store.get_chart()
        if not current:
            return "Error: No chart exists yet. Use set_chart to create one first."

        patched = jsonpatch.apply_patch(current, patches)
        config = ChartConfig.model_validate(patched)
        validated = config.model_dump()
        state_store.store_chart(validated)

        changes = []
        for p in patches:
            path = p.get("path", "?")
            val = p.get("value", "")
            if isinstance(val, str) and len(val) > 50:
                val = val[:50] + "..."
            changes.append(f"{p.get('op', '?')} {path} = {val}")

        return f"Applied {len(patches)} patch(es): {'; '.join(changes)}"
    except jsonpatch.JsonPatchException as e:
        return f"Patch error: {e}. Check your paths against the chart structure."
    except Exception as e:
        return f"Error applying patches: {e}"


@tool
def get_chart_info() -> str:
    """Get a summary of the current chart structure.

    Use this to check the current chart before making patch changes.
    Returns title, type, series info, data shape, and options.

    Returns:
        Chart summary string.
    """
    current = state_store.get_chart()
    if not current:
        return "No chart exists yet."

    try:
        config = ChartConfig.model_validate(current)
        series_info = ", ".join(
            f"{s.key}({s.color})" for s in config.series
        )
        return (
            f"Title: '{config.title}', Type: {config.chart_type}, "
            f"Series: [{series_info}], "
            f"Data: {len(config.data)} points, "
            f"Options: legend={config.show_legend}, grid={config.show_grid}, stacked={config.stacked}"
        )
    except Exception:
        return f"Chart data (raw): {json.dumps(current)[:500]}"


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
You create and modify interactive charts using shared state.

TOOLS (pick the right one):
- set_chart: Create a NEW chart or MAJOR restructuring. Sends the complete chart JSON.
- patch_chart: Apply SMALL changes (color, title, labels, options). Sends only the
  JSON Patch operations — much more efficient. Use this whenever possible.
- get_chart_info: Check the current chart structure before patching.

RULES:
1. For NEW charts: use set_chart with complete chart JSON string.
2. For SMALL CHANGES (color, title, style, toggle): use patch_chart with JSON Patch ops.
3. If you're unsure about the current chart structure, call get_chart_info first.
4. After calling any tool, give a brief 1-2 sentence summary.
5. NEVER call both set_chart and patch_chart in the same response.

CHART TYPES: bar, line, area, pie, scatter, composed

COLOR PALETTE:
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

When asked for sample data, generate realistic data directly in the set_chart call.
Keep responses concise.""",
        client=chat_client,
        tools=[set_chart, patch_chart, get_chart_info],
    )

    stateful_agent = AgentFrameworkAgent(
        agent=base_agent,
        name="DataVizAgent",
        description="Creates and modifies data visualizations with streaming state updates",
        # NOTE: state_schema intentionally omitted. This prevents the framework from
        # injecting a "Current state of the application" system message that shows
        # stale flow.current_state after patch_chart (which has no predict_state_config
        # mapping). Without state_schema, the LLM tracks chart state through its
        # conversation history and tool results. Predictive streaming for set_chart
        # still works via predict_state_config (independent of state_schema).
        predict_state_config={
            "chart": {"tool": "set_chart", "tool_argument": "chart_json"},
        },
    )

    return stateful_agent

