"""Basic streaming chat agent for the AG-UI Playground."""

import os

from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from azure.identity import DefaultAzureCredential

from tools.demo_tools import calculate, get_current_time, get_weather


def create_chat_agent(model_mode: str = "chat") -> Agent:
    """Create a basic chat agent with demo tools.

    Args:
        model_mode: One of "chat", "reasoning", or "hybrid".
                    Determines which model deployment to use.
    """
    project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    credential = DefaultAzureCredential()

    # Select model based on mode
    if model_mode == "reasoning":
        model = os.environ.get("FOUNDRY_MODEL_REASONING", "o3-mini")
    else:
        model = os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4o-mini")

    chat_client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=credential,
    )

    agent = Agent(
        name="PlaygroundChatAgent",
        instructions="""You are a helpful assistant in the AG-UI Playground demo.
You demonstrate the AG-UI protocol features including streaming text, tool calls, and more.

You have access to these tools:
- get_weather: Get current weather for a city (simulated data)
- calculate: Evaluate math expressions
- get_current_time: Get the current UTC time

When users ask questions that could use these tools, use them to demonstrate
tool call events in the AG-UI protocol. Be conversational and explain what
you're doing so users can see the protocol events in action.

Keep responses concise but informative.""",
        client=chat_client,
        tools=[get_weather, calculate, get_current_time],
    )

    return agent
