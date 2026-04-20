"""Demo tools for the AG-UI Playground."""

import json
import random
from datetime import datetime, timezone

from agent_framework import tool


@tool
def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: The name of the city to get weather for.

    Returns:
        A JSON string with weather information.
    """
    return _get_weather_impl(city)


@tool
def calculate(expression: str) -> str:
    """Evaluate a mathematical expression safely.

    Args:
        expression: A mathematical expression to evaluate (e.g., '2 + 2', '15 * 3.14').

    Returns:
        The result of the calculation.
    """
    return _calculate_impl(expression)


@tool
def get_current_time(timezone_name: str = "UTC") -> str:
    """Get the current date and time.

    Args:
        timezone_name: The timezone name (currently only UTC is supported).

    Returns:
        The current date and time as a formatted string.
    """
    return _get_current_time_impl(timezone_name)


# --- HITL (Human-in-the-Loop) versions with approval required ---


@tool(approval_mode="always_require")
def get_weather_hitl(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: The name of the city to get weather for.

    Returns:
        A JSON string with weather information.
    """
    return _get_weather_impl(city)


@tool(approval_mode="always_require")
def calculate_hitl(expression: str) -> str:
    """Evaluate a mathematical expression safely.

    Args:
        expression: A mathematical expression to evaluate (e.g., '2 + 2', '15 * 3.14').

    Returns:
        The result of the calculation.
    """
    return _calculate_impl(expression)


@tool(approval_mode="always_require")
def get_current_time_hitl(timezone_name: str = "UTC") -> str:
    """Get the current date and time.

    Args:
        timezone_name: The timezone name (currently only UTC is supported).

    Returns:
        The current date and time as a formatted string.
    """
    return _get_current_time_impl(timezone_name)


# --- Shared implementations ---


def _get_weather_impl(city: str) -> str:
    conditions = ["Sunny", "Partly Cloudy", "Cloudy", "Rainy", "Snowy", "Windy"]
    weather = {
        "city": city,
        "temperature_f": random.randint(20, 95),
        "condition": random.choice(conditions),
        "humidity": random.randint(30, 90),
        "wind_mph": random.randint(0, 30),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return json.dumps(weather, indent=2)


def _calculate_impl(expression: str) -> str:
    allowed_chars = set("0123456789+-*/.() ")
    if not all(c in allowed_chars for c in expression):
        return "Error: Invalid characters in expression. Only numbers and +-*/.() are allowed."
    try:
        result = eval(expression)  # Safe since we validated characters
        return f"{expression} = {result}"
    except Exception as e:
        return f"Error evaluating '{expression}': {str(e)}"


def _get_current_time_impl(timezone_name: str = "UTC") -> str:
    now = datetime.now(timezone.utc)
    return f"Current time (UTC): {now.strftime('%Y-%m-%d %H:%M:%S')}"
