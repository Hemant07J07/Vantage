from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AIHealthView,
    CompanyViewSet,
    ResearchCreateView,
    ResearchDetailView,
    ResearchJobListView,
)

router = DefaultRouter()
router.register("companies", CompanyViewSet, basename="company")

urlpatterns = [
    # Public: the product's front door and its poll target.
    path("research/", ResearchCreateView.as_view(), name="research-create"),
    path("research/history/", ResearchJobListView.as_view(), name="research-history"),
    path("research/<uuid:pk>/", ResearchDetailView.as_view(), name="research-detail"),
    path("ai/health/", AIHealthView.as_view(), name="ai-health"),
    path("", include(router.urls)),
]
