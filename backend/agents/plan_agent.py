"""Plan agent for the AG-UI Playground — planning + task execution."""

import os
from typing import Optional

from agent_framework import Agent, MCPStreamableHTTPTool
from agent_framework.foundry import FoundryChatClient
from azure.identity import DefaultAzureCredential

from tools.demo_tools import calculate, get_current_time, get_weather
from tools.plan_tools import create_plan, update_task


def create_plan_agent(
    mcp_tools: Optional[MCPStreamableHTTPTool] = None,
) -> Agent:
    """Create a planning agent with task management + standard tools.

    This agent can decide whether a request is simple (answer directly)
    or complex (create a plan, work through tasks sequentially).
    """
    project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    model = os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4.1-mini")
    credential = DefaultAzureCredential()

    chat_client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=credential,
    )

    tools: list = [
        create_plan,
        update_task,
        get_weather,
        calculate,
        get_current_time,
    ]
    if mcp_tools:
        tools.append(mcp_tools)

    agent = Agent(
        name="PlannerAgent",
        instructions="""You are a planning assistant that breaks complex tasks into steps.

PLANNING BEHAVIOR:
- For simple questions (facts, math, weather for one city), answer directly.
- For complex tasks that require 3+ distinct steps, ALWAYS call create_plan first.
- Complex tasks include: comparing multiple things, multi-city weather reports,
  multi-step calculations, research across topics, or any request with "compare",
  "analyze", "for each", "multiple", etc.

WHEN EXECUTING A PLAN:
1. Call create_plan with a structured task list first.
2. For each task in order:
   a. Call update_task(task_id, "in_progress") to mark it active.
   b. Do the work (use tools like get_weather, calculate, etc.).
   c. Call update_task(task_id, "done", result="brief summary") when finished.
3. After all tasks are done, provide a final summary.

If a task fails, call update_task(task_id, "failed", result="error description").

IMPORTANT: Always create_plan BEFORE doing any work on complex tasks.
Keep task titles short and clear. Use descriptive kebab-case IDs.""",
        client=chat_client,
        tools=tools,
    )

    return agent
