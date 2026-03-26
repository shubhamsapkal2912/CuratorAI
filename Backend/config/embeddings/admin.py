from django.contrib import admin

from .models import Embedding


@admin.register(Embedding)
class EmbeddingAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "document_filename", "vector_index", "chunk_preview", "created_at")
    list_filter = ("created_at",)
    search_fields = ("document__filename", "document__user__email", "chunk_text")
    ordering = ("-created_at", "-id")
    list_select_related = ("document",)
    readonly_fields = ("created_at", "chunk_preview")

    @admin.display(ordering="document__filename", description="Filename")
    def document_filename(self, obj):
        return obj.document.filename

    @admin.display(description="Chunk Preview")
    def chunk_preview(self, obj):
        text = " ".join(obj.chunk_text.split())
        return text[:100] + "..." if len(text) > 100 else text
