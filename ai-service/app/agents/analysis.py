"""Step 3 — judge the account against the ICP, with cited reasoning."""
from __future__ import annotations

import logging

from ..llm_client import LLMClient
from ..prompts import ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, build_analysis_user, render_sources_block
from ..schemas import AnalysisResponse, CompanyPayload
from ..vocabulary import BUYING_INTENT_FALLBACK, BUYING_INTENTS, coerce
from ..retrieval import enrich
from ..web_search import format_results_for_model, search_multi
from .base import run_json_agent, validate_citations

logger = logging.getLogger(__name__)


def _queries(payload: CompanyPayload) -> list[str]:
    subject = payload.company_name or payload.domain or ""
    if not subject:
        return []
    return [
        f"{subject} growth strategy challenges market position",
        f"{subject} customers pricing product offering",
    ]


async def run(client: LLMClient, payload: CompanyPayload) -> AnalysisResponse:
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
        system=ANALYSIS_SYSTEM,
        user=build_analysis_user(
            payload.company_name,
            payload.domain,
            payload.known_profile or {},
            payload.signals or [],
            sources_block,
        ),
        schema=ANALYSIS_SCHEMA,
        label="analysis",
    )

    claims = validate_citations(
        [c for c in data.get("claims", []) if isinstance(c, dict)],
        len(outcome.results),
        label="analysis",
    )

    try:
        confidence = int(data.get("icp_fit_confidence", 0))
    except (TypeError, ValueError):
        confidence = 0

    intent = data.get("buying_intent")
    return AnalysisResponse(
        summary=(data.get("summary") or "").strip(),
        current_challenge=(data.get("current_challenge") or "").strip(),
        potential_need=(data.get("potential_need") or "").strip(),
        buying_intent=coerce(intent, BUYING_INTENTS, BUYING_INTENT_FALLBACK),
        icp_fit_confidence=min(max(confidence, 0), 100),
        claims=claims,
        sources=[r.to_dict() for r in outcome.results],
        model_used=client.model,
        search_ok=outcome.ok,
    )
