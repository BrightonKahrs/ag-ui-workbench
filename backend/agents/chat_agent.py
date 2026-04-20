"""Basic streaming chat agent for the AG-UI Playground."""

import os
from typing import Optional

from agent_framework import Agent, MCPStreamableHTTPTool
from agent_framework.foundry import FoundryChatClient
from azure.identity import DefaultAzureCredential

from tools.demo_tools import calculate, get_current_time, get_weather


def create_chat_agent(
    model_mode: str = "chat",
    mcp_tools: Optional[MCPStreamableHTTPTool] = None,
) -> Agent:
    """Create a basic chat agent with demo tools and optional MCP tools.

    Args:
        model_mode: One of "chat", "reasoning", or "hybrid".
                    Determines which model deployment to use.
        mcp_tools: Optional MCPStreamableHTTPTool for connecting to local MCP server.
    """
    project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    credential = DefaultAzureCredential()

    # Select model based on mode
    if model_mode == "reasoning":
        model = os.environ.get("FOUNDRY_MODEL_REASONING", "o4-mini")
    else:
        model = os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4.1-mini")

    chat_client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=credential,
    )

    # Build tool list: local tools + MCP tools
    tools: list = [get_weather, calculate, get_current_time]
    if mcp_tools:
        tools.append(mcp_tools)

    mcp_instruction = ""
    if mcp_tools:
        mcp_instruction = """

You also have access to MCP (Model Context Protocol) tools from a local MCP server:
- search_knowledge_base: Search for info about AG-UI, MCP, Agent Framework, Recharts
- list_datasets: List available datasets in the data store
- query_dataset: Query a dataset for sample rows
- compute_statistics: Compute statistics on a list of numbers
- get_server_info: Get MCP server metadata

When users ask about data, knowledge, or statistics, use the MCP tools.
This demonstrates MCP server integration in the AG-UI protocol."""

    agent = Agent(
        name="PlaygroundChatAgent",
        instructions=f"""You are a helpful assistant in the AG-UI Playground demo.
You demonstrate the AG-UI protocol features including streaming text, tool calls, and more.

You have access to these local tools:
- get_weather: Get current weather for a city (simulated data)
- calculate: Evaluate math expressions
- get_current_time: Get the current UTC time
{mcp_instruction}

When users ask questions that could use these tools, use them to demonstrate
tool call events in the AG-UI protocol. Be conversational and explain what
you're doing so users can see the protocol events in action.

Keep responses concise but informative.""",
        client=chat_client,
        tools=tools,
    )

    return agent
