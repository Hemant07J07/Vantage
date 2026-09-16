from django.contrib import admin
from django.db import connection
from django.db.utils import OperationalError
from django.http import JsonResponse
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.views import CurrentUserView, RegisterView


def health_check(request):
    """
    Unauthenticated, for Render's health check probe. `/api/` was being used
    for this before and always returned 401 — DRF's default permission is
    IsAuthenticated, so Render read "requires login" as "the app is down" and
    never marked a deploy healthy.

    Actually checks the database rather than just confirming the Django
    process is alive — a query, not a ping, so a real Supabase outage reports
    503 instead of a green check that's lying. Redis is deliberately not
    checked here: it backs the WebSocket layer, not the HTTP API this health
    check gates, and failing the whole service over a degraded live-updates
    feed would overstate what's actually broken.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except OperationalError as exc:
        return JsonResponse({"status": "error", "detail": str(exc)}, status=503)
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("health/", health_check, name="health"),
    path("admin/", admin.site.urls),
    path("api/auth/register/", RegisterView.as_view(), name="register"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/", include("leads.urls")),
    path("api/", include("intelligence.urls")),
    path("api/analytics/", include("analytics.urls")),
]
