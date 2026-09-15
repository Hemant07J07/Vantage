"""
Celery app for Vantage.

Lead qualification is I/O-bound (it waits on the AI service, which waits on
the model provider and on web search) so it belongs on a worker, not inline in
the request/response cycle. This is what keeps POST /api/leads/ fast even when
the model takes a few seconds to respond.
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("vantage")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
