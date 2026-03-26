from django.urls import path
from .views import DocumentDetailView, DocumentListView, UploadDocumentView

urlpatterns = [
    path('list/', DocumentListView.as_view()),
    path('upload/', UploadDocumentView.as_view()),
    path('<int:document_id>', DocumentDetailView.as_view()),
]
