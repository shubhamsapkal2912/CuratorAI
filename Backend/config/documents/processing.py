from django.db import transaction
from kombu.exceptions import OperationalError

from embeddings.models import Embedding
from services.index_sync_service import rebuild_vector_store

from .tasks import process_document_task


def schedule_document_processing(document_id, reset_existing=False):
    def _process():
        if reset_existing:
            Embedding.objects.filter(document_id=document_id).delete()
            rebuild_vector_store()

        try:
            process_document_task.delay(document_id)
        except OperationalError:
            process_document_task(document_id)

    transaction.on_commit(_process)
