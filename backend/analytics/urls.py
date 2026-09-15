from django.urls import path

from .meta import MetaView
from .views import (
    ActivityFeedView,
    InsightsView,
    IntentOverTimeView,
    SignalFeedView,
    SourceBreakdownView,
    SummaryView,
    TopIndustriesView,
)

urlpatterns = [
    path("meta/", MetaView.as_view(), name="analytics-meta"),
    path("summary/", SummaryView.as_view(), name="analytics-summary"),
    path("sources/", SourceBreakdownView.as_view(), name="analytics-sources"),
    path("intent-over-time/", IntentOverTimeView.as_view(), name="analytics-intent"),
    path("top-industries/", TopIndustriesView.as_view(), name="analytics-industries"),
    path("signals/", SignalFeedView.as_view(), name="analytics-signals"),
    path("activity/", ActivityFeedView.as_view(), name="analytics-activity"),
    path("insights/", InsightsView.as_view(), name="analytics-insights"),
]
