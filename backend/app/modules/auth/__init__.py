from app.modules.auth.dependencies import (
    get_current_active_user,
    get_current_admin,
    get_current_user,
    oauth2_scheme,
)
from app.modules.auth.models import User, UserPreference, UserProfile
from app.modules.auth.router import router as auth_router
from app.modules.auth.schemas import (
    LogoutRequest,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    ResendVerificationRequest,
    Token,
    UpdateProfileRequest,
    UpdateUserRequest,
    UserCreate,
    UserLogin,
    UserProfileResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.modules.auth.service import AuthService

__all__ = [
    "User",
    "UserProfile",
    "UserPreference",
    "UserCreate",
    "UserLogin",
    "Token",
    "UserResponse",
    "UserProfileResponse",
    "PasswordResetRequest",
    "PasswordResetConfirm",
    "RefreshTokenRequest",
    "LogoutRequest",
    "VerifyEmailRequest",
    "ResendVerificationRequest",
    "UpdateUserRequest",
    "UpdateProfileRequest",
    "MessageResponse",
    "AuthService",
    "get_current_user",
    "get_current_active_user",
    "get_current_admin",
    "oauth2_scheme",
    "auth_router",
]
