"""
Vantage AI service.

A separate FastAPI microservice (not bolted onto Django) so:
- it can be async end-to-end for the I/O-bound model + web-search calls
- it can be scaled/restarted independently of the Django backend
- swapping models, providers, or adding new tools never touches Django code

Research is four narrow endpoints rather than one long call. That keeps each
request inside its own timeout budget instead of a cumulative one, and it gives
the public progress stepper real step boundaries to report — the timings a
visitor sees are measured, not staged.

Run standalone: uvicorn app.main:app --reload --port 8001
"""
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import agents
from . import monitor
from . import vocabulary as vocab
from .agents.base import ModelOutputError
from .llm_client import LLMClient
from .prompts import ICP_SPEC
from .qualifier import qualify
from .schemas import (
    AnalysisResponse,
    CompanyPayload,
    HealthResponse,
    LeadPayload,
    MonitorCheckPayload,
    MonitorCheckResponse,
    ProfileResponse,
    QualificationResponse,
    RecommendationResponse,
    SignalsResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# See README.md "Model choice" for the reasoning behind this default.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")

# Human-readable names for the dashboard's agent-status rail, which reads this
# from /health rather than hardcoding a label that drifts from reality.
MODEL_LABELS = {
    "qwen/qwen3.8-27b": "Qwen 3.8 (27B, Groq)",
    "openai/gpt-oss-20b": "GPT-OSS (20B, Groq)",
    "openai/gpt-oss-120b": "GPT-OSS (120B, Groq)",
}


def model_label(model: str) -> str:
    if model in MODEL_LABELS:
        return MODEL_LABELS[model]
    name, _, size = model.partition("/")
    return f"{size or name} (Groq)".strip()


llm_client = LLMClient(base_url=GROQ_BASE_URL, model=GROQ_MODEL, api_key=GROQ_API_KEY)


app = FastAPI(title="Vantage AI Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    reachable = await llm_client.health_check()
    available = await llm_client.has_model() if reachable else False
    return HealthResponse(
        status="ok",
        model_reachable=reachable,
        model=GROQ_MODEL,
        model_label=model_label(GROQ_MODEL),
        model_available=available,
    )


@app.get("/icp")
async def icp():
    """
    The ICP as data.

    Exposed so the Django backend can verify its scoring constants still agree
    with what the prompts tell the model — these used to be two hand-maintained
    copies that could silently diverge.
    """
    return ICP_SPEC


@app.get("/vocabulary")
async def vocabulary():
    """
    The closed sets this service will emit.

    Same purpose as `/icp`: Django stores these values and re-validates them
    on ingest, so the two sides have to agree on what the allowed strings are.
    Publishing them makes a mismatch findable — otherwise a type this service
    stopped emitting, or one Django stopped recognising, just shows up as
    every signal quietly arriving as "web".
    """
    return vocab.as_payload()


@app.post("/qualify", response_model=QualificationResponse)
async def qualify_lead(payload: LeadPayload):
    logger.info("Qualifying lead_id=%s company=%s", payload.lead_id, payload.company_name)
    try:
        return await qualify(llm_client, payload)
    except ModelOutputError as exc:
        # A 502 (rather than a zeroed-out 200) so the caller retries instead of
        # storing garbage that looks exactly like a genuinely weak lead.
        logger.error("Qualification produced unusable output for lead_id=%s: %s", payload.lead_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Qualification failed for lead_id=%s", payload.lead_id)
        raise HTTPException(status_code=502, detail=f"AI qualification failed: {exc}") from exc


@app.post("/monitor/check", response_model=MonitorCheckResponse)
async def monitor_check(payload: MonitorCheckPayload):
    """
    Has anything changed on this company's own pages since the last check?

    Cheap by design — most calls here fetch a few pages, find an identical
    hash, and return without touching the model at all. See app/monitor.py.
    """
    subject = payload.domain or payload.company_name or "unknown"
    logger.info("Monitor check subject=%s", subject)
    try:
        return await monitor.check_company(
            llm_client,
            company_name=payload.company_name or "",
            domain=payload.domain or "",
            website=payload.website or "",
            prior_hash=payload.prior_hash,
            prior_snapshot=payload.prior_snapshot,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Monitor check failed for %s", subject)
        raise HTTPException(status_code=502, detail=f"monitor check failed: {exc}") from exc


def _research_route(name: str, runner):
    async def handler(payload: CompanyPayload):
        subject = payload.domain or payload.company_name or "unknown"
        logger.info("Research step=%s subject=%s", name, subject)
        try:
            return await runner(llm_client, payload)
        except ModelOutputError as exc:
            logger.error("Research step %s produced unusable output for %s: %s", name, subject, exc)
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            logger.exception("Research step %s failed for %s", name, subject)
            raise HTTPException(status_code=502, detail=f"{name} failed: {exc}") from exc

    return handler


app.add_api_route(
    "/research/profile", _research_route("profile", agents.profile.run),
    methods=["POST"], response_model=ProfileResponse,
)
app.add_api_route(
    "/research/signals", _research_route("signals", agents.signals.run),
    methods=["POST"], response_model=SignalsResponse,
)
app.add_api_route(
    "/research/analyze", _research_route("analysis", agents.analysis.run),
    methods=["POST"], response_model=AnalysisResponse,
)
app.add_api_route(
    "/research/recommend", _research_route("recommend", agents.recommend.run),
    methods=["POST"], response_model=RecommendationResponse,
)
