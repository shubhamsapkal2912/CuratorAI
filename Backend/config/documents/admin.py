from django.contrib import admin

from .models import Document
from .processing import schedule_document_processing


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("id", "filename", "user", "processed", "uploaded_at")
    list_filter = ("processed", "uploaded_at")
    search_fields = ("filename", "user__email")
    ordering = ("-uploaded_at", "-id")
    list_select_related = ("user",)
    readonly_fields = ("uploaded_at",)

    def save_model(self, request, obj, form, change):
        should_process = not change or "file" in form.changed_data

        if should_process:
            obj.processed = False

        super().save_model(request, obj, form, change)

        if not should_process:
            return

        schedule_document_processing(obj.id, reset_existing=change)
