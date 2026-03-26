from rest_framework import serializers
from .models import Document


class DocumentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ["id", "file", "filename", "uploaded_at", "processed"]
        read_only_fields = ["id", "file", "filename", "uploaded_at", "processed"]


class DocumentUploadSerializer(serializers.ModelSerializer):
    def create(self, validated_data):
        uploaded_file = validated_data["file"]
        validated_data.setdefault("filename", uploaded_file.name)
        return super().create(validated_data)

    class Meta:
        model = Document
        fields = ["id", "file", "filename", "uploaded_at", "processed"]
        read_only_fields = ["id", "filename", "uploaded_at", "processed"]
