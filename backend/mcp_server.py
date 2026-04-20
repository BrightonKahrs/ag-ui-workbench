"""Local MCP server for the AG-UI Playground.

Exposes demo tools via the Model Context Protocol over Streamable HTTP.
Run separately: `uv run python mcp_server.py`
The chat agent connects to this via MCPStreamableHTTPTool.
"""

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


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="127.0.0.1", port=8889)
