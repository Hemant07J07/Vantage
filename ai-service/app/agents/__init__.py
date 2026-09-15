"""
One module per research step.

Each exposes a single `async def run(client, payload) -> Response`, so
`main.py`'s routes are one-liners and splitting a step into its own service
later means copying this module plus its prompt file — no restructuring.
"""
from . import analysis, profile, recommend, signals
from .base import ModelOutputError, run_json_agent, validate_citations

__all__ = [
    "profile", "signals", "analysis", "recommend",
    "ModelOutputError", "run_json_agent", "validate_citations",
]
