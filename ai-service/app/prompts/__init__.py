"""
Prompts, output schemas, and the ICP spec.

Was a single `prompts.py`; split per-agent so each research step's wording and
JSON contract sit together and can be tuned without touching the others.
"""
from .common import (
    CITATION_RULES,
    CITED_CLAIM_SCHEMA,
    NO_SOURCES_NOTE,
    SEARCH_FAILED_NOTE,
    render_sources_block,
)
from .icp import ICP_SPEC, render_icp_prompt
from .qualify import (
    FINAL_ANSWER_INSTRUCTION,
    QUALIFICATION_JSON_SCHEMA,
    SYSTEM_PROMPT,
    WEB_SEARCH_TOOL,
    build_lead_context,
)
from .research import (
    ANALYSIS_SCHEMA,
    ANALYSIS_SYSTEM,
    PROFILE_SCHEMA,
    PROFILE_SYSTEM,
    RECOMMEND_SCHEMA,
    RECOMMEND_SYSTEM,
    SIGNALS_SCHEMA,
    SIGNALS_SYSTEM,
    build_analysis_user,
    build_profile_user,
    build_recommend_user,
    build_signals_user,
)

__all__ = [
    "CITATION_RULES", "CITED_CLAIM_SCHEMA", "NO_SOURCES_NOTE", "SEARCH_FAILED_NOTE",
    "render_sources_block", "ICP_SPEC", "render_icp_prompt",
    "SYSTEM_PROMPT", "WEB_SEARCH_TOOL", "QUALIFICATION_JSON_SCHEMA",
    "FINAL_ANSWER_INSTRUCTION", "build_lead_context",
    "PROFILE_SYSTEM", "PROFILE_SCHEMA", "build_profile_user",
    "SIGNALS_SYSTEM", "SIGNALS_SCHEMA", "build_signals_user",
    "ANALYSIS_SYSTEM", "ANALYSIS_SCHEMA", "build_analysis_user",
    "RECOMMEND_SYSTEM", "RECOMMEND_SCHEMA", "build_recommend_user",
]
