"""
Thin client for the ai-service microservice. This is the ONLY place in the
Django codebase that knows the AI service's HTTP shape — if you swap models,
add a new tool, or change the response schema, this is the one file that has
to change on the backend side.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    pass


@dataclass
class QualificationResult:
    icp_fit_confidence: int
    buying_intent: str
    urgency: str
    pain_points: list[str]
    recommended_service: str
    recommended_action: str
    ai_summary: str
    research_notes: str
    model_used: str


def qualify_lead(*, lead_payload: dict) -> QualificationResult:
    """
    Calls POST /qualify on the AI service synchronously.
    Meant to be called from inside a Celery task (see tasks.py), never
    directly from a request/response view — the model call can take
    several seconds and shouldn't block the API.
    """
    url = f"{settings.AI_SERVICE_URL}/qualify"
    try:
        response = httpx.post(url, json=lead_payload, timeout=settings.AI_SERVICE_TIMEOUT_SECONDS)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.exception("AI service call failed")
        raise AIServiceError(str(exc)) from exc

    data = response.json()
    return QualificationResult(
        icp_fit_confidence=data["icp_fit_confidence"],
        buying_intent=data["buying_intent"],
        urgency=data["urgency"],
        pain_points=data.get("pain_points", []),
        recommended_service=data.get("recommended_service", ""),
        recommended_action=data.get("recommended_action", ""),
        ai_summary=data.get("ai_summary", ""),
        research_notes=data.get("research_notes", ""),
        model_used=data.get("model_used", ""),
    )
