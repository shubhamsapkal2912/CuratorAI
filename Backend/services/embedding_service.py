from sentence_transformers import SentenceTransformer

_model = None


def _get_model():
    global _model

    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")

    return _model


def generate_embeddings(chunks):
    return _get_model().encode(chunks)
