"""
ASGI entrypoint. Routes plain HTTP to Django as usual, and upgrades
/ws/... connections to the Channels websocket consumer so the dashboard
gets live lead/score updates without polling.
"""
import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_asgi_app = get_asgi_application()

import leads.routing  # noqa: E402  (must import after django.setup() via get_asgi_application)

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            URLRouter(leads.routing.websocket_urlpatterns)
        ),
    }
)
