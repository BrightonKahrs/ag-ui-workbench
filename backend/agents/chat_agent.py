"""Basic streaming chat agent for the AG-UI Workbench."""

import os
from typing import Any, Optional

from agent_framework import Agent, MCPStreamableHTTPTool
from agent_framework.anthropic import AnthropicClient
from agent_framework.foundry import FoundryChatClient
from agent_framework.openai import OpenAIChatClient, OpenAIChatOptions
from azure.identity import DefaultAzureCredential

from tools.demo_tools import (
    calculate,
    calculate_hitl,
    get_current_time,
    get_current_time_hitl,
    get_weather,
    get_weather_hitl,
)


class PatchedAnthropicClient(AnthropicClient):
    """AnthropicClient with fix for adaptive thinking in multi-turn tool loops.

    The base class serializes thinking blocks as {"type": "thinking", "thinking": content.text}
    but content.text can be None for some thinking blocks (especially with adaptive thinking),
    which causes Anthropic's API to reject the request. This subclass filters those out.
    """

    def _prepare_message_for_anthropic(self, message: Any) -> dict[str, Any]:
        result = super()._prepare_message_for_anthropic(message)
        # Filter out thinking blocks with invalid (None/empty) thinking content
        if "content" in result and isinstance(result["content"], list):
            result["content"] = [
                block for block in result["content"]
                if not (
                    isinstance(block, dict)
                    and block.get("type") == "thinking"
                    and not block.get("thinking")
                )
            ]
        return result


def _create_client(provider: str = "foundry", model: str | None = None):
    """Create a chat client for the specified provider.

    Supports:
    - foundry: Azure AI Foundry (default)
    - openai: Direct OpenAI API
    - anthropic: Anthropic Claude via native SDK
    """
    if provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY", "")
        resolved_model = model or "gpt-4.1-mini"
        return OpenAIChatClient(model=resolved_model, api_key=api_key), resolved_model

    elif provider == "anthropic":
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        resolved_model = model or "claude-sonnet-4-6"
        return PatchedAnthropicClient(
            model=resolved_model,
            api_key=api_key,
        ), resolved_model

    else:  # foundry (default)
        project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
        credential = DefaultAzureCredential()
        resolved_model = model or os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4.1-mini")
        return FoundryChatClient(
            project_endpoint=project_endpoint,
            model=resolved_model,
            credential=credential,
        ), resolved_model


def create_chat_agent(
    model_mode: str = "chat",
    hitl: bool = False,
    mcp_tools: Optional[MCPStreamableHTTPTool] = None,
    reasoning_effort: str = "medium",
    thinking_budget: int = 4096,
    provider: str = "foundry",
    model: str | None = None,
) -> Agent:
    """Create a chat agent with configurable provider and demo tools.

    Args:
        model_mode: One of "chat" or "reasoning".
        hitl: If True, all tools require human approval before execution.
        mcp_tools: Optional MCPStreamableHTTPTool for connecting to local MCP server.
        reasoning_effort: Reasoning effort level ("low", "medium", "high") for reasoning models.
        thinking_budget: Token budget for Anthropic extended thinking (1024-128000).
        provider: Provider to use ("foundry", "openai", "anthropic").
        model: Specific model name to use (overrides default for provider).
    """
    # For reasoning mode on Foundry, override model to reasoning variant
    if model_mode == "reasoning" and provider == "foundry" and not model:
        model = os.environ.get("FOUNDRY_MODEL_REASONING", "o4-mini")

    chat_client, resolved_model = _create_client(provider, model)

    # Configure reasoning options for reasoning models
    default_options: dict | None = None
    if model_mode == "reasoning":
        if provider == "anthropic":
            # Use the budget_tokens value directly from the frontend slider
            default_options = {
                "thinking": {"type": "enabled", "budget_tokens": thinking_budget},
                "max_tokens": 16000,
            }
        else:
            # OpenAI/Foundry use reasoning effort
            default_options = OpenAIChatOptions(
                reasoning={"effort": reasoning_effort, "summary": "auto"},
            )

    # Select tool versions based on HITL mode
    if hitl:
        tools: list = [get_weather_hitl, calculate_hitl, get_current_time_hitl]
    else:
        tools = [get_weather, calculate, get_current_time]

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

    hitl_instruction = ""
    if hitl:
        hitl_instruction = """

Note: Tool calls in this session have a human approval step built in.
Go ahead and use tools normally when they are helpful — the system will
handle the approval flow automatically."""

    agent = Agent(
        name="WorkbenchChatAgent",
        instructions=f"""You are a helpful assistant in the AG-UI Workbench.
You demonstrate the AG-UI protocol features including streaming text, tool calls, and more.

You have access to these local tools:
- get_weather: Get current weather for a city (simulated data)
- calculate: Evaluate math expressions
- get_current_time: Get the current UTC time
{mcp_instruction}{hitl_instruction}

When users ask questions that could use these tools, use them to demonstrate
tool call events in the AG-UI protocol. Be conversational and explain what
you're doing so users can see the protocol events in action.

Keep responses concise but informative.""",
        client=chat_client,
        tools=tools,
        default_options=default_options,
    )

    return agent
