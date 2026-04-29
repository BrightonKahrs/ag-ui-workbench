"""Thread-safe shared state store.

Used by:
- Tool functions to read/write state
- Server middleware to emit state events and compute deltas

The store is keyed by (thread_id, namespace). Tools access it via a contextvars-based
"active thread" so they don't need the thread_id as a parameter.

Namespaces:
- "dashboard" — multi-widget dashboard for SharedStateTab
- "plan"      — task plan for PlanTab
"""

import contextvars
import copy
import threading
from collections.abc import Callable
from typing import Any

# ---- Active-thread context var (set by server before running agent) ----
_active_thread: contextvars.ContextVar[str] = contextvars.ContextVar(
    "active_thread", default="default"
)


def set_active_thread(thread_id: str) -> contextvars.Token[str]:
    """Set the active thread ID. Returns a reset token."""
    return _active_thread.set(thread_id)


def get_active_thread() -> str:
    """Get the active thread ID."""
    return _active_thread.get()


# ---- Generic namespaced state store ----
_lock = threading.Lock()
_states: dict[str, dict[str, dict[str, Any]]] = {}  # {thread_id: {namespace: data}}
_MAX_THREADS = 100


def _tid() -> str:
    return _active_thread.get()


def get_state(namespace: str, thread_id: str | None = None) -> dict[str, Any] | None:
    """Get state for a namespace. Uses active thread if not specified."""
    tid = thread_id or _tid()
    with _lock:
        thread_data = _states.get(tid, {})
        val = thread_data.get(namespace)
        return copy.deepcopy(val) if val else None


def store_state(namespace: str, data: dict[str, Any], thread_id: str | None = None) -> None:
    """Store state for a namespace. Uses active thread if not specified."""
    tid = thread_id or _tid()
    with _lock:
        if tid not in _states:
            _states[tid] = {}
        _states[tid][namespace] = copy.deepcopy(data)
        while len(_states) > _MAX_THREADS:
            oldest = next(iter(_states))
            del _states[oldest]


def get_full_state(thread_id: str | None = None) -> dict[str, Any]:
    """Get the full merged state dict for a thread (all namespaces)."""
    tid = thread_id or _tid()
    with _lock:
        thread_data = _states.get(tid, {})
        return copy.deepcopy(thread_data)


# ---- Dashboard convenience methods ----

_EMPTY_DASHBOARD: dict[str, Any] = {
    "title": "Dashboard",
    "widgets": {},
    "layout": [],
    "nextId": 1,
}


def get_dashboard(thread_id: str | None = None) -> dict[str, Any]:
    """Get the current dashboard (or a fresh empty one)."""
    d = get_state("dashboard", thread_id)
    if d is None:
        return copy.deepcopy(_EMPTY_DASHBOARD)
    return d


def store_dashboard(dashboard: dict[str, Any], thread_id: str | None = None) -> None:
    """Store the dashboard, keeping layout sorted by widget ID for stable diffs."""
    if "layout" in dashboard and isinstance(dashboard["layout"], list):
        dashboard["layout"] = sorted(dashboard["layout"], key=lambda it: it.get("i", ""))
    store_state("dashboard", dashboard, thread_id)


def mutate_dashboard(
    mutator: Callable[[dict[str, Any]], dict[str, Any] | None],
    thread_id: str | None = None,
) -> dict[str, Any]:
    """Atomically read-modify-write the dashboard under lock.

    The mutator receives a deep copy and should return the new dashboard
    (or mutate in place and return None, in which case the same object is stored).
    Returns the stored dashboard.
    """
    tid = thread_id or _tid()
    with _lock:
        thread_data = _states.get(tid, {})
        current = copy.deepcopy(thread_data.get("dashboard")) or copy.deepcopy(_EMPTY_DASHBOARD)

        result = mutator(current)
        updated = result if result is not None else current

        # Enforce invariants: layout sorted, every widget has a layout entry
        if "layout" in updated and isinstance(updated["layout"], list):
            updated["layout"] = sorted(updated["layout"], key=lambda it: it.get("i", ""))

        if tid not in _states:
            _states[tid] = {}
        _states[tid]["dashboard"] = copy.deepcopy(updated)

        while len(_states) > _MAX_THREADS:
            oldest = next(iter(_states))
            del _states[oldest]

    return copy.deepcopy(updated)


# ---- Chart convenience wrappers (backward compat / migration) ----


def get_chart(thread_id: str | None = None) -> dict[str, Any] | None:
    """Get the current chart for a thread (legacy compat)."""
    return get_state("chart", thread_id)


def store_chart(chart: dict[str, Any], thread_id: str | None = None) -> None:
    """Store a chart for a thread (legacy compat)."""
    store_state("chart", chart, thread_id)


# ---- Plan convenience wrappers ----


def get_plan(thread_id: str | None = None) -> dict[str, Any] | None:
    """Get the current plan for a thread."""
    return get_state("plan", thread_id)


def store_plan(plan: dict[str, Any], thread_id: str | None = None) -> None:
    """Store a plan for a thread."""
    store_state("plan", plan, thread_id)
