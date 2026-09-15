"""
Shared machinery for the research agents.

Every agent is the same shape — system prompt, user prompt, schema-constrained
call, validated JSON out — so that lives here once. Each `agents/<step>.py` is
then just its prompt wiring, which is what makes splitting them into separate
services later a copy rather than a refactor.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from ..llm_client import DEFAULT_NUM_CTX, LLMClient

logger = logging.getLogger(__name__)

# Output-length budget per research step (see llm_client.py: this now bounds
# the reply via max_completion_tokens, not an input context window).
#
# Sized to how much each step is expected to produce, not uniformly: analysis
# reasons over the profile, the signals AND the largest evidence block, so it
# gets the most room to write.
NUM_CTX = {
    "profile": 12288,
    "signals": 12288,
    "analysis": 16384,
    "recommend": 8192,
    "qualify": 8192,
}


class ModelOutputError(Exception):
    """
    The model returned something we cannot use.

    This is deliberately an error rather than a silent fallback. The previous
    behaviour — swallowing a JSON parse failure and returning zeros — made a
    broken model response indistinguishable from a genuinely unpromising lead,
    so bad output quietly became bad data with no signal that anything was
    wrong. Raising means the caller retries or reports honestly.
    """


REPAIR_INSTRUCTION = (
    "That was not valid JSON. Reply with the JSON object only — no prose, no "
    "markdown fences, no explanation."
)


def _extract_json(content: str) -> dict[str, Any]:
    """Parse the reply, tolerating markdown fences and leading prose."""
    if not content or not content.strip():
        raise ValueError("empty response")

    text = content.strip()

    # Strip ```json ... ``` fences if the model added them despite `format`.
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.lstrip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip("` \n")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Last resort: the outermost {...} span.
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


async def run_json_agent(
    client: LLMClient,
    *,
    system: str,
    user: str,
    schema: dict[str, Any],
    temperature: float = 0.1,
    timeout: float | None = None,
    label: str = "agent",
) -> dict[str, Any]:
    """
    One schema-constrained call, with a single repair attempt.

    Raises ModelOutputError if the model can't produce parseable JSON twice.

    The context budget is looked up from `label`, so a step gets the right
    window by being named — there is no call site that can forget to pass one.
    """
    num_ctx = NUM_CTX.get(label, DEFAULT_NUM_CTX)

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    message = await client.chat(
        messages,
        json_schema=schema,
        temperature=temperature,
        timeout=timeout,
        num_ctx=num_ctx,
    )
    content = message.get("content", "")

    try:
        return _extract_json(content)
    except (json.JSONDecodeError, ValueError) as first_error:
        logger.warning("%s: unparseable JSON, attempting repair: %r", label, content[:300])

    messages.extend(
        [
            {"role": "assistant", "content": content},
            {"role": "user", "content": REPAIR_INSTRUCTION},
        ]
    )
    retry = await client.chat(
        messages,
        json_schema=schema,
        temperature=0.0,
        timeout=timeout,
        # The repair turn carries the original prompt plus the failed reply, so
        # it is strictly larger than the first — it must not get a smaller window.
        num_ctx=num_ctx,
    )
    retry_content = retry.get("content", "")

    try:
        return _extract_json(retry_content)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("%s: repair failed, giving up: %r", label, retry_content[:300])
        raise ModelOutputError(
            f"{label}: model did not return valid JSON after a repair attempt"
        ) from exc


def validate_citations(items: list[dict], source_count: int, *, label: str = "") -> list[dict]:
    """
    Convert 1-based citations to 0-based indices, dropping any that don't exist.

    Models cite [9] when shown six results often enough that trusting the
    indices would attach claims to the wrong pages — or to nothing. Dropping is
    the safe failure: the claim survives as unsourced (and gets capped
    downstream) rather than carrying a fabricated citation.
    """
    dropped = 0
    total = 0

    for item in items:
        raw = item.get("source_ids") or []
        resolved = []
        for value in raw:
            total += 1
            if not isinstance(value, int):
                dropped += 1
                continue
            index = value - 1  # prompt is 1-based
            if 0 <= index < source_count:
                resolved.append(index)
            else:
                dropped += 1
        item["source_ids"] = resolved

    if dropped:
        logger.warning(
            "%s: dropped %s/%s citations outside the %s available sources",
            label or "agent", dropped, total, source_count,
        )
    return items
