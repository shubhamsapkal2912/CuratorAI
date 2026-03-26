import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from documents.models import Document
from embeddings.models import Embedding
from services.retrieval_service import retrieve_context
from users.models import User


class RetrieveContextServiceTests(APITestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_media_dir.cleanup)
        self.user = User.objects.create_user(
            email="service@example.com",
            password="secret123",
        )
        with override_settings(MEDIA_ROOT=self.temp_media_dir.name):
            self.document = Document.objects.create(
                user=self.user,
                file=SimpleUploadedFile("test.pdf", b"%PDF-1.4 test"),
                filename="test.pdf",
            )
            self.secondary_document = Document.objects.create(
                user=self.user,
                file=SimpleUploadedFile("roadmap.pdf", b"%PDF-1.4 roadmap"),
                filename="roadmap.pdf",
            )
            self.other_user = User.objects.create_user(
                email="other@example.com",
                password="secret123",
            )
            self.other_document = Document.objects.create(
                user=self.other_user,
                file=SimpleUploadedFile("private.pdf", b"%PDF-1.4 private"),
                filename="private.pdf",
            )

    def test_retrieve_context_deduplicates_repeated_chunks(self):
        Embedding.objects.create(
            document=self.document,
            chunk_text="Repeated chunk",
            vector_index=2,
        )
        Embedding.objects.create(
            document=self.document,
            chunk_text="Repeated chunk",
            vector_index=5,
        )
        Embedding.objects.create(
            document=self.document,
            chunk_text="Unique chunk",
            vector_index=8,
        )

        with (
            patch("services.retrieval_service.generate_embeddings", return_value=[[0.1, 0.2]]),
            patch("services.retrieval_service.search_vectors", return_value=[5, 2, 8]),
        ):
            contexts = retrieve_context("find something", k=2)

        self.assertEqual(
            [context["text"] for context in contexts],
            ["Repeated chunk", "Unique chunk"],
        )

    def test_retrieve_context_filters_by_user_and_selected_documents(self):
        Embedding.objects.create(
            document=self.document,
            chunk_text="General notes",
            vector_index=2,
        )
        Embedding.objects.create(
            document=self.secondary_document,
            chunk_text="Roadmap details",
            vector_index=5,
        )
        Embedding.objects.create(
            document=self.other_document,
            chunk_text="Private content",
            vector_index=8,
        )

        with (
            patch("services.retrieval_service.generate_embeddings", return_value=[[0.1, 0.2]]),
            patch("services.retrieval_service.search_vectors", return_value=[5, 8, 2]),
        ):
            contexts = retrieve_context(
                "find roadmap",
                user=self.user,
                document_names=["roadmap.pdf"],
                k=3,
            )

        self.assertEqual(len(contexts), 1)
        self.assertEqual(contexts[0]["filename"], "roadmap.pdf")
        self.assertEqual(contexts[0]["text"], "Roadmap details")


class RetrieveContextViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="retrieval@example.com",
            password="secret123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_search_returns_results_and_sources(self):
        contexts = [
            {
                "document_id": 1,
                "filename": "doc-a.pdf",
                "text": "first result",
                "vector_index": 5,
            },
            {
                "document_id": 2,
                "filename": "doc-b.pdf",
                "text": "second result",
                "vector_index": 2,
            },
        ]

        with patch("retrieval.views.retrieve_context", return_value=contexts):
            response = self.client.post(
                "/api/retrieval/search/",
                {"query": "find something", "documents": "doc-a.pdf, doc-b.pdf"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["documents"], ["doc-a.pdf", "doc-b.pdf"])
        self.assertEqual(
            response.data["results"],
            ["first result", "second result"],
        )
        self.assertEqual(response.data["sources"], contexts)
