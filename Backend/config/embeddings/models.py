from django.db import models
from documents.models import Document

class Embedding(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE)
    chunk_text = models.TextField()
    vector_index = models.IntegerField()  # 🔥 important
    created_at = models.DateTimeField(auto_now_add=True)