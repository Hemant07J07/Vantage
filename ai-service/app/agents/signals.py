"""Step 2 — find recent, dated buying signals."""
from __future__ import annotations

import logging

from ..llm_client import LLMClient
from ..prompts import SIGNALS_SCHEMA, SIGNALS_SYSTEM, build_signals_user, render_sources_block
from ..schemas import CompanyPayload, SignalsResponse
from ..vocabulary import (
    SIGNAL_STRENGTH_FALLBACK,
    SIGNAL_STRENGTHS,
    SIGNAL_TYPE_FALLBACK,
    SIGNAL_TYPES,
    coerce,
)
from ..retrieval import enrich
from ..web_search import format_results_for_model, search_multi
from .base import run_json_agent, validate_citations

logger = logging.getLogger(__name__)


def _queries(payload: CompanyPayload) -> list[str]:
    subject = payload.company_name or payload.domain or ""
    if not subject:
        return []
    # Three angles, because signals cluster differently by kind: money, people,
    # and announcements rarely surface from the same query.
    return [
        f"{subject} funding round raised investment news",
        f"{subject} hiring open roles careers jobs",
        f"{subject} news announcement launch partnership",
    ]


async def run(client: LLMClient, payload: CompanyPayload) -> SignalsResponse:
    outcome = await search_multi(_queries(payload))
    # Read the pages themselves, not just what the search engine said
    # about them. Anything that can't be fetched keeps its snippet.
    await enrich(outcome, budget_seconds=30.0)
    sources_block = render_sources_block(
        format_results_for_model(outcome.results),
        ok=outcome.ok,
        has_results=bool(outcome.results),
    )

    data = await run_json_agent(
        client,
        system=SIGNALS_SYSTEM,
        user=build_signals_user(
            payload.company_name, payload.domain, payload.known_profile or {}, sources_block
        ),
        schema=SIGNALS_SCHEMA,
        label="signals",
    )

    raw = [s for s in data.get("signals", []) if isinstance(s, dict) and (s.get("value") or "").strip()]
    validate_citations(raw, len(outcome.results), label="signals")

    signals = [
        {
            "type": coerce(s.get("type"), SIGNAL_TYPES, SIGNAL_TYPE_FALLBACK),
            "value": s["value"].strip()[:255],
            "strength": coerce(
                s.get("strength"), SIGNAL_STRENGTHS, SIGNAL_STRENGTH_FALLBACK
            ),
            "detected_at": s.get("detected_at") or None,
            "source_ids": s.get("source_ids", []),
        }
        for s in raw
    ]

    return SignalsResponse(
        signals=signals,
        sources=[r.to_dict() for r in outcome.results],
        model_used=client.model,
        search_ok=outcome.ok,
    )
