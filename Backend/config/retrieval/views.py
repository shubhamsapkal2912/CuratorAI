from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.retrieval_service import retrieve_context

from .serializers import RetrieveContextSerializer


class RetrieveContextView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RetrieveContextSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        query = serializer.validated_data["query"]
        document_names = serializer.validated_data["documents"]
        contexts = retrieve_context(
            query,
            user=request.user,
            document_names=document_names,
        )

        return Response({
            "query": query,
            "documents": document_names,
            "results": [context["text"] for context in contexts],
            "sources": contexts,
        })
