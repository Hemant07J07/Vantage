"""
The vocabularies and thresholds the UI must not invent for itself.

Every value here previously existed twice: once in Python, where it decided
what the system actually did, and once in TypeScript, where it decided what
the user was told. Those copies drift silently — raising
`HIGH_INTENT_THRESHOLD` changed which leads the backend flagged while the
dashboard carried on colouring gauges by the old number, and nothing failed.

This follows the pattern the AI service already set with its `/icp` endpoint:
publish the constants so the other side can read them rather than restate
them.

Presentation is deliberately *not* here. Which colour a signal pill is, or
how a card is laid out, is the frontend's business; this endpoint publishes
only the things that carry meaning.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from intelligence.models import CompanyIntelligence, ResearchClaim, ResearchJob, Signal, Source
from leads.models import Lead

from .views import SCORE_BANDS


def _choices(enum) -> list[dict]:
    return [{"key": value, "label": label} for value, label in enum.choices]


class MetaView(APIView):
    """Vocabularies and thresholds, read straight off the models and settings."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {
                "thresholds": {
                    # The score at which a lead is treated as high intent.
                    # Environment-configurable, which is precisely why the
                    # frontend must read it rather than hardcode 75.
                    "high_intent_score": settings.HIGH_INTENT_THRESHOLD,
                    "qualified_min_score": CompanyIntelligence.QUALIFIED_MIN_SCORE,
                    "min_trend_points": settings.MIN_TREND_POINTS,
                    "min_trend_days": settings.MIN_TREND_DAYS,
                    # Ceiling applied to any claim no page backs up.
                    "unsourced_confidence_cap": ResearchClaim.CONFIDENCE_CAP_UNSOURCED,
                },
                "pipeline_stages": CompanyIntelligence.stage_vocabulary(),
                "score_bands": [
                    {"label": label, "min": low, "max": high}
                    for label, low, high in SCORE_BANDS
                ],
                "signal_types": _choices(Signal.Type),
                "signal_strengths": _choices(Signal.Strength),
                "source_kinds": _choices(Source.Kind),
                "buying_intents": _choices(CompanyIntelligence.Intent),
                "lead_statuses": _choices(Lead.Status),
                "lead_sources": _choices(Lead.Source),
                "research_steps": _choices(ResearchJob.Step),
            }
        )
