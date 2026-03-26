from rest_framework import serializers

from .models import ChatConversation, ChatTurn


class ChatQuerySerializer(serializers.Serializer):
    query = serializers.CharField()
    documents = serializers.CharField(required=False, allow_blank=True, default="")
    conversation_id = serializers.UUIDField(required=False)

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


class ChatMessageSerializer(serializers.Serializer):
    id = serializers.CharField()
    role = serializers.CharField()
    text = serializers.CharField()
    timestamp = serializers.DateTimeField()
    source_documents = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )


class ChatTurnSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatTurn
        fields = ["id", "query", "response", "documents", "created_at"]


class ChatConversationSummarySerializer(serializers.ModelSerializer):
    turn_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatConversation
        fields = [
            "id",
            "title",
            "last_message_preview",
            "created_at",
            "updated_at",
            "turn_count",
        ]

    def get_turn_count(self, obj):
        return obj.turns.count()


class ChatConversationDetailSerializer(serializers.ModelSerializer):
    turns = ChatTurnSerializer(many=True, read_only=True)
    messages = serializers.SerializerMethodField()
    turn_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatConversation
        fields = [
            "id",
            "title",
            "last_message_preview",
            "created_at",
            "updated_at",
            "turn_count",
            "turns",
            "messages",
        ]

    def get_turn_count(self, obj):
        return obj.turns.count()

    def get_messages(self, obj):
        messages = []

        for turn in obj.turns.all():
            timestamp = turn.created_at
            messages.append({
                "id": f"{turn.id}-user",
                "role": "user",
                "text": turn.query,
                "timestamp": timestamp,
            })
            messages.append({
                "id": f"{turn.id}-ai",
                "role": "ai",
                "text": turn.response,
                "timestamp": timestamp,
                "source_documents": turn.documents,
            })

        serializer = ChatMessageSerializer(messages, many=True)
        return serializer.data
