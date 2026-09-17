from django.conf import settings
from django.db import models


class Company(models.Model):
    name = models.CharField(max_length=255)
    # The dedupe key. Nullable because a company can be submitted by name
    # alone; unique because Postgres permits many NULLs but only one of each
    # real value. See leads/companies.py for how it's derived.
    domain = models.CharField(max_length=253, unique=True, null=True, blank=True, db_index=True)
    website = models.URLField(blank=True)
    industry = models.CharField(max_length=120, blank=True)
    employee_count = models.PositiveIntegerField(null=True, blank=True)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=160, blank=True)
    logo_url = models.URLField(blank=True)
    # True once the domain resolved and at least one source corroborated the
    # profile — drives the verified tick in the account header.
    verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "companies"
        ordering = ["name"]
        indexes = [models.Index(fields=["industry"])]

    def __str__(self) -> str:
        return self.name


class UserCompany(models.Model):
    """
    Which companies a user has researched — what makes a dashboard theirs.

    Company/CompanyIntelligence stay one shared, cached row per domain
    regardless of who researched it (so a second user researching a company
    the first already looked up gets the fast, consistent, already-computed
    result rather than paying for a duplicate research run). This is the
    layer on top that makes each account's Accounts/Pipeline/Signal Feed
    private: those views filter through this table rather than returning the
    shared catalog wholesale, so a new signup starts with an empty dashboard
    instead of seeing every other account's research.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="companies")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="user_links")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "company"], name="uniq_user_company")]

    def __str__(self) -> str:
        return f"{self.user_id} -> {self.company_id}"


class Lead(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "New"
        QUALIFYING = "qualifying", "Qualifying"
        HIGH_INTENT = "high_intent", "High intent"
        NURTURE = "nurture", "Nurture"
        FAILED = "failed", "Qualification failed"

    class Source(models.TextChoices):
        WEBSITE = "website", "Website"
        LINKEDIN = "linkedin", "LinkedIn"
        CSV = "csv", "CSV import"
        LANDING_PAGE = "landing_page", "Landing page"
        WHATSAPP = "whatsapp", "WhatsApp"
        MANUAL = "manual", "Manual entry"

    company = models.ForeignKey(
        Company, on_delete=models.CASCADE, related_name="leads",
        null=True, blank=True,
    )
    contact_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    message = models.TextField(blank=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["status"]),
            models.Index(fields=["source"]),
        ]

    def __str__(self) -> str:
        return f"{self.contact_name} <{self.email}>"


class LeadScore(models.Model):
    """The queryable, sortable numeric side of qualification."""

    lead = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name="score")
    icp_fit_score = models.PositiveSmallIntegerField(default=0)
    buying_intent = models.CharField(max_length=20, default="unknown")
    urgency = models.CharField(max_length=20, default="unknown")
    # scoring.blended_score has always computed these two; they used to be
    # discarded, which meant the UI couldn't explain *why* a score was what it
    # was without re-deriving the weights client-side.
    intent_score = models.PositiveSmallIntegerField(default=0)
    urgency_score = models.PositiveSmallIntegerField(default=0)
    total_score = models.PositiveSmallIntegerField(default=0)
    computed_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.lead_id}: {self.total_score}"


class AIQualification(models.Model):
    """The rich, unstructured side of qualification produced by the AI service."""

    lead = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name="qualification")
    pain_points = models.JSONField(default=list, blank=True)
    recommended_service = models.TextField(blank=True)
    recommended_action = models.TextField(blank=True)
    ai_summary = models.TextField(blank=True)
    research_notes = models.TextField(blank=True, help_text="Findings pulled in via the web-search tool call")
    model_used = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"AI brief for lead {self.lead_id}"


class Activity(models.Model):
    """
    Append-only audit trail.

    `lead` used to be required, which made company-level events (a research job
    finishing on an account with no inbound lead) impossible to record. It is
    now nullable, with a constraint that a row must hang off *something*.
    """

    class Type(models.TextChoices):
        CREATED = "created", "Lead created"
        DUPLICATE_SUBMISSION = "duplicate_submission", "Duplicate submission"
        REQUALIFY_REQUESTED = "requalify_requested", "Re-qualification requested"
        QUALIFICATION_FAILED = "qualification_failed", "Qualification failed"
        HIGH_INTENT = "high_intent", "Routed to sales"
        NURTURE = "nurture", "Routed to nurture"
        ASSIGNED = "assigned", "Assigned"
        RESEARCH_STARTED = "research_started", "Research started"
        RESEARCH_COMPLETED = "research_completed", "Research completed"
        RESEARCH_FAILED = "research_failed", "Research failed"
        SIGNAL_DETECTED = "signal_detected", "Signal detected"
        CHANGE_DETECTED = "change_detected", "Change detected by monitoring"

    lead = models.ForeignKey(
        Lead, on_delete=models.CASCADE, related_name="activity", null=True, blank=True
    )
    company = models.ForeignKey(
        Company, on_delete=models.CASCADE, related_name="activity", null=True, blank=True
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # Free-text is still accepted (choices aren't enforced at the DB level) so
    # existing rows stay valid, but new writes should use Type.
    type = models.CharField(max_length=50, choices=Type.choices)
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "activity"
        indexes = [
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["lead", "-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(lead__isnull=False) | models.Q(company__isnull=False),
                name="activity_has_subject",
            )
        ]

    def __str__(self) -> str:
        subject = f"lead {self.lead_id}" if self.lead_id else f"company {self.company_id}"
        return f"[{self.type}] {subject}"


class Assignment(models.Model):
    lead = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name="assignment")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assignments")
    assigned_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Lead {self.lead_id} -> {self.user}"
