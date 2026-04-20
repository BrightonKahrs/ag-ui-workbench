"""Stateful agent with shared state for the AG-UI Playground."""

import os
from enum import Enum

from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import AgentFrameworkAgent
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel, Field


# --- State Models ---


class SkillLevel(str, Enum):
    BEGINNER = "Beginner"
    INTERMEDIATE = "Intermediate"
    ADVANCED = "Advanced"


class CookingTime(str, Enum):
    FIVE_MIN = "5 min"
    FIFTEEN_MIN = "15 min"
    THIRTY_MIN = "30 min"
    FORTY_FIVE_MIN = "45 min"
    SIXTY_PLUS_MIN = "60+ min"


class Ingredient(BaseModel):
    icon: str = Field(..., description="Emoji icon representing the ingredient")
    name: str = Field(..., description="Name of the ingredient")
    amount: str = Field(..., description="Amount or quantity")


class Recipe(BaseModel):
    title: str = Field(default="", description="The title of the recipe")
    skill_level: SkillLevel = Field(
        default=SkillLevel.BEGINNER, description="The skill level required"
    )
    special_preferences: list[str] = Field(
        default_factory=list, description="Dietary preferences"
    )
    cooking_time: CookingTime = Field(
        default=CookingTime.THIRTY_MIN, description="Estimated cooking time"
    )
    ingredients: list[Ingredient] = Field(
        default_factory=list, description="List of ingredients"
    )
    instructions: list[str] = Field(
        default_factory=list, description="Step-by-step instructions"
    )


# --- Tool ---


@tool
def update_recipe(recipe: Recipe) -> str:
    """Update the recipe with new or modified content.

    You MUST write the complete recipe with ALL fields, even when changing only a few items.
    When modifying an existing recipe, include ALL existing ingredients and instructions
    plus your changes. NEVER delete existing data - only add or modify.

    Args:
        recipe: The complete recipe object with all details.

    Returns:
        Confirmation that the recipe was updated.
    """
    return "Recipe updated successfully."


# --- Agent Creation ---


def create_stateful_agent() -> AgentFrameworkAgent:
    """Create a stateful agent with shared state management."""
    project_endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    model = os.environ.get("FOUNDRY_MODEL_CHAT", "gpt-4o-mini")
    credential = DefaultAzureCredential()

    chat_client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=credential,
    )

    base_agent = Agent(
        name="RecipeAgent",
        instructions="""You are a helpful recipe assistant in the AG-UI Playground.
You demonstrate shared state and predictive state updates in the AG-UI protocol.

CRITICAL RULES:
1. You will receive the current recipe state in the system context
2. To update the recipe, you MUST use the update_recipe tool
3. When modifying a recipe, ALWAYS include ALL existing data plus your changes
4. NEVER delete existing ingredients or instructions - only add or modify
5. After calling the tool, provide a brief conversational message (1-2 sentences)

When creating a NEW recipe:
- Provide all required fields: title, skill_level, cooking_time, ingredients, instructions
- Use actual emojis for ingredient icons (🥕 🧄 🧅 🍅 🌿 🍗 🥩 🧀 🍝 🥚 🧈)
- Be creative and helpful

When MODIFYING an existing recipe:
- Include ALL existing ingredients + any new ones
- Include ALL existing instructions + any new/modified ones
- Explain what you changed in your response message

Keep responses concise. Focus on the recipe updates.""",
        client=chat_client,
        tools=[update_recipe],
    )

    # Wrap with AgentFrameworkAgent for shared state support
    stateful_agent = AgentFrameworkAgent(
        agent=base_agent,
        name="RecipeAgent",
        description="Creates and modifies recipes with streaming state updates",
        state_schema={
            "recipe": {"type": "object", "description": "The current recipe"},
        },
        predict_state_config={
            "recipe": {"tool": "update_recipe", "tool_argument": "recipe"},
        },
    )

    return stateful_agent
