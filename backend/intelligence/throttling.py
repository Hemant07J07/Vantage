"""
Rate limiting that survives the Next.js proxy hop.

The public research endpoints are never called by a browser directly — the
Next.js route handlers proxy them so the browser never learns the backend's
address. That means every request reaches Django from the *same* container IP,
and DRF's stock throttles, which key on REMOTE_ADDR, would put every visitor on
Earth into one shared bucket: the first five researches of the hour would lock
out everybody else.

These classes key on the leftmost X-Forwarded-For entry instead — the original
client — falling back to REMOTE_ADDR when the header is absent.

Trusting XFF is only safe because nothing outside our own compose network can
reach Django's port; if this is ever exposed directly, the header becomes
attacker-controlled and this must move behind a proxy that rewrites it.
"""
from __future__ import annotations

from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle


def client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        # Leftmost entry is the original client; the rest are proxies.
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.META.get("REMOTE_ADDR", "") or "unknown"


class ForwardedScopedRateThrottle(ScopedRateThrottle):
    """ScopedRateThrottle that identifies anonymous callers by real client IP."""

    def get_cache_key(self, request, view):
        if not getattr(view, self.scope_attr, None):
            return None
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = client_ip(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class ForwardedAnonRateThrottle(SimpleRateThrottle):
    """Global anonymous limit, keyed on the real client IP."""

    scope = "anon"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request)}
