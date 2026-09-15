"""Schema fragments and instructions shared by every research agent."""
from __future__ import annotations

# A claim the model must back with the sources it was shown. `source_ids` are
# indices into the [S1..Sn] block in the user message — the service validates
# them against the real result count and drops anything out of range, because
# models routinely cite [S9] when handed six results.
CITED_CLAIM_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "category": {
            "type": "string",
            "enum": ["profile", "challenge", "need", "intent", "icp", "risk"],
        },
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "source_ids": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["text", "category", "confidence", "source_ids"],
}

CITATION_RULES = """Citation rules — these matter more than sounding confident:
- Every claim must list the source numbers that support it, e.g. [1, 3].
- Only cite numbers that actually appear in the SOURCES block.
- If nothing in the sources supports a statement, you may still make it, but
  give it an empty source_ids list and a confidence at or below 0.4. A guess
  labelled as a guess is useful; a guess dressed as a fact is not.
- Set confidence to reflect the evidence, not your fluency: 0.9+ only when a
  source states it plainly, 0.5-0.8 when inferring from related facts.
- Never invent a company detail to fill a field. Leave it empty instead.
- Return at most 8 claims, and make them the 8 that matter most: what the
  company does, who it sells to, its scale, and what changed recently. Prefer
  one well-sourced claim over three restatements of it. The schema enforces
  this ceiling, so spending it on minor details means the important ones are
  simply missing."""

NO_SOURCES_NOTE = (
    "No web results were available for this company. Say so honestly: return "
    "empty source_ids, keep confidence at or below 0.4, and do not fabricate "
    "specifics. Do not conclude the company does not exist — the search simply "
    "returned nothing."
)

SEARCH_FAILED_NOTE = (
    "Web search was unavailable for this request (a tool error, not an empty "
    "result set). Work only from what you were given, mark every claim as "
    "unsourced with confidence at or below 0.4, and do not speculate about the "
    "company's current situation."
)


def render_sources_block(formatted_sources: str, *, ok: bool, has_results: bool) -> str:
    """Build the SOURCES section, telling the model plainly when it has none."""
    if not ok:
        return f"SOURCES:\n(none — {SEARCH_FAILED_NOTE})"
    if not has_results:
        return f"SOURCES:\n(none — {NO_SOURCES_NOTE})"
    return f"SOURCES:\n{formatted_sources}"
