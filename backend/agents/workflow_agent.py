"""Workflow agent demonstrating AG-UI ACTIVITY_SNAPSHOT and STEP events.

A 3-stage "Research Pipeline" workflow:
  Researcher → Analyzer → Synthesizer

Each executor calls the LLM and yields output. The AG-UI workflow adapter
automatically emits STEP_STARTED/STEP_FINISHED and ACTIVITY_SNAPSHOT events
for each executor transition.
"""

import logging
import os

from agent_framework import (
    Executor,
    Message,
    WorkflowBuilder,
    WorkflowContext,
    handler,
)
from agent_framework.foundry import FoundryChatClient
from azure.identity import DefaultAzureCredential

logger = logging.getLogger(__name__)


def _extract_user_text(messages: list) -> str:
    """Extract the last user message text from a list of Message objects."""
    for m in reversed(messages):
        role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else "")
        if role == "user":
            # Message objects have .contents list of Content objects
            contents = getattr(m, "contents", None)
            if contents:
                for c in contents:
                    text = getattr(c, "text", None)
                    if text:
                        return text
            # Fallback for dict-style messages
            if isinstance(m, dict):
                return m.get("content", "")
    return ""


class Researcher(Executor):
    """Stage 1: Research the user's question and produce a summary."""

    def __init__(self, chat_client: FoundryChatClient):
        super().__init__(id="researcher")
        self._client = chat_client

    @handler(input=list, output=dict)
    async def handle(self, messages: list, ctx: WorkflowContext) -> dict:
        user_msg = _extract_user_text(messages)
        logger.info(f"[Researcher] Processing: {user_msg[:80]}")

        response = await self._client.get_response(
            messages=[
                Message("system", [
                    "You are a research assistant. Given a question, provide a detailed "
                    "research summary with key facts and findings. Be thorough but concise. "
                    "Keep your response under 150 words."
                ]),
                Message("user", [f"Research this topic: {user_msg}"]),
            ],
        )
        research = response.text
        logger.info(f"[Researcher] Done, {len(research)} chars")
        await ctx.yield_output(f"**📚 Research Summary**\n\n{research}")
        result = {"research": research, "question": user_msg}
        await ctx.send_message(result, target_id="analyzer")
        return result


class Analyzer(Executor):
    """Stage 2: Analyze the research and extract key points."""

    def __init__(self, chat_client: FoundryChatClient):
        super().__init__(id="analyzer")
        self._client = chat_client

    @handler(input=dict, output=dict)
    async def handle(self, data: dict, ctx: WorkflowContext) -> dict:
        research = data.get("research", "")
        question = data.get("question", "")
        logger.info(f"[Analyzer] Processing insights for: {question[:80]}")

        response = await self._client.get_response(
            messages=[
                Message("system", [
                    "You are an analyst. Given research findings, extract 3-5 key insights "
                    "as bullet points. Each point should be a clear, actionable takeaway. "
                    "Keep your response under 100 words."
                ]),
                Message("user", [
                    f"Original question: {question}\n\nResearch findings:\n{research}\n\n"
                    "Extract key insights:"
                ]),
            ],
        )
        analysis = response.text
        logger.info(f"[Analyzer] Done, {len(analysis)} chars")
        await ctx.yield_output(f"**🔍 Key Insights**\n\n{analysis}")
        result = {"question": question, "research": research, "analysis": analysis}
        await ctx.send_message(result, target_id="synthesizer")
        return result


class Synthesizer(Executor):
    """Stage 3: Synthesize everything into a final answer."""

    def __init__(self, chat_client: FoundryChatClient):
        super().__init__(id="synthesizer")
        self._client = chat_client

    @handler(input=dict, workflow_output=str)
    async def handle(self, data: dict, ctx: WorkflowContext) -> str:
        question = data.get("question", "")
        research = data.get("research", "")
        analysis = data.get("analysis", "")
        logger.info(f"[Synthesizer] Synthesizing answer for: {question[:80]}")

        response = await self._client.get_response(
            messages=[
                Message("system", [
                    "You are a synthesizer. Combine the research and analysis into a "
                    "clear, well-structured final answer. Start with a direct answer, "
                    "then provide supporting context. Keep your response under 150 words."
                ]),
                Message("user", [
                    f"Question: {question}\n\nResearch:\n{research}\n\nKey Insights:\n{analysis}\n\n"
                    "Provide the final synthesized answer:"
                ]),
            ],
        )
        synthesis = response.text
        logger.info(f"[Synthesizer] Done, {len(synthesis)} chars")
        await ctx.yield_output(f"**✨ Final Answer**\n\n{synthesis}")
        return synthesis


def create_workflow():
    """Create a fresh research pipeline workflow."""
    project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    model = os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4.1-mini")
    credential = DefaultAzureCredential()

    chat_client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=credential,
    )

    researcher = Researcher(chat_client)
    analyzer = Analyzer(chat_client)
    synthesizer = Synthesizer(chat_client)

    builder = WorkflowBuilder(
        start_executor=researcher,
        output_executors=[synthesizer],
    )
    builder.add_edge(researcher, analyzer)
    builder.add_edge(analyzer, synthesizer)

    return builder.build()
