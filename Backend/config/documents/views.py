from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Document
from .processing import schedule_document_processing
from .serializers import DocumentListSerializer, DocumentUploadSerializer
from services.index_sync_service import rebuild_vector_store


class DocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        documents = request.user.document_set.order_by("-uploaded_at", "-id")
        serializer = DocumentListSerializer(documents, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UploadDocumentView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        data = request.data.copy()

        if "file" not in data and request.FILES:
            uploaded_files = list(request.FILES.items())
            if len(uploaded_files) == 1:
                _, uploaded_file = uploaded_files[0]
                data["file"] = uploaded_file

        serializer = DocumentUploadSerializer(data=data)

        if serializer.is_valid():
            document = serializer.save(user=request.user)
            schedule_document_processing(document.id)

            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, document_id):
        document = get_object_or_404(Document, id=document_id, user=request.user)
        storage = document.file.storage
        file_name = document.file.name

        document.delete()

        if file_name:
            storage.delete(file_name)

        rebuild_vector_store()

        return Response(
            {"message": "File deleted successfully"},
            status=status.HTTP_200_OK,
        )
