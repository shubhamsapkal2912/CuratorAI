from pathlib import Path
import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings

from documents.models import Document
from documents.tasks import process_document_task
from embeddings.models import Embedding
from services.vector_store_service import add_vectors, search_vectors
from users.models import User


class VectorStoreServiceTests(SimpleTestCase):
    def test_add_vectors_persists_index_for_search(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch("services.vector_store_service.INDEX_PATH", Path(temp_dir) / "faiss.index"):
                vector = [0.1] * 384

                self.assertEqual(add_vectors([vector]), [0])
                self.assertEqual(search_vectors([vector]), [0])


class ProcessDocumentTaskTests(TestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_media_dir.cleanup)

    def test_process_document_task_saves_embeddings_with_vector_indices(self):
        user = User.objects.create_user(
            email="processor@example.com",
            password="secret123",
        )
        with override_settings(MEDIA_ROOT=self.temp_media_dir.name):
            document = Document.objects.create(
                user=user,
                file=SimpleUploadedFile("test.pdf", b"%PDF-1.4 test"),
                filename="test.pdf",
            )

        with (
            patch("documents.tasks.parse_pdf", return_value="parsed text"),
            patch("documents.tasks.chunk_text", return_value=["chunk one", "chunk two"]),
            patch("documents.tasks.generate_embeddings", return_value=[[0.1, 0.2], [0.3, 0.4]]),
            patch("documents.tasks.add_vectors", return_value=[7, 8]),
        ):
            process_document_task(document.id)

        document.refresh_from_db()

        self.assertTrue(document.processed)
        self.assertQuerySetEqual(
            Embedding.objects.order_by("vector_index").values_list("chunk_text", "vector_index"),
            [("chunk one", 7), ("chunk two", 8)],
            transform=tuple,
        )
