from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LeadPayload(BaseModel):
    """What the Django backend sends to POST /qualify."""

    lead_id: int
    contact_name: str
    email: str
    message: str = ""
    company_name: str | None = None
    website: str | None = None
    industry: str | None = None
    employee_count: int | None = None


class CompanyPayload(BaseModel):
    """
    What the research endpoints accept.

    Company-only on purpose: `LeadPayload` requires lead_id/contact_name/email,
    so researching a company nobody has submitted a form for can't reuse it.
    Later steps receive earlier steps' output via known_profile/signals/analysis
    rather than re-deriving it.
    """

    company_name: str | None = None
    domain: str | None = None
    website: str | None = None
    industry: str | None = None
    employee_count: int | None = None
    known_profile: dict[str, Any] | None = None
    signals: list[dict[str, Any]] | None = None
    analysis: dict[str, Any] | None = None


class QualificationResponse(BaseModel):
    """What this service sends back. Django's leads/ai_client.py deserializes
    exactly this shape — keep the two in sync if you change a field."""

    model_config = ConfigDict(protected_namespaces=())

    icp_fit_confidence: int = Field(ge=0, le=100, description="Model's own 0-100 opinion of ICP fit")
    buying_intent: str = Field(description="high | medium | low")
    urgency: str = Field(description="high | medium | low")
    pain_points: list[str] = Field(default_factory=list)
    recommended_service: str = ""
    recommended_action: str = ""
    ai_summary: str = ""
    research_notes: str = ""
    model_used: str = ""


class ProfileResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: str = ""
    description: str = ""
    industry: str = ""
    employee_count: int | None = None
    location: str = ""
    website: str = ""
    claims: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    model_used: str = ""
    # False means search itself errored, as opposed to finding nothing — the
    # difference matters when judging how much to trust the result.
    search_ok: bool = True


class SignalsResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    signals: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    model_used: str = ""
    search_ok: bool = True


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    summary: str = ""
    current_challenge: str = ""
    potential_need: str = ""
    buying_intent: str = "unknown"
    icp_fit_confidence: int = Field(default=0, ge=0, le=100)
    claims: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    model_used: str = ""
    search_ok: bool = True


class RecommendationResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    recommended_services: list[dict[str, Any]] = Field(default_factory=list)
    outreach_subject: str = ""
    recommended_outreach: str = ""
    model_used: str = ""


class HealthResponse(BaseModel):
    status: str
    model_reachable: bool
    model: str
    model_label: str = ""
    model_available: bool = False


class MonitorCheckPayload(BaseModel):
    """
    What POST /monitor/check accepts.

    The prior hash and snapshot come from Django, which stores them per
    company — this service keeps no state of its own between checks.
    """

    company_name: str | None = None
    domain: str | None = None
    website: str | None = None
    prior_hash: str = ""
    prior_snapshot: str = ""


class MonitorCheckResponse(BaseModel):
    """
    The result of one cheap check.

    `reachable` is separate from `changed` deliberately: a site nobody could
    fetch has told us nothing, and reporting that as "unchanged" would let a
    permanently broken domain look like a permanently quiet company.

    `material` is only meaningful when `changed` is true.
    """

    reachable: bool
    pages_fetched: int
    changed: bool
    material: bool
    new_hash: str
    new_snapshot: str
    reason: str
