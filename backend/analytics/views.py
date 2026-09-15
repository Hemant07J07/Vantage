"""
Dashboard analytics.

Every metric here reports what the data actually supports. Two conventions run
throughout, and the frontend depends on both:

* `delta_pct` is **null**, never 0, when there is no prior period to compare
  against. "+0%" would claim we measured no change; null says we couldn't
  measure at all.
* `has_enough_history` tells the UI whether a series is worth drawing. With a
  day-old dataset a sparkline through two points is a shape, not a trend, so
  the components render a labelled empty state instead.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDate, TruncWeek
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from intelligence.models import CompanyIntelligence, ResearchJob, Signal
from intelligence.serializers import SignalFeedSerializer
from leads.models import Activity, Lead

# A series needs this many non-empty buckets before it's presented as a trend.
# Sourced from settings so the value the frontend is told (via /meta/) and the
# value used to compute `has_enough_history` can't drift apart.
MIN_TREND_POINTS = settings.MIN_TREND_POINTS

RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90}

#: Score buckets as (label, lower-inclusive, upper-exclusive). The top band's
#: upper bound is inclusive. Published through /meta/ so the dashboard renders
#: these in the right order instead of hardcoding the labels.
SCORE_BANDS = [
    ("0-25", 0, 25),
    ("25-50", 25, 50),
    ("50-75", 50, 75),
    ("75-100", 75, 100),
]


def _range_days(request) -> int:
    return RANGE_DAYS.get(request.query_params.get("range", "30d"), 30)


def _daily_series(queryset, field: str, start, days: int) -> list[dict]:
    """Count rows per day across the window, including days with nothing."""
    rows = (
        queryset.filter(**{f"{field}__gte": start})
        .annotate(day=TruncDate(field))
        .values("day")
        .annotate(value=Count("id"))
    )
    counts = {row["day"]: row["value"] for row in rows if row["day"]}
    today = timezone.now().date()
    return [
        {
            "date": (day := today - timedelta(days=offset)).isoformat(),
            "value": counts.get(day, 0),
        }
        for offset in range(days - 1, -1, -1)
    ]


def _metric(queryset, field: str, days: int) -> dict:
    """A metric card: current value, prior-period comparison, and a series."""
    now = timezone.now()
    current_start = now - timedelta(days=days)
    previous_start = now - timedelta(days=days * 2)

    current = queryset.filter(**{f"{field}__gte": current_start}).count()
    previous = queryset.filter(
        **{f"{field}__gte": previous_start, f"{field}__lt": current_start}
    ).count()

    # No prior activity means no comparison is possible — say so with null
    # rather than implying a measured 0% change.
    delta_pct = round((current - previous) / previous * 100) if previous else None

    series = _daily_series(queryset, field, current_start, days)
    return {
        "value": queryset.count(),
        "period_value": current,
        "previous_value": previous,
        "delta_pct": delta_pct,
        "series": series,
        "has_enough_history": sum(1 for point in series if point["value"]) >= MIN_TREND_POINTS,
    }


class SummaryView(APIView):
    """The four metric cards on the Overview page."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = _range_days(request)
        leads = Lead.objects.all()

        # "Qualified" means the AI produced a verdict. `failed` is explicitly
        # excluded — the previous version counted failures as qualified, which
        # inflated the number every time the model provider was unreachable.
        qualified = leads.filter(
            status__in=[Lead.Status.HIGH_INTENT, Lead.Status.NURTURE]
        )
        high_intent = leads.filter(status=Lead.Status.HIGH_INTENT)
        pending = leads.filter(status__in=[Lead.Status.NEW, Lead.Status.QUALIFYING])

        scored = leads.filter(score__isnull=False)
        avg_score = scored.aggregate(avg=Avg("score__total_score"))["avg"]

        return Response(
            {
                "range_days": days,
                "total_leads": _metric(leads, "created_at", days),
                "qualified_leads": _metric(qualified, "created_at", days),
                "high_intent": _metric(high_intent, "created_at", days),
                "actions_pending": {
                    "value": pending.count(),
                    "period_value": pending.count(),
                    "previous_value": None,
                    "delta_pct": None,
                    "series": [],
                    "has_enough_history": False,
                },
                "avg_score": round(avg_score, 1) if avg_score is not None else None,
                "scored_lead_count": scored.count(),
                # Buckets only span scored leads; unscored ones belong to none
                # of them, so the totals deliberately won't match total_leads.
                "score_distribution": {
                    label: scored.filter(
                        score__total_score__gte=low, score__total_score__lt=high
                    ).count()
                    # The top band is inclusive of 100, so it can't use __lt.
                    if high < 100
                    else scored.filter(score__total_score__gte=low).count()
                    for label, low, high in SCORE_BANDS
                },
            }
        )


class IntentOverTimeView(APIView):
    """Weekly intent trend. Honest about how little history exists."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = _range_days(request)
        start = timezone.now() - timedelta(days=days)

        rows = (
            Lead.objects.filter(score__isnull=False, score__computed_at__gte=start)
            .annotate(bucket=TruncWeek("score__computed_at"))
            .values("bucket")
            .annotate(
                total=Count("id"),
                high=Count("id", filter=Q(score__total_score__gte=75)),
                avg_score=Avg("score__total_score"),
            )
            .order_by("bucket")
        )

        series = [
            {
                "date": row["bucket"].date().isoformat(),
                "total": row["total"],
                "high_intent": row["high"],
                "avg_score": round(row["avg_score"] or 0, 1),
            }
            for row in rows
            if row["bucket"]
        ]

        return Response(
            {
                "granularity": "weekly",
                "series": series,
                "has_enough_history": len(series) >= MIN_TREND_POINTS,
                "min_points": MIN_TREND_POINTS,
            }
        )


class TopIndustriesView(APIView):
    """Industries actually present in the data — never a fixed demo list."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = (
            Lead.objects.exclude(company__industry="")
            .exclude(company__isnull=True)
            .values("company__industry")
            .annotate(count=Count("id"), avg_score=Avg("score__total_score"))
            .order_by("-count")[:6]
        )
        results = [
            {
                "industry": row["company__industry"],
                "count": row["count"],
                "avg_score": round(row["avg_score"], 1) if row["avg_score"] is not None else None,
            }
            for row in rows
        ]
        total = sum(row["count"] for row in results)
        for row in results:
            row["share_pct"] = round(row["count"] / total * 100) if total else 0

        return Response(
            {
                "results": results,
                "total_leads": total,
                # One industry at 100% is a tautology, not an insight — the UI
                # drops the bars below this threshold.
                "show_shares": len(results) >= 2,
            }
        )


class SignalFeedView(APIView):
    """
    Recent buying signals across every researched company.

    `Signal` is otherwise only reachable one company at a time, via
    `/api/companies/{id}/`. The dashboard needs the opposite view — what
    changed anywhere, newest first — and building that client-side would mean
    a request per account.

    Signals carry their sources inline so a feed row can open the evidence
    drawer without a second round trip. Rows with no sources are still
    returned: the UI marks them as uncited rather than hiding them, which is
    the same rule `ResearchClaim.unsourced` follows.

    At most `PER_COMPANY_CAP` signals come from any one account. A single
    research run often yields several near-duplicate rows — four separate job
    boards for the same hiring push — and without a cap one company fills the
    whole feed and the cross-company view stops being one. The cap drops
    surplus rows from over-represented accounts only; it never reorders, and
    nothing is merged or rewritten.
    """

    permission_classes = [IsAuthenticated]

    #: Signals any one company may contribute to the feed.
    PER_COMPANY_CAP = 2

    def get(self, request):
        try:
            limit = min(int(request.query_params.get("limit", 20)), 100)
        except ValueError:
            limit = 20

        rows = (
            Signal.objects.select_related("company")
            .prefetch_related("sources")
            # Model Meta already orders by -detected_at, -observed_at; repeated
            # here so the contract survives a change to the model's default.
            .order_by("-detected_at", "-observed_at")
        )

        # Over-fetch so the cap can discard duplicates and still fill the page.
        # Bounded, so a database of one noisy company can't walk the table.
        window = rows[: limit * self.PER_COMPANY_CAP + limit]

        seen: dict[int, int] = {}
        selected = []
        for signal in window:
            count = seen.get(signal.company_id, 0)
            if count >= self.PER_COMPANY_CAP:
                continue
            seen[signal.company_id] = count + 1
            selected.append(signal)
            if len(selected) == limit:
                break

        return Response({"results": SignalFeedSerializer(selected, many=True).data})


class ActivityFeedView(APIView):
    """Unified recent activity across leads and companies."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            limit = min(int(request.query_params.get("limit", 20)), 100)
        except ValueError:
            limit = 20

        rows = (
            Activity.objects.select_related("lead", "company")
            .order_by("-created_at")[:limit]
        )
        return Response(
            {
                "results": [
                    {
                        "id": row.id,
                        "type": row.type,
                        "label": row.get_type_display() if row.type in Activity.Type.values else row.type,
                        "description": row.description,
                        "lead_id": row.lead_id,
                        "company_id": row.company_id,
                        "company_name": row.company.name if row.company else None,
                        "created_at": row.created_at,
                    }
                    for row in rows
                ]
            }
        )


class InsightsView(APIView):
    """
    Observations derived from real rows only.

    Returns an empty list when nothing genuinely qualifies, rather than padding
    the panel with filler so it looks busy.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        insights = []
        week_ago = timezone.now() - timedelta(days=7)

        crossed = Lead.objects.filter(
            status=Lead.Status.HIGH_INTENT, updated_at__gte=week_ago
        ).count()
        if crossed:
            insights.append(
                {
                    "kind": "high_intent",
                    "tone": "ok",
                    "title": f"{crossed} lead{'s' if crossed != 1 else ''} reached high intent",
                    "subtitle": "In the last 7 days",
                    "href": "/dashboard/leads?status=high_intent",
                }
            )

        unresearched = (
            CompanyIntelligence.objects.filter(icp_fit_score__gte=70)
            .filter(company__leads__assignment__isnull=True)
            .distinct()
            .count()
        )
        if unresearched:
            insights.append(
                {
                    "kind": "unassigned",
                    "tone": "warn",
                    "title": f"{unresearched} high-fit account{'s' if unresearched != 1 else ''} have no owner",
                    "subtitle": "At risk of being deprioritised",
                    "href": "/dashboard/accounts?min_icp=70",
                }
            )

        stalled = Lead.objects.filter(status=Lead.Status.FAILED).count()
        if stalled:
            insights.append(
                {
                    "kind": "failed",
                    "tone": "danger",
                    "title": f"{stalled} lead{'s' if stalled != 1 else ''} failed qualification",
                    "subtitle": "Re-qualify once the AI service is healthy",
                    "href": "/dashboard/leads?status=failed",
                }
            )

        researched = ResearchJob.objects.filter(
            status=ResearchJob.Status.COMPLETE, created_at__gte=week_ago
        ).count()
        if researched:
            insights.append(
                {
                    "kind": "research",
                    "tone": "info",
                    "title": f"{researched} account{'s' if researched != 1 else ''} researched this week",
                    "subtitle": "Evidence-backed briefs are ready",
                    "href": "/dashboard/research",
                }
            )

        return Response({"results": insights})


class SourceBreakdownView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = (
            Lead.objects.values("source")
            .annotate(count=Count("id"), avg_score=Avg("score__total_score"))
            .order_by("-count")
        )
        return Response(
            {
                "results": [
                    {
                        "source": row["source"],
                        "count": row["count"],
                        "avg_score": round(row["avg_score"], 1) if row["avg_score"] is not None else None,
                    }
                    for row in rows
                ]
            }
        )
