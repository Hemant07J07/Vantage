"""
HTML to readable text.

Uses `selectolax` (a Rust HTML parser) rather than BeautifulSoup: it is an
order of magnitude faster, and at 20 pages per research step inside a 150s
budget that difference is the difference between fitting and not.

The goal is not a perfect reader-mode rendering. It is to get the page's
*prose* — and to drop navigation, cookie banners, script and style content,
which otherwise dominate a modern page and would fill the model's context with
menu items.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from selectolax.parser import HTMLParser

logger = logging.getLogger(__name__)

# Removed outright: these contribute no prose and a great deal of noise.
_STRIP_TAGS = (
    "script", "style", "noscript", "svg", "canvas", "iframe",
    "nav", "header", "footer", "aside", "form", "button", "template",
)

# Boilerplate that survives tag stripping because it sits in ordinary <div>s.
_BOILERPLATE = re.compile(
    r"^(accept all cookies?|cookie settings|skip to (main )?content|"
    r"subscribe|sign up|log ?in|menu|search|share this|all rights reserved)$",
    re.IGNORECASE,
)

_WS = re.compile(r"[ \t ]+")
_BLANKS = re.compile(r"\n{3,}")

_DATE_META = (
    "article:published_time",
    "og:article:published_time",
    "datePublished",
    "publishdate",
    "pubdate",
    "date",
)


@dataclass
class ExtractedPage:
    title: str = ""
    text: str = ""
    published_at: str | None = None

    def __bool__(self) -> bool:
        return bool(self.text)


def _clean_lines(raw: str) -> str:
    lines = []
    for line in raw.splitlines():
        line = _WS.sub(" ", line).strip()
        if not line or _BOILERPLATE.match(line):
            continue
        # Single words and stray punctuation are almost always nav remnants.
        if len(line) < 3:
            continue
        lines.append(line)
    return _BLANKS.sub("\n\n", "\n".join(lines)).strip()


def _published_at(tree: HTMLParser) -> str | None:
    """Best-effort publication date, for dating signals honestly."""
    for node in tree.css("meta"):
        key = (node.attributes.get("property") or node.attributes.get("name") or "").lower()
        if key in {d.lower() for d in _DATE_META}:
            value = (node.attributes.get("content") or "").strip()
            if value:
                return value

    # JSON-LD is where most news sites actually put it.
    for node in tree.css('script[type="application/ld+json"]'):
        try:
            data = json.loads(node.text() or "{}")
        except (ValueError, TypeError):
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict) and item.get("datePublished"):
                return str(item["datePublished"])

    node = tree.css_first("time[datetime]")
    if node:
        return (node.attributes.get("datetime") or "").strip() or None
    return None


def extract(html: str, *, url: str = "") -> ExtractedPage:
    """Parse a page into title, prose and (where available) publication date."""
    if not html or not html.strip():
        return ExtractedPage()

    try:
        tree = HTMLParser(html)
    except Exception as exc:  # noqa: BLE001
        logger.warning("HTML parse failed for %s: %s", url, exc)
        return ExtractedPage()

    title = ""
    if node := tree.css_first("title"):
        title = _WS.sub(" ", node.text() or "").strip()[:500]
    if not title:
        if node := tree.css_first('meta[property="og:title"]'):
            title = (node.attributes.get("content") or "").strip()[:500]

    published = _published_at(tree)

    for tag in _STRIP_TAGS:
        for node in tree.css(tag):
            node.decompose()

    body = tree.css_first("main") or tree.css_first("article") or tree.body
    if body is None:
        return ExtractedPage(title=title, published_at=published)

    text = _clean_lines(body.text(separator="\n") or "")
    return ExtractedPage(title=title, text=text, published_at=published)


def parse_date(value: str | None) -> datetime | None:
    """Parse the assorted date spellings pages use. Returns aware UTC or None."""
    if not value:
        return None
    raw = value.strip().replace("Z", "+00:00")
    for candidate in (raw, raw[:19], raw[:10]):
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None
