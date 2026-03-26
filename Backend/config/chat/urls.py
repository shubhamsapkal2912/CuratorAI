from django.urls import path
from .views import (
    ChatConversationDetailView,
    ChatConversationListView,
    ChatStreamView,
    ChatView,
)

urlpatterns = [
    path("ask/", ChatView.as_view(), name="chat-ask"),
    path("ask/stream/", ChatStreamView.as_view(), name="chat-ask-stream"),
    path("conversations/", ChatConversationListView.as_view(), name="chat-conversations"),
    path(
        "conversations/<uuid:conversation_id>/",
        ChatConversationDetailView.as_view(),
        name="chat-conversation-detail",
    ),
]
