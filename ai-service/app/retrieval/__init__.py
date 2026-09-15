"""
Retrieval: turn search results into page content the model can actually read.

`enrich(outcome, deadline=...)` is the whole public surface. It fetches the
pages behind a `SearchOutcome`, extracts their prose, and writes it back onto
each `SearchResult.text`. Everything downstream — prompt rendering, and later
chunking and embedding — reads that field.

Degradation is the point of the design, not an afterthought. Blocked hosts,
robots.txt denials, timeouts and slow sites are all normal; any result without
text keeps its search snippet and is still citable. The caller gets a
`FetchReport` so it can say *how* thin the evidence was instead of implying it
was complete.
"""
from __future__ import annotations

import asyncio
import logging
import time

from ..web_search import SearchOutcome
from ..canonical import canonical_url
from .extract import extract
from .fetch import MAX_TEXT_CHARS, FetchReport, fetch_pages

logger = logging.getLogger(__name__)

#: How long enrichment may take before returning whatever it has.
DEFAULT_FETCH_BUDGET_SECONDS = 45.0


async def enrich(
    outcome: SearchOutcome,
    *,
    budget_seconds: float = DEFAULT_FETCH_BUDGET_SECONDS,
) -> FetchReport:
    """
    Fetch and extract the pages behind `outcome`, mutating its results in place.

    Returns the report describing what was and wasn't retrieved.
    """
    if not outcome.results:
        return FetchReport()

    deadline = time.monotonic() + budget_seconds
    report = await fetch_pages([r.url for r in outcome.results], deadline=deadline)

    if not report.pages:
        logger.info(
            "No pages fetched (attempted=%s blocked=%s robots=%s failed=%s deadline=%s)",
            report.attempted, report.blocked, report.robots_denied,
            report.failed, report.deadline_hit,
        )
        return report

    # Extraction is CPU-bound parsing; run it off the event loop so it doesn't
    # stall anything else the service is serving.
    def _extract_all() -> dict[str, tuple[str, str | None]]:
        out = {}
        for canon, page in report.pages.items():
            parsed = extract(page.html, url=page.url)
            if parsed.text:
                out[canon] = (parsed.text[:MAX_TEXT_CHARS], parsed.published_at)
        return out

    extracted = await asyncio.to_thread(_extract_all)

    enriched = 0
    for result in outcome.results:
        canon = canonical_url(result.url)
        if canon in extracted:
            text, published = extracted[canon]
            result.text = text
            result.published_at = published
            enriched += 1

    logger.info(
        "Enriched %s/%s results with page text (fetched=%s blocked=%s robots=%s failed=%s)",
        enriched, len(outcome.results), report.succeeded,
        report.blocked, report.robots_denied, report.failed,
    )
    return report


__all__ = ["enrich", "FetchReport", "canonical_url", "DEFAULT_FETCH_BUDGET_SECONDS"]
