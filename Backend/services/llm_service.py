from django.conf import settings
from openai import OpenAI

_client = None
NO_CONTEXT_MESSAGE = (
    "I could not find relevant context in the uploaded documents to answer that question."
)


def _get_client():
    global _client

    if _client is None:
        _client = OpenAI(
            base_url=settings.LOCAL_LLM_BASE_URL,
            api_key=settings.LOCAL_LLM_API_KEY,
        )

    return _client


def _format_context(contexts):
    return "\n\n".join(
        f"[{index}] File: {context['filename']}\n{context['text']}"
        for index, context in enumerate(contexts, start=1)
    )


def _build_history_messages(history):
    messages = []

    for turn in history or []:
        messages.append({
            "role": "user",
            "content": turn["query"],
        })
        messages.append({
            "role": "assistant",
            "content": turn["response"],
        })

    return messages


def _build_completion_kwargs(query, contexts, history=None):
    return {
        "model": settings.LOCAL_LLM_MODEL,
        "temperature": settings.LOCAL_LLM_TEMPERATURE,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a helpful RAG assistant. "
                    "Answer only from the provided context. "
                    "If the context is insufficient, say you do not know based on the uploaded documents. "
                    "Cite supporting context blocks like [1] and [2]."
                ),
            },
            *_build_history_messages(history),
            {
                "role": "user",
                "content": (
                    f"Question:\n{query}\n\n"
                    f"Context:\n{_format_context(contexts)}"
                ),
            },
        ],
    }


def generate_answer(query, contexts, history=None):
    if not contexts:
        return NO_CONTEXT_MESSAGE

    response = _get_client().chat.completions.create(
        **_build_completion_kwargs(query, contexts, history=history)
    )

    return response.choices[0].message.content or ""


def generate_answer_stream(query, contexts, history=None):
    if not contexts:
        return iter((NO_CONTEXT_MESSAGE,))

    response_stream = _get_client().chat.completions.create(
        stream=True,
        **_build_completion_kwargs(query, contexts, history=history),
    )

    def iterator():
        for chunk in response_stream:
            for choice in chunk.choices or []:
                delta = choice.delta.content
                if delta:
                    yield delta

    return iterator()
