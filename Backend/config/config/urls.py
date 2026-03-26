from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def home(request):
    return JsonResponse({
        "message": "RAG Backend Running",
        "status": "ok",
    })


urlpatterns = [
    path("", home),
    path("admin/", admin.site.urls),
    path("api/user/", include("users.urls")),
    path("api/documents/", include("documents.urls")),
    path("api/retrieval/", include("retrieval.urls")),
    path("api/chat/", include("chat.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
