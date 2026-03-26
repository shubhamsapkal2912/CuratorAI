from rest_framework import serializers


class RetrieveContextSerializer(serializers.Serializer):
    query = serializers.CharField()
    documents = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_documents(self, value):
        if not value:
            return []

        document_names = []
        seen_names = set()

        for name in value.split(","):
            normalized_name = name.strip()
            if not normalized_name or normalized_name in seen_names:
                continue

            seen_names.add(normalized_name)
            document_names.append(normalized_name)

        return document_names
