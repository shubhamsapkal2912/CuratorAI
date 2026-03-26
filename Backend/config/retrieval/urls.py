from django.urls import path
from .views import RetrieveContextView

urlpatterns = [
    path('search/', RetrieveContextView.as_view(), name='retrieve-context'),
]