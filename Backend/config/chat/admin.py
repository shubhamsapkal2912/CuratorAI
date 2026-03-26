from django.contrib import admin

from .models import ChatHistory


@admin.register(ChatHistory)
class ChatHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "query_preview", "created_at")
    list_filter = ("created_at",)
    search_fields = ("user__email", "query", "response")
    ordering = ("-created_at", "-id")
    list_select_related = ("user",)
    readonly_fields = ("user", "query", "response", "created_at")

    @admin.display(description="Query")
    def query_preview(self, obj):
        text = " ".join(obj.query.split())
        return text[:100] + "..." if len(text) > 100 else text
