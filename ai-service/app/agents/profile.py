"""Step 1 — build a factual company profile from web sources."""
from __future__ import annotations

import logging

from ..llm_client import LLMClient
from ..prompts import PROFILE_SCHEMA, PROFILE_SYSTEM, build_profile_user, render_sources_block
from ..schemas import CompanyPayload, ProfileResponse
from ..retrieval import enrich
from ..web_search import format_results_for_model, search_multi
from .base import run_json_agent, validate_citations

logger = logging.getLogger(__name__)


def _queries(payload: CompanyPayload) -> list[str]:
    subject = payload.domain or payload.company_name or ""
    if not subject:
        return []
    queries = [f"{subject} company overview what they do"]
    if payload.domain:
        queries.append(f"{payload.domain} about company headquarters employees")
    else:
        queries.append(f"{subject} industry headquarters number of employees")
    return queries


async def run(client: LLMClient, payload: CompanyPayload) -> ProfileResponse:
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
        system=PROFILE_SYSTEM,
        user=build_profile_user(payload.company_name, payload.domain, sources_block),
        schema=PROFILE_SCHEMA,
        label="profile",
    )

    claims = validate_citations(
        [c for c in data.get("claims", []) if isinstance(c, dict)],
        len(outcome.results),
        label="profile",
    )

    employee_count = data.get("employee_count")
    if not isinstance(employee_count, int) or employee_count <= 0:
        employee_count = None

    return ProfileResponse(
        name=(data.get("name") or payload.company_name or "").strip(),
        description=(data.get("description") or "").strip(),
        industry=(data.get("industry") or "").strip(),
        employee_count=employee_count,
        location=(data.get("location") or "").strip(),
        website=payload.website or (f"https://{payload.domain}" if payload.domain else ""),
        claims=claims,
        sources=[r.to_dict() for r in outcome.results],
        model_used=client.model,
        search_ok=outcome.ok,
    )
