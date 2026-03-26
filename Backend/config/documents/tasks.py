from celery import shared_task

from embeddings.models import Embedding
from services.chunking_service import chunk_text
from services.document_parser_service import parse_pdf
from services.embedding_service import generate_embeddings
from services.vector_store_service import add_vectors

from .models import Document


@shared_task
def process_document_task(document_id):
    document = Document.objects.get(id=document_id)

    text = parse_pdf(document.file.path)
    chunks = chunk_text(text)
    embeddings = generate_embeddings(chunks)
    vector_indices = add_vectors(embeddings)

    Embedding.objects.bulk_create([
        Embedding(
            document=document,
            chunk_text=chunk,
            vector_index=vector_index,
        )
        for chunk, vector_index in zip(chunks, vector_indices)
    ])

    document.processed = True
    document.save(update_fields=["processed"])
