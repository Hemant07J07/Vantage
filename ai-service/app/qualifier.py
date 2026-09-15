"""
The lead-qualification agent loop:

1. Send the system prompt + lead context, with `web_search` available as a tool.
2. If the model calls the tool, run the search, feed results back, ask again.
   (Capped at MAX_TOOL_ROUNDS so a confused model can't loop forever.)
3. Once the model stops calling tools, make one more call with a strict
   JSON schema (`format=`) so the final answer is guaranteed parseable.
"""
from __future__ import annotations

import json
import logging

from .agents.base import ModelOutputError, _extract_json
from .llm_client import LLMClient
from .prompts import (
    FINAL_ANSWER_INSTRUCTION,
    QUALIFICATION_JSON_SCHEMA,
    SYSTEM_PROMPT,
    WEB_SEARCH_TOOL,
    build_lead_context,
)
from .schemas import LeadPayload, QualificationResponse
from .web_search import format_results_for_model, search

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 2


async def qualify(client: LLMClient, payload: LeadPayload) -> QualificationResponse:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_lead_context(payload)},
    ]

    research_notes: list[str] = []

    for _ in range(MAX_TOOL_ROUNDS):
        message = await client.chat(messages, tools=[WEB_SEARCH_TOOL])
        tool_calls = message.get("tool_calls") or []

        if not tool_calls:
            # Model didn't ask to search this round — nothing further to research.
            break

        messages.append({k: v for k, v in message.items() if k != "_telemetry"})

        for call in tool_calls:
            fn = call.get("function", {}) or {}
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            query = args.get("query") if isinstance(args, dict) else None

            # Check the tool name rather than running anything that happens to
            # carry a `query` argument. Qwen occasionally invents tool names,
            # and silently executing the wrong one is worse than saying no.
            if name != "web_search":
                messages.append(
                    {
                        "role": "tool",
                        "name": name or "unknown",
                        "tool_call_id": call.get("id", ""),
                        "content": f"Error: no tool named {name!r}. Only 'web_search' exists.",
                    }
                )
                continue

            if not query:
                messages.append(
                    {
                        "role": "tool",
                        "name": "web_search",
                        "tool_call_id": call.get("id", ""),
                        "content": "Error: web_search requires a non-empty 'query' argument.",
                    }
                )
                continue

            outcome = await search(query)
            if not outcome.ok:
                formatted = "Web search is currently unavailable. Judge from the lead's message alone."
            elif not outcome.results:
                formatted = "No results found for that query."
            else:
                formatted = format_results_for_model(outcome.results)
                research_notes.append(f"Searched: {query}\n{formatted}")

            # Qwen's chat template expects `name` on a tool result; without it
            # the model can fail to associate the output with its own call.
            messages.append(
                {
                    "role": "tool",
                    "name": "web_search",
                    "tool_call_id": call.get("id", ""),
                    "content": formatted,
                }
            )

    # Final call: force structured JSON so we never need to text-parse.
    messages.append({"role": "user", "content": FINAL_ANSWER_INSTRUCTION})
    final_message = await client.chat(
        messages, json_schema=QUALIFICATION_JSON_SCHEMA, temperature=0.1
    )
    content = final_message.get("content", "")

    try:
        parsed = _extract_json(content)
    except (json.JSONDecodeError, ValueError):
        # One repair attempt, then fail loudly. Returning zeroed-out defaults
        # here (the old behaviour) made a broken response indistinguishable
        # from a genuinely unpromising lead, so bad output silently became
        # bad data with nothing to alert on.
        logger.warning("Qualification JSON unparseable, attempting repair: %r", content[:300])
        messages.extend(
            [
                {"role": "assistant", "content": content},
                {"role": "user", "content": "That was not valid JSON. Reply with the JSON object only."},
            ]
        )
        retry = await client.chat(messages, json_schema=QUALIFICATION_JSON_SCHEMA, temperature=0.0)
        try:
            parsed = _extract_json(retry.get("content", ""))
        except (json.JSONDecodeError, ValueError) as exc:
            raise ModelOutputError(
                "qualify: model did not return valid JSON after a repair attempt"
            ) from exc

    return QualificationResponse(
        icp_fit_confidence=parsed.get("icp_fit_confidence", 0),
        buying_intent=parsed.get("buying_intent", "unknown"),
        urgency=parsed.get("urgency", "unknown"),
        pain_points=parsed.get("pain_points", []),
        recommended_service=parsed.get("recommended_service", ""),
        recommended_action=parsed.get("recommended_action", ""),
        ai_summary=parsed.get("ai_summary", ""),
        research_notes="\n\n".join(research_notes),
        model_used=client.model,
    )
