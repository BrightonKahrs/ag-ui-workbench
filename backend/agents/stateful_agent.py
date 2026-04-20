"""Stateful agent with shared state for the AG-UI Playground — Data Visualization."""

import json
import os
from enum import Enum
from typing import Optional

from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import AgentFrameworkAgent
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel, Field


# --- State Models ---


class ChartType(str, Enum):
    BAR = "bar"
    LINE = "line"
    AREA = "area"
    PIE = "pie"
    SCATTER = "scatter"
    COMPOSED = "composed"


class DataPoint(BaseModel):
    """A single data point in the visualization."""

    label: str = Field(..., description="Category or x-axis label (e.g. 'Jan', 'Product A')")
    values: dict[str, float] = Field(
        ...,
        description="Named numeric values. Keys are series names, values are numbers. E.g. {'revenue': 4200, 'cost': 3100}",
    )


class DataSeries(BaseModel):
    """Metadata for a data series rendered on the chart."""

    key: str = Field(..., description="The key in DataPoint.values this series reads from")
    name: str = Field(..., description="Human-readable display name")
    color: str = Field(..., description="Hex color, e.g. '#8884d8'")


class ChartConfig(BaseModel):
    """Full chart configuration — this IS the shared state."""

    title: str = Field(default="", description="Chart title")
    chart_type: ChartType = Field(default=ChartType.BAR, description="Type of chart to render")
    x_label: str = Field(default="", description="X-axis label")
    y_label: str = Field(default="", description="Y-axis label")
    series: list[DataSeries] = Field(default_factory=list, description="Data series definitions")
    data: list[DataPoint] = Field(default_factory=list, description="The data points to plot")
    show_legend: bool = Field(default=True, description="Whether to show the legend")
    show_grid: bool = Field(default=True, description="Whether to show grid lines")
    stacked: bool = Field(default=False, description="Whether bar/area charts should be stacked")


# --- Tools ---


@tool
def set_chart(chart: ChartConfig) -> str:
    """Set the entire chart configuration at once. Use this when creating a new visualization or making major changes.

    You MUST provide ALL fields including title, chart_type, series, and data.
    When updating, include ALL existing data points and series plus your changes.

    Args:
        chart: The complete chart configuration with data, series, and styling.

    Returns:
        Confirmation message.
    """
    return f"Chart updated: '{chart.title}' with {len(chart.data)} data points and {len(chart.series)} series."


@tool
def add_data_points(points: list[DataPoint]) -> str:
    """Add new data points to the existing chart. Use this for appending data without replacing everything.

    Args:
        points: List of new data points to add.

    Returns:
        Confirmation message.
    """
    return f"Added {len(points)} data points to the chart."


@tool
def update_chart_style(
    chart_type: Optional[ChartType] = None,
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


@tool
def generate_sample_data(dataset: str) -> str:
    """Generate a sample dataset for demonstration. Returns JSON data that you should
    then use with set_chart to create the visualization.

    Available datasets:
    - "monthly_revenue": Monthly revenue and expenses for a SaaS company
    - "product_comparison": Product category comparison (units sold, revenue, returns)
    - "website_traffic": Weekly website traffic by source (organic, paid, social, direct)
    - "temperature": Daily temperature readings across cities
    - "market_share": Market share percentages by company (good for pie charts)
    - "stock_performance": Quarterly stock performance of tech companies

    Args:
        dataset: Name of the sample dataset to generate.

    Returns:
        JSON string with chart configuration for the chosen dataset.
    """
    datasets = {
        "monthly_revenue": {
            "title": "Monthly Revenue vs Expenses (2024)",
            "chart_type": "bar",
            "x_label": "Month",
            "y_label": "Amount ($K)",
            "series": [
                {"key": "revenue", "name": "Revenue", "color": "#8884d8"},
                {"key": "expenses", "name": "Expenses", "color": "#82ca9d"},
                {"key": "profit", "name": "Profit", "color": "#ffc658"},
            ],
            "data": [
                {"label": "Jan", "values": {"revenue": 42, "expenses": 31, "profit": 11}},
                {"label": "Feb", "values": {"revenue": 48, "expenses": 33, "profit": 15}},
                {"label": "Mar", "values": {"revenue": 55, "expenses": 35, "profit": 20}},
                {"label": "Apr", "values": {"revenue": 51, "expenses": 34, "profit": 17}},
                {"label": "May", "values": {"revenue": 63, "expenses": 38, "profit": 25}},
                {"label": "Jun", "values": {"revenue": 71, "expenses": 41, "profit": 30}},
                {"label": "Jul", "values": {"revenue": 68, "expenses": 39, "profit": 29}},
                {"label": "Aug", "values": {"revenue": 75, "expenses": 42, "profit": 33}},
                {"label": "Sep", "values": {"revenue": 82, "expenses": 45, "profit": 37}},
                {"label": "Oct", "values": {"revenue": 79, "expenses": 44, "profit": 35}},
                {"label": "Nov", "values": {"revenue": 88, "expenses": 47, "profit": 41}},
                {"label": "Dec", "values": {"revenue": 95, "expenses": 50, "profit": 45}},
            ],
        },
        "product_comparison": {
            "title": "Product Category Performance",
            "chart_type": "bar",
            "x_label": "Category",
            "y_label": "Units",
            "series": [
                {"key": "units_sold", "name": "Units Sold", "color": "#8884d8"},
                {"key": "revenue_k", "name": "Revenue ($K)", "color": "#82ca9d"},
                {"key": "returns", "name": "Returns", "color": "#ff7c7c"},
            ],
            "data": [
                {"label": "Electronics", "values": {"units_sold": 1200, "revenue_k": 450, "returns": 45}},
                {"label": "Clothing", "values": {"units_sold": 3400, "revenue_k": 280, "returns": 230}},
                {"label": "Food & Bev", "values": {"units_sold": 5200, "revenue_k": 190, "returns": 12}},
                {"label": "Home & Garden", "values": {"units_sold": 890, "revenue_k": 320, "returns": 67}},
                {"label": "Sports", "values": {"units_sold": 1560, "revenue_k": 210, "returns": 89}},
            ],
        },
        "website_traffic": {
            "title": "Weekly Website Traffic by Source",
            "chart_type": "area",
            "x_label": "Week",
            "y_label": "Visitors",
            "stacked": True,
            "series": [
                {"key": "organic", "name": "Organic Search", "color": "#8884d8"},
                {"key": "paid", "name": "Paid Ads", "color": "#82ca9d"},
                {"key": "social", "name": "Social Media", "color": "#ffc658"},
                {"key": "direct", "name": "Direct", "color": "#ff7c7c"},
            ],
            "data": [
                {"label": "W1", "values": {"organic": 4200, "paid": 2100, "social": 1800, "direct": 1200}},
                {"label": "W2", "values": {"organic": 4500, "paid": 2300, "social": 2100, "direct": 1100}},
                {"label": "W3", "values": {"organic": 4100, "paid": 2800, "social": 1900, "direct": 1300}},
                {"label": "W4", "values": {"organic": 4800, "paid": 2400, "social": 2400, "direct": 1400}},
                {"label": "W5", "values": {"organic": 5200, "paid": 2600, "social": 2800, "direct": 1500}},
                {"label": "W6", "values": {"organic": 5500, "paid": 2200, "social": 3100, "direct": 1600}},
                {"label": "W7", "values": {"organic": 5100, "paid": 3000, "social": 2900, "direct": 1400}},
                {"label": "W8", "values": {"organic": 5800, "paid": 2900, "social": 3300, "direct": 1700}},
            ],
        },
        "temperature": {
            "title": "Daily Temperature Across Cities (°F)",
            "chart_type": "line",
            "x_label": "Day",
            "y_label": "Temperature (°F)",
            "series": [
                {"key": "new_york", "name": "New York", "color": "#8884d8"},
                {"key": "london", "name": "London", "color": "#82ca9d"},
                {"key": "tokyo", "name": "Tokyo", "color": "#ffc658"},
                {"key": "sydney", "name": "Sydney", "color": "#ff7c7c"},
            ],
            "data": [
                {"label": "Mon", "values": {"new_york": 72, "london": 61, "tokyo": 78, "sydney": 68}},
                {"label": "Tue", "values": {"new_york": 75, "london": 59, "tokyo": 80, "sydney": 71}},
                {"label": "Wed", "values": {"new_york": 70, "london": 63, "tokyo": 76, "sydney": 65}},
                {"label": "Thu", "values": {"new_york": 68, "london": 58, "tokyo": 82, "sydney": 69}},
                {"label": "Fri", "values": {"new_york": 74, "london": 62, "tokyo": 79, "sydney": 72}},
                {"label": "Sat", "values": {"new_york": 78, "london": 65, "tokyo": 83, "sydney": 74}},
                {"label": "Sun", "values": {"new_york": 76, "london": 60, "tokyo": 81, "sydney": 70}},
            ],
        },
        "market_share": {
            "title": "Cloud Market Share (2024)",
            "chart_type": "pie",
            "series": [
                {"key": "share", "name": "Market Share", "color": "#8884d8"},
            ],
            "data": [
                {"label": "AWS", "values": {"share": 31}},
                {"label": "Azure", "values": {"share": 25}},
                {"label": "Google Cloud", "values": {"share": 11}},
                {"label": "Alibaba", "values": {"share": 4}},
                {"label": "Others", "values": {"share": 29}},
            ],
        },
        "stock_performance": {
            "title": "Quarterly Stock Performance (%)",
            "chart_type": "line",
            "x_label": "Quarter",
            "y_label": "Growth (%)",
            "series": [
                {"key": "msft", "name": "Microsoft", "color": "#00a4ef"},
                {"key": "aapl", "name": "Apple", "color": "#a2aaad"},
                {"key": "googl", "name": "Google", "color": "#4285f4"},
                {"key": "amzn", "name": "Amazon", "color": "#ff9900"},
            ],
            "data": [
                {"label": "Q1 2023", "values": {"msft": 5.2, "aapl": 3.1, "googl": 4.8, "amzn": 2.3}},
                {"label": "Q2 2023", "values": {"msft": 8.1, "aapl": 6.4, "googl": 7.2, "amzn": 5.1}},
                {"label": "Q3 2023", "values": {"msft": 12.3, "aapl": 8.9, "googl": 10.1, "amzn": 9.8}},
                {"label": "Q4 2023", "values": {"msft": 15.7, "aapl": 11.2, "googl": 13.5, "amzn": 14.2}},
                {"label": "Q1 2024", "values": {"msft": 18.4, "aapl": 13.8, "googl": 16.2, "amzn": 17.6}},
                {"label": "Q2 2024", "values": {"msft": 22.1, "aapl": 15.3, "googl": 19.8, "amzn": 21.4}},
            ],
        },
    }

    if dataset not in datasets:
        return f"Unknown dataset '{dataset}'. Available: {', '.join(datasets.keys())}"

    return json.dumps(datasets[dataset])


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
the chart from the state you produce.

CRITICAL RULES:
1. You receive the current chart state in the system context
2. To create or fully replace a visualization, use the `set_chart` tool
3. To add data, use `add_data_points`
4. To tweak styling only, use `update_chart_style`
5. To generate demo data, use `generate_sample_data` — then parse the returned JSON and call `set_chart` with it
6. When modifying, ALWAYS include ALL existing data + your additions in set_chart
7. After calling a tool, provide a brief conversational explanation (1-2 sentences)

CHART TYPES:
- "bar": Grouped bar chart (use stacked=True for stacked bars)
- "line": Line chart with dots
- "area": Filled area chart (use stacked=True for stacked areas)
- "pie": Pie/donut chart (only uses first series key)
- "scatter": Scatter plot
- "composed": Mixed chart (bars + lines together)

COLOR PALETTE (use these for attractive charts):
#8884d8 (purple), #82ca9d (green), #ffc658 (gold), #ff7c7c (coral),
#00a4ef (blue), #a2aaad (silver), #4285f4 (google blue), #ff9900 (orange),
#36cfc9 (teal), #f759ab (pink)

When the user asks to "show me" something without being specific, use generate_sample_data
for an appropriate dataset and then set_chart with the result.

Keep responses concise and focused on describing what was visualized.""",
        client=chat_client,
        tools=[set_chart, add_data_points, update_chart_style, generate_sample_data],
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

