"""
Web search — the evidence source behind every cited claim.

Three providers, tried in order:

1. SearXNG (`SEARXNG_URL`), a self-hosted metasearch engine that aggregates
   Google, Bing, Brave and DuckDuckGo behind one keyless JSON API. First
   because it needs no account and no quota, and because aggregating several
   engines means one of them rate-limiting us doesn't end the search.
2. Ollama's own hosted web search API (`ollama.web_search`), used when
   OLLAMA_API_KEY is set. Free tier on a free Ollama account.
   See https://ollama.com/blog/web-search.
3. DuckDuckGo via `ddgs` — the floor. No setup at all, so research still works
   on a bare checkout with no containers beyond the defaults.

Each implements `search(query) -> SearchOutcome`, so adding a paid provider
(Tavily, Brave, SerpAPI) later is another branch here and nothing else.

The order is a preference, not a requirement: every provider is wrapped so a
failure falls through to the next one. SearXNG being down must never be able
to fail a research run.

Two things this module is careful about:

* **Results carry their provenance.** Which query found them, which provider
  answered, where they ranked, when they were fetched. Without that, a claim
  citing a page can't be traced back or re-checked later.
* **"Search broke" and "search found nothing" are different answers.** Both
  used to collapse into an empty list that reached the model as the string
  "No web search results found." — from which it would cheerfully conclude the
  company doesn't exist.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse

from .canonical import canonical_url

logger = logging.getLogger(__name__)

DEFAULT_MAX_RESULTS = 6


@dataclass
class SearchResult:
    title: str
    snippet: str
    url: str
    query: str = ""
    provider: str = ""
    rank: int = 0
    fetched_at: str = ""
    #: Extracted page prose, filled in by `retrieval.enrich`. Empty when the
    #: page was blocked, disallowed by robots.txt, or missed the deadline — in
    #: which case `snippet` is all we have and the result stays citable.
    text: str = ""
    #: The page's own publication date, where it declared one. Distinct from
    #: `fetched_at`, which is when *we* retrieved it.
    published_at: str | None = None

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "snippet": self.snippet,
            "url": self.url,
            "query": self.query,
            "provider": self.provider,
            "rank": self.rank,
            "fetched_at": self.fetched_at,
            "text": self.text,
            "published_at": self.published_at,
        }


@dataclass
class SearchOutcome:
    """Results plus whether the search itself actually worked."""

    results: list[SearchResult] = field(default_factory=list)
    ok: bool = True
    error: str | None = None

    def __bool__(self) -> bool:
        return bool(self.results)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _api_key() -> str:
    # Read per-call rather than at import, so a key added after the container
    # started actually takes effect.
    return os.environ.get("OLLAMA_API_KEY", "").strip()


def _searxng_url() -> str:
    return os.environ.get("SEARXNG_URL", "").strip().rstrip("/")


# --- Provider 1: SearXNG, self-hosted, no key ------------------------------

# Kept short deliberately. SearXNG queries several upstream engines in series,
# so a slow upstream can hang the whole request; at that point ddgs will answer
# faster than waiting.
SEARXNG_TIMEOUT_SECONDS = 8.0


def _search_searxng_sync(query: str, max_results: int, base_url: str) -> list[SearchResult]:
    import httpx

    resp = httpx.get(
        f"{base_url}/search",
        params={
            "q": query,
            "format": "json",
            # General text results only; the image/video engines add latency
            # and return nothing a research claim can cite.
            "categories": "general",
            "language": "en",
        },
        timeout=SEARXNG_TIMEOUT_SECONDS,
        headers={"Accept": "application/json"},
    )
    resp.raise_for_status()
    payload = resp.json()

    fetched = _now_iso()
    results = []
    for index, r in enumerate(payload.get("results", [])[:max_results]):
        url = r.get("url") or ""
        if not url:
            continue
        results.append(
            SearchResult(
                title=r.get("title") or "",
                snippet=(r.get("content") or "")[:800],
                url=url,
                query=query,
                provider="searxng",
                rank=index,
                fetched_at=fetched,
            )
        )
    return results


# --- Provider 2: Ollama's hosted web search API ---------------------------

def _search_ollama_sync(query: str, max_results: int) -> list[SearchResult]:
    from ollama import web_search  # imported lazily: only needed with a key

    response = web_search(query, max_results=max_results)
    fetched = _now_iso()
    return [
        SearchResult(
            title=r.title or "",
            snippet=(r.content or "")[:800],
            url=r.url or "",
            query=query,
            provider="ollama_web_search",
            rank=index,
            fetched_at=fetched,
        )
        for index, r in enumerate(response.results)
    ]


# --- Provider 3: DuckDuckGo, no key required -------------------------------

def _search_ddgs_sync(query: str, max_results: int) -> list[SearchResult]:
    from ddgs import DDGS

    with DDGS() as ddgs:
        raw = list(ddgs.text(query, max_results=max_results))

    fetched = _now_iso()
    return [
        SearchResult(
            title=r.get("title", ""),
            snippet=r.get("body", ""),
            url=r.get("href", ""),
            query=query,
            provider="ddgs",
            rank=index,
            fetched_at=fetched,
        )
        for index, r in enumerate(raw)
    ]


def _search_sync(query: str, max_results: int = DEFAULT_MAX_RESULTS) -> SearchOutcome:
    errors: list[str] = []

    if base_url := _searxng_url():
        try:
            results = _search_searxng_sync(query, max_results, base_url)
            # An empty list from a healthy SearXNG usually means every upstream
            # engine rate-limited it at once, which is indistinguishable from a
            # genuine zero-result query. Fall through rather than reporting an
            # authoritative "nothing exists".
            if results:
                return SearchOutcome(results=results)
            logger.info("SearXNG returned no results for %r, trying next provider", query)
        except Exception as exc:  # noqa: BLE001
            logger.warning("SearXNG search failed for %r (%s), falling through", query, exc)
            errors.append(f"searxng: {exc}")

    if _api_key():
        try:
            return SearchOutcome(results=_search_ollama_sync(query, max_results))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Ollama web search failed for %r, falling back to DuckDuckGo", query)
            errors.append(f"ollama: {exc}")

    try:
        results = _search_ddgs_sync(query, max_results)
        if results:
            return SearchOutcome(results=results)
        # ddgs scrapes DuckDuckGo's HTML. When it is rate-limited or blocked it
        # does not raise — it returns an empty list, indistinguishable from a
        # genuine zero-result query. Treating that as an authoritative "nothing
        # found" is how the model ends up concluding a company doesn't exist.
        logger.warning("ddgs returned no results for %r (blocked, or genuinely empty)", query)
        errors.append("ddgs: no results (possibly rate-limited)")
    except Exception as exc:  # noqa: BLE001
        logger.exception("DuckDuckGo web search failed for %r", query)
        errors.append(f"ddgs: {exc}")

    # Nothing usable from any provider. We cannot tell "this company has no web
    # presence" from "every provider refused us", so we report the weaker,
    # truthful claim: the search did not establish anything.
    return SearchOutcome(results=[], ok=False, error="; ".join(errors))


async def search(query: str, max_results: int = DEFAULT_MAX_RESULTS) -> SearchOutcome:
    """Run the (blocking) search client off the event loop."""
    return await asyncio.to_thread(_search_sync, query, max_results)


#: Ceiling on the merged result list. Every extra source costs prompt
#: scaffolding, a fetch slot, and — because the model tries to cite them all —
#: output tokens. Trimmed here rather than at render time because agents pass
#: len(outcome.results) to validate_citations; trimming later would leave the
#: model citing indices that no longer exist.
MAX_MERGED_RESULTS = 14


async def search_multi(
    queries: list[str],
    max_results: int = DEFAULT_MAX_RESULTS,
    max_total: int = MAX_MERGED_RESULTS,
) -> SearchOutcome:
    """
    Run several queries and merge them into one de-duplicated, stably-indexed
    list — the index is what claims cite, so it must not shift between steps.

    `ok` is True if *any* query succeeded; a total failure is reported honestly.
    """
    outcomes = await asyncio.gather(*(search(q, max_results) for q in queries))

    merged: list[SearchResult] = []
    seen: set[str] = set()
    errors = []
    any_ok = False

    for outcome in outcomes:
        any_ok = any_ok or outcome.ok
        if outcome.error:
            errors.append(outcome.error)
        for result in outcome.results:
            # Canonical, not a bare lowercase strip: the same page arrives from
            # different queries with different tracking parameters, and counting
            # those as distinct costs a duplicate fetch and a duplicate slot in
            # the evidence block.
            key = canonical_url(result.url)
            if not key or key in seen:
                continue
            seen.add(key)
            result.rank = len(merged)
            merged.append(result)
            if len(merged) >= max_total:
                break
        if len(merged) >= max_total:
            break

    return SearchOutcome(
        results=merged,
        ok=any_ok or not errors,
        error="; ".join(errors) or None,
    )


# Per-source ceiling on page text in the prompt.
MAX_TEXT_CHARS_IN_PROMPT = 1500
MAX_SNIPPET_CHARS_IN_PROMPT = 400

# Total page text the evidence block may carry, across all sources.
#
# This exists because of a measured failure, not as a precaution: rendering 18
# fetched pages at 2400 chars each produced a ~43k-character prompt (~11k
# tokens), and qwen3:8b took longer than the 110s client timeout to evaluate
# it — the signals step returned 502.
#
# Measured on this box with qwen3:8b under JSON-schema constraint:
#   ~740 prompt tokens -> 18s      ~1.8k -> 23s      ~3.1k -> 53s
# Latency climbs superlinearly, and generation grows too because more sources
# means more signals to emit. 9k chars of page text lands the whole prompt near
# 3.5k tokens / ~60s, inside the 110s client timeout with room for variance.
#
# The budget is spent in rank order. Sources that don't fit still appear with
# their snippet, so every result stays citable and the citation indices the
# model is given remain a contiguous 1..N over the full result list.
TEXT_CHAR_BUDGET = 9_000


def format_results_for_model(
    results: list[SearchResult],
    *,
    char_budget: int = TEXT_CHAR_BUDGET,
) -> str:
    """
    Render results as a numbered block the model can cite by index.

    The numbering is 1-based for the prompt (humans and models both handle
    [1] better than [0]); callers convert back when resolving citations.

    Extracted page text is used where it exists and the search snippet only
    where it doesn't — and the two are labelled differently, because "this is
    what the page says" and "this is what a search engine said about the page"
    are different grades of evidence and the model should weigh them as such.
    """
    if not results:
        return "(no results)"

    lines = []
    spent = 0

    for index, r in enumerate(results, start=1):
        try:
            host = urlparse(r.url).netloc.removeprefix("www.")
        except ValueError:
            host = ""

        header = f"[{index}] {r.title or host}"
        if r.published_at:
            header += f"  (published {r.published_at[:10]})"

        allowance = min(MAX_TEXT_CHARS_IN_PROMPT, max(0, char_budget - spent))
        if r.text and allowance >= 500:
            # Below ~500 chars a page excerpt is more misleading than useful —
            # it reads as the whole page while being a fragment of the header.
            body = r.text.strip()[:allowance]
            spent += len(body)
            label = "PAGE"
        else:
            body = (r.snippet or "").strip().replace("\n", " ")[:MAX_SNIPPET_CHARS_IN_PROMPT]
            label = "SNIPPET ONLY"

        lines.append(f"{header}\n    {host} — {label}\n    {body}\n    {r.url}")

    return "\n\n".join(lines)
