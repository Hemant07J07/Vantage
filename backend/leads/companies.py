"""
Company identity: turning whatever a human typed into a stable key.

A company arrives here from three very different places — a lead form, the
public research box, or the seed command — and it might be "Acme", "Acme Inc.",
"https://www.acme.com/pricing?ref=x", or just "acme.com". Before this module
existed, every one of those produced a *separate* Company row, because both
call sites used `Company.objects.get_or_create(name=...)`, an exact,
case-sensitive string match.

The domain is the only identifier that's actually stable across those inputs,
so it's the dedupe key. `name` is treated as display text, not identity.
"""
from __future__ import annotations

import re
from typing import Any

from django.db.models import Q

from .models import Company

# Personal-mail hosts. Someone submitting a lead from a gmail address must not
# create a Company called "gmail.com" that every other freemail lead then
# collapses into.
FREEMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
    "msn.com", "yahoo.com", "ymail.com", "proton.me", "protonmail.com",
    "icloud.com", "me.com", "mac.com", "aol.com", "gmx.com", "mail.com",
    "zoho.com", "yandex.com", "fastmail.com", "hey.com", "duck.com",
}

_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.\-]*://", re.I)
_IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
# Hostname label rules: alphanumeric, internal hyphens, 1-63 chars per label.
_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)


def normalize_domain(value: str | None) -> str | None:
    """
    Reduce a URL, email, or bare hostname to a canonical registrable domain.

    Returns None when the input isn't usable as a company identity — a bare
    company name, an IP address, a freemail host, or junk. Callers treat None
    as "fall back to matching on name".

        >>> normalize_domain("https://www.Acme.com/pricing?x=1")
        'acme.com'
        >>> normalize_domain("jane@acme.co.uk")
        'acme.co.uk'
        >>> normalize_domain("Acme Corporation")   # a name, not a domain
        None
        >>> normalize_domain("gmail.com")          # freemail
        None
    """
    if not value:
        return None

    candidate = str(value).strip().lower()
    if not candidate:
        return None

    # An email address: keep the host side.
    if "@" in candidate:
        candidate = candidate.rsplit("@", 1)[-1]

    candidate = _SCHEME_RE.sub("", candidate)

    # Strip anything after the authority, plus userinfo and port.
    for sep in ("/", "?", "#"):
        candidate = candidate.split(sep, 1)[0]
    if "@" in candidate:
        candidate = candidate.rsplit("@", 1)[-1]
    candidate = candidate.split(":", 1)[0]

    candidate = candidate.strip().strip(".")
    if candidate.startswith("www."):
        candidate = candidate[4:]

    if not candidate or _IPV4_RE.match(candidate) or not _HOSTNAME_RE.match(candidate):
        return None
    if candidate in FREEMAIL_DOMAINS:
        return None

    return candidate


def looks_like_domain(value: str | None) -> bool:
    """True when the raw input was already domain-shaped (has a dot, no spaces)."""
    if not value:
        return False
    candidate = str(value).strip()
    return " " not in candidate and "." in candidate


def display_name_from_domain(domain: str) -> str:
    """'acme-corp.co.uk' -> 'Acme Corp'. A placeholder until research finds the real name."""
    label = domain.split(".")[0].replace("-", " ").replace("_", " ")
    return label.title() if label else domain


def resolve_company(
    *,
    name: str | None = None,
    website: str | None = None,
    domain: str | None = None,
    defaults: dict[str, Any] | None = None,
) -> tuple[Company, bool]:
    """
    Find-or-create a Company, keyed on domain where one can be derived.

    Falls back to a case-insensitive name match so companies submitted without
    a website still dedupe sensibly. Any `defaults` only ever *fill in blanks*
    on an existing row — research that later discovers a real industry should
    not be clobbered by the next lead form that leaves the field empty.

    Returns (company, created).
    """
    defaults = dict(defaults or {})
    resolved_domain = (
        normalize_domain(domain)
        or normalize_domain(website)
        or (normalize_domain(name) if looks_like_domain(name) else None)
    )

    company: Company | None = None
    created = False

    if resolved_domain:
        company = Company.objects.filter(domain=resolved_domain).first()

    if company is None and name and not looks_like_domain(name):
        # Match on name only among rows that wouldn't contradict this domain.
        qs = Company.objects.filter(name__iexact=name.strip())
        if resolved_domain:
            qs = qs.filter(Q(domain__isnull=True) | Q(domain=resolved_domain))
        company = qs.first()

    if company is None:
        display = (name or "").strip()
        if not display or looks_like_domain(display):
            display = display_name_from_domain(resolved_domain) if resolved_domain else (display or "Unknown company")
        company = Company.objects.create(
            name=display,
            domain=resolved_domain,
            website=(website or "").strip(),
            **defaults,
        )
        return company, True

    # Backfill: set the domain if we've only just learned it, and fill blanks.
    dirty: list[str] = []
    if resolved_domain and not company.domain:
        company.domain = resolved_domain
        dirty.append("domain")
    if website and not company.website:
        company.website = website.strip()
        dirty.append("website")
    for field, value in defaults.items():
        if value in (None, "", []):
            continue
        if not getattr(company, field, None):
            setattr(company, field, value)
            dirty.append(field)
    if dirty:
        company.save(update_fields=[*dirty, "updated_at"])

    return company, created
