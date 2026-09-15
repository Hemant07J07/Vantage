"""
Company intelligence: research jobs, the evidence they gather, and the
synthesised view built from it.

The shape here exists to answer one question the old design couldn't:
*why does the system believe this?* Previously a qualification produced a
`research_notes` text blob — the URLs were in there as prose, but nothing tied
a specific claim to a specific page, so nothing could be checked.

    ResearchJob ──> Source        (a page we actually fetched)
         │            ▲
         ├──> ResearchClaim ──────┘  (an assertion, citing the pages behind it)
         └──> Signal ─────────────┘  (a dated event: funding, hiring, news)
                    │
                    ▼
          CompanyIntelligence      (the current synthesised view)

`Company` deliberately stays in the `leads` app — it predates this one and is
referenced from lead intake, so moving it across apps would be a
SeparateDatabaseAndState dance for no benefit.
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Source(models.Model):
    """
    One retrieved web document — the thing a claim points at.

    Everything needed to re-find and judge the page is kept: which query
    surfaced it, which provider answered, where it ranked, and when we looked.
    None of that survived the old flat-string approach.
    """

    class Kind(models.TextChoices):
        WEBSITE = "website", "Company website"
        NEWS = "news", "News article"
        LINKEDIN = "linkedin", "LinkedIn"
        JOBS = "jobs", "Job listing"
        CRUNCHBASE = "crunchbase", "Crunchbase"
        WEB = "web", "Web"

    company = models.ForeignKey(
        "leads.Company", on_delete=models.CASCADE, related_name="sources"
    )
    job = models.ForeignKey(
        "ResearchJob", on_delete=models.SET_NULL, null=True, blank=True, related_name="sources"
    )
    url = models.URLField(max_length=1000)
    title = models.CharField(max_length=500, blank=True)
    snippet = models.TextField(blank=True)
    provider = models.CharField(max_length=40, help_text="ollama_web_search | ddgs")
    query = models.CharField(max_length=500, help_text="The search query that surfaced this")
    rank = models.PositiveSmallIntegerField(default=0)
    kind = models.CharField(max_length=24, choices=Kind.choices, default=Kind.WEB)
    fetched_at = models.DateTimeField()

    class Meta:
        ordering = ["rank", "id"]
        indexes = [models.Index(fields=["company", "-fetched_at"])]
        constraints = [
            models.UniqueConstraint(fields=["job", "url"], name="uniq_source_per_job")
        ]

    def __str__(self) -> str:
        return f"{self.kind}: {self.title or self.url}"


class ResearchJob(models.Model):
    """
    One run of the research pipeline.

    The UUID pk is deliberate: job ids appear in public, unauthenticated poll
    URLs and shareable result permalinks, and sequential integers there would
    leak volume and invite enumeration.
    """

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    class Step(models.TextChoices):
        PROFILE = "profile", "Finding company information"
        SIGNALS = "signals", "Searching recent signals"
        ANALYSIS = "analysis", "Analyzing business situation"
        ICP = "icp", "Evaluating ICP"
        RECOMMEND = "recommend", "Generating recommendation"

    class Trigger(models.TextChoices):
        MANUAL = "manual", "Requested by a person"
        SCHEDULED = "scheduled", "Started by change monitoring"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        "leads.Company", on_delete=models.SET_NULL, null=True, blank=True, related_name="research_jobs"
    )
    input_query = models.CharField(max_length=255, help_text="Exactly what the visitor typed")
    normalized_domain = models.CharField(max_length=253, blank=True, db_index=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    current_step = models.CharField(max_length=20, choices=Step.choices, blank=True)
    # [{key, label, state: pending|active|done|failed, started_at, finished_at,
    #   duration_ms, detail}] — written five times per job and always read whole,
    # so a JSON column beats five extra rows and a join.
    steps = models.JSONField(default=list, blank=True)
    error = models.TextField(blank=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="research_jobs"
    )
    # A scheduled run has no requester, so requested_by being null can't tell a
    # monitored re-run apart from an anonymous public one. These say plainly
    # what started the job and, for a scheduled one, what the change looked like.
    trigger_type = models.CharField(max_length=20, choices=Trigger.choices, default=Trigger.MANUAL)
    trigger_reason = models.CharField(max_length=200, blank=True)
    # Hashed client IP. Abuse forensics only — never displayed, never reversed.
    client_fingerprint = models.CharField(max_length=64, blank=True)

    model_used = models.CharField(max_length=100, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["normalized_domain", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Research {self.input_query} ({self.status})"

    @classmethod
    def initial_steps(cls) -> list[dict]:
        """The five-step plan, all pending. Rendered by the progress stepper."""
        return [
            {
                "key": key,
                "label": label,
                "state": "pending",
                "started_at": None,
                "finished_at": None,
                "duration_ms": None,
                "detail": "",
            }
            for key, label in cls.Step.choices
        ]


class ResearchClaim(models.Model):
    """
    One atomic, cited assertion — the evidence layer.

    A claim with no linked sources is something the model inferred rather than
    read. `services.py` caps those at CONFIDENCE_CAP_UNSOURCED so an unbacked
    guess can never outrank a sourced fact, and the UI renders them distinctly.
    """

    CONFIDENCE_CAP_UNSOURCED = 0.4

    class Category(models.TextChoices):
        PROFILE = "profile", "Company profile"
        CHALLENGE = "challenge", "Current challenge"
        NEED = "need", "Potential need"
        INTENT = "intent", "Buying intent"
        ICP = "icp", "ICP fit"
        RISK = "risk", "Risk"

    job = models.ForeignKey(ResearchJob, on_delete=models.CASCADE, related_name="claims")
    company = models.ForeignKey(
        "leads.Company", on_delete=models.CASCADE, related_name="claims"
    )
    text = models.TextField()
    category = models.CharField(max_length=20, choices=Category.choices)
    confidence = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)]
    )
    sources = models.ManyToManyField(Source, blank=True, related_name="claims")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-confidence", "id"]
        indexes = [models.Index(fields=["company", "category"])]

    def __str__(self) -> str:
        return f"[{self.category}] {self.text[:60]}"


class Signal(models.Model):
    """A dated, observable event: funding, hiring, news, a product launch."""

    class Type(models.TextChoices):
        FUNDING = "funding", "Funding"
        HIRING = "hiring", "Hiring"
        NEWS = "news", "News"
        PRODUCT = "product", "Product"
        LEADERSHIP = "leadership", "Leadership"
        WEB = "web", "Web activity"

    class Strength(models.TextChoices):
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    company = models.ForeignKey(
        "leads.Company", on_delete=models.CASCADE, related_name="signals"
    )
    job = models.ForeignKey(
        ResearchJob, on_delete=models.SET_NULL, null=True, blank=True, related_name="signals"
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    value = models.CharField(max_length=255, help_text='e.g. "Series B, $22M"')
    strength = models.CharField(max_length=10, choices=Strength.choices, default=Strength.MEDIUM)
    # When the event happened, where that's knowable; null when only "recently".
    detected_at = models.DateTimeField(null=True, blank=True)
    observed_at = models.DateTimeField(auto_now_add=True)
    sources = models.ManyToManyField(Source, blank=True, related_name="signals")

    class Meta:
        ordering = ["-detected_at", "-observed_at"]
        indexes = [models.Index(fields=["company", "type"])]

    def __str__(self) -> str:
        return f"{self.type}: {self.value}"


class CompanyIntelligence(models.Model):
    """
    The current synthesised view of a company — replaced on each successful job.

    Distinct from `leads.AIQualification`, which judges a specific inbound
    message from a specific person. This judges the *account*, and exists
    whether or not anyone ever filled in a form.
    """

    class Intent(models.TextChoices):
        HIGH = "high", "High"
        WARM = "warm", "Warm"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"
        UNKNOWN = "unknown", "Unknown"

    class Stage(models.TextChoices):
        """
        Where an account sits in the pipeline.

        The split matters: the first three are **derived** — research either
        has not run, is running, or has produced a score — so they're set by
        the pipeline itself and recomputed on every job.

        ENGAGED and WON are **declared**. Nothing in this system observes a
        reply, a meeting or a closed deal, so there is no honest way to infer
        them; they are only ever set by a person through the stage endpoint.
        Deriving them from, say, a high ICP score would turn a prediction into
        a reported fact.
        """

        NEW = "new", "New"
        RESEARCHING = "researching", "Researching"
        QUALIFIED = "qualified", "Qualified"
        ENGAGED = "engaged", "Engaged"
        WON = "won", "Won"

    #: Stages a person may set. The rest are owned by the research pipeline.
    MANUAL_STAGES = {Stage.ENGAGED, Stage.WON}

    #: ICP score at or above which a completed research run reads as qualified.
    QUALIFIED_MIN_SCORE = 50

    #: Why each stage is what it is, shown under the board's column headings.
    STAGE_DESCRIPTIONS = {
        Stage.NEW: "Not researched yet",
        Stage.RESEARCHING: "Scored below the ICP bar",
        Stage.QUALIFIED: "Cleared the ICP bar",
        Stage.ENGAGED: "Set by you",
        Stage.WON: "Set by you",
    }

    @classmethod
    def stage_vocabulary(cls) -> list[dict]:
        """
        The board's columns, in order, with the rule that governs each.

        Published through the meta endpoint so the UI doesn't carry its own
        copy of which stages accept a drop. That copy existed briefly and is
        exactly the kind of rule that goes stale silently: adding a stage here
        would have left the board rendering four columns with no error.
        """
        return [
            {
                "key": stage.value,
                "label": stage.label,
                "description": cls.STAGE_DESCRIPTIONS.get(stage, ""),
                "manual": stage in cls.MANUAL_STAGES,
            }
            for stage in cls.Stage
        ]

    company = models.OneToOneField(
        "leads.Company", on_delete=models.CASCADE, related_name="intelligence"
    )
    latest_job = models.ForeignKey(
        ResearchJob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    icp_fit_score = models.PositiveSmallIntegerField(default=0)
    icp_fit_label = models.CharField(max_length=20, blank=True)
    buying_intent = models.CharField(max_length=10, choices=Intent.choices, default=Intent.UNKNOWN)
    # Null on a first run — there is no prior period to compare against, and
    # rendering "+0%" there would be a fabrication.
    intent_delta_pct = models.SmallIntegerField(null=True, blank=True)
    # Null until real engagement data exists. This product has none yet, so the
    # UI shows "Not tracked yet" rather than inventing a number.
    engagement_score = models.PositiveSmallIntegerField(null=True, blank=True)
    # Derived in Python from claim confidence and source coverage — never asked
    # of the model, so it degrades honestly when search turns up nothing.
    research_confidence = models.PositiveSmallIntegerField(default=0)

    summary = models.TextField(blank=True)
    current_challenge = models.TextField(blank=True)
    potential_need = models.TextField(blank=True)
    recommended_services = models.JSONField(default=list, blank=True)
    recommended_outreach = models.TextField(blank=True)
    outreach_subject = models.CharField(max_length=255, blank=True)

    stage = models.CharField(
        max_length=24, choices=Stage.choices, default=Stage.NEW, db_index=True
    )
    last_signal_at = models.DateTimeField(null=True, blank=True)
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "company intelligence"
        ordering = ["-icp_fit_score"]
        indexes = [models.Index(fields=["-icp_fit_score", "buying_intent"])]

    def derived_stage(self) -> str:
        """
        The stage research alone implies.

        Returns the current stage untouched once a person has taken the
        account over — a completed re-research must never drag an engaged or
        won account backwards to "qualified".
        """
        if self.stage in self.MANUAL_STAGES:
            return self.stage
        if self.icp_fit_score >= self.QUALIFIED_MIN_SCORE:
            return self.Stage.QUALIFIED
        return self.Stage.RESEARCHING

    def __str__(self) -> str:
        return f"Intelligence for {self.company_id} ({self.icp_fit_score})"


class CompanyWatchState(models.Model):
    """
    What monitoring knows about one company between checks.

    Only companies that have been researched at least once are watched — the
    point is noticing that a known account moved, not discovering new ones.

    The snapshot is kept alongside the hash because the hash alone can say
    *that* something changed, never *what*. Without the previous text there is
    nothing to diff, and the classifier that decides whether a change is worth
    re-researching would have to guess from the current page alone.
    """

    class Result(models.TextChoices):
        UNREACHABLE = "unreachable", "Could not be fetched"
        UNCHANGED = "unchanged", "No change"
        CHANGED = "changed", "Changed"

    company = models.OneToOneField(
        "leads.Company", on_delete=models.CASCADE, related_name="watch_state"
    )

    content_hash = models.CharField(max_length=64, blank=True)
    content_snapshot = models.TextField(blank=True)

    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_changed_at = models.DateTimeField(null=True, blank=True)
    last_result = models.CharField(max_length=20, choices=Result.choices, blank=True)
    last_reason = models.CharField(max_length=200, blank=True)

    # Quiet companies are checked less often. Unreachable ones back off on
    # their own counter: a site that is down says nothing about how often the
    # company changes, so it must not be mistaken for a quiet one.
    consecutive_unchanged = models.PositiveIntegerField(default=0)
    consecutive_failures = models.PositiveIntegerField(default=0)

    next_check_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # A separate cadence from the fields above: those track hash-diffing the
    # company's own pages, this tracks actually searching the open web for
    # news about it. Different cost, different schedule, so kept apart rather
    # than overloading one pair of timestamps for two different mechanisms.
    last_trend_scan_at = models.DateTimeField(null=True, blank=True)
    next_trend_scan_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["next_check_at"]

    def __str__(self) -> str:
        return f"Watch on {self.company_id} (next {self.next_check_at:%Y-%m-%d %H:%M})"

    @staticmethod
    def _interval(streak: int) -> timedelta:
        """Doubling backoff, capped. Streak 0 is the base interval."""
        base = settings.MONITOR_BASE_INTERVAL_HOURS
        hours = min(base * (2 ** min(streak, 10)), settings.MONITOR_MAX_INTERVAL_HOURS)
        return timedelta(hours=hours)

    def _finish(self, result: str, reason: str, streak: int) -> None:
        now = timezone.now()
        self.last_checked_at = now
        self.last_result = result
        self.last_reason = reason[:200]
        self.next_check_at = now + self._interval(streak)

    def record_unreachable(self, reason: str) -> None:
        self.consecutive_failures += 1
        self._finish(self.Result.UNREACHABLE, reason, self.consecutive_failures)
        self.save()

    def record_baseline(self, content_hash: str, snapshot: str, reason: str) -> None:
        """
        First successful look at a company — nothing to compare against yet.

        Kept apart from `record_unchanged` so the very first check doesn't
        start a quiet streak: a company nobody has observed twice hasn't
        earned a longer interval, it just hasn't been watched yet.
        """
        self.consecutive_failures = 0
        self.consecutive_unchanged = 0
        self.content_hash = content_hash
        self.content_snapshot = snapshot
        self._finish(self.Result.UNCHANGED, reason, 0)
        self.save()

    def record_unchanged(self, content_hash: str, snapshot: str, reason: str) -> None:
        self.consecutive_failures = 0
        # The snapshot is refreshed even though the hash matched: extraction can
        # produce text that normalises to the same hash, and keeping the newest
        # copy means the next diff is against what was actually last seen.
        self.content_hash = content_hash
        self.content_snapshot = snapshot
        self.consecutive_unchanged += 1
        self._finish(self.Result.UNCHANGED, reason, self.consecutive_unchanged)
        self.save()

    def record_changed(self, content_hash: str, snapshot: str, reason: str) -> None:
        self.consecutive_failures = 0
        self.content_hash = content_hash
        self.content_snapshot = snapshot
        self.consecutive_unchanged = 0
        self.last_changed_at = timezone.now()
        self._finish(self.Result.CHANGED, reason, 0)
        self.save()
