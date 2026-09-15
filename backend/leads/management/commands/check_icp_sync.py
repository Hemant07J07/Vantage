"""
Verify the backend's ICP constants still match the AI service's prompt spec.

These are two representations of one business rule: Python constants that drive
scoring, and prose that tells the model what to look for. They used to be
maintained separately, so an ICP change in one place produced scores and
narratives that quietly disagreed. This command makes that divergence loud.

    python manage.py check_icp_sync
"""
import httpx
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from leads.scoring import ICP_INDUSTRIES, ICP_MAX_EMPLOYEES, ICP_MIN_EMPLOYEES


class Command(BaseCommand):
    help = "Check that leads/scoring.py agrees with the AI service's ICP spec."

    def handle(self, *args, **options):
        url = f"{settings.AI_SERVICE_URL}/icp"
        try:
            response = httpx.get(url, timeout=10.0)
            response.raise_for_status()
            spec = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise CommandError(f"Could not fetch {url}: {exc}") from exc

        remote_industries = {i.strip().lower() for i in spec.get("industries", [])}
        problems = []

        if remote_industries != ICP_INDUSTRIES:
            only_backend = ICP_INDUSTRIES - remote_industries
            only_service = remote_industries - ICP_INDUSTRIES
            if only_backend:
                problems.append(f"only in scoring.py: {sorted(only_backend)}")
            if only_service:
                problems.append(f"only in the AI service: {sorted(only_service)}")

        if spec.get("min_employees") != ICP_MIN_EMPLOYEES:
            problems.append(
                f"min_employees differs: scoring.py={ICP_MIN_EMPLOYEES}, service={spec.get('min_employees')}"
            )
        if spec.get("max_employees") != ICP_MAX_EMPLOYEES:
            problems.append(
                f"max_employees differs: scoring.py={ICP_MAX_EMPLOYEES}, service={spec.get('max_employees')}"
            )

        if problems:
            self.stderr.write(self.style.ERROR("ICP definitions have diverged:"))
            for problem in problems:
                self.stderr.write(f"  - {problem}")
            raise CommandError("ICP is out of sync between the backend and the AI service.")

        self.stdout.write(self.style.SUCCESS(
            f"ICP in sync: {len(ICP_INDUSTRIES)} industries, "
            f"{ICP_MIN_EMPLOYEES}-{ICP_MAX_EMPLOYEES} employees."
        ))
