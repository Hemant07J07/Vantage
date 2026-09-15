"""
HTTP client for the AI service's research endpoints.

The only place in Django that knows the research wire format. Each research
step is a separate bounded request rather than one long call — see the module
docstring in `tasks.py` for why that matters to the timeout budget.

Blocking on purpose: called from Celery, never from a request thread.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class AIResearchError(Exception):
    """The AI service failed, timed out, or returned something unusable."""


@dataclass
class SourceRef:
    """One page the model was shown, as returned by the AI service."""

    url: str
    title: str = ""
    snippet: str = ""
    provider: str = ""
    query: str = ""
    rank: int = 0
    kind: str = "web"


@dataclass
class CitedClaim:
    text: str
    category: str
    confidence: float
    # Indices into the sources list the AI service returned alongside this.
    source_indices: list[int] = field(default_factory=list)


@dataclass
class ProfileResult:
    name: str = ""
    description: str = ""
    industry: str = ""
    employee_count: int | None = None
    location: str = ""
    website: str = ""
    claims: list[CitedClaim] = field(default_factory=list)
    sources: list[SourceRef] = field(default_factory=list)
    model_used: str = ""


@dataclass
class SignalItem:
    type: str
    value: str
    strength: str = "medium"
    detected_at: str | None = None
    source_indices: list[int] = field(default_factory=list)


@dataclass
class SignalsResult:
    signals: list[SignalItem] = field(default_factory=list)
    sources: list[SourceRef] = field(default_factory=list)
    model_used: str = ""


@dataclass
class AnalysisResult:
    summary: str = ""
    current_challenge: str = ""
    potential_need: str = ""
    buying_intent: str = "unknown"
    icp_fit_confidence: int = 0
    claims: list[CitedClaim] = field(default_factory=list)
    sources: list[SourceRef] = field(default_factory=list)
    model_used: str = ""


@dataclass
class RecommendationResult:
    recommended_services: list[dict[str, Any]] = field(default_factory=list)
    recommended_outreach: str = ""
    outreach_subject: str = ""
    model_used: str = ""


def _post(path: str, payload: dict, *, timeout: float | None = None) -> dict:
    url = f"{settings.AI_SERVICE_URL}{path}"
    try:
        response = httpx.post(
            url,
            json=payload,
            timeout=timeout or settings.AI_RESEARCH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        logger.exception("AI research call failed: %s", path)
        raise AIResearchError(f"{path}: {exc}") from exc
    except ValueError as exc:  # malformed JSON body on a 200
        logger.exception("AI research call returned non-JSON: %s", path)
        raise AIResearchError(f"{path}: invalid JSON response") from exc


def _sources(raw: list[dict] | None) -> list[SourceRef]:
    return [
        SourceRef(
            url=item.get("url", ""),
            title=item.get("title", ""),
            snippet=item.get("snippet", ""),
            provider=item.get("provider", ""),
            query=item.get("query", ""),
            rank=item.get("rank", 0),
            kind=item.get("kind", "web"),
        )
        for item in (raw or [])
        if item.get("url")
    ]


def _claims(raw: list[dict] | None) -> list[CitedClaim]:
    claims: list[CitedClaim] = []
    for item in raw or []:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        try:
            confidence = float(item.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        claims.append(
            CitedClaim(
                text=text,
                category=item.get("category", "profile"),
                confidence=min(max(confidence, 0.0), 1.0),
                source_indices=[i for i in item.get("source_ids", []) if isinstance(i, int)],
            )
        )
    return claims


def fetch_profile(*, company_name: str | None, domain: str | None, website: str | None) -> ProfileResult:
    data = _post(
        "/research/profile",
        {"company_name": company_name, "domain": domain, "website": website},
    )
    return ProfileResult(
        name=data.get("name", "") or "",
        description=data.get("description", "") or "",
        industry=data.get("industry", "") or "",
        employee_count=data.get("employee_count"),
        location=data.get("location", "") or "",
        website=data.get("website", "") or "",
        claims=_claims(data.get("claims")),
        sources=_sources(data.get("sources")),
        model_used=data.get("model_used", ""),
    )


def fetch_signals(*, company_name: str | None, domain: str | None, known_profile: dict) -> SignalsResult:
    data = _post(
        "/research/signals",
        {"company_name": company_name, "domain": domain, "known_profile": known_profile},
    )
    signals = []
    for item in data.get("signals", []) or []:
        value = (item.get("value") or "").strip()
        if not value:
            continue
        signals.append(
            SignalItem(
                type=item.get("type", "web"),
                value=value,
                strength=item.get("strength", "medium"),
                detected_at=item.get("detected_at"),
                source_indices=[i for i in item.get("source_ids", []) if isinstance(i, int)],
            )
        )
    return SignalsResult(
        signals=signals,
        sources=_sources(data.get("sources")),
        model_used=data.get("model_used", ""),
    )


def fetch_analysis(*, company_name: str | None, domain: str | None, known_profile: dict, signals: list[dict]) -> AnalysisResult:
    data = _post(
        "/research/analyze",
        {
            "company_name": company_name,
            "domain": domain,
            "known_profile": known_profile,
            "signals": signals,
        },
    )
    try:
        confidence = int(data.get("icp_fit_confidence", 0))
    except (TypeError, ValueError):
        confidence = 0
    return AnalysisResult(
        summary=data.get("summary", "") or "",
        current_challenge=data.get("current_challenge", "") or "",
        potential_need=data.get("potential_need", "") or "",
        buying_intent=data.get("buying_intent", "unknown") or "unknown",
        icp_fit_confidence=min(max(confidence, 0), 100),
        claims=_claims(data.get("claims")),
        sources=_sources(data.get("sources")),
        model_used=data.get("model_used", ""),
    )


def fetch_recommendation(
    *, company_name: str | None, domain: str | None, known_profile: dict, analysis: dict
) -> RecommendationResult:
    data = _post(
        "/research/recommend",
        {
            "company_name": company_name,
            "domain": domain,
            "known_profile": known_profile,
            "analysis": analysis,
        },
    )
    services = [s for s in (data.get("recommended_services") or []) if isinstance(s, dict)]
    return RecommendationResult(
        recommended_services=services,
        recommended_outreach=data.get("recommended_outreach", "") or "",
        outreach_subject=data.get("outreach_subject", "") or "",
        model_used=data.get("model_used", ""),
    )


@dataclass
class MonitorCheck:
    """
    One cheap change check. See ai-service/app/monitor.py.

    `reachable` is kept apart from `changed` so a site that couldn't be fetched
    is never recorded as a company that didn't move.
    """

    reachable: bool
    pages_fetched: int
    changed: bool
    material: bool
    new_hash: str
    new_snapshot: str
    reason: str


def check_for_changes(
    *,
    company_name: str | None,
    domain: str | None,
    website: str | None,
    prior_hash: str,
    prior_snapshot: str,
) -> MonitorCheck:
    data = _post(
        "/monitor/check",
        {
            "company_name": company_name,
            "domain": domain,
            "website": website,
            "prior_hash": prior_hash,
            "prior_snapshot": prior_snapshot,
        },
        timeout=settings.MONITOR_TIMEOUT_SECONDS,
    )
    return MonitorCheck(
        reachable=bool(data.get("reachable")),
        pages_fetched=int(data.get("pages_fetched") or 0),
        changed=bool(data.get("changed")),
        material=bool(data.get("material")),
        new_hash=data.get("new_hash") or "",
        new_snapshot=data.get("new_snapshot") or "",
        reason=data.get("reason") or "",
    )
