"""
Vantage backend settings.

Environment-driven so the same image runs in docker-compose and on a real host.
See .env.example for every variable this file reads.
"""
import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "channels",
    "accounts",
    "leads",
    "intelligence",
    "analytics",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --- Database -----------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "vantage"),
        "USER": os.environ.get("POSTGRES_USER", "vantage"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "vantage"),
        "HOST": os.environ.get("POSTGRES_HOST", "postgres"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

# --- Auth -----------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    # The public research endpoint triggers model inference and web search, so
    # it needs a real ceiling. These key on the forwarded client IP rather than
    # REMOTE_ADDR — every request arrives via the Next.js proxy, so keying on
    # the socket peer would throttle all visitors as a single shared bucket.
    "DEFAULT_THROTTLE_CLASSES": (
        "intelligence.throttling.ForwardedAnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/hour",
        "user": "2000/hour",
        "research": "5/hour",        # cost control on the public front door
        "research_poll": "900/hour",  # 1.5s polling for ~4min, with headroom
        "lead_create": "20/hour",     # the other unauthenticated endpoint
        "register": "10/hour",        # signup, per client IP
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# --- CORS (Next.js dev server + configurable prod origin) -----------------
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
).split(",")
CORS_ALLOW_CREDENTIALS = True

# --- Internationalization ---------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Redis (shared by Celery broker/result backend + Channels layer) ------
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
_REDIS_IS_TLS = REDIS_URL.startswith("rediss://")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

# --- Celery -----------------------------------------------------------------
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

# A `rediss://` URL (Upstash, or any TLS-only hosted Redis) isn't enough on its
# own — unlike plain redis-py, Celery's Redis transport refuses to start
# against one at all unless ssl_cert_reqs is set explicitly, raising
# E_REDIS_SSL_CERT_REQS_MISSING_INVALID before a single task runs. CERT_NONE
# because managed providers terminate TLS with certs Python's default trust
# store often can't chase to a root; the connection is still encrypted, this
# only skips validating the certificate chain.
if _REDIS_IS_TLS:
    import ssl

    CELERY_BROKER_USE_SSL = {"ssl_cert_reqs": ssl.CERT_NONE}
    CELERY_REDIS_BACKEND_USE_SSL = {"ssl_cert_reqs": ssl.CERT_NONE}
# A research job is 4 sequential model calls, so the old 120s ceiling is far too
# tight. The soft limit fires first and raises SoftTimeLimitExceeded, which the
# tasks catch to mark the row failed with a real message; the hard limit is the
# backstop that SIGKILLs a genuinely wedged worker.
#
# Raised again when the retrieval layer landed: steps now read the actual pages
# behind their sources, so the model is given real prose instead of snippets
# and generates proportionally more cited claims. Generation, not prompt size,
# is what got slower — measured at over 110s for the profile step.
CELERY_TASK_TIME_LIMIT = 1100
CELERY_TASK_SOFT_TIME_LIMIT = 1020

# Groq's free tier is rate-limited per key (30 requests/minute). Running lead
# qualification and company research on separate single-concurrency queues
# keeps a long research job from starving inbound lead qualification (and vice
# versa), and keeps this app's own concurrency comfortably under that ceiling
# regardless of provider.
CELERY_TASK_DEFAULT_QUEUE = "celery"
CELERY_TASK_ROUTES = {
    "leads.tasks.qualify_lead_task": {"queue": "qualify"},
    "intelligence.tasks.run_research_job": {"queue": "research"},
    # Monitoring checks are mostly HTTP fetches and hashing, so they get their
    # own queue and can run several at a time — unlike the two model-bound
    # queues above, which stay single-concurrency to respect the model
    # provider's own rate limit. A check that does reach the model uses one
    # short call.
    "intelligence.tasks.dispatch_due_monitor_checks": {"queue": "monitor"},
    "intelligence.tasks.check_company_for_changes": {"queue": "monitor"},
    # Trend scanning is NOT on the monitor queue above, deliberately: every
    # call here does a real web search + one model call (unlike a monitor
    # check, which mostly never reaches the model), so it needs its own
    # single-concurrency queue — see the comment above scan_company_trends.
    "intelligence.tasks.dispatch_due_trend_scans": {"queue": "trends"},
    "intelligence.tasks.scan_company_trends": {"queue": "trends"},
}

# The dispatcher only reads a small indexed query and enqueues; running it
# every 15 minutes keeps each company's actual check close to when it comes
# due without the schedule itself being the thing that costs anything.
CELERY_BEAT_SCHEDULE = {
    "dispatch-due-monitor-checks": {
        "task": "intelligence.tasks.dispatch_due_monitor_checks",
        "schedule": 15 * 60.0,
    },
    "dispatch-due-trend-scans": {
        "task": "intelligence.tasks.dispatch_due_trend_scans",
        "schedule": int(os.environ.get("TREND_SCAN_DISPATCH_MINUTES", "60")) * 60.0,
    },
}

# --- Change monitoring ----------------------------------------------------
# How soon a researched company is re-checked, and how far that interval is
# allowed to stretch for one that never changes. The check itself is cheap —
# a few page fetches and a hash — so the base interval is about how fresh the
# data should be, not about cost.
MONITOR_BASE_INTERVAL_HOURS = int(os.environ.get("MONITOR_BASE_INTERVAL_HOURS", "24"))
MONITOR_MAX_INTERVAL_HOURS = int(os.environ.get("MONITOR_MAX_INTERVAL_HOURS", "168"))
# Ceiling on how many checks one dispatcher tick may enqueue, so a long outage
# can't come back and queue every company at once.
MONITOR_MAX_BATCH = int(os.environ.get("MONITOR_MAX_BATCH", "25"))
# Monitoring is off unless asked for: it makes outbound requests to company
# websites on a timer, which should be a deliberate choice, not a side effect
# of starting the stack.
MONITOR_ENABLED = os.environ.get("MONITOR_ENABLED", "false").lower() == "true"
MONITOR_TIMEOUT_SECONDS = float(os.environ.get("MONITOR_TIMEOUT_SECONDS", "120"))

# --- Trend scanning ---------------------------------------------------------
# Unlike change monitoring above, this runs a real web search every call, so
# it's priced and scheduled differently: less often, in small batches, on its
# own queue (see CELERY_TASK_ROUTES / scan_company_trends).
TREND_SCAN_ENABLED = os.environ.get("TREND_SCAN_ENABLED", "false").lower() == "true"
# How often each already-researched company is rescanned for new signals.
TREND_SCAN_INTERVAL_HOURS = int(os.environ.get("TREND_SCAN_INTERVAL_HOURS", "24"))
# How often the dispatcher tick runs. Also read directly into CELERY_BEAT_SCHEDULE
# above — kept here too so the rest of the app has one name for it.
TREND_SCAN_DISPATCH_MINUTES = int(os.environ.get("TREND_SCAN_DISPATCH_MINUTES", "60"))
# Companies scanned per tick. At concurrency=1, this bounds how long a tick
# runs — small on purpose, so a run finishes in a couple of minutes and the
# worker goes idle again rather than churning continuously.
TREND_SCAN_MAX_BATCH = int(os.environ.get("TREND_SCAN_MAX_BATCH", "5"))
# A signal found again within this window doesn't count as "new" — see
# services.signals_not_yet_seen.
TREND_SCAN_SIGNAL_DEDUPE_DAYS = int(os.environ.get("TREND_SCAN_SIGNAL_DEDUPE_DAYS", "45"))

# --- AI service ---------------------------------------------------------
# Base URL of the separate FastAPI microservice that talks to Groq + web search.
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://ai-service:8001")
# Per-HTTP-call budgets. Each research step is its own bounded request rather
# than one cumulative call, so these stay well under the Celery soft limit.
AI_SERVICE_TIMEOUT_SECONDS = float(os.environ.get("AI_SERVICE_TIMEOUT_SECONDS", "100"))
AI_RESEARCH_TIMEOUT_SECONDS = float(os.environ.get("AI_RESEARCH_TIMEOUT_SECONDS", "200"))

# Score threshold above which a lead is auto-assigned + alerted (see leads/scoring.py)
HIGH_INTENT_THRESHOLD = int(os.environ.get("HIGH_INTENT_THRESHOLD", "75"))

# How much history a series needs before it is presented as a trend.
#
# Both of these are published through /api/analytics/meta/ rather than being
# re-declared in the frontend. They used to exist as a second hand-maintained
# copy in the client, which meant raising HIGH_INTENT_THRESHOLD here changed
# what the backend counted while the UI kept colouring by the old number.
MIN_TREND_POINTS = int(os.environ.get("MIN_TREND_POINTS", "3"))
MIN_TREND_DAYS = int(os.environ.get("MIN_TREND_DAYS", "7"))

# How long a company's research stays fresh before a new request re-runs it.
# This is the main cost control on the public research endpoint: a burst of
# visitors all researching the same domain costs one model run, not N.
RESEARCH_CACHE_TTL_HOURS = int(os.environ.get("RESEARCH_CACHE_TTL_HOURS", "168"))

# --- Logging ----------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "[{asctime}] {levelname} {name}: {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "leads": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "intelligence": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "celery": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
