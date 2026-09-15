"""
The Ideal Customer Profile — defined once, as data.

This used to exist twice: as English prose in the qualification system prompt,
and as Python constants in the Django backend's `leads/scoring.py`. Nothing
kept them in sync, so changing the ICP in one place silently produced scores
and narratives that disagreed with each other.

Here it is structured data with a renderer. The backend can fetch it from
`GET /icp` and assert its own constants still match — see the
`check_icp_sync` management command.
"""
from __future__ import annotations

ICP_SPEC = {
    "industries": [
        "B2B SaaS",
        "marketing technology",
        "martech",
        "manufacturing",
        "professional services",
    ],
    "min_employees": 20,
    "max_employees": 5000,
    "intent_signals": [
        "mentions of a timeline or deadline",
        "a stated budget or procurement process",
        "a specific, named pain point",
        "a request to talk to sales or book a demo",
        'urgency language ("this quarter", "ASAP", "before renewal")',
        "hiring for roles that imply the problem we solve",
        "recent funding that unlocks new spend",
    ],
    "low_intent_signals": [
        "vague browsing language (\"just looking\", \"curious\")",
        "no company context at all",
        "a personal rather than business email domain",
        "student, job-seeker, or vendor enquiries",
    ],
}


def render_icp_prompt(spec: dict | None = None) -> str:
    """Render the spec as the prose block every agent's system prompt embeds."""
    spec = spec or ICP_SPEC
    industries = ", ".join(spec["industries"])
    intent = "\n".join(f"  - {item}" for item in spec["intent_signals"])
    low_intent = "\n".join(f"  - {item}" for item in spec["low_intent_signals"])

    return f"""Ideal Customer Profile (ICP):
- Industries: {industries}
- Company size: {spec['min_employees']}-{spec['max_employees']} employees
- Signals of real buying intent:
{intent}
- Signals of low intent:
{low_intent}"""
