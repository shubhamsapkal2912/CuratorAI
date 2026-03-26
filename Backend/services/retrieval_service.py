from django.conf import settings
from django.db.models import Case, IntegerField, When

from embeddings.models import Embedding
from services.embedding_service import generate_embeddings
from services.vector_store_service import search_vectors


def retrieve_context(query, user=None, document_names=None, k=None):
    top_k = k or settings.RAG_TOP_K
    search_k = max(top_k * 3, top_k)
    query_vector = generate_embeddings([query])
    vector_ids = search_vectors(query_vector, k=search_k)

    if not vector_ids:
        return []

    ranking = Case(
        *[
            When(vector_index=vector_id, then=position)
            for position, vector_id in enumerate(vector_ids)
        ],
        output_field=IntegerField(),
    )

    embeddings = Embedding.objects.filter(vector_index__in=vector_ids).select_related("document")

    if user is not None:
        embeddings = embeddings.filter(document__user=user)

    if document_names:
        embeddings = embeddings.filter(document__filename__in=document_names)

    embeddings = embeddings.order_by(ranking)

    contexts = []
    seen_chunks = set()

    for embedding in embeddings:
        normalized_text = " ".join(embedding.chunk_text.split())
        if normalized_text in seen_chunks:
            continue

        seen_chunks.add(normalized_text)
        contexts.append({
            "document_id": embedding.document_id,
            "filename": embedding.document.filename,
            "text": embedding.chunk_text,
            "vector_index": embedding.vector_index,
        })

        if len(contexts) == top_k:
            break

    return contexts
