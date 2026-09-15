"""
Everything that shapes what the model sees and how it must answer when
qualifying an inbound lead.

The ICP itself is NOT written out here — it comes from `prompts/icp.py`, which
is the single source of truth shared with the research agents and checkable
against the Django backend's scoring constants via `GET /icp`.
"""
from .icp import render_icp_prompt

SYSTEM_PROMPT = f"""You are the qualification analyst for a B2B growth team.

Your {render_icp_prompt()}

You have a `web_search` tool available. Use it when the lead's message and
company name alone aren't enough to judge industry fit or what the company
actually does — for example, when industry is missing or the company name is
unfamiliar. Do not search for well-known companies or when the message
already makes intent and fit obvious; at most two searches.

When you are done researching (or if no research is needed), you will be
asked to produce your final qualification as structured JSON. Be concrete
and specific in the free-text fields — reference actual details from the
lead's message and company info rather than generic phrases. Do not invent
details about the company that you were not given and did not find."""

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for information about a company (what it does, its industry, its size) to inform lead qualification.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query, e.g. 'Acme Robotics company profile industry'",
                }
            },
            "required": ["query"],
        },
    },
}

# Passed as the final call's json_schema so the reply is constrained to this
# shape (see llm_client.py — best-effort, not guaranteed, hence the repair
# retry in agents/base.py still being the real safety net).
QUALIFICATION_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "icp_fit_confidence": {"type": "integer", "minimum": 0, "maximum": 100},
        "buying_intent": {"type": "string", "enum": ["high", "medium", "low"]},
        "urgency": {"type": "string", "enum": ["high", "medium", "low"]},
        "pain_points": {"type": "array", "items": {"type": "string"}},
        "recommended_service": {"type": "string"},
        "recommended_action": {"type": "string"},
        "ai_summary": {"type": "string"},
    },
    "required": [
        "icp_fit_confidence", "buying_intent", "urgency", "pain_points",
        "recommended_service", "recommended_action", "ai_summary",
    ],
}


def build_lead_context(payload) -> str:
    return f"""New lead to qualify:

Contact: {payload.contact_name} ({payload.email})
Company: {payload.company_name or "not provided"}
Website: {payload.website or "not provided"}
Industry (self-reported): {payload.industry or "not provided"}
Employee count (self-reported): {payload.employee_count if payload.employee_count is not None else "not provided"}

Message from lead:
\"\"\"{payload.message or "(no message provided)"}\"\"\"

Research this lead if needed, then qualify it."""


FINAL_ANSWER_INSTRUCTION = (
    "Now produce your final qualification as JSON matching the required schema. "
    "Base icp_fit_confidence and buying_intent on the ICP criteria and everything "
    "gathered above, including any web research."
)
