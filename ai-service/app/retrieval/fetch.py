"""
Fetching the pages behind search results.

Until now the model only ever saw search-engine snippets — roughly 150
characters of SEO blurb — which is why a "hiring signal" could read
"641 Oslo Hq Jobs in India": that is a result *title*, not intelligence. This
module is what puts the actual page in front of the model.

Three rules are enforced here rather than left to callers:

* **A blocklist that is code, not convention.** LinkedIn, X, Instagram,
  Facebook and Crunchbase are never fetched. Their terms forbid it, and in
  practice they serve auth walls and HTTP 999 to datacentre IPs anyway. They
  remain perfectly good *search results* — we cite the snippet and link out.
* **robots.txt is honoured**, per host, cached for the process lifetime.
* **Budgets are hard.** A research step has ~150s end to end; fetching cannot
  be allowed to consume it. Everything is bounded by a deadline, and a partial
  corpus is an acceptable, reportable outcome.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from ..canonical import canonical_url, registrable_host

logger = logging.getLogger(__name__)

# Identifiable, with a contact path. Anonymous scrapers are what make site
# operators block whole IP ranges.
USER_AGENT = "VantageResearchBot/1.0 (+https://github.com/vantage; research@vantage.local)"

#: Never fetched. Search snippets only. See the module docstring.
BLOCKED_HOSTS = frozenset(
    {
        "linkedin.com",
        "x.com",
        "twitter.com",
        "instagram.com",
        "facebook.com",
        "threads.net",
        "crunchbase.com",
        "glassdoor.com",
        "indeed.com",
    }
)

MAX_PAGES = 20
MAX_BYTES = 2_000_000
MAX_TEXT_CHARS = 60_000

GLOBAL_CONCURRENCY = 8
PER_DOMAIN_CONCURRENCY = 2
PER_DOMAIN_GAP_SECONDS = 0.4

CONNECT_TIMEOUT = 5.0
READ_TIMEOUT = 12.0

_CONTENT_OK = ("text/html", "application/xhtml", "text/plain", "application/json", "application/xml")


@dataclass
class FetchedPage:
    url: str
    canonical: str
    status: int = 0
    html: str = ""
    content_type: str = ""
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.status == 200 and bool(self.html)


@dataclass
class FetchReport:
    """What actually happened, so the caller can report it instead of guessing."""

    pages: dict[str, FetchedPage] = field(default_factory=dict)
    attempted: int = 0
    succeeded: int = 0
    blocked: int = 0
    robots_denied: int = 0
    failed: int = 0
    deadline_hit: bool = False


def is_blocked(url: str) -> bool:
    return registrable_host(url) in BLOCKED_HOSTS


class _RobotsCache:
    """robots.txt per host, fetched once. Failures are treated as permissive."""

    def __init__(self) -> None:
        self._parsers: dict[str, RobotFileParser | None] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def allows(self, client: httpx.AsyncClient, url: str) -> bool:
        try:
            parts = urlsplit(url)
        except ValueError:
            return False
        origin = f"{parts.scheme}://{parts.netloc}"

        if origin not in self._parsers:
            lock = self._locks.setdefault(origin, asyncio.Lock())
            async with lock:
                if origin not in self._parsers:
                    self._parsers[origin] = await self._load(client, origin)

        parser = self._parsers[origin]
        if parser is None:
            # No robots.txt, or it was unreachable. The convention is that
            # absent robots.txt means "allowed" — we do not invent a denial.
            return True
        return parser.can_fetch(USER_AGENT, url)

    async def _load(self, client: httpx.AsyncClient, origin: str) -> RobotFileParser | None:
        try:
            resp = await client.get(f"{origin}/robots.txt", timeout=5.0)
        except httpx.HTTPError:
            return None
        if resp.status_code != 200 or not resp.text:
            return None
        parser = RobotFileParser()
        parser.parse(resp.text.splitlines())
        return parser


class _DomainLimiter:
    """Concurrency cap plus a minimum gap between requests to one domain."""

    def __init__(self) -> None:
        self._sems: dict[str, asyncio.Semaphore] = {}
        self._last: dict[str, float] = {}

    def semaphore(self, host: str) -> asyncio.Semaphore:
        if host not in self._sems:
            self._sems[host] = asyncio.Semaphore(PER_DOMAIN_CONCURRENCY)
        return self._sems[host]

    async def pace(self, host: str) -> None:
        elapsed = time.monotonic() - self._last.get(host, 0.0)
        if elapsed < PER_DOMAIN_GAP_SECONDS:
            await asyncio.sleep(PER_DOMAIN_GAP_SECONDS - elapsed)
        self._last[host] = time.monotonic()


async def _fetch_one(
    client: httpx.AsyncClient,
    url: str,
    robots: _RobotsCache,
    limiter: _DomainLimiter,
    global_sem: asyncio.Semaphore,
    report: FetchReport,
) -> FetchedPage:
    canon = canonical_url(url)
    page = FetchedPage(url=url, canonical=canon)
    host = registrable_host(url)

    async with global_sem, limiter.semaphore(host):
        await limiter.pace(host)
        try:
            if not await robots.allows(client, url):
                page.error = "robots.txt"
                report.robots_denied += 1
                return page

            # Streamed so an unexpectedly huge page is abandoned mid-download
            # rather than after it has already cost us the memory and the time.
            async with client.stream("GET", url) as resp:
                page.status = resp.status_code
                page.content_type = resp.headers.get("content-type", "").split(";")[0].strip()

                if resp.status_code != 200:
                    page.error = f"http {resp.status_code}"
                    report.failed += 1
                    return page
                if page.content_type and not page.content_type.startswith(_CONTENT_OK):
                    page.error = f"content-type {page.content_type}"
                    report.failed += 1
                    return page

                chunks: list[bytes] = []
                size = 0
                async for chunk in resp.aiter_bytes():
                    chunks.append(chunk)
                    size += len(chunk)
                    if size >= MAX_BYTES:
                        break

            page.html = b"".join(chunks).decode(resp.encoding or "utf-8", errors="replace")
            report.succeeded += 1
            return page

        except (httpx.HTTPError, UnicodeDecodeError, ValueError) as exc:
            page.error = f"{type(exc).__name__}: {exc}"
            report.failed += 1
            return page


async def fetch_pages(urls: list[str], *, deadline: float) -> FetchReport:
    """
    Fetch up to MAX_PAGES URLs, stopping when `deadline` (a monotonic
    timestamp) passes.

    Whatever finished in time is returned. Unfinished fetches are cancelled,
    not awaited — waiting for them is what would blow the step's budget.
    """
    report = FetchReport()

    candidates: list[str] = []
    seen: set[str] = set()
    for url in urls:
        canon = canonical_url(url)
        if not canon or canon in seen:
            continue
        if is_blocked(url):
            report.blocked += 1
            continue
        seen.add(canon)
        candidates.append(url)
        if len(candidates) >= MAX_PAGES:
            break

    if not candidates:
        return report

    report.attempted = len(candidates)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        report.deadline_hit = True
        return report

    robots = _RobotsCache()
    limiter = _DomainLimiter()
    global_sem = asyncio.Semaphore(GLOBAL_CONCURRENCY)

    timeout = httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT)
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
    ) as client:
        tasks = [
            asyncio.create_task(_fetch_one(client, u, robots, limiter, global_sem, report))
            for u in candidates
        ]
        done, pending = await asyncio.wait(tasks, timeout=remaining)

        for task in pending:
            task.cancel()
        if pending:
            report.deadline_hit = True
            logger.warning("Fetch deadline hit: %s of %s pages", len(done), len(tasks))

        for task in done:
            try:
                page = task.result()
            except Exception:  # noqa: BLE001
                report.failed += 1
                continue
            if page.ok:
                report.pages[page.canonical] = page

    return report
