from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from intelligence.throttling import ForwardedScopedRateThrottle

from .models import Activity, Assignment, Lead
from .serializers import (
    ActivitySerializer,
    AssignmentUserSerializer,
    LeadCreateSerializer,
    LeadDetailSerializer,
    LeadListSerializer,
)
from .tasks import qualify_lead_task

User = get_user_model()

DEDUPE_WINDOW = timedelta(hours=24)


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related("company", "score", "qualification", "assignment").all()
    permission_classes = [permissions.IsAuthenticated]

    # Public ingestion endpoint (a landing-page form) shouldn't require login;
    # everything else on this viewset does.
    def get_permissions(self):
        if self.action == "create":
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_throttles(self):
        # Anonymous submission is a write path that queues model work, so it
        # gets its own ceiling keyed on the real client IP (see
        # intelligence.throttling for why REMOTE_ADDR won't do here).
        if self.action == "create":
            self.throttle_scope = "lead_create"
            return [ForwardedScopedRateThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == "create":
            return LeadCreateSerializer
        if self.action == "list":
            return LeadListSerializer
        return LeadDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        source_filter = self.request.query_params.get("source")
        min_score = self.request.query_params.get("min_score")
        search = self.request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if source_filter:
            qs = qs.filter(source=source_filter)
        if min_score:
            qs = qs.filter(score__total_score__gte=min_score)
        if search:
            # Matches the same free-text shape CompanyViewSet already offers,
            # so the frontend's search box can treat every list the same way.
            qs = qs.filter(
                Q(contact_name__icontains=search)
                | Q(email__icontains=search)
                | Q(company__name__icontains=search)
            )
        return qs

    def create(self, request, *args, **kwargs):
        email = (request.data.get("email") or "").strip().lower()
        recent_duplicate = Lead.objects.filter(
            email__iexact=email,
            created_at__gte=timezone.now() - DEDUPE_WINDOW,
        ).first()
        if email and recent_duplicate:
            Activity.objects.create(
                lead=recent_duplicate, type=Activity.Type.DUPLICATE_SUBMISSION,
                description="Duplicate submission within 24h was ignored",
            )
            serializer = LeadDetailSerializer(recent_duplicate)
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()

        qualify_lead_task.delay(lead.id)

        return Response(LeadDetailSerializer(lead).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def requalify(self, request, pk=None):
        lead = self.get_object()
        Activity.objects.create(lead=lead, type=Activity.Type.REQUALIFY_REQUESTED, description="Manual re-qualification triggered")
        qualify_lead_task.delay(lead.id)
        return Response({"status": "queued"}, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        lead = self.get_object()
        user_id = request.data.get("user_id")
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "Unknown user_id"}, status=status.HTTP_400_BAD_REQUEST)

        Assignment.objects.update_or_create(lead=lead, defaults={"user": user})
        Activity.objects.create(
            lead=lead,
            company=lead.company,
            type=Activity.Type.ASSIGNED,
            description=f"Manually assigned to {user.username}",
        )
        return Response(LeadDetailSerializer(lead).data)

    @action(detail=True, methods=["get"])
    def activity(self, request, pk=None):
        lead = self.get_object()
        return Response(ActivitySerializer(lead.activity.all(), many=True).data)


class TeamViewSet(viewsets.ReadOnlyModelViewSet):
    """Sales reps available for assignment — used to populate the dashboard's
    assignment dropdown."""

    queryset = User.objects.filter(is_staff=True)
    serializer_class = AssignmentUserSerializer
    permission_classes = [permissions.IsAuthenticated]
