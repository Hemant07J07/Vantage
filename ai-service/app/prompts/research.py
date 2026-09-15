"""Prompts and output schemas for the four research steps."""
from __future__ import annotations

from .common import CITATION_RULES, CITED_CLAIM_SCHEMA
from .icp import render_icp_prompt

# --- 1. Profile --------------------------------------------------------------

PROFILE_SYSTEM = f"""You are a B2B research analyst building a factual profile of a company.

Work only from the SOURCES you are given. Your job is accuracy, not coverage:
an empty field is better than a plausible invention.

{CITATION_RULES}"""

PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Official company name, or empty if unclear"},
        "description": {"type": "string", "description": "One or two sentences on what they do"},
        "industry": {"type": "string", "description": "Primary industry, or empty if unclear"},
        "employee_count": {"type": ["integer", "null"], "description": "Best estimate, or null"},
        "location": {"type": "string", "description": "HQ city/country, or empty"},
        "claims": {"type": "array", "items": CITED_CLAIM_SCHEMA, "maxItems": 8},
    },
    "required": ["name", "description", "industry", "employee_count", "location", "claims"],
}


def build_profile_user(company_name: str | None, domain: str | None, sources_block: str) -> str:
    return f"""Build a factual profile of this company.

Company: {company_name or "unknown"}
Domain: {domain or "unknown"}

{sources_block}

Return the profile as JSON. Use the "profile" category for every claim.
Leave any field empty (or null for employee_count) if the sources don't support it."""


# --- 2. Signals --------------------------------------------------------------

SIGNALS_SYSTEM = f"""You are a B2B research analyst identifying recent, dated buying signals.

A signal is a concrete, observable event — a funding round, a hiring push, a
product launch, a leadership change, a news mention. "They have a website" is
not a signal. Neither is a general description of what they sell.

Only report signals the SOURCES actually evidence. Reporting none is a valid
and common answer.

{CITATION_RULES}"""

SIGNALS_SCHEMA = {
    "type": "object",
    "properties": {
        "signals": {
            "type": "array",
            "maxItems": 10,
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["funding", "hiring", "news", "product", "leadership", "web"],
                    },
                    "value": {
                        "type": "string",
                        "description": 'Short, concrete summary, e.g. "Series B, $22M" or "14 open sales roles"',
                    },
                    "strength": {"type": "string", "enum": ["high", "medium", "low"]},
                    "detected_at": {
                        "type": ["string", "null"],
                        "description": "ISO-8601 date of the event if stated, else null",
                    },
                    "source_ids": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["type", "value", "strength", "detected_at", "source_ids"],
            },
        }
    },
    "required": ["signals"],
}


def build_signals_user(company_name: str | None, domain: str | None, profile: dict, sources_block: str) -> str:
    return f"""Identify recent buying signals for this company.

Company: {company_name or "unknown"}
Domain: {domain or "unknown"}
What they do: {profile.get("description") or "unknown"}
Industry: {profile.get("industry") or "unknown"}

{sources_block}

Return signals as JSON. Return an empty array if the sources show none —
that is a normal outcome, not a failure."""


# --- 3. Analysis -------------------------------------------------------------

ANALYSIS_SYSTEM = f"""You are a B2B growth analyst judging whether a company is
worth a sales team's attention, and why.

{render_icp_prompt()}

Judge intent from evidence of the company's *situation*, not from how much you
happen to know about them. A famous company with no recent signals is not
high intent.

{CITATION_RULES}"""

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "2-3 sentences: who they are and why they matter now"},
        "current_challenge": {"type": "string", "description": "The business problem they appear to face"},
        "potential_need": {"type": "string", "description": "What they'd plausibly need help with"},
        "buying_intent": {"type": "string", "enum": ["high", "warm", "medium", "low", "unknown"]},
        "icp_fit_confidence": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Your own 0-100 read on ICP fit",
        },
        "claims": {"type": "array", "items": CITED_CLAIM_SCHEMA, "maxItems": 8},
    },
    "required": [
        "summary", "current_challenge", "potential_need",
        "buying_intent", "icp_fit_confidence", "claims",
    ],
}


def build_analysis_user(
    company_name: str | None, domain: str | None, profile: dict, signals: list[dict], sources_block: str
) -> str:
    signal_lines = (
        "\n".join(f"- [{s.get('type')}] {s.get('value')} (strength: {s.get('strength')})" for s in signals)
        or "(none found)"
    )
    return f"""Analyse this company against the ICP.

Company: {company_name or "unknown"}
Domain: {domain or "unknown"}
What they do: {profile.get("description") or "unknown"}
Industry: {profile.get("industry") or "unknown"}
Employees: {profile.get("employee_count") if profile.get("employee_count") is not None else "unknown"}
Location: {profile.get("location") or "unknown"}

Signals found:
{signal_lines}

{sources_block}

Return the analysis as JSON. Use categories "challenge", "need", "intent" and
"icp" for the claims. If the evidence is thin, say buying_intent is "unknown"
and keep icp_fit_confidence low — an honest low score is more useful than a
confident guess."""


# --- 4. Recommendation -------------------------------------------------------

RECOMMEND_SYSTEM = """You are a B2B sales strategist writing the first outreach
to a prospect.

Ground every sentence in the specific findings you are given. Generic outreach
("I'd love to connect about your business needs") is worse than none — it tells
the reader nobody looked. Reference their actual situation.

Keep the message under 90 words, plain-spoken, no marketing adjectives, no
fabricated flattery, and no claims about them you weren't told."""

RECOMMEND_SCHEMA = {
    "type": "object",
    "properties": {
        "recommended_services": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "rationale": {"type": "string", "description": "Why this, for this company"},
                },
                "required": ["title", "rationale"],
            },
        },
        "outreach_subject": {"type": "string", "description": "Email subject line, under 60 chars"},
        "recommended_outreach": {"type": "string", "description": "The message body, under 90 words"},
    },
    "required": ["recommended_services", "outreach_subject", "recommended_outreach"],
}


def build_recommend_user(company_name: str | None, profile: dict, analysis: dict) -> str:
    return f"""Draft the recommended next step for this account.

Company: {company_name or "unknown"}
What they do: {profile.get("description") or "unknown"}
Industry: {profile.get("industry") or "unknown"}

Our analysis:
- Summary: {analysis.get("summary") or "unknown"}
- Current challenge: {analysis.get("current_challenge") or "unknown"}
- Potential need: {analysis.get("potential_need") or "unknown"}
- Buying intent: {analysis.get("buying_intent") or "unknown"}

Return JSON with 2-3 recommended services and one short outreach message that
refers to their actual situation above."""
