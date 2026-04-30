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
    """Evaluate a scientific mathematical expression.

    Supports: arithmetic, exponents (**), sqrt, cbrt, trig (sin/cos/tan/asin/acos/atan),
    hyperbolic (sinh/cosh/tanh), log/log2/log10/exp, factorial, gamma, erf,
    radians/degrees conversion, constants (pi, e, c, G, h, k_B, N_A, g),
    numerical derivative(f, x) and integral(f, a, b), complex numbers, and more.

    Args:
        expression: A mathematical expression (e.g., 'sqrt(2)*sin(pi/4)', 'integral(lambda x: x**2, 0, 1)').

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
    """Evaluate a scientific mathematical expression.

    Supports: arithmetic, exponents (**), sqrt, cbrt, trig (sin/cos/tan/asin/acos/atan),
    hyperbolic (sinh/cosh/tanh), log/log2/log10/exp, factorial, gamma, erf,
    radians/degrees conversion, constants (pi, e, c, G, h, k_B, N_A, g),
    numerical derivative(f, x) and integral(f, a, b), complex numbers, and more.

    Args:
        expression: A mathematical expression (e.g., 'sqrt(2)*sin(pi/4)', 'integral(lambda x: x**2, 0, 1)').

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
    import math
    import cmath

    # Safe namespace with comprehensive scientific/physics functions
    safe_globals: dict = {"__builtins__": {}}
    safe_locals: dict = {
        # Constants
        "pi": math.pi,
        "e": math.e,
        "tau": math.tau,
        "inf": math.inf,
        "nan": math.nan,
        "c": 299_792_458,          # speed of light (m/s)
        "G": 6.674e-11,            # gravitational constant
        "h": 6.626e-34,            # Planck constant
        "k_B": 1.381e-23,          # Boltzmann constant
        "N_A": 6.022e23,           # Avogadro's number
        "R": 8.314,                # gas constant (J/(mol·K))
        "mu_0": 1.257e-6,          # vacuum permeability
        "epsilon_0": 8.854e-12,    # vacuum permittivity
        "g": 9.80665,              # standard gravity (m/s²)
        # Basic math
        "abs": abs,
        "round": round,
        "min": min,
        "max": max,
        "sum": sum,
        # Powers and roots
        "sqrt": math.sqrt,
        "cbrt": lambda x: x ** (1 / 3) if x >= 0 else -((-x) ** (1 / 3)),
        "pow": pow,
        # Trigonometric (radians)
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "asin": math.asin,
        "acos": math.acos,
        "atan": math.atan,
        "atan2": math.atan2,
        # Hyperbolic
        "sinh": math.sinh,
        "cosh": math.cosh,
        "tanh": math.tanh,
        "asinh": math.asinh,
        "acosh": math.acosh,
        "atanh": math.atanh,
        # Logarithms and exponentials
        "log": math.log,           # natural log (or log(x, base))
        "log2": math.log2,
        "log10": math.log10,
        "exp": math.exp,
        "exp2": lambda x: 2 ** x,
        # Angle conversions
        "radians": math.radians,
        "degrees": math.degrees,
        "deg": math.radians,       # shorthand: deg(45) → radians
        # Factorial and combinatorics
        "factorial": math.factorial,
        "comb": math.comb,
        "perm": math.perm,
        # Rounding and special
        "ceil": math.ceil,
        "floor": math.floor,
        "trunc": math.trunc,
        "fmod": math.fmod,
        "gcd": math.gcd,
        "lcm": math.lcm,
        # Calculus helpers (numerical)
        "derivative": lambda f, x, h=1e-8: (f(x + h) - f(x - h)) / (2 * h),
        "integral": lambda f, a, b, n=10000: (
            (b - a) / n * sum(f(a + i * (b - a) / n) for i in range(n))
        ),
        # Hypot and distance
        "hypot": math.hypot,
        "dist": math.dist,
        # Special functions
        "gamma": math.gamma,
        "lgamma": math.lgamma,
        "erf": math.erf,
        "erfc": math.erfc,
        # Complex number support
        "complex": complex,
        "j": 1j,
        "cabs": abs,
        "cphase": cmath.phase,
        "cpolar": cmath.polar,
        # Boolean for conditionals
        "True": True,
        "False": False,
    }

    try:
        result = eval(expression, safe_globals, safe_locals)
        # Format the result nicely
        if isinstance(result, float):
            if abs(result) > 1e10 or (0 < abs(result) < 1e-4):
                formatted = f"{result:.6e}"
            elif result == int(result):
                formatted = str(int(result))
            else:
                formatted = f"{result:.10g}"
        elif isinstance(result, complex):
            formatted = f"{result}"
        else:
            formatted = str(result)
        return f"{expression} = {formatted}"
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"


def _get_current_time_impl(timezone_name: str = "UTC") -> str:
    now = datetime.now(timezone.utc)
    return f"Current time (UTC): {now.strftime('%Y-%m-%d %H:%M:%S')}"
