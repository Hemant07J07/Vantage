"""
Seed a small, genuinely-AI-qualified demo dataset.

Two deliberate choices:

**Everything is real.** No fabricated scores, no backdated timestamps, no
synthetic trend history. Every score here comes from an actual model run, which
means the dashboard on first boot shows one day of real data — and the sparse
states in the UI are doing their job rather than being hidden behind filler.

**Everything is sequential.** Tasks are called in-process, not via `.delay()`.
An earlier version queued all the leads at once against a single-concurrency
model backend and four of five then timed out waiting behind each other.
Staying sequential also keeps this comfortably under the model provider's own
per-minute rate limit. Running here, in one process, makes the ordering
impossible to get wrong.
"""
import time

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from intelligence.models import ResearchJob
from intelligence.tasks import run_research_job
from leads.companies import resolve_company
from leads.models import Lead
from leads.tasks import qualify_lead_task

User = get_user_model()

# Twelve leads spanning the intent spectrum — deliberately varied *inputs*, so
# the resulting score distribution is varied for real reasons rather than
# because the numbers were chosen.
SAMPLE_LEADS = [
    # --- clear high intent -------------------------------------------------
    {
        "contact_name": "Marcus Webb", "email": "marcus@fieldstone-group.com",
        "company_name": "Fieldstone Group", "website": "https://fieldstone-group.com",
        "industry": "B2B SaaS", "employee_count": 310, "source": Lead.Source.WEBSITE,
        "message": "Our board wants a demand-gen system live before next quarter. "
                   "Budget is approved. Can we talk this week?",
    },
    {
        "contact_name": "Leila Haddad", "email": "leila@nova-industrial.com",
        "company_name": "Nova Industrial", "website": "https://nova-industrial.com",
        "industry": "Manufacturing", "employee_count": 1200, "source": Lead.Source.WHATSAPP,
        "message": "Requesting a call with sales to discuss enterprise implementation "
                   "and pricing for a 12-month rollout.",
    },
    {
        "contact_name": "Tomas Reiner", "email": "t.reiner@apexforge.de",
        "company_name": "Apexforge", "website": "https://apexforge.de",
        "industry": "Manufacturing", "employee_count": 540, "source": Lead.Source.LANDING_PAGE,
        "message": "We're replacing our current RFQ tooling this quarter and have "
                   "signoff. Who do we speak to about migration?",
    },
    # --- medium ------------------------------------------------------------
    {
        "contact_name": "Priya Nair", "email": "priya@brightloomcrm.com",
        "company_name": "Brightloom CRM", "website": "https://brightloomcrm.com",
        "industry": "B2B SaaS", "employee_count": 140, "source": Lead.Source.WEBSITE,
        "message": "We're evaluating tools to speed up lead qualification for our SDR team.",
    },
    {
        "contact_name": "Daniel Okafor", "email": "daniel@ferrotek.co",
        "company_name": "FerroTek Manufacturing", "website": "https://ferrotek.co",
        "industry": "Manufacturing", "employee_count": 800, "source": Lead.Source.LANDING_PAGE,
        "message": "Looking for a way to capture and qualify inbound RFQs faster.",
    },
    {
        "contact_name": "Sara Lindqvist", "email": "sara@northpeak.io",
        "company_name": "Northpeak", "website": "https://northpeak.io",
        "industry": "Marketing technology", "employee_count": 95, "source": Lead.Source.LINKEDIN,
        "message": "Interested in how you handle attribution across channels. "
                   "We're mapping options for next year.",
    },
    {
        "contact_name": "Kenji Watanabe", "email": "kenji@meridian-consult.jp",
        "company_name": "Meridian Consulting", "website": "https://meridian-consult.jp",
        "industry": "Professional services", "employee_count": 220, "source": Lead.Source.WEBSITE,
        "message": "Our partners want better visibility into which prospects to prioritise. "
                   "No firm timeline yet.",
    },
    # --- low / browsing ----------------------------------------------------
    {
        "contact_name": "Ana Souza", "email": "ana.souza@paperclip.io",
        "company_name": "Paperclip", "website": "https://paperclip.io",
        "industry": "Professional services", "employee_count": 35, "source": Lead.Source.LINKEDIN,
        "message": "Just checking out pricing, not urgent right now.",
    },
    {
        "contact_name": "Greg Mullins", "email": "greg.mullins@gmail.com",
        "company_name": "", "website": "",
        "industry": "", "employee_count": None, "source": Lead.Source.WEBSITE,
        "message": "hi whats this",
    },
    {
        "contact_name": "Nadia Farouk", "email": "nadia@studio-lumen.com",
        "company_name": "Studio Lumen", "website": "https://studio-lumen.com",
        "industry": "Design", "employee_count": 8, "source": Lead.Source.WEBSITE,
        "message": "Do you offer a free tier for very small teams? Just exploring.",
    },
    # --- borderline --------------------------------------------------------
    {
        "contact_name": "Robert Chen", "email": "r.chen@halcyon-systems.com",
        "company_name": "Halcyon Systems", "website": "https://halcyon-systems.com",
        "industry": "B2B SaaS", "employee_count": 6500, "source": Lead.Source.LINKEDIN,
        "message": "Evaluating vendors for a pilot. Procurement is slow here but the "
                   "need is real — we're losing deals to slow follow-up.",
    },
    {
        "contact_name": "Ines Duarte", "email": "ines@verdant-labs.pt",
        "company_name": "Verdant Labs", "website": "https://verdant-labs.pt",
        "industry": "Marketing technology", "employee_count": 18, "source": Lead.Source.LANDING_PAGE,
        "message": "Small team but growing fast — we just raised and are hiring SDRs. "
                   "Want to get this right before we scale.",
    },
]

# Companies given a full research run, so Accounts has real intelligence.
RESEARCH_DOMAINS = [
    "fieldstone-group.com",
    "nova-industrial.com",
    "brightloomcrm.com",
    "ferrotek.co",
    "northpeak.io",
    "halcyon-systems.com",
]


class Command(BaseCommand):
    help = "Create the demo user and a small set of genuinely AI-qualified leads."

    def add_arguments(self, parser):
        parser.add_argument("--leads-only", action="store_true", help="Skip company research")
        parser.add_argument("--research-only", action="store_true", help="Skip lead creation")
        parser.add_argument("--force", action="store_true", help="Re-run over existing rows")

    def handle(self, *args, **options):
        self._ensure_user()

        if not options["research_only"]:
            self._seed_leads(force=options["force"])

        if not options["leads_only"]:
            self._research_companies(force=options["force"])

        self.stdout.write(self.style.SUCCESS("\nDone."))

    def _ensure_user(self):
        if User.objects.filter(username="demo").exists():
            self.stdout.write("User 'demo' already exists.")
            return
        User.objects.create_user(username="demo", password="vantage-demo", is_staff=True)
        self.stdout.write(self.style.SUCCESS("Created staff user 'demo' / 'vantage-demo'"))

    def _seed_leads(self, *, force: bool):
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nQualifying {len(SAMPLE_LEADS)} leads (sequentially — expect ~30s each)"
        ))

        succeeded = failed = skipped = 0

        for index, spec in enumerate(SAMPLE_LEADS, start=1):
            email = spec["email"]
            existing = Lead.objects.filter(email=email).first()

            if existing and not force:
                self.stdout.write(f"  [{index}/{len(SAMPLE_LEADS)}] {email} — exists, skipping")
                skipped += 1
                continue

            lead = existing
            if lead is None:
                company = None
                if spec["company_name"] or spec["website"]:
                    company, _ = resolve_company(
                        name=spec["company_name"] or None,
                        website=spec["website"] or None,
                        domain=email,
                        defaults={
                            "industry": spec["industry"],
                            "employee_count": spec["employee_count"],
                        },
                    )
                lead = Lead.objects.create(
                    company=company,
                    contact_name=spec["contact_name"],
                    email=email,
                    message=spec["message"],
                    source=spec["source"],
                )

            self.stdout.write(
                f"  [{index}/{len(SAMPLE_LEADS)}] {spec['contact_name']:20} … ", ending=""
            )
            self.stdout.flush()

            started = time.monotonic()
            try:
                # Called directly, not .delay(): in-process is sequential by
                # construction and can't contend with the worker.
                qualify_lead_task(lead.id)
                lead.refresh_from_db()
                score = getattr(lead, "score", None)
                elapsed = time.monotonic() - started
                self.stdout.write(
                    f"{lead.status:11} score={score.total_score if score else '—':>3}  ({elapsed:.0f}s)"
                )
                succeeded += 1
            except Exception as exc:  # noqa: BLE001
                # One bad lead shouldn't abort the batch.
                self.stdout.write(self.style.ERROR(f"failed: {exc}"))
                failed += 1

        self.stdout.write(
            f"\nLeads: {succeeded} qualified, {failed} failed, {skipped} skipped."
        )

    def _research_companies(self, *, force: bool):
        from leads.models import Company

        companies = list(Company.objects.filter(domain__in=RESEARCH_DOMAINS))
        if not companies:
            self.stdout.write("\nNo companies to research (run without --research-only first).")
            return

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nResearching {len(companies)} companies (4 model calls each)"
        ))

        succeeded = failed = skipped = 0

        for index, company in enumerate(companies, start=1):
            if hasattr(company, "intelligence") and not force:
                self.stdout.write(f"  [{index}/{len(companies)}] {company.name} — researched, skipping")
                skipped += 1
                continue

            job = ResearchJob.objects.create(
                company=company,
                input_query=company.domain or company.name,
                normalized_domain=company.domain or "",
                steps=ResearchJob.initial_steps(),
            )

            self.stdout.write(f"  [{index}/{len(companies)}] {company.name:24} … ", ending="")
            self.stdout.flush()

            started = time.monotonic()
            try:
                run_research_job(str(job.id))
                job.refresh_from_db()
                elapsed = time.monotonic() - started
                if job.status == ResearchJob.Status.COMPLETE:
                    intel = getattr(company, "intelligence", None)
                    self.stdout.write(
                        f"complete  icp={intel.icp_fit_score if intel else '—':>3}  ({elapsed:.0f}s)"
                    )
                    succeeded += 1
                else:
                    self.stdout.write(self.style.WARNING(f"{job.status}: {job.error[:60]}"))
                    failed += 1
            except Exception as exc:  # noqa: BLE001
                self.stdout.write(self.style.ERROR(f"failed: {exc}"))
                failed += 1

        self.stdout.write(
            f"\nResearch: {succeeded} complete, {failed} failed, {skipped} skipped."
        )
