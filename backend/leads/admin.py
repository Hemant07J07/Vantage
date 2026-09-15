from django.contrib import admin

from .models import Activity, AIQualification, Assignment, Company, Lead, LeadScore


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "industry", "employee_count", "created_at")
    search_fields = ("name", "website")


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("contact_name", "email", "company", "status", "source", "created_at")
    list_filter = ("status", "source")
    search_fields = ("contact_name", "email")


admin.site.register(LeadScore)
admin.site.register(AIQualification)
admin.site.register(Activity)
admin.site.register(Assignment)
