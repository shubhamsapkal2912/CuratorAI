from embeddings.models import Embedding
from services.embedding_service import generate_embeddings
from services.vector_store_service import replace_index


def rebuild_vector_store():
    embeddings = list(
        Embedding.objects.select_related("document").order_by("document_id", "id")
    )

    if not embeddings:
        replace_index([])
        return

    vectors = generate_embeddings([embedding.chunk_text for embedding in embeddings])
    vector_indices = replace_index(vectors)

    for embedding, vector_index in zip(embeddings, vector_indices):
        embedding.vector_index = vector_index

    Embedding.objects.bulk_update(embeddings, ["vector_index"])
