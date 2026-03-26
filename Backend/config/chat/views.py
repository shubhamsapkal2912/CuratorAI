import json

from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from services.llm_service import generate_answer, generate_answer_stream
from services.retrieval_service import retrieve_context

from .models import ChatConversation, ChatHistory, ChatTurn
from .serializers import (
    ChatConversationDetailSerializer,
    ChatConversationSummarySerializer,
    ChatQuerySerializer,
)


def _format_sse_event(payload):
    return f"data: {json.dumps(payload)}\n\n"


def _build_conversation_title(query):
    normalized = " ".join((query or "").split())
    if not normalized:
        return "New chat"
    if len(normalized) <= 80:
        return normalized
    return f"{normalized[:77].rstrip()}..."


def _build_conversation_preview(query):
    normalized = " ".join((query or "").split())
    if len(normalized) <= 120:
        return normalized
    return f"{normalized[:117].rstrip()}..."


def _get_conversation(user, conversation_id):
    if not conversation_id:
        return None

    return get_object_or_404(
        ChatConversation.objects.prefetch_related("turns"),
        id=conversation_id,
        user=user,
    )


def _build_history(conversation):
    if conversation is None:
        return []

    turns = list(conversation.turns.order_by("-created_at", "-id")[:6])
    turns.reverse()
    return [
        {
            "query": turn.query,
            "response": turn.response,
        }
        for turn in turns
    ]


def _save_chat_turn(user, conversation, query, answer, documents):
    turn = ChatTurn.objects.create(
        conversation=conversation,
        query=query,
        response=answer,
        documents=documents,
    )

    conversation.last_message_preview = _build_conversation_preview(query)
    conversation.save()

    ChatHistory.objects.create(
        user=user,
        query=query,
        response=answer,
    )

    return turn


def _get_or_create_conversation(user, query, conversation):
    if conversation is not None:
        return conversation, False

    return (
        ChatConversation.objects.create(
            user=user,
            title=_build_conversation_title(query),
            last_message_preview=_build_conversation_preview(query),
        ),
        True,
    )


class ServerSentEventRenderer(BaseRenderer):
    media_type = "text/event-stream"
    format = "event-stream"
    charset = "utf-8"
    render_style = "text"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if data is None:
            return b""

        if isinstance(data, (bytes, bytearray)):
            return bytes(data)

        if isinstance(data, str):
            return data.encode(self.charset)

        return json.dumps(data).encode(self.charset)


class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChatQuerySerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        query = serializer.validated_data["query"]
        document_names = serializer.validated_data["documents"]
        conversation = _get_conversation(
            request.user,
            serializer.validated_data.get("conversation_id"),
        )
        contexts = retrieve_context(
            query,
            user=request.user,
            document_names=document_names,
        )

        try:
            answer = generate_answer(
                query,
                contexts,
                history=_build_history(conversation),
            )
        except Exception as exc:
            return Response(
                {
                    "error": "Local LLM is unavailable",
                    "details": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        conversation, _ = _get_or_create_conversation(request.user, query, conversation)
        _save_chat_turn(
            request.user,
            conversation,
            query,
            answer,
            document_names,
        )
        conversation.refresh_from_db()

        return Response({
            "query": query,
            "documents": document_names,
            "answer": answer,
            "sources": contexts,
            "conversation": ChatConversationSummarySerializer(conversation).data,
        })


class ChatStreamView(APIView):
    permission_classes = [IsAuthenticated]
    renderer_classes = [ServerSentEventRenderer, JSONRenderer]

    def post(self, request):
        serializer = ChatQuerySerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        query = serializer.validated_data["query"]
        document_names = serializer.validated_data["documents"]
        conversation = _get_conversation(
            request.user,
            serializer.validated_data.get("conversation_id"),
        )
        contexts = retrieve_context(
            query,
            user=request.user,
            document_names=document_names,
        )

        try:
            answer_stream = generate_answer_stream(
                query,
                contexts,
                history=_build_history(conversation),
            )
        except Exception as exc:
            return Response(
                {
                    "error": "Local LLM is unavailable",
                    "details": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        def event_stream():
            answer_parts = []

            yield _format_sse_event({
                "type": "start",
                "query": query,
                "documents": document_names,
                "conversation_id": str(conversation.id) if conversation else None,
            })

            try:
                for chunk in answer_stream:
                    answer_parts.append(chunk)
                    yield _format_sse_event({
                        "type": "chunk",
                        "content": chunk,
                    })
            except Exception as exc:
                yield _format_sse_event({
                    "type": "error",
                    "error": "Local LLM is unavailable",
                    "details": str(exc),
                })
                return

            answer = "".join(answer_parts)
            persisted_conversation, _ = _get_or_create_conversation(
                request.user,
                query,
                conversation,
            )
            _save_chat_turn(
                request.user,
                persisted_conversation,
                query,
                answer,
                document_names,
            )
            persisted_conversation.refresh_from_db()

            yield _format_sse_event({
                "type": "complete",
                "query": query,
                "documents": document_names,
                "answer": answer,
                "sources": contexts,
                "conversation": ChatConversationSummarySerializer(
                    persisted_conversation
                ).data,
            })

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class ChatConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = (
            ChatConversation.objects.filter(user=request.user)
            .prefetch_related("turns")
            .order_by("-updated_at")
        )
        serializer = ChatConversationSummarySerializer(conversations, many=True)
        return Response(serializer.data)


class ChatConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            ChatConversation.objects.filter(user=request.user).prefetch_related("turns"),
            id=conversation_id,
        )
        serializer = ChatConversationDetailSerializer(conversation)
        return Response(serializer.data)
