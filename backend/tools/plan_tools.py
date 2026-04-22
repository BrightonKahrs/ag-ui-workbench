"""Plan tools for the AG-UI Playground — task planning and tracking."""

import json
import uuid

from agent_framework import tool
from pydantic import BaseModel, field_validator

import state_store


# --- Pydantic models for validation ---


class TaskDef(BaseModel):
    """A single task in a plan."""
    id: str
    title: str
    description: str = ""


class PlanDef(BaseModel):
    """A plan with ordered tasks."""
    title: str
    tasks: list[TaskDef]

    @field_validator("tasks")
    @classmethod
    def at_least_one_task(cls, v: list[TaskDef]) -> list[TaskDef]:
        if not v:
            raise ValueError("Plan must have at least one task")
        return v


# --- Tools ---


@tool
def create_plan(plan_json: str) -> str:
    """Create a task plan for a complex multi-step task.

    Call this when a user's request requires multiple distinct steps.
    Each task will be worked on sequentially.

    Pass a JSON STRING with this structure:
    {
        "title": "Plan title describing the overall goal",
        "tasks": [
            {"id": "unique-id", "title": "Task title", "description": "What to do"},
            {"id": "another-id", "title": "Another task", "description": "Details"}
        ]
    }

    Use descriptive kebab-case IDs (e.g., "fetch-weather-nyc", "analyze-data").
    Order tasks in execution sequence.

    Args:
        plan_json: A JSON string containing the plan definition.

    Returns:
        Confirmation message with the plan ID.
    """
    try:
        raw = json.loads(plan_json) if isinstance(plan_json, str) else plan_json
        plan_def = PlanDef.model_validate(raw)
    except (json.JSONDecodeError, ValueError) as e:
        return f"Error: Invalid plan JSON — {e}"

    plan_id = f"plan-{uuid.uuid4().hex[:8]}"
    task_order = [t.id for t in plan_def.tasks]
    tasks = {
        t.id: {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "status": "pending",
            "result": None,
        }
        for t in plan_def.tasks
    }

    plan_state = {
        "id": plan_id,
        "title": plan_def.title,
        "status": "in_progress",
        "taskOrder": task_order,
        "tasks": tasks,
    }

    state_store.store_plan(plan_state)
    return f"Plan '{plan_def.title}' created with {len(tasks)} tasks. Now work through each task."


@tool
def update_task(task_id: str, status: str, result: str = "") -> str:
    """Update a task's status in the current plan.

    Call this to mark a task as in_progress before starting it,
    then call again with done (and a result summary) when finished.

    Args:
        task_id: The ID of the task to update.
        status: New status — one of: in_progress, done, failed, cancelled.
        result: A brief result summary (required when status is 'done').

    Returns:
        Confirmation message.
    """
    valid_statuses = {"in_progress", "done", "failed", "cancelled"}
    if status not in valid_statuses:
        return f"Error: status must be one of {valid_statuses}"

    plan = state_store.get_plan()
    if not plan:
        return "Error: No active plan. Call create_plan first."

    tasks = plan.get("tasks", {})
    if task_id not in tasks:
        return f"Error: Task '{task_id}' not found in plan."

    tasks[task_id]["status"] = status
    if result:
        tasks[task_id]["result"] = result

    # Update overall plan status
    all_statuses = [t["status"] for t in tasks.values()]
    if all(s in ("done", "cancelled") for s in all_statuses):
        plan["status"] = "completed"
    elif any(s == "failed" for s in all_statuses):
        plan["status"] = "failed"
    else:
        plan["status"] = "in_progress"

    state_store.store_plan(plan)
    return f"Task '{task_id}' → {status}" + (f": {result}" if result else "")
