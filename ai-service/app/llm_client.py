"""
Thin async wrapper around Groq's OpenAI-compatible chat completions API.

Replaces what used to be a local Ollama daemon. Deliberately kept in the same
shape that file had — messages/tools/json_schema in, one message dict out —
so every call site (agents/base.py, qualifier.py, monitor.py) needed zero
changes when the provider underneath it changed. That shape isn't free,
though: two real translations happen here, not just a different base URL.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Qwen 3 is a hybrid reasoning model and can still emit a <think>...</think>
# block. There's no request field on this API to suppress it (unlike Ollama's
# top-level `think` flag), so this regex is the only defence — a stray block
# would otherwise break json.loads on a response that is, apart from the
# prefix, perfectly valid.
_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

# Groq-hosted models carry their own fixed context window, comfortably larger
# than anything this app sends — there's no equivalent here to Ollama's
# "silently caps at 4096 without num_ctx" failure mode. The parameter stays on
# `chat()`'s signature so agents/base.py's per-step budgets need no change,
# but it's now spent as an output-length cap (`max_completion_tokens`) rather
# than an input-window size.
DEFAULT_NUM_CTX = 8192

# A 429 gets a few short retries (2s, 4s, 8s backoff, or whatever Retry-After
# says) before giving up — enough to ride out a burst without turning a
# genuinely exhausted quota into a long hang.
MAX_RATE_LIMIT_RETRIES = 3


def strip_thinking(content: str) -> str:
    if not content:
        return ""
    return _THINK_BLOCK.sub("", content).strip()


def _normalize_outgoing(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Re-stringify any tool_call arguments before sending.

    `chat()` hands callers *parsed* `arguments` dicts for convenience (see
    below) — qualifier.py reads `args.get("query")` straight off them. But
    when that same assistant turn gets replayed on the next round (qualifier.py
    appends its own prior response back into `messages`), the wire format
    expects `arguments` as a JSON-encoded string, per the OpenAI tool-calling
    convention Groq follows. Without this, a replayed turn would silently send
    a dict where the API expects a string.
    """
    normalized = []
    for msg in messages:
        tool_calls = msg.get("tool_calls")
        if not tool_calls:
            normalized.append(msg)
            continue
        msg = dict(msg)
        msg["tool_calls"] = [
            {
                **call,
                "function": {
                    **call["function"],
                    "arguments": (
                        json.dumps(call["function"]["arguments"])
                        if isinstance(call["function"].get("arguments"), dict)
                        else call["function"].get("arguments", "{}")
                    ),
                },
            }
            for call in tool_calls
        ]
        normalized.append(msg)
    return normalized


class LLMClient:
    def __init__(self, base_url: str, model: str, api_key: str, timeout_seconds: float = 150.0):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def _post_with_retry(
        self, body: dict[str, Any], *, timeout: float | None
    ) -> dict[str, Any]:
        """
        POST /chat/completions, absorbing a rate-limit response rather than
        failing the whole research step on it.

        Discovered live, not theoretical: a burst of calls against this app's
        own free-tier key (several research steps in close succession) drew a
        real 429 from Groq mid-run. Groq's free tier is 30 requests/minute —
        comfortable for this app's normal pace, tight under a burst — so this
        is worth absorbing rather than surfacing as a hard failure. Honours
        `Retry-After` when Groq sends one; otherwise backs off by attempt
        number. Any other error status still raises immediately — this is
        specifically for "try again shortly," not a general retry-everything.
        """
        attempt = 0
        async with httpx.AsyncClient(timeout=timeout or self.timeout_seconds) as client:
            while True:
                resp = await client.post(
                    f"{self.base_url}/chat/completions", json=body, headers=self._headers()
                )
                if resp.status_code != 429 or attempt >= MAX_RATE_LIMIT_RETRIES:
                    resp.raise_for_status()
                    return resp.json()

                wait = float(resp.headers.get("Retry-After", "0")) or (2**attempt)
                logger.warning(
                    "Groq rate limit hit (attempt %s/%s), retrying in %.1fs",
                    attempt + 1, MAX_RATE_LIMIT_RETRIES, wait,
                )
                await asyncio.sleep(wait)
                attempt += 1

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/models", headers=self._headers())
                return resp.status_code == 200
        except httpx.HTTPError:
            return False

    async def has_model(self) -> bool:
        """Whether the configured model is actually available on this account."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/models", headers=self._headers())
                resp.raise_for_status()
                ids = {item.get("id", "") for item in resp.json().get("data", [])}
        except (httpx.HTTPError, ValueError):
            return False
        return self.model in ids

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.2,
        timeout: float | None = None,
        think: bool = False,
        num_ctx: int = DEFAULT_NUM_CTX,
    ) -> dict[str, Any]:
        """
        POST /chat/completions (non-streaming). Returns a dict shaped like the
        old Ollama `message` — `content` and/or `tool_calls`, `<think>`
        stripped, `tool_calls[].function.arguments` parsed to a dict rather
        than left as the raw JSON string this API actually returns (Ollama's
        API handed that back already-parsed; qualifier.py's tool loop was
        written against that and still expects it).

        `think` has no equivalent here — accepted so call sites don't need
        editing, silently unused. `strip_thinking()` is the real defence and
        doesn't care which provider produced the stray block.

        `json_schema` becomes OpenAI-style `response_format`, not passed
        through raw. `strict` is deliberately False: Groq documents guaranteed
        schema-valid output as available only for its own gpt-oss models, not
        the Qwen models. Best-effort mode usually matches the schema; when it
        doesn't, `run_json_agent`'s existing one-shot repair retry is the
        safety net — that's what makes this an acceptable trade rather than a
        silent reliability regression.
        """
        body: dict[str, Any] = {
            "model": self.model,
            "messages": _normalize_outgoing(messages),
            "temperature": temperature,
            "max_completion_tokens": num_ctx,
        }
        if tools:
            body["tools"] = tools
        if json_schema:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "response", "schema": json_schema, "strict": False},
            }

        data = await self._post_with_retry(body, timeout=timeout)

        choice = (data.get("choices") or [{}])[0]
        message: dict[str, Any] = dict(choice.get("message") or {})

        if isinstance(message.get("content"), str):
            message["content"] = strip_thinking(message["content"])

        if message.get("tool_calls"):
            parsed_calls = []
            for call in message["tool_calls"]:
                call = dict(call)
                fn = dict(call.get("function") or {})
                raw_args = fn.get("arguments")
                if isinstance(raw_args, str):
                    try:
                        fn["arguments"] = json.loads(raw_args) if raw_args else {}
                    except json.JSONDecodeError:
                        logger.warning("Tool call arguments were not valid JSON: %r", raw_args[:200])
                        fn["arguments"] = {}
                call["function"] = fn
                parsed_calls.append(call)
            message["tool_calls"] = parsed_calls

        usage = data.get("usage") or {}
        message["_telemetry"] = {
            "total_duration_ms": None,  # Not reported by this API.
            "eval_count": usage.get("completion_tokens"),
            "prompt_eval_count": usage.get("prompt_tokens"),
            "num_ctx": num_ctx,
            "done_reason": choice.get("finish_reason"),
        }
        return message
