from pathlib import Path

import faiss
import numpy as np

INDEX_DIMENSION = 384
INDEX_PATH = Path(__file__).resolve().parent.parent / "config" / "faiss.index"


def _load_index():
    if INDEX_PATH.exists():
        return faiss.read_index(str(INDEX_PATH))

    return faiss.IndexFlatL2(INDEX_DIMENSION)


def _normalize_vectors(vectors):
    vectors = np.array(vectors).astype("float32")

    if vectors.size == 0:
        return vectors.reshape(0, INDEX_DIMENSION)

    if vectors.ndim == 1:
        vectors = np.expand_dims(vectors, axis=0)

    return vectors


def replace_index(vectors):
    index = faiss.IndexFlatL2(INDEX_DIMENSION)

    if len(vectors) > 0:
        normalized_vectors = _normalize_vectors(vectors)
        index.add(normalized_vectors)

    faiss.write_index(index, str(INDEX_PATH))

    return list(range(index.ntotal))


def add_vectors(vectors):
    index = _load_index()
    vectors = _normalize_vectors(vectors)

    if len(vectors) == 0:
        return []

    start_index = index.ntotal
    index.add(vectors)
    faiss.write_index(index, str(INDEX_PATH))

    return list(range(start_index, start_index + len(vectors)))


def search_vectors(query_vector, k=5):
    index = _load_index()
    query_vector = _normalize_vectors(query_vector)

    if index.ntotal == 0:
        return []

    k = min(k, index.ntotal)

    _, indices = index.search(query_vector, k)

    return [vector_id for vector_id in indices[0].tolist() if vector_id != -1]
