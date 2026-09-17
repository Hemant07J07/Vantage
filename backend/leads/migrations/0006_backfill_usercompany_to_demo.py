"""
One-time backfill for the UserCompany rollout.

Every Company that existed before per-user scoping went in has no owner —
without this, all of it would vanish from every dashboard, including the
demo account's, the moment the new views ship. Assigns it all to `demo`
specifically (not "whoever the first user happens to be") so it lands
somewhere predictable and matches what was already using it.

Deliberately defensive: on any environment where a `demo` user doesn't exist
yet (a fresh deploy before seeding, for instance), this is a no-op rather
than a crash — the data simply stays unowned until someone researches it.
"""
from django.db import migrations


def backfill_to_demo(apps, schema_editor):
    User = apps.get_model("auth", "User")
    Company = apps.get_model("leads", "Company")
    UserCompany = apps.get_model("leads", "UserCompany")

    demo = User.objects.filter(username="demo").first()
    if demo is None:
        return

    existing = set(
        UserCompany.objects.filter(user=demo).values_list("company_id", flat=True)
    )
    UserCompany.objects.bulk_create(
        [
            UserCompany(user=demo, company_id=company_id)
            for company_id in Company.objects.values_list("id", flat=True)
            if company_id not in existing
        ],
        ignore_conflicts=True,
    )


def noop_reverse(apps, schema_editor):
    # Deliberately not undoing the backfill on a reverse migration — a
    # rollback shouldn't also erase demo's ownership of pre-existing data.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0005_usercompany_usercompany_uniq_user_company"),
    ]

    operations = [
        migrations.RunPython(backfill_to_demo, noop_reverse),
    ]
