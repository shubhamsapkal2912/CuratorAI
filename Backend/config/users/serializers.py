from rest_framework import serializers
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken

class LoginSerializer(serializers.Serializer):
    username = serializers.EmailField(required=False)
    email = serializers.EmailField(required=False)
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = (data.get("email") or data.get("username") or "").strip().lower()
        password = data.get("password")

        if not email:
            raise serializers.ValidationError({
                "email": ["Email is required."]
            })

        user = authenticate(username=email, password=password)

        if not user:
            raise serializers.ValidationError({
                "non_field_errors": ["Invalid credentials"]
            })

        refresh = RefreshToken.for_user(user)

        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "email": user.email,
        }
