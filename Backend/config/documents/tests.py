from django.contrib.admin.sites import AdminSite
from pathlib import Path
import tempfile
from unittest.mock import patch

from kombu.exceptions import OperationalError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .admin import DocumentAdmin
from .models import Document
from users.models import User


class UploadDocumentViewTests(APITestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_media_dir.cleanup)
        self.user = User.objects.create_user(
            email="uploader@example.com",
            password="secret123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_upload_accepts_file_without_explicit_filename(self):
        uploaded_file = SimpleUploadedFile("notes.pdf", b"%PDF-1.4 test")

        with (
            override_settings(MEDIA_ROOT=self.temp_media_dir.name),
            patch("documents.processing.process_document_task.delay") as delay_mock,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = self.client.post(
                "/api/documents/upload/",
                {"file": uploaded_file},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = Document.objects.get()
        self.assertEqual(document.filename, "notes.pdf")
        self.assertTrue(document.file.name.startswith("uploaded_documents/"))
        self.assertNotIn("config\\documents", document.file.path.lower())
        delay_mock.assert_called_once_with(document.id)

    def test_upload_accepts_single_file_under_an_alternate_key(self):
        uploaded_file = SimpleUploadedFile("alias.pdf", b"%PDF-1.4 alias")

        with (
            override_settings(MEDIA_ROOT=self.temp_media_dir.name),
            patch("documents.processing.process_document_task.delay") as delay_mock,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = self.client.post(
                "/api/documents/upload/",
                {"document": uploaded_file},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = Document.objects.get(filename="alias.pdf")
        delay_mock.assert_called_once_with(document.id)

    def test_upload_falls_back_to_local_processing_when_broker_is_unavailable(self):
        uploaded_file = SimpleUploadedFile("offline.pdf", b"%PDF-1.4 offline")

        with (
            override_settings(MEDIA_ROOT=self.temp_media_dir.name),
            patch("documents.processing.process_document_task") as task_mock,
            self.captureOnCommitCallbacks(execute=True),
        ):
            task_mock.delay.side_effect = OperationalError("broker unavailable")
            response = self.client.post(
                "/api/documents/upload/",
                {"file": uploaded_file},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = Document.objects.get(filename="offline.pdf")
        task_mock.assert_called_once_with(document.id)


class DocumentListViewTests(APITestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_media_dir.cleanup)
        self.user = User.objects.create_user(
            email="list@example.com",
            password="secret123",
        )
        self.other_user = User.objects.create_user(
            email="other-list@example.com",
            password="secret123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_only_authenticated_users_documents(self):
        with override_settings(MEDIA_ROOT=self.temp_media_dir.name):
            older = Document.objects.create(
                user=self.user,
                file=SimpleUploadedFile("older.pdf", b"%PDF-1.4 older"),
                filename="older.pdf",
            )
            newer = Document.objects.create(
                user=self.user,
                file=SimpleUploadedFile("newer.pdf", b"%PDF-1.4 newer"),
                filename="newer.pdf",
            )
            Document.objects.create(
                user=self.other_user,
                file=SimpleUploadedFile("hidden.pdf", b"%PDF-1.4 hidden"),
                filename="hidden.pdf",
            )

        response = self.client.get("/api/documents/list/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [document["filename"] for document in response.data],
            [newer.filename, older.filename],
        )


class DocumentDeleteViewTests(APITestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_media_dir.cleanup)
        self.user = User.objects.create_user(
            email="delete@example.com",
            password="secret123",
        )
        self.other_user = User.objects.create_user(
            email="other-delete@example.com",
            password="secret123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_delete_removes_document_and_rebuilds_index(self):
        with override_settings(MEDIA_ROOT=self.temp_media_dir.name):
            document = Document.objects.create(
                user=self.user,
                file=SimpleUploadedFile("delete-me.pdf", b"%PDF-1.4 delete"),
                filename="delete-me.pdf",
            )
            file_path = document.file.path

        with (
            override_settings(MEDIA_ROOT=self.temp_media_dir.name),
            patch("documents.views.rebuild_vector_store") as rebuild_mock,
        ):
            response = self.client.delete(f"/api/documents/{document.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "File deleted successfully")
        self.assertFalse(Document.objects.filter(id=document.id).exists())
        self.assertFalse(Path(file_path).exists())
        rebuild_mock.assert_called_once_with()

    def test_delete_does_not_allow_other_users_document(self):
        with override_settings(MEDIA_ROOT=self.temp_media_dir.name):
            document = Document.objects.create(
                user=self.other_user,
                file=SimpleUploadedFile("private.pdf", b"%PDF-1.4 private"),
                filename="private.pdf",
            )

        with (
            override_settings(MEDIA_ROOT=self.temp_media_dir.name),
            patch("documents.views.rebuild_vector_store") as rebuild_mock,
        ):
            response = self.client.delete(f"/api/documents/{document.id}")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Document.objects.filter(id=document.id).exists())
        rebuild_mock.assert_not_called()


class DocumentAdminTests(APITestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_media_dir.cleanup)
        self.user = User.objects.create_user(
            email="admin-doc@example.com",
            password="secret123",
        )
        self.factory = RequestFactory()
        self.admin_site = AdminSite()
        self.document_admin = DocumentAdmin(Document, self.admin_site)

    def test_admin_save_triggers_processing_for_new_document(self):
        request = self.factory.post("/admin/documents/document/add/")
        request.user = self.user

        with override_settings(MEDIA_ROOT=self.temp_media_dir.name):
            document = Document(
                user=self.user,
                file=SimpleUploadedFile("admin.pdf", b"%PDF-1.4 admin"),
                filename="admin.pdf",
            )

            form = type("Form", (), {"changed_data": ["file"]})()

            with (
                patch("documents.processing.process_document_task.delay") as delay_mock,
                self.captureOnCommitCallbacks(execute=True),
            ):
                self.document_admin.save_model(request, document, form, change=False)

        self.assertTrue(Document.objects.filter(filename="admin.pdf").exists())
        delay_mock.assert_called_once_with(document.id)
