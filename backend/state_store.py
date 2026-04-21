"""Thread-safe shared chart state store.

Used by:
- Tool functions (set_chart, patch_chart, get_chart_info) to read/write chart state
- Server middleware to emit state events and compute deltas

The store is keyed by thread_id. Tools access it via a contextvars-based
"active thread" so they don't need the thread_id as a parameter.
"""

import contextvars
import copy
import threading
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


# ---- Thread-safe chart store ----
_lock = threading.Lock()
_chart_states: dict[str, dict[str, Any]] = {}
_MAX_THREADS = 100


def get_chart(thread_id: str | None = None) -> dict[str, Any] | None:
    """Get the current chart for a thread. Uses active thread if not specified."""
    tid = thread_id or _active_thread.get()
    with _lock:
        chart = _chart_states.get(tid)
        return copy.deepcopy(chart) if chart else None


def store_chart(chart: dict[str, Any], thread_id: str | None = None) -> None:
    """Store a chart for a thread. Uses active thread if not specified."""
    tid = thread_id or _active_thread.get()
    with _lock:
        _chart_states[tid] = copy.deepcopy(chart)
        # Evict oldest if over limit
        while len(_chart_states) > _MAX_THREADS:
            oldest = next(iter(_chart_states))
            del _chart_states[oldest]


def get_full_state(thread_id: str | None = None) -> dict[str, Any]:
    """Get the full state dict (with chart key) for a thread."""
    chart = get_chart(thread_id)
    return {"chart": chart} if chart else {}
