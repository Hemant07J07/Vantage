"""
Turning raw AI output into persisted, checkable evidence.

Two rules live here rather than in the model layer, because they're policy
rather than schema:

1. **An unsourced claim is capped.** If the model asserts something but cites
   no page, it inferred it. Those are held at CONFIDENCE_CAP_UNSOURCED so a
   guess can never outrank a fact, and the UI marks them distinctly.
2. **Research confidence is computed, never asked for.** Ask a model how
   confident it is and you get a number it made up. Deriving it from claim
   confidence and source coverage means it falls honestly when search fails.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from urllib.parse import urlparse

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from leads.models import Company
from .ai_client import CitedClaim, SignalItem, SourceRef
from .models import CompanyIntelligence, ResearchClaim, ResearchJob, Signal, Source

logger = logging.getLogger(__name__)

# Source coverage is considered "full" at this many distinct pages. Below it,
# research confidence is scaled down proportionally.
FULL_COVERAGE_SOURCES = 5

_JOB_BOARD_HINTS = ("greenhouse.io", "lever.co", "workable.com", "ashbyhq.com", "smartrecruiters.com")
_NEWS_HINTS = ("techcrunch.", "reuters.", "bloomberg.", "forbes.", "businesswire.", "prnewswire.", "/news/", "/press")


def classify_source(url: str, company_domain: str | None) -> str:
    """Bucket a URL so the UI can show a meaningful chip instead of 'web'."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return Source.Kind.WEB

    host = (parsed.netloc or "").lower().removeprefix("www.")
    path = (parsed.path or "").lower()

    if company_domain and (host == company_domain or host.endswith(f".{company_domain}")):
        return Source.Kind.WEBSITE
    if "linkedin.com" in host:
        return Source.Kind.LINKEDIN
    if "crunchbase.com" in host:
        return Source.Kind.CRUNCHBASE
    if any(hint in host for hint in _JOB_BOARD_HINTS) or any(
        seg in path for seg in ("/jobs", "/careers", "/job/")
    ):
        return Source.Kind.JOBS
    if any(hint in host or hint in path for hint in _NEWS_HINTS):
        return Source.Kind.NEWS
    return Source.Kind.WEB


def persist_sources(
    *, job: ResearchJob, company: Company, refs: list[SourceRef]
) -> list[Source]:
    """
    Store the pages a step consulted, returning them positionally.

    The returned list is index-aligned with `refs` so a claim citing "[S2]" can
    be resolved back to a row. De-duplicated per job by URL, since the same
    page routinely surfaces across several queries.
    """
    stored: list[Source] = []
    seen: dict[str, Source] = {}

    for index, ref in enumerate(refs):
        if not ref.url:
            continue
        if ref.url in seen:
            stored.append(seen[ref.url])
            continue

        source, _ = Source.objects.get_or_create(
            job=job,
            url=ref.url[:1000],
            defaults={
                "company": company,
                "title": ref.title[:500],
                "snippet": ref.snippet,
                "provider": ref.provider[:40],
                "query": ref.query[:500],
                "rank": ref.rank or index,
                "kind": ref.kind if ref.kind in Source.Kind.values else classify_source(ref.url, company.domain),
                "fetched_at": timezone.now(),
            },
        )
        seen[ref.url] = source
        stored.append(source)

    return stored


def persist_claims(
    *,
    job: ResearchJob,
    company: Company,
    claims: list[CitedClaim],
    sources: list[Source],
) -> list[ResearchClaim]:
    """
    Store claims and wire each to the sources it cited.

    Out-of-range citation indices are dropped rather than trusted: models
    routinely cite [S9] when shown six results. The drop rate is logged because
    it's a good early signal that a prompt or model change has degraded.
    """
    created: list[ResearchClaim] = []
    dropped = 0
    total_refs = 0

    for claim in claims:
        resolved = []
        for index in claim.source_indices:
            total_refs += 1
            if 0 <= index < len(sources):
                resolved.append(sources[index])
            else:
                dropped += 1

        confidence = claim.confidence
        if not resolved:
            # Nothing backs this up — treat it as an inference, not a finding.
            confidence = min(confidence, ResearchClaim.CONFIDENCE_CAP_UNSOURCED)

        row = ResearchClaim.objects.create(
            job=job,
            company=company,
            text=claim.text,
            category=claim.category if claim.category in ResearchClaim.Category.values else ResearchClaim.Category.PROFILE,
            confidence=confidence,
        )
        if resolved:
            row.sources.set(resolved)
        created.append(row)

    if dropped:
        logger.warning(
            "Dropped %s/%s hallucinated source citations for job %s",
            dropped, total_refs, job.id,
        )
    return created


def persist_signals(*, job: ResearchJob, company: Company, items, sources: list[Source]) -> list[Signal]:
    created: list[Signal] = []
    for item in items:
        detected_at = None
        if item.detected_at:
            parsed = parse_datetime(item.detected_at) if isinstance(item.detected_at, str) else item.detected_at
            if isinstance(parsed, datetime):
                detected_at = parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)

        signal = Signal.objects.create(
            job=job,
            company=company,
            type=item.type if item.type in Signal.Type.values else Signal.Type.WEB,
            value=item.value[:255],
            strength=item.strength if item.strength in Signal.Strength.values else Signal.Strength.MEDIUM,
            detected_at=detected_at,
        )
        resolved = [sources[i] for i in item.source_indices if 0 <= i < len(sources)]
        if resolved:
            signal.sources.set(resolved)
        created.append(signal)
    return created


def signals_not_yet_seen(*, company: Company, items: list[SignalItem], within_days: int) -> list[SignalItem]:
    """
    Filter a fresh signals search down to what this company doesn't already have.

    Exact-text comparison, case/whitespace-normalized — not fuzzy matching.
    Deliberately cheap: a rephrased version of the same headline can still slip
    through as "new". That's a known gap, not a promise of perfect dedup, and
    it's the honest trade against running a second model call just to compare.
    """
    if not items:
        return []
    cutoff = timezone.now() - timedelta(days=within_days)
    seen = {
        " ".join(value.split()).lower()
        for value in Signal.objects.filter(company=company, observed_at__gte=cutoff)
        .values_list("value", flat=True)
    }
    return [item for item in items if " ".join(item.value.split()).lower() not in seen]


def compute_research_confidence(claims: list[ResearchClaim]) -> int:
    """
    0-100, derived from how well-evidenced the claims actually are.

    Two factors: the mean confidence of the claims themselves, scaled by how
    many distinct pages backed them. A single-source answer is capped low no
    matter how sure the model sounded.
    """
    if not claims:
        return 0

    mean_confidence = sum(c.confidence for c in claims) / len(claims)
    distinct_sources = {
        source_id
        for claim in claims
        for source_id in claim.sources.values_list("id", flat=True)
    }
    coverage = min(1.0, len(distinct_sources) / FULL_COVERAGE_SOURCES)
    return round(100 * mean_confidence * coverage)


def icp_label(score: int) -> str:
    if score >= 80:
        return "Excellent"
    if score >= 60:
        return "Strong"
    if score >= 40:
        return "Moderate"
    return "Weak"


def normalize_intent(value: str | None) -> str:
    candidate = (value or "unknown").strip().lower()
    return candidate if candidate in CompanyIntelligence.Intent.values else CompanyIntelligence.Intent.UNKNOWN
