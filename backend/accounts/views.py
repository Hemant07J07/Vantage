from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from intelligence.throttling import ForwardedScopedRateThrottle

from .serializers import CurrentUserSerializer, RegisterSerializer


class CurrentUserView(generics.RetrieveAPIView):
    """Who the caller actually is — the shell used to hardcode "demo"."""

    serializer_class = CurrentUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    # Unauthenticated write path, so it gets its own ceiling keyed on the real
    # client IP rather than the Next.js proxy's (see intelligence.throttling).
    throttle_scope = "register"
    throttle_classes = [ForwardedScopedRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Same {access, refresh} shape TokenObtainPairView returns, so the
        # frontend can sign the new account straight in without a second call.
        refresh = RefreshToken.for_user(user)
        return Response(
            {"access": str(refresh.access_token), "refresh": str(refresh)},
            status=status.HTTP_201_CREATED,
        )
