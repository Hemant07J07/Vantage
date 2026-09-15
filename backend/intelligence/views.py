from __future__ import annotations

import hashlib
import logging
from datetime import timedelta

import httpx
from django.conf import settings
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from leads.companies import normalize_domain, resolve_company
from leads.models import Company

from .models import CompanyIntelligence, ResearchClaim, ResearchJob, Signal
from .serializers import (
    CompanyBriefSerializer,
    CompanyIntelligenceSerializer,
    CompanyListSerializer,
    ResearchJobSerializer,
)
from .tasks import run_research_job
from .throttling import ForwardedScopedRateThrottle, client_ip

logger = logging.getLogger(__name__)

# Prefetches the poll endpoint needs; without them it N+1s once every 1.5s.
_JOB_PREFETCH = (
    "sources",
    Prefetch("claims", queryset=ResearchClaim.objects.prefetch_related("sources")),
    Prefetch("signals", queryset=Signal.objects.prefetch_related("sources")),
)


def _fingerprint(request) -> str:
    """Hashed client IP — abuse forensics only, never displayed or reversed."""
    salt = settings.SECRET_KEY[:16]
    return hashlib.sha256(f"{salt}:{client_ip(request)}".encode()).hexdigest()


class ResearchCreateView(APIView):
    """
    Public entry point: POST {"query": "stripe.com"}.

    Deliberately unauthenticated — it's the product's front door. Three guards
    keep that from being an LLM-time DoS:
      * a per-domain freshness cache, so a burst all researching the same
        company costs one model run;
      * in-flight de-duplication, so double-submits join the existing job;
      * a scoped rate limit keyed on the real client IP.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ForwardedScopedRateThrottle]
    throttle_scope = "research"

    def post(self, request):
        raw_query = (request.data.get("query") or "").strip()
        if not raw_query:
            return Response(
                {"detail": "Enter a company name or website to research."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(raw_query) > 255:
            return Response(
                {"detail": "That query is too long."}, status=status.HTTP_400_BAD_REQUEST
            )

        domain = normalize_domain(raw_query)

        # 1. Fresh research already on file? Hand it straight back.
        if domain:
            ttl = timedelta(hours=settings.RESEARCH_CACHE_TTL_HOURS)
            fresh = (
                CompanyIntelligence.objects.select_related("company", "latest_job")
                .filter(company__domain=domain, computed_at__gte=timezone.now() - ttl)
                .first()
            )
            if fresh and fresh.latest_job_id:
                job = (
                    ResearchJob.objects.select_related("company")
                    .prefetch_related(*_JOB_PREFETCH)
                    .get(id=fresh.latest_job_id)
                )
                data = ResearchJobSerializer(job).data
                data["cached"] = True
                return Response(data, status=status.HTTP_200_OK)

            # 2. Someone else is already researching this exact domain.
            in_flight = (
                ResearchJob.objects.filter(
                    normalized_domain=domain,
                    status__in=[ResearchJob.Status.QUEUED, ResearchJob.Status.RUNNING],
                )
                .order_by("-created_at")
                .first()
            )
            if in_flight:
                data = ResearchJobSerializer(in_flight).data
                data["cached"] = False
                return Response(data, status=status.HTTP_202_ACCEPTED)

        company, _ = resolve_company(
            name=None if domain else raw_query,
            domain=domain,
            website=raw_query if domain else None,
        )

        job = ResearchJob.objects.create(
            company=company,
            input_query=raw_query,
            normalized_domain=domain or "",
            steps=ResearchJob.initial_steps(),
            requested_by=request.user if request.user.is_authenticated else None,
            client_fingerprint=_fingerprint(request),
        )
        run_research_job.delay(str(job.id))

        data = ResearchJobSerializer(job).data
        data["cached"] = False
        return Response(data, status=status.HTTP_202_ACCEPTED)


class ResearchDetailView(RetrieveAPIView):
    """Poll target, also the shareable result permalink. Public by design."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ForwardedScopedRateThrottle]
    throttle_scope = "research_poll"
    serializer_class = ResearchJobSerializer
    queryset = ResearchJob.objects.select_related("company", "company__intelligence").prefetch_related(
        *_JOB_PREFETCH
    )


class CompanyViewSet(viewsets.ReadOnlyModelViewSet):
    """Accounts — the authenticated view over everything research has produced."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CompanyListSerializer

    def get_queryset(self):
        qs = (
            Company.objects.select_related("intelligence", "watch_state")
            .annotate(lead_count=Count("leads", distinct=True))
        )
        params = self.request.query_params
        if industry := params.get("industry"):
            qs = qs.filter(industry__iexact=industry)
        if intent := params.get("intent"):
            qs = qs.filter(intelligence__buying_intent=intent)
        if min_icp := params.get("min_icp"):
            try:
                qs = qs.filter(intelligence__icp_fit_score__gte=int(min_icp))
            except ValueError:
                pass
        if search := params.get("search"):
            # Domain is the second thing shown on every row this feeds
            # (Accounts, Pipeline, Campaigns, Overview's priority list) —
            # matching only the name meant typing a domain found nothing.
            qs = qs.filter(Q(name__icontains=search) | Q(domain__icontains=search))
        if params.get("researched") == "true":
            qs = qs.filter(intelligence__isnull=False)
        if params.get("has_outreach") == "true":
            # Accounts research has written a first-touch email for. Filtered
            # here rather than in the client, which could only ever filter the
            # page it had been given and silently missed the rest.
            qs = qs.exclude(intelligence__recommended_outreach="").filter(
                intelligence__recommended_outreach__isnull=False
            )
        if stage := params.get("stage"):
            qs = qs.filter(intelligence__stage=stage)
        return qs.order_by("-intelligence__icp_fit_score", "name")

    def retrieve(self, request, *args, **kwargs):
        company = self.get_object()
        intelligence = getattr(company, "intelligence", None)
        claims = (
            ResearchClaim.objects.filter(company=company)
            .prefetch_related("sources")
            .order_by("category", "-confidence")
        )
        signals = Signal.objects.filter(company=company).prefetch_related("sources")
        sources = company.sources.all().order_by("kind", "rank")

        from .serializers import (
            ResearchClaimSerializer,
            SignalSerializer,
            SourceSerializer,
            WatchStateSerializer,
        )

        # Null when this company has never been checked — the UI says so
        # rather than implying a freshness it can't back up.
        watch = getattr(company, "watch_state", None)

        return Response(
            {
                "company": CompanyBriefSerializer(company).data,
                "intelligence": CompanyIntelligenceSerializer(intelligence).data if intelligence else None,
                "claims": ResearchClaimSerializer(claims, many=True).data,
                "signals": SignalSerializer(signals, many=True).data,
                "sources": SourceSerializer(sources, many=True).data,
                "monitoring": WatchStateSerializer(watch).data if watch else None,
            }
        )

    @action(detail=True, methods=["patch"])
    def stage(self, request, pk=None):
        """
        Move an account to a stage a person is asserting.

        Only ENGAGED and WON are settable here. The earlier stages are derived
        from research — letting the UI write them would put the board and the
        pipeline in disagreement the next time a job ran. Accepting only the
        two manual stages also keeps the honesty rule enforceable in one place:
        nothing can claim an account replied or closed except a human saying so.
        """
        company = self.get_object()
        intelligence = getattr(company, "intelligence", None)
        if intelligence is None:
            return Response(
                {"detail": "This account has no research yet."},
                status=status.HTTP_409_CONFLICT,
            )

        requested = request.data.get("stage")
        allowed = {s.value for s in CompanyIntelligence.MANUAL_STAGES}

        if requested in allowed:
            intelligence.stage = requested
        elif requested == "reset":
            # Hand the account back to the pipeline. Clearing manual ownership
            # first is what lets derived_stage() recompute rather than return
            # the manual stage untouched.
            intelligence.stage = CompanyIntelligence.Stage.RESEARCHING
            intelligence.stage = intelligence.derived_stage()
        else:
            return Response(
                {
                    "detail": (
                        f"stage must be one of {sorted(allowed)} or 'reset'. "
                        "Earlier stages are derived from research and cannot be set."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        intelligence.save(update_fields=["stage", "computed_at"])
        return Response({"stage": intelligence.stage})

    @action(detail=True, methods=["post"])
    def research(self, request, pk=None):
        """Force a fresh research run, bypassing the freshness cache."""
        company = self.get_object()
        in_flight = ResearchJob.objects.filter(
            company=company,
            status__in=[ResearchJob.Status.QUEUED, ResearchJob.Status.RUNNING],
        ).first()
        if in_flight:
            return Response(ResearchJobSerializer(in_flight).data, status=status.HTTP_202_ACCEPTED)

        job = ResearchJob.objects.create(
            company=company,
            input_query=company.domain or company.name,
            normalized_domain=company.domain or "",
            steps=ResearchJob.initial_steps(),
            requested_by=request.user,
            client_fingerprint=_fingerprint(request),
        )
        run_research_job.delay(str(job.id))
        return Response(ResearchJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class ResearchJobListView(APIView):
    """Recent research runs, for the authenticated Research page's history table."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        jobs = (
            ResearchJob.objects.select_related("company")
            .prefetch_related(*_JOB_PREFETCH)[:50]
        )
        return Response({"results": ResearchJobSerializer(jobs, many=True).data})


class AIHealthView(APIView):
    """
    Thin proxy to the AI service's /health, so the dashboard's agent-status rail
    reports the *actual* configured model rather than a hardcoded label.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        requests_today = ResearchJob.objects.filter(created_at__gte=today).count()

        payload = {
            "service_reachable": False,
            "model_reachable": False,
            "model": "",
            "model_label": "",
            "requests_today": requests_today,
            # No quota is configured, so none is reported. The UI shows a bare
            # count rather than inventing a denominator.
            "requests_limit": None,
        }
        try:
            response = httpx.get(f"{settings.AI_SERVICE_URL}/health", timeout=5.0)
            response.raise_for_status()
            data = response.json()
            payload.update(
                service_reachable=True,
                model_reachable=bool(data.get("model_reachable")),
                model=data.get("model", ""),
                model_label=data.get("model_label") or data.get("model", ""),
            )
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("AI health check failed: %s", exc)

        return Response(payload)
