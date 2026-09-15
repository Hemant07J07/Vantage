"""
Cheap change detection, so re-research is spent on companies that moved.

A full research run is four model calls, each preceded by its own web search
and page fetch. Re-running that on a schedule for every account would burn
through a large share of the daily request budget mostly to rediscover that
nothing happened.

This does the cheap half first. It fetches the handful of pages a company
announces itself on, normalises away the parts that change without meaning
anything (clock times, copyright years, build hashes), and hashes what's left.
An identical hash ends the check having spent no model time at all.

Only when the hash moves does one short classification call look at what was
actually added and decide whether it reads as a business event or as noise.
That second gate matters: without it, a reworded hero section would queue the
same expensive pipeline as a funding announcement.

Three outcomes are kept distinct on purpose, because collapsing them is how a
monitor starts lying:
  - unreachable   — nothing could be fetched, so nothing is known
  - unchanged     — fetched successfully and genuinely identical
  - changed       — fetched successfully and different (material or not)
"""
from __future__ import annotations

import difflib
import hashlib
import json
import logging
import re
import time

from .llm_client import LLMClient
from .retrieval.extract import extract
from .retrieval.fetch import fetch_pages

logger = logging.getLogger(__name__)

#: Where companies actually announce things. Missing paths 404 harmlessly —
#: fetch_pages reports them as failures and the rest of the check continues.
CANDIDATE_PATHS = ("", "/careers", "/jobs", "/news", "/blog")

FETCH_BUDGET_SECONDS = 25.0

#: Per-page and total caps on the stored snapshot. The snapshot is sent back on
#: the next check to diff against, so it is kept small enough to store per
#: company and hand over HTTP without thought.
MAX_PAGE_CHARS = 6_000
MAX_SNAPSHOT_CHARS = 20_000

#: How much of the added text the classifier is shown. Enough to recognise an
#: announcement, small enough that the call stays cheap.
MAX_DIFF_CHARS = 2_000

CLASSIFY_NUM_CTX = 4096
CLASSIFY_TIMEOUT = 60.0

_WS = re.compile(r"[ \t]+")

#: Things that differ between two fetches of an unchanged page.
_VOLATILE = (
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b"),
    re.compile(r"\b\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b"),
    re.compile(r"(?:©|\(c\)|copyright)\s*\d{4}(?:\s*[-–]\s*\d{4})?"),
    re.compile(r"\b[0-9a-f]{16,}\b"),
)


def candidate_urls(website: str, domain: str) -> list[str]:
    base = (website or "").strip()
    if not base and domain:
        base = f"https://{domain.strip()}"
    if not base:
        return []
    if not base.startswith(("http://", "https://")):
        base = f"https://{base}"
    base = base.rstrip("/")
    return [f"{base}{path}" for path in CANDIDATE_PATHS]


def normalize(text: str) -> str:
    """
    Lowercase, drop volatile fragments, collapse spacing — keeping line breaks.

    Lines are preserved because the diff is taken line by line; flattening to
    one long string would make every change look like the whole page changed.
    """
    lines: list[str] = []
    for raw in text.lower().splitlines():
        line = raw
        for pattern in _VOLATILE:
            line = pattern.sub("", line)
        line = _WS.sub(" ", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def build_snapshot(pages: dict[str, str]) -> str:
    """
    One normalised, deterministic document from the fetched pages.

    Sorted by URL so that fetch completion order — which varies run to run —
    can never by itself look like a change.
    """
    chunks: list[str] = []
    for url in sorted(pages):
        body = normalize(pages[url])[:MAX_PAGE_CHARS]
        if body:
            chunks.append(f"## {url}\n{body}")
    return "\n\n".join(chunks)[:MAX_SNAPSHOT_CHARS]


def digest(snapshot: str) -> str:
    return hashlib.sha256(snapshot.encode("utf-8")).hexdigest()


def added_text(prior: str, current: str, *, cap: int = MAX_DIFF_CHARS) -> str:
    """The lines present now and absent before — what the classifier judges."""
    diff = difflib.unified_diff(
        prior.splitlines(), current.splitlines(), lineterm="", n=0
    )
    added = [
        line[1:].strip()
        for line in diff
        if line.startswith("+") and not line.startswith("+++")
    ]
    return "\n".join(line for line in added if line)[:cap]


CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "material": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["material", "reason"],
}

CLASSIFY_SYSTEM = """You judge whether a change to a company's website is worth re-researching.

You are given the text that was ADDED to their public pages since the last check.

Answer material=true only for evidence of a real business development:
hiring or new roles, funding or investment, leadership or team changes,
a product or feature launch, a new customer, partnership, office or market,
or a substantive announcement.

Answer material=false for cosmetic or routine changes: reworded copy,
navigation, legal or policy text, styling, reordered content, prices with no
announcement, blog posts about generic topics, or text that carries no news.

Give a reason of at most 15 words, stating what you saw. Reply with JSON only."""


async def classify_change(client: LLMClient, *, company: str, added: str) -> tuple[bool, str]:
    """
    One short call: is this diff a business event?

    A failure here is deliberately reported as material=false with a reason
    that says so. Guessing "true" would queue the full pipeline on a model
    hiccup; silently guessing "false" would hide it. This does neither.
    """
    try:
        message = await client.chat(
            messages=[
                {"role": "system", "content": CLASSIFY_SYSTEM},
                {
                    "role": "user",
                    "content": f"Company: {company}\n\nText added since the last check:\n{added}",
                },
            ],
            json_schema=CLASSIFY_SCHEMA,
            temperature=0.0,
            num_ctx=CLASSIFY_NUM_CTX,
            timeout=CLASSIFY_TIMEOUT,
        )
        payload = json.loads(message.get("content") or "{}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Change classification failed for %s: %s", company, exc)
        return False, f"could not classify the change ({type(exc).__name__})"

    material = bool(payload.get("material"))
    reason = str(payload.get("reason") or "").strip()[:200]
    return material, reason or ("looks material" if material else "looks cosmetic")


async def check_company(
    client: LLMClient,
    *,
    company_name: str,
    domain: str,
    website: str,
    prior_hash: str,
    prior_snapshot: str,
) -> dict:
    urls = candidate_urls(website, domain)
    if not urls:
        return {
            "reachable": False,
            "pages_fetched": 0,
            "changed": False,
            "material": False,
            "new_hash": "",
            "new_snapshot": "",
            "reason": "no website or domain on record to check",
        }

    report = await fetch_pages(urls, deadline=time.monotonic() + FETCH_BUDGET_SECONDS)
    pages: dict[str, str] = {}
    for url, page in report.pages.items():
        if not page.ok:
            continue
        extracted = extract(page.html, url=url)
        if extracted.text:
            pages[url] = extracted.text

    if not pages:
        # Never hashed as "" and stored — an unreachable site would then look
        # identical to every other unreachable site, and the next successful
        # fetch would read as a change that never happened.
        return {
            "reachable": False,
            "pages_fetched": 0,
            "changed": False,
            "material": False,
            "new_hash": "",
            "new_snapshot": "",
            "reason": "none of the pages could be fetched",
        }

    snapshot = build_snapshot(pages)
    new_hash = digest(snapshot)

    result = {
        "reachable": True,
        "pages_fetched": len(pages),
        "changed": False,
        "material": False,
        "new_hash": new_hash,
        "new_snapshot": snapshot,
        "reason": "",
    }

    if not prior_hash:
        # First sighting. There is nothing to compare against, and the company
        # was researched to get here, so this records a baseline rather than
        # reporting a change.
        result["reason"] = "baseline recorded"
        return result

    if new_hash == prior_hash:
        result["reason"] = "no change"
        return result

    result["changed"] = True
    added = added_text(prior_snapshot, snapshot)
    if not added:
        # The hash moved but nothing was added — content was removed or
        # reordered. Not worth a model call, and not worth re-researching.
        result["reason"] = "content removed or reordered, nothing new"
        return result

    material, reason = await classify_change(client, company=company_name or domain, added=added)
    result["material"] = material
    result["reason"] = reason
    return result
