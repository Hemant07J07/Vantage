from rest_framework import serializers

from leads.models import Company

from .models import (
    CompanyIntelligence,
    CompanyWatchState,
    ResearchClaim,
    ResearchJob,
    Signal,
    Source,
)


class SourceSerializer(serializers.ModelSerializer):
    hostname = serializers.SerializerMethodField()

    class Meta:
        model = Source
        fields = ["id", "url", "title", "snippet", "kind", "provider", "hostname", "fetched_at"]

    def get_hostname(self, obj) -> str:
        from urllib.parse import urlparse

        try:
            return urlparse(obj.url).netloc.removeprefix("www.")
        except ValueError:
            return ""


class ResearchClaimSerializer(serializers.ModelSerializer):
    source_ids = serializers.SerializerMethodField()
    # Lets the UI distinguish "a page says this" from "the model inferred this"
    # instead of presenting both as equally established.
    unsourced = serializers.SerializerMethodField()

    class Meta:
        model = ResearchClaim
        fields = ["id", "text", "category", "confidence", "unsourced", "source_ids"]

    def get_source_ids(self, obj) -> list[int]:
        return [s.id for s in obj.sources.all()]

    def get_unsourced(self, obj) -> bool:
        return not obj.sources.all()


class SignalSerializer(serializers.ModelSerializer):
    source_ids = serializers.SerializerMethodField()
    # Same distinction `ResearchClaimSerializer` draws: a signal no page backs
    # up is the model's reading, not an observation, and the UI marks it so.
    # Derived here rather than in the client so both surfaces agree on what
    # "cited" means.
    unsourced = serializers.SerializerMethodField()
    type_label = serializers.CharField(source="get_type_display", read_only=True)
    strength_label = serializers.CharField(source="get_strength_display", read_only=True)

    class Meta:
        model = Signal
        fields = [
            "id",
            "type",
            "type_label",
            "value",
            "strength",
            "strength_label",
            "detected_at",
            "observed_at",
            "unsourced",
            "source_ids",
        ]

    def get_source_ids(self, obj) -> list[int]:
        return [s.id for s in obj.sources.all()]

    def get_unsourced(self, obj) -> bool:
        return not obj.sources.all()


class SignalFeedSerializer(SignalSerializer):
    """
    A signal shown outside its own company's page — the cross-company feed on
    the dashboard.

    Differs from `SignalSerializer` in two ways, both so the feed is usable on
    its own: it names the company the signal belongs to, and it embeds the
    sources rather than only their ids. Embedding matters because the evidence
    drawer opens straight from a feed row; with ids alone every row would need
    a second request before it could show anything.
    """

    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    company_domain = serializers.CharField(source="company.domain", read_only=True)
    sources = SourceSerializer(many=True, read_only=True)

    class Meta(SignalSerializer.Meta):
        fields = [
            *SignalSerializer.Meta.fields,
            "company_id",
            "company_name",
            "company_domain",
            "sources",
        ]


class CompanyIntelligenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyIntelligence
        fields = [
            "icp_fit_score", "icp_fit_label", "buying_intent", "intent_delta_pct",
            "engagement_score", "research_confidence", "summary", "current_challenge",
            "potential_need", "recommended_services", "recommended_outreach",
            "outreach_subject", "stage", "last_signal_at", "computed_at",
        ]


class CompanyBriefSerializer(serializers.ModelSerializer):
    """Company header shape used by both the research result and account list."""

    class Meta:
        model = Company
        fields = [
            "id", "name", "domain", "website", "industry", "employee_count",
            "description", "location", "logo_url", "verified",
        ]


class CompanyListSerializer(serializers.ModelSerializer):
    intelligence = CompanyIntelligenceSerializer(read_only=True)
    lead_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id", "name", "domain", "industry", "employee_count", "location",
            "verified", "lead_count", "intelligence",
        ]


class WatchStateSerializer(serializers.ModelSerializer):
    """
    What monitoring knows, for display.

    The hash and snapshot are deliberately not exposed — they are working
    state, not something a reader can act on.
    """

    class Meta:
        model = CompanyWatchState
        fields = ["last_checked_at", "last_changed_at", "last_result", "last_reason", "next_check_at"]


class ResearchJobSerializer(serializers.ModelSerializer):
    """
    The public poll payload. Also renders the shareable permalink, so it must
    be safe for anonymous eyes — no requested_by, no client_fingerprint.
    """

    company = CompanyBriefSerializer(read_only=True)
    result = CompanyIntelligenceSerializer(source="company.intelligence", read_only=True)
    claims = ResearchClaimSerializer(many=True, read_only=True)
    signals = SignalSerializer(many=True, read_only=True)
    sources = SourceSerializer(many=True, read_only=True)

    class Meta:
        model = ResearchJob
        fields = [
            "id", "status", "current_step", "steps", "error", "input_query",
            "normalized_domain", "model_used", "duration_ms", "created_at",
            "finished_at", "company", "result", "claims", "signals", "sources",
        ]
