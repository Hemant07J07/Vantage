"""
The research pipeline.

Five steps, four of them separate bounded HTTP calls to the AI service and one
(ICP scoring) done here in deterministic Python. Splitting it this way is what
makes the public progress stepper honest: each step's timing is measured, not
choreographed, and a step that fails names itself.

It also fixes the timeout arithmetic. One long call would have had to fit
inside a single HTTP budget; four short ones each get their own.
"""
from __future__ import annotations

import logging
import time
from datetime import timedelta

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from leads.models import Activity, Company
from leads.scoring import blended_score

from . import ai_client, services
from .models import CompanyIntelligence, CompanyWatchState, ResearchJob, Signal

logger = logging.getLogger(__name__)


def _set_step(job: ResearchJob, key: str, state: str, *, detail: str = "", duration_ms: int | None = None) -> None:
    """Update one step in the job's plan and save it for the poller to read."""
    now = timezone.now().isoformat()
    for step in job.steps:
        if step.get("key") != key:
            continue
        step["state"] = state
        step["detail"] = detail
        if state == "active":
            step["started_at"] = now
        elif state in {"done", "failed"}:
            step["finished_at"] = now
            step["duration_ms"] = duration_ms
        break

    job.current_step = key if state == "active" else job.current_step
    job.save(update_fields=["steps", "current_step"])


def _fail(job: ResearchJob, step_key: str, message: str) -> None:
    _set_step(job, step_key, "failed", detail=message[:300])
    job.status = ResearchJob.Status.FAILED
    job.error = message[:2000]
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "error", "finished_at"])
    if job.company_id:
        Activity.objects.create(
            company_id=job.company_id,
            type=Activity.Type.RESEARCH_FAILED,
            description=message[:2000],
            metadata={"job_id": str(job.id)},
        )


@shared_task(bind=True, max_retries=1, default_retry_delay=10)
def run_research_job(self, job_id: str):
    """Research one company end to end, recording evidence as it goes."""
    try:
        job = ResearchJob.objects.select_related("company").get(id=job_id)
    except ResearchJob.DoesNotExist:
        logger.warning("run_research_job: job %s no longer exists", job_id)
        return

    if job.status in {ResearchJob.Status.COMPLETE, ResearchJob.Status.FAILED}:
        logger.info("run_research_job: job %s already %s, skipping", job_id, job.status)
        return

    company = job.company
    if company is None:
        _fail(job, ResearchJob.Step.PROFILE, "No company attached to this research job")
        return

    started = time.monotonic()
    job.status = ResearchJob.Status.RUNNING
    job.save(update_fields=["status"])

    Activity.objects.create(
        company=company,
        type=Activity.Type.RESEARCH_STARTED,
        description=f"Research started for {job.input_query}",
        metadata={"job_id": str(job.id)},
    )

    current = ResearchJob.Step.PROFILE
    try:
        # --- 1. Profile ---------------------------------------------------
        step_started = time.monotonic()
        _set_step(job, ResearchJob.Step.PROFILE, "active")
        profile = ai_client.fetch_profile(
            company_name=company.name,
            domain=company.domain,
            website=company.website or None,
        )
        profile_sources = services.persist_sources(job=job, company=company, refs=profile.sources)
        profile_claims = services.persist_claims(
            job=job, company=company, claims=profile.claims, sources=profile_sources
        )
        _apply_profile(company, profile)
        _set_step(
            job, ResearchJob.Step.PROFILE, "done",
            detail=f"{len(profile_sources)} sources",
            duration_ms=int((time.monotonic() - step_started) * 1000),
        )

        known_profile = {
            "name": company.name,
            "description": company.description,
            "industry": company.industry,
            "employee_count": company.employee_count,
            "location": company.location,
        }

        # --- 2. Signals ---------------------------------------------------
        current = ResearchJob.Step.SIGNALS
        step_started = time.monotonic()
        _set_step(job, ResearchJob.Step.SIGNALS, "active")
        signals_result = ai_client.fetch_signals(
            company_name=company.name, domain=company.domain, known_profile=known_profile
        )
        signal_sources = services.persist_sources(job=job, company=company, refs=signals_result.sources)
        signals = services.persist_signals(
            job=job, company=company, items=signals_result.signals, sources=signal_sources
        )
        _set_step(
            job, ResearchJob.Step.SIGNALS, "done",
            detail=f"{len(signals)} signals",
            duration_ms=int((time.monotonic() - step_started) * 1000),
        )

        # --- 3. Analysis --------------------------------------------------
        current = ResearchJob.Step.ANALYSIS
        step_started = time.monotonic()
        _set_step(job, ResearchJob.Step.ANALYSIS, "active")
        analysis = ai_client.fetch_analysis(
            company_name=company.name,
            domain=company.domain,
            known_profile=known_profile,
            signals=[{"type": s.type, "value": s.value, "strength": s.strength} for s in signals],
        )
        analysis_sources = services.persist_sources(job=job, company=company, refs=analysis.sources)
        analysis_claims = services.persist_claims(
            job=job, company=company, claims=analysis.claims, sources=analysis_sources
        )
        _set_step(
            job, ResearchJob.Step.ANALYSIS, "done",
            duration_ms=int((time.monotonic() - step_started) * 1000),
        )

        # --- 4. ICP scoring (deterministic, no model involved) ------------
        current = ResearchJob.Step.ICP
        step_started = time.monotonic()
        _set_step(job, ResearchJob.Step.ICP, "active")
        breakdown = blended_score(
            industry=company.industry,
            employee_count=company.employee_count,
            ai_icp_fit_confidence=analysis.icp_fit_confidence,
            buying_intent=analysis.buying_intent,
            # A researched account has no inbound message, so there is no
            # urgency signal to read. Scoring it "unknown" (0 points) is the
            # honest reading rather than inventing one.
            urgency="unknown",
        )
        _set_step(
            job, ResearchJob.Step.ICP, "done",
            detail=f"Score {breakdown.total_score}/100",
            duration_ms=int((time.monotonic() - step_started) * 1000),
        )

        # --- 5. Recommendation --------------------------------------------
        current = ResearchJob.Step.RECOMMEND
        step_started = time.monotonic()
        _set_step(job, ResearchJob.Step.RECOMMEND, "active")
        recommendation = ai_client.fetch_recommendation(
            company_name=company.name,
            domain=company.domain,
            known_profile=known_profile,
            analysis={
                "summary": analysis.summary,
                "current_challenge": analysis.current_challenge,
                "potential_need": analysis.potential_need,
                "buying_intent": analysis.buying_intent,
            },
        )
        _set_step(
            job, ResearchJob.Step.RECOMMEND, "done",
            duration_ms=int((time.monotonic() - step_started) * 1000),
        )

    except SoftTimeLimitExceeded:
        _fail(job, current, "Research exceeded its time limit")
        raise
    except ai_client.AIResearchError as exc:
        if self.request.retries >= self.max_retries:
            _fail(job, current, str(exc))
            return
        logger.warning("run_research_job: retrying job %s after %s", job_id, exc)
        raise self.retry(exc=exc)
    except Exception as exc:  # noqa: BLE001
        logger.exception("run_research_job: unexpected failure for job %s", job_id)
        _fail(job, current, f"Unexpected error: {exc}")
        raise

    all_claims = [*profile_claims, *analysis_claims]
    intent = services.normalize_intent(analysis.buying_intent)

    with transaction.atomic():
        previous = CompanyIntelligence.objects.filter(company=company).first()
        previous_score = previous.icp_fit_score if previous else None

        # Research owns the first three stages and recomputes them each run,
        # but it must never pull an account a human has moved on backwards:
        # re-researching an engaged account cannot demote it to "qualified".
        if previous and previous.stage in CompanyIntelligence.MANUAL_STAGES:
            stage = previous.stage
        elif breakdown.total_score >= CompanyIntelligence.QUALIFIED_MIN_SCORE:
            stage = CompanyIntelligence.Stage.QUALIFIED
        else:
            stage = CompanyIntelligence.Stage.RESEARCHING

        CompanyIntelligence.objects.update_or_create(
            company=company,
            defaults={
                "latest_job": job,
                "icp_fit_score": breakdown.total_score,
                "icp_fit_label": services.icp_label(breakdown.total_score),
                "buying_intent": intent,
                # Only a real prior run gives a real delta. First research
                # leaves this null so the UI shows "First research", not "+0%".
                "intent_delta_pct": (
                    breakdown.total_score - previous_score if previous_score is not None else None
                ),
                "research_confidence": services.compute_research_confidence(all_claims),
                "summary": analysis.summary,
                "current_challenge": analysis.current_challenge,
                "potential_need": analysis.potential_need,
                "recommended_services": recommendation.recommended_services,
                "recommended_outreach": recommendation.recommended_outreach,
                "outreach_subject": recommendation.outreach_subject,
                "stage": stage,
                "last_signal_at": max(
                    (s.detected_at for s in signals if s.detected_at), default=None
                ),
            },
        )

        job.status = ResearchJob.Status.COMPLETE
        job.model_used = analysis.model_used or profile.model_used
        job.finished_at = timezone.now()
        job.duration_ms = int((time.monotonic() - started) * 1000)
        job.current_step = ""
        job.save(update_fields=["status", "model_used", "finished_at", "duration_ms", "current_step"])

        Activity.objects.create(
            company=company,
            type=Activity.Type.RESEARCH_COMPLETED,
            description=f"Research complete — ICP fit {breakdown.total_score}/100",
            metadata={"job_id": str(job.id), "score": breakdown.total_score},
        )

    logger.info("run_research_job: %s complete in %sms", job_id, job.duration_ms)


def _apply_profile(company: Company, profile: ai_client.ProfileResult) -> None:
    """
    Fold researched facts into the company row.

    Only fills blanks — a value a human entered on a lead form outranks one the
    model inferred, so an existing industry is never overwritten.
    """
    dirty: list[str] = []
    for field, value in (
        ("name", profile.name),
        ("description", profile.description),
        ("industry", profile.industry),
        ("location", profile.location),
        ("website", profile.website),
    ):
        if value and not getattr(company, field, ""):
            setattr(company, field, value[:255] if field in {"name", "location"} else value)
            dirty.append(field)

    if profile.employee_count and not company.employee_count:
        company.employee_count = profile.employee_count
        dirty.append("employee_count")

    # "Verified" means the domain resolved and at least one page corroborated
    # the profile — not merely that we tried.
    if profile.sources and company.domain and not company.verified:
        company.verified = True
        dirty.append("verified")

    if dirty:
        company.save(update_fields=[*dirty, "updated_at"])


# --- Change monitoring ------------------------------------------------------
#
# Two tasks, deliberately split. The dispatcher is tiny and runs on a beat
# schedule; it only decides *who* is due. The check does the actual work for
# one company, so a slow or failing site delays that company and nothing else.


def _ensure_watch_states() -> int:
    """
    Give every researched company a watch row.

    Done here rather than at the end of a research run so that companies
    researched before monitoring existed are picked up too, and so a row
    deleted by hand simply comes back instead of silently ending monitoring.
    """
    researched = CompanyIntelligence.objects.values_list("company_id", flat=True)
    watched = CompanyWatchState.objects.values_list("company_id", flat=True)
    missing = set(researched) - set(watched)

    now = timezone.now()
    if missing:
        CompanyWatchState.objects.bulk_create(
            [
                CompanyWatchState(company_id=company_id, next_check_at=now, next_trend_scan_at=now)
                for company_id in missing
            ],
            ignore_conflicts=True,
        )

    # A NULL next_trend_scan_at (rows created before trend scanning existed)
    # would never match a `__lte=now` filter, silently opting those companies
    # out forever. This is a one-time backfill, not an ongoing cost — it's a
    # no-op once every row has a value.
    backfilled = CompanyWatchState.objects.filter(next_trend_scan_at__isnull=True).update(
        next_trend_scan_at=now
    )
    return len(missing) + backfilled


@shared_task
def dispatch_due_monitor_checks():
    """Enqueue a check for each company whose next check has come due."""
    if not settings.MONITOR_ENABLED:
        return "monitoring disabled (MONITOR_ENABLED)"

    _ensure_watch_states()

    now = timezone.now()
    due = list(
        CompanyWatchState.objects.filter(next_check_at__lte=now)
        .values_list("id", "company_id")[: settings.MONITOR_MAX_BATCH]
    )
    if not due:
        return "nothing due"

    # Push the next check out before enqueueing, so a tick that lands while
    # these are still running doesn't queue them a second time. Whatever the
    # check itself decides overwrites this.
    CompanyWatchState.objects.filter(id__in=[row[0] for row in due]).update(
        next_check_at=now + timedelta(hours=settings.MONITOR_BASE_INTERVAL_HOURS)
    )

    for _, company_id in due:
        check_company_for_changes.delay(company_id)
    return f"queued {len(due)} check(s)"


@shared_task
def check_company_for_changes(company_id: int):
    """
    Cheap check for one company; full research only if something moved.

    The expensive path is the same `run_research_job` a person triggers — this
    decides whether to spend it, it doesn't reimplement it.
    """
    try:
        state = CompanyWatchState.objects.select_related("company").get(company_id=company_id)
    except CompanyWatchState.DoesNotExist:
        logger.warning("No watch state for company_id=%s", company_id)
        return "no watch state"

    company = state.company
    is_baseline = not state.content_hash
    try:
        result = ai_client.check_for_changes(
            company_name=company.name,
            domain=company.domain,
            website=company.website,
            prior_hash=state.content_hash,
            prior_snapshot=state.content_snapshot,
        )
    except ai_client.AIResearchError as exc:
        # Recorded as "could not be checked", never as "did not change" — the
        # difference is the whole point of monitoring being trustworthy.
        state.record_unreachable(f"check failed: {exc}"[:200])
        return "check failed"
    except SoftTimeLimitExceeded:
        state.record_unreachable("check timed out")
        return "check timed out"

    if not result.reachable:
        state.record_unreachable(result.reason)
        return f"unreachable: {result.reason}"

    if not result.changed:
        if is_baseline:
            state.record_baseline(result.new_hash, result.new_snapshot, result.reason)
        else:
            state.record_unchanged(result.new_hash, result.new_snapshot, result.reason)
        return result.reason

    state.record_changed(result.new_hash, result.new_snapshot, result.reason)
    Activity.objects.create(
        company_id=company.id,
        type=Activity.Type.CHANGE_DETECTED,
        description=result.reason,
        metadata={"material": result.material, "pages_fetched": result.pages_fetched},
    )

    if not result.material:
        return f"changed, not material: {result.reason}"

    in_flight = ResearchJob.objects.filter(
        company=company,
        status__in=[ResearchJob.Status.QUEUED, ResearchJob.Status.RUNNING],
    ).exists()
    if in_flight:
        return "changed, but research already in flight"

    job = ResearchJob.objects.create(
        company=company,
        input_query=company.domain or company.name,
        normalized_domain=company.domain or "",
        steps=ResearchJob.initial_steps(),
        trigger_type=ResearchJob.Trigger.SCHEDULED,
        trigger_reason=result.reason,
    )
    run_research_job.delay(str(job.id))
    return f"re-researching: {result.reason}"


# --- Trend scanning ----------------------------------------------------------
#
# Distinct from the change monitoring above on purpose. That mechanism hashes
# a company's OWN pages and is mostly free — it only calls the model when its
# own-page hash actually moves, which is why its worker can run at
# --concurrency=4. This one runs a REAL web search every single call (funding /
# hiring / news queries via the same infra a manual "Research" click uses), so
# every invocation reaches the model provider. It gets its own queue at
# --concurrency=1 — mixing it onto the monitor queue would burn through the
# provider's per-minute rate limit fast and risks genuinely concurrent
# requests queueing up and blowing past their HTTP timeouts, the exact failure
# mode documented on `qualify-worker` in docker-compose.yml.


@shared_task
def dispatch_due_trend_scans():
    """Enqueue a trend scan for each company whose next scan has come due."""
    if not settings.TREND_SCAN_ENABLED:
        return "trend scanning disabled (TREND_SCAN_ENABLED)"

    _ensure_watch_states()

    now = timezone.now()
    due = list(
        CompanyWatchState.objects.filter(next_trend_scan_at__lte=now)
        .values_list("id", "company_id")[: settings.TREND_SCAN_MAX_BATCH]
    )
    if not due:
        return "nothing due"

    # Claimed before enqueueing, same reasoning as the monitor dispatcher: a
    # tick that's still running when the next one fires must not double-queue.
    CompanyWatchState.objects.filter(id__in=[row[0] for row in due]).update(
        next_trend_scan_at=now + timedelta(hours=settings.TREND_SCAN_INTERVAL_HOURS)
    )

    for _, company_id in due:
        scan_company_trends.delay(company_id)
    return f"queued {len(due)} trend scan(s)"


@shared_task
def scan_company_trends(company_id: int):
    """
    Search the open web for what's new about one company.

    Every real finding is logged as a lightweight ResearchJob so `Source`'s
    (job, url) uniqueness constraint has something real to key on — passing
    job=None here would let one company's cached article silently attach to
    a different company's Source row the next time the same URL turns up.

    A high-strength new signal escalates to the full pipeline via the same
    `run_research_job` a manual click uses; this task never recomputes ICP
    score or summary itself.
    """
    try:
        state = CompanyWatchState.objects.select_related("company").get(company_id=company_id)
    except CompanyWatchState.DoesNotExist:
        logger.warning("No watch state for company_id=%s", company_id)
        return "no watch state"

    company = state.company

    if not (company.domain or company.website):
        # Nothing to search against. The schedule already advanced in the
        # dispatcher, so this isn't retried every tick — but it's reported
        # honestly rather than looking like a scan that ran and found nothing.
        return "no domain or website on record — nothing to scan"

    in_flight = ResearchJob.objects.filter(
        company=company,
        status__in=[ResearchJob.Status.QUEUED, ResearchJob.Status.RUNNING],
    ).exists()
    if in_flight:
        return "research already in flight — scan skipped"

    job = ResearchJob.objects.create(
        company=company,
        input_query=company.domain or company.name,
        normalized_domain=company.domain or "",
        trigger_type=ResearchJob.Trigger.SCHEDULED,
        trigger_reason="periodic trend scan",
    )

    def _finish(reason: str) -> None:
        job.status = ResearchJob.Status.COMPLETE
        job.trigger_reason = reason[:200]
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "trigger_reason", "finished_at"])
        state.last_trend_scan_at = timezone.now()
        state.save(update_fields=["last_trend_scan_at"])

    try:
        result = ai_client.fetch_signals(
            company_name=company.name, domain=company.domain, known_profile={}
        )
    except ai_client.AIResearchError as exc:
        job.status = ResearchJob.Status.FAILED
        job.error = str(exc)[:2000]
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error", "finished_at"])
        return f"scan failed: {exc}"
    except SoftTimeLimitExceeded:
        job.status = ResearchJob.Status.FAILED
        job.error = "scan timed out"
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error", "finished_at"])
        return "scan timed out"

    new_items = services.signals_not_yet_seen(
        company=company, items=result.signals, within_days=settings.TREND_SCAN_SIGNAL_DEDUPE_DAYS
    )

    if not new_items:
        _finish("no new signals")
        return "no new signals"

    is_high = any(item.strength == Signal.Strength.HIGH for item in new_items)

    # Text dedup alone isn't enough here: observed in testing, the same event
    # ("Linear raised $82M...") came back reworded by the model on the very
    # next scan and read as a brand-new high-strength signal, which would
    # escalate to a second full research run minutes after the first one
    # finished. A cooldown on RECENT completed research closes that gap
    # without needing fuzzy text matching — if something this material was
    # already researched a moment ago, it's almost certainly the same event.
    recently_researched = ResearchJob.objects.filter(
        company=company,
        status=ResearchJob.Status.COMPLETE,
        finished_at__gte=timezone.now() - timedelta(hours=settings.TREND_SCAN_INTERVAL_HOURS),
    ).exists()

    if is_high and not recently_researched:
        # Discard this probe's own results — the full pipeline redoes its own
        # signals search as one of its steps and persists that properly. If
        # both were persisted, the same finding could end up stored twice.
        headline = next(i.value for i in new_items if i.strength == Signal.Strength.HIGH)
        job.steps = ResearchJob.initial_steps()
        job.trigger_reason = f"new high-strength signal: {headline}"[:200]
        job.save(update_fields=["steps", "trigger_reason"])
        run_research_job.delay(str(job.id))
        state.last_trend_scan_at = timezone.now()
        state.save(update_fields=["last_trend_scan_at"])
        return f"escalating to full research: {headline}"

    stored_sources = services.persist_sources(job=job, company=company, refs=result.sources)
    services.persist_signals(job=job, company=company, items=new_items, sources=stored_sources)

    intel = CompanyIntelligence.objects.filter(company=company).first()
    if intel:
        intel.last_signal_at = timezone.now()
        intel.save(update_fields=["last_signal_at"])

    _finish(f"found {len(new_items)} new signal(s)")
    return f"found {len(new_items)} new signal(s), not escalated"
