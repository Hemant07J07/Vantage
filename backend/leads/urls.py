from rest_framework.routers import DefaultRouter

from .views import LeadViewSet, TeamViewSet

router = DefaultRouter()
router.register("leads", LeadViewSet, basename="lead")
router.register("team", TeamViewSet, basename="team")

urlpatterns = router.urls
