from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import User


class LoginViewTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="user@example.com",
            password="secret123",
        )

    def test_login_accepts_email_payload(self):
        response = self.client.post(
            "/api/user/login",
            {
                "email": "user@example.com",
                "password": "secret123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["email"], self.user.email)

    def test_login_ignores_stale_authorization_header(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer stale-token")

        response = self.client.post(
            "/api/user/login",
            {
                "email": "user@example.com",
                "password": "secret123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_login_still_accepts_legacy_username_field(self):
        response = self.client.post(
            "/api/user/login",
            {
                "username": "user@example.com",
                "password": "secret123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
