"""
The closed sets this service is allowed to emit.

Django is the system of record: these mirror `Signal.Type`, `Signal.Strength`
and `CompanyIntelligence.Intent` in `backend/intelligence/models.py`, and the
backend re-validates everything on ingest (`services.persist_signals` falls
back to `web`/`medium` for anything it doesn't recognise). So a mismatch here
never corrupts data — it silently degrades it, which is worse to debug: every
funding signal would quietly arrive as "web".

They live in one module, and are published at `/vocabulary`, so that drift is
*detectable* rather than invisible. That's the same reason `/icp` exists —
the ICP constants used to be two hand-maintained copies.

Adding a value means changing it in both places. The endpoint is what makes
forgetting one of them findable.
"""
from __future__ import annotations

SIGNAL_TYPES = frozenset({"funding", "hiring", "news", "product", "leadership", "web"})
SIGNAL_TYPE_FALLBACK = "web"

SIGNAL_STRENGTHS = frozenset({"high", "medium", "low"})
SIGNAL_STRENGTH_FALLBACK = "medium"

BUYING_INTENTS = frozenset({"high", "warm", "medium", "low", "unknown"})
BUYING_INTENT_FALLBACK = "unknown"


def coerce(value: object, allowed: frozenset[str], fallback: str) -> str:
    """
    Return `value` when it's in the allowed set, else the fallback.

    Centralised because each agent previously inlined the same conditional,
    and an inlined version is easy to write without the fallback at all —
    which would let unvalidated model output reach the database.
    """
    return value if isinstance(value, str) and value in allowed else fallback


def as_payload() -> dict[str, object]:
    """What `/vocabulary` publishes, for cross-service comparison."""
    return {
        "signal_types": sorted(SIGNAL_TYPES),
        "signal_type_fallback": SIGNAL_TYPE_FALLBACK,
        "signal_strengths": sorted(SIGNAL_STRENGTHS),
        "signal_strength_fallback": SIGNAL_STRENGTH_FALLBACK,
        "buying_intents": sorted(BUYING_INTENTS),
        "buying_intent_fallback": BUYING_INTENT_FALLBACK,
    }
