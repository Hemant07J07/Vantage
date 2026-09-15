import logging

from asgiref.sync import async_to_sync
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction

from .ai_client import AIServiceError, qualify_lead
from .models import Activity, AIQualification, Assignment, Lead, LeadScore
from .scoring import blended_score
from .serializers import LeadListSerializer

logger = logging.getLogger(__name__)


def _broadcast(event_type: str, payload: dict) -> None:
    """Push a message to every dashboard client connected over websocket."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        "dashboard",
        {"type": "dashboard.event", "event": event_type, "payload": payload},
    )


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def qualify_lead_task(self, lead_id: int):
    """
    The core V1 loop, running off the request thread:
    lead -> AI service (model provider + optional web search) -> score -> route -> broadcast
    """
    try:
        lead = Lead.objects.select_related("company").get(id=lead_id)
    except Lead.DoesNotExist:
        logger.warning("qualify_lead_task: lead %s no longer exists", lead_id)
        return

    lead.status = Lead.Status.QUALIFYING
    lead.save(update_fields=["status"])
    _broadcast("lead.status", {"lead_id": lead.id, "status": lead.status})

    payload = {
        "lead_id": lead.id,
        "contact_name": lead.contact_name,
        "email": lead.email,
        "message": lead.message,
        "company_name": lead.company.name if lead.company else None,
        "website": lead.company.website if lead.company else None,
        "industry": lead.company.industry if lead.company else None,
        "employee_count": lead.company.employee_count if lead.company else None,
    }

    try:
        result = qualify_lead(lead_payload=payload)
    except AIServiceError as exc:
        # Only record a terminal failure once retries are genuinely exhausted.
        # Marking FAILED on every attempt (as this used to) left a misleading
        # trail of "qualification_failed" rows behind leads that then succeeded.
        if self.request.retries >= self.max_retries:
            _mark_failed(lead, f"AI service unavailable after retries: {exc}")
            return
        logger.warning(
            "qualify_lead_task: AI service error for lead %s (attempt %s/%s): %s",
            lead_id, self.request.retries + 1, self.max_retries + 1, exc,
        )
        raise self.retry(exc=exc)
    except SoftTimeLimitExceeded:
        _mark_failed(lead, "Qualification exceeded its time limit")
        raise
    except Exception as exc:  # noqa: BLE001
        # Anything else — a DataError from an over-long model response, a bug —
        # must still leave the lead in a terminal, visible state. Without this
        # the lead sat in `qualifying` forever with no retry and no audit row.
        logger.exception("qualify_lead_task: unexpected failure for lead %s", lead_id)
        _mark_failed(lead, f"Unexpected error: {exc}")
        raise

    breakdown = blended_score(
        industry=lead.company.industry if lead.company else None,
        employee_count=lead.company.employee_count if lead.company else None,
        ai_icp_fit_confidence=result.icp_fit_confidence,
        buying_intent=result.buying_intent,
        urgency=result.urgency,
    )

    try:
        # One transaction: a lead must never end up with a score but no
        # qualification, or a status that contradicts either.
        with transaction.atomic():
            LeadScore.objects.update_or_create(
                lead=lead,
                defaults={
                    "icp_fit_score": breakdown.icp_rule_score + breakdown.ai_confidence_score,
                    "buying_intent": result.buying_intent,
                    "urgency": result.urgency,
                    "intent_score": breakdown.intent_score,
                    "urgency_score": breakdown.urgency_score,
                    "total_score": breakdown.total_score,
                },
            )

            AIQualification.objects.update_or_create(
                lead=lead,
                defaults={
                    "pain_points": result.pain_points,
                    "recommended_service": result.recommended_service,
                    "recommended_action": result.recommended_action,
                    "ai_summary": result.ai_summary,
                    "research_notes": result.research_notes,
                    "model_used": result.model_used,
                },
            )

            if breakdown.total_score >= settings.HIGH_INTENT_THRESHOLD:
                lead.status = Lead.Status.HIGH_INTENT
                Activity.objects.create(
                    lead=lead, company=lead.company, type=Activity.Type.HIGH_INTENT,
                    description=f"Score {breakdown.total_score} crossed the high-intent threshold",
                )
                _auto_assign(lead)
            else:
                lead.status = Lead.Status.NURTURE
                Activity.objects.create(
                    lead=lead, company=lead.company, type=Activity.Type.NURTURE,
                    description=f"Score {breakdown.total_score} routed to nurture",
                )

            lead.save(update_fields=["status"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("qualify_lead_task: failed persisting result for lead %s", lead_id)
        _mark_failed(lead, f"Could not save qualification: {exc}")
        raise

    fresh = Lead.objects.select_related("company", "score").get(id=lead.id)
    _broadcast("lead.qualified", LeadListSerializer(fresh).data)


def _mark_failed(lead: Lead, reason: str) -> None:
    """Put a lead in a terminal, explainable state and tell the dashboard."""
    lead.status = Lead.Status.FAILED
    lead.save(update_fields=["status"])
    Activity.objects.create(
        lead=lead,
        company=lead.company,
        type=Activity.Type.QUALIFICATION_FAILED,
        description=reason[:2000],
    )
    _broadcast("lead.status", {"lead_id": lead.id, "status": lead.status})


def _auto_assign(lead: Lead) -> None:
    """Round-robin-free v1 assignment: hand it to whichever staff user has
    the fewest open assignments. Good enough for a small team; swap for
    real territory/round-robin rules once that matters."""
    from django.contrib.auth import get_user_model
    from django.db.models import Count

    User = get_user_model()
    candidate = (
        User.objects.filter(is_staff=True)
        .annotate(load=Count("assignments"))
        .order_by("load")
        .first()
    )
    if not candidate:
        return

    Assignment.objects.update_or_create(lead=lead, defaults={"user": candidate})
    Activity.objects.create(
        lead=lead,
        company=lead.company,
        type=Activity.Type.ASSIGNED,
        description=f"Auto-assigned to {candidate.username}",
    )
