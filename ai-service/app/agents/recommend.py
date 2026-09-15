"""Step 4 — turn the analysis into a concrete next action."""
from __future__ import annotations

import logging

from ..llm_client import LLMClient
from ..prompts import RECOMMEND_SCHEMA, RECOMMEND_SYSTEM, build_recommend_user
from ..schemas import CompanyPayload, RecommendationResponse
from .base import run_json_agent

logger = logging.getLogger(__name__)

MAX_SERVICES = 3


async def run(client: LLMClient, payload: CompanyPayload) -> RecommendationResponse:
    # No search here: this step reasons over what the earlier steps established
    # rather than gathering anything new, so it's the fastest of the four.
    data = await run_json_agent(
        client,
        system=RECOMMEND_SYSTEM,
        user=build_recommend_user(
            payload.company_name, payload.known_profile or {}, payload.analysis or {}
        ),
        schema=RECOMMEND_SCHEMA,
        temperature=0.3,  # a little latitude: this is the one drafting prose
        label="recommend",
    )

    services = [
        {
            "title": (s.get("title") or "").strip()[:120],
            "rationale": (s.get("rationale") or "").strip()[:400],
        }
        for s in (data.get("recommended_services") or [])
        if isinstance(s, dict) and (s.get("title") or "").strip()
    ][:MAX_SERVICES]

    return RecommendationResponse(
        recommended_services=services,
        outreach_subject=(data.get("outreach_subject") or "").strip()[:255],
        recommended_outreach=(data.get("recommended_outreach") or "").strip(),
        model_used=client.model,
    )
