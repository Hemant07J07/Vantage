"""
URL canonicalisation — the key everything else dedupes and caches on.

Search engines hand back the same page under many spellings: with and without
`www`, with tracking parameters, with a trailing slash, with a fragment. The
old `search_multi` dedupe was `url.rstrip("/").lower()`, which treats
`example.com/a?utm_source=x` and `example.com/a` as two different pages — so
the same document was shown to the model twice, fetched twice, and embedded
twice.
"""
from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Tracking parameters carry no meaning for the page's content. Everything else
# is kept: `?id=123` usually selects *which* page you get.
_TRACKING_PREFIXES = ("utm_", "mc_", "pk_")
_TRACKING_EXACT = {
    "fbclid",
    "gclid",
    "msclkid",
    "igshid",
    "ref",
    "ref_src",
    "source",
    "spm",
    "_hsenc",
    "_hsmi",
}


def canonical_url(url: str) -> str:
    """
    A stable identity for a page. Returns "" for anything unusable.

    Not a security boundary and not a redirect follower — just enough
    normalisation that the same document maps to the same string.
    """
    if not url:
        return ""

    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return ""

    if parts.scheme not in ("http", "https") or not parts.netloc:
        return ""

    host = parts.netloc.lower()
    # Strip a default port, keep a non-default one — it selects a real service.
    if host.endswith(":80") and parts.scheme == "http":
        host = host[:-3]
    elif host.endswith(":443") and parts.scheme == "https":
        host = host[:-4]
    host = host.removeprefix("www.")

    query = urlencode(
        [
            (k, v)
            for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if not (k.lower().startswith(_TRACKING_PREFIXES) or k.lower() in _TRACKING_EXACT)
        ]
    )

    path = parts.path.rstrip("/") or "/"

    # Fragments are dropped: they address a position within a document, not a
    # different document.
    return urlunsplit((parts.scheme, host, path, query, ""))


def registrable_host(url: str) -> str:
    """
    Host without `www`, used for per-domain rate limiting and caps.

    Deliberately not a public-suffix lookup: `boards.greenhouse.io` and
    `api.greenhouse.io` should be rate-limited together, and treating each
    subdomain separately is what lets one site monopolise a fetch budget.
    """
    try:
        host = urlsplit(url).netloc.lower().split(":")[0].removeprefix("www.")
    except ValueError:
        return ""
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) > 2 else host
