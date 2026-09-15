"""
Deterministic scoring on top of the AI service's qualitative output.

Why not let the LLM own the final number end to end? Two reasons:
1. Reproducibility — the ICP rules (industry, size, geography) should score
   the same way every time; that shouldn't depend on model sampling.
2. Auditability — a sales lead can be sorted/filtered on a number whose
   components are visible, not a black-box score.

The AI service returns a qualitative read (intent, urgency, ICP opinion,
0-100 confidence); this module blends that with hard ICP rules into the
single `total_score` stored on LeadScore.
"""
from __future__ import annotations

from dataclasses import dataclass

# --- Your ICP rules live here. Edit these for your actual business. -------
ICP_INDUSTRIES = {"b2b saas", "marketing technology", "martech", "manufacturing", "professional services"}
ICP_MIN_EMPLOYEES = 20
ICP_MAX_EMPLOYEES = 5000

INTENT_WEIGHTS = {"high": 40, "medium": 22, "low": 8, "unknown": 0}
URGENCY_WEIGHTS = {"high": 15, "medium": 8, "low": 2, "unknown": 0}


@dataclass
class ScoreBreakdown:
    icp_rule_score: int
    ai_confidence_score: int
    intent_score: int
    urgency_score: int
    total_score: int


def rule_based_icp_score(industry: str | None, employee_count: int | None) -> int:
    """0-30 points from hard rules, independent of any model call."""
    score = 0
    if industry and industry.strip().lower() in ICP_INDUSTRIES:
        score += 18
    if employee_count is not None and ICP_MIN_EMPLOYEES <= employee_count <= ICP_MAX_EMPLOYEES:
        score += 12
    return score


def blended_score(
    *,
    industry: str | None,
    employee_count: int | None,
    ai_icp_fit_confidence: int,  # 0-100, the AI service's own opinion
    buying_intent: str,
    urgency: str,
) -> ScoreBreakdown:
    icp_rule = rule_based_icp_score(industry, employee_count)
    ai_confidence = round(min(max(ai_icp_fit_confidence, 0), 100) * 0.30)  # up to 30 pts
    intent = INTENT_WEIGHTS.get((buying_intent or "unknown").lower(), 0)
    urgency_pts = URGENCY_WEIGHTS.get((urgency or "unknown").lower(), 0)

    total = min(icp_rule + ai_confidence + intent + urgency_pts, 100)

    return ScoreBreakdown(
        icp_rule_score=icp_rule,
        ai_confidence_score=ai_confidence,
        intent_score=intent,
        urgency_score=urgency_pts,
        total_score=total,
    )
