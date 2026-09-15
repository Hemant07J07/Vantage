from django.contrib.auth import get_user_model
from rest_framework import serializers

from .companies import resolve_company
from .models import Activity, AIQualification, Assignment, Company, Lead, LeadScore

User = get_user_model()


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["id", "name", "website", "industry", "employee_count", "created_at"]


class LeadScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeadScore
        fields = ["icp_fit_score", "buying_intent", "urgency", "total_score", "computed_at"]


class AIQualificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIQualification
        fields = [
            "pain_points", "recommended_service", "recommended_action",
            "ai_summary", "research_notes", "model_used", "created_at",
        ]


class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = ["id", "type", "description", "created_at"]


class AssignmentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name"]


class AssignmentSerializer(serializers.ModelSerializer):
    user = AssignmentUserSerializer(read_only=True)

    class Meta:
        model = Assignment
        fields = ["user", "assigned_at"]


class LeadListSerializer(serializers.ModelSerializer):
    """Lean shape for the table view."""

    company_name = serializers.CharField(source="company.name", default=None, read_only=True)
    score = LeadScoreSerializer(read_only=True)

    class Meta:
        model = Lead
        fields = [
            "id", "contact_name", "email", "company_name", "source",
            "status", "created_at", "score",
        ]


class LeadDetailSerializer(serializers.ModelSerializer):
    company = CompanySerializer(read_only=True)
    score = LeadScoreSerializer(read_only=True)
    qualification = AIQualificationSerializer(read_only=True)
    activity = ActivitySerializer(many=True, read_only=True)
    assignment = AssignmentSerializer(read_only=True)

    class Meta:
        model = Lead
        fields = [
            "id", "contact_name", "email", "phone", "message", "source",
            "status", "created_at", "updated_at",
            "company", "score", "qualification", "activity", "assignment",
        ]


class LeadCreateSerializer(serializers.ModelSerializer):
    """Input shape for POST /api/leads/. Accepts flat company fields and
    gets-or-creates the Company row so the client doesn't need two calls."""

    company_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    website = serializers.CharField(write_only=True, required=False, allow_blank=True)
    industry = serializers.CharField(write_only=True, required=False, allow_blank=True)
    employee_count = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Lead
        fields = [
            "id", "contact_name", "email", "phone", "message", "source",
            "company_name", "website", "industry", "employee_count",
        ]

    def create(self, validated_data):
        company = None
        company_name = validated_data.pop("company_name", "")
        website = validated_data.pop("website", "")
        industry = validated_data.pop("industry", "")
        employee_count = validated_data.pop("employee_count", None)

        # Resolve on domain rather than an exact name match, so "Acme",
        # "Acme Inc." and acme.com all land on one row. Falls back to the work
        # email's domain when the form left the website blank.
        if company_name or website:
            company, _ = resolve_company(
                name=company_name or None,
                website=website or None,
                domain=validated_data.get("email"),
                defaults={"industry": industry, "employee_count": employee_count},
            )

        lead = Lead.objects.create(company=company, **validated_data)
        Activity.objects.create(
            lead=lead, type=Activity.Type.CREATED, description="Lead submitted"
        )
        return lead
