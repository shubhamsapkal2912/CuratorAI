from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from users.models import User

from .models import ChatConversation, ChatHistory, ChatTurn


class ChatViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="chat@example.com",
            password="secret123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_chat_returns_answer_and_sources(self):
        contexts = [
            {
                "document_id": 1,
                "filename": "project.pdf",
                "text": "This document is about an annotation workflow.",
                "vector_index": 4,
            }
        ]

        with (
            patch("chat.views.retrieve_context", return_value=contexts),
            patch(
                "chat.views.generate_answer",
                return_value="The document is about an annotation workflow. [1]",
            ),
        ):
            response = self.client.post(
                "/api/chat/ask/",
                {
                    "query": "What is this document about?",
                    "documents": "project.pdf, project.pdf",
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["documents"], ["project.pdf"])
        self.assertEqual(
            response.data["answer"],
            "The document is about an annotation workflow. [1]",
        )
        self.assertEqual(response.data["sources"], contexts)
        self.assertIn("conversation", response.data)
        self.assertEqual(ChatHistory.objects.count(), 1)
        self.assertEqual(ChatConversation.objects.count(), 1)
        self.assertEqual(ChatTurn.objects.count(), 1)

    def test_chat_stream_returns_chunked_events_and_persists_history(self):
        contexts = [
            {
                "document_id": 1,
                "filename": "project.pdf",
                "text": "This document is about an annotation workflow.",
                "vector_index": 4,
            }
        ]

        with (
            patch("chat.views.retrieve_context", return_value=contexts),
            patch(
                "chat.views.generate_answer_stream",
                return_value=iter(["The document ", "is about an annotation workflow. [1]"]),
            ),
        ):
            response = self.client.post(
                "/api/chat/ask/stream/",
                {
                    "query": "What is this document about?",
                    "documents": "project.pdf",
                },
                format="json",
                HTTP_ACCEPT="text/event-stream",
            )

            body = b"".join(response.streaming_content).decode()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response["Content-Type"].startswith("text/event-stream"))
        self.assertIn('"type": "start"', body)
        self.assertIn('"type": "chunk"', body)
        self.assertIn("The document ", body)
        self.assertIn("annotation workflow. [1]", body)
        self.assertIn('"type": "complete"', body)
        self.assertIn('"conversation"', body)
        self.assertEqual(ChatHistory.objects.count(), 1)
        self.assertEqual(ChatConversation.objects.count(), 1)
        self.assertEqual(ChatTurn.objects.count(), 1)
        self.assertEqual(
            ChatHistory.objects.first().response,
            "The document is about an annotation workflow. [1]",
        )

    def test_chat_conversation_list_and_detail_return_persisted_messages(self):
        conversation = ChatConversation.objects.create(
            user=self.user,
            title="What is this document about?",
            last_message_preview="What is this document about?",
        )
        turn = ChatTurn.objects.create(
            conversation=conversation,
            query="What is this document about?",
            response="The document is about an annotation workflow. [1]",
            documents=["project.pdf"],
        )

        list_response = self.client.get("/api/chat/conversations/")
        detail_response = self.client.get(f"/api/chat/conversations/{conversation.id}/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(str(list_response.data[0]["id"]), str(conversation.id))
        self.assertEqual(list_response.data[0]["turn_count"], 1)

        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["title"], conversation.title)
        self.assertEqual(len(detail_response.data["turns"]), 1)
        self.assertEqual(detail_response.data["turns"][0]["id"], turn.id)
        self.assertEqual(len(detail_response.data["messages"]), 2)
        self.assertEqual(detail_response.data["messages"][0]["role"], "user")
        self.assertEqual(detail_response.data["messages"][1]["role"], "ai")
        self.assertEqual(
            detail_response.data["messages"][1]["source_documents"],
            ["project.pdf"],
        )
