"""
Give `CompanyIntelligence.stage` a real vocabulary.

The field shipped as a free-text CharField that the research task hardwired to
the single value "researched", so every row carried the same string and the
column said nothing. This replaces it with the pipeline's actual stages and
back-fills what the old value should have meant.

The back-fill reads the score that was already stored rather than inventing a
position: rows that cleared the qualification bar become QUALIFIED, the rest
become RESEARCHING. Nothing is promoted to ENGAGED or WON — those are only
ever set by a person, and no historical row carries evidence that anyone did.
"""
from django.db import migrations, models

QUALIFIED_MIN_SCORE = 50


def set_stages(apps, schema_editor):
    CompanyIntelligence = apps.get_model("intelligence", "CompanyIntelligence")

    CompanyIntelligence.objects.filter(
        icp_fit_score__gte=QUALIFIED_MIN_SCORE
    ).update(stage="qualified")

    CompanyIntelligence.objects.filter(
        icp_fit_score__lt=QUALIFIED_MIN_SCORE
    ).update(stage="researching")


def unset_stages(apps, schema_editor):
    """Restore the single pre-migration value so a rollback is lossless."""
    CompanyIntelligence = apps.get_model("intelligence", "CompanyIntelligence")
    CompanyIntelligence.objects.all().update(stage="researched")


class Migration(migrations.Migration):

    dependencies = [
        ("intelligence", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="companyintelligence",
            name="stage",
            field=models.CharField(
                choices=[
                    ("new", "New"),
                    ("researching", "Researching"),
                    ("qualified", "Qualified"),
                    ("engaged", "Engaged"),
                    ("won", "Won"),
                ],
                db_index=True,
                default="new",
                max_length=24,
            ),
        ),
        migrations.RunPython(set_stages, unset_stages),
    ]
