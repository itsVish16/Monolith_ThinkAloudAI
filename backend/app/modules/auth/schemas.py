from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def validate_password_strength(v: str) -> str:
    """Shared password validation rules: min 8 chars, max 128, at least 1 uppercase, at least 1 number."""
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(v) > 128:
        raise ValueError("Password must be at most 128 characters long")
    if not any(c.isupper() for c in v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one number")
    return v


def normalize_email(v: str) -> str:
    """Normalizes email to lowercase with trimmed whitespace."""
    return v.strip().lower()


class UserCreate(BaseModel):
    """Schema for registering a new user."""

    username: str = Field(..., description="Unique alphanumeric username (3-30 chars)", examples=["johndoe123"])
    email: EmailStr = Field(..., description="Valid email address", examples=["john@example.com"])
    full_name: str = Field(..., description="User's full name", examples=["John Doe"])
    password: str = Field(
        ...,
        description="Strong password (min 8 chars, 1 uppercase, 1 number)",
        examples=["StrongPass123!"],
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 30:
            raise ValueError("Username must be between 3 and 30 characters")
        if not all(c.isalnum() or c == "_" for c in v):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        if v[0].isdigit():
            raise ValueError("Username cannot start with a number")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Full name must be at most 100 characters")
        return v


class UserLogin(BaseModel):
    """Schema for user authentication credentials."""

    email: EmailStr = Field(..., description="Registered email address", examples=["john@example.com"])
    password: str = Field(..., description="Account password", examples=["StrongPass123!"])

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return normalize_email(v)


class Token(BaseModel):
    """JWT Token response schema."""

    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field("bearer", description="Token type, typically 'bearer'")


class RefreshTokenRequest(BaseModel):
    """Schema for token refresh."""

    refresh_token: str = Field(..., description="Valid JWT refresh token")


class LogoutRequest(BaseModel):
    """Schema for revoking refresh token on logout."""

    refresh_token: str = Field(..., description="The refresh token to blacklist")


class PasswordResetRequest(BaseModel):
    """Schema for requesting a password reset OTP."""

    email: EmailStr = Field(..., description="Registered email address", examples=["john@example.com"])

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return normalize_email(v)


class PasswordResetConfirm(BaseModel):
    """Schema for resetting password with verification OTP."""

    email: EmailStr = Field(..., description="Registered email address", examples=["john@example.com"])
    otp: str = Field(..., description="6-digit OTP code received via email", examples=["123456"])
    new_password: str = Field(..., description="New password", examples=["NewStrongPass123!"])

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit() or len(value) != 6:
            raise ValueError("OTP must be exactly 6 digits")
        return value

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_strength(value)


class VerifyEmailRequest(BaseModel):
    """Schema for verifying email via OTP."""

    email: EmailStr = Field(..., description="Registered email address", examples=["john@example.com"])
    token: str = Field(..., description="6-digit verification OTP", examples=["123456"])

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit() or len(value) != 6:
            raise ValueError("OTP must be exactly 6 digits")
        return value


class ResendVerificationRequest(BaseModel):
    """Schema for requesting a new email verification OTP."""

    email: EmailStr = Field(..., description="Registered email address", examples=["john@example.com"])

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return normalize_email(v)


class UpdateUserRequest(BaseModel):
    """Schema for modifying user account fields."""

    username: str | None = Field(None, description="New unique username (3-30 chars)", examples=["newjohn123"])
    full_name: str | None = Field(None, description="New full name", examples=["Johnathan Doe"])

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if len(value) < 3 or len(value) > 30:
            raise ValueError("Username must be between 3 and 30 characters")
        if not all(char.isalnum() or char == "_" for char in value):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        if value[0].isdigit():
            raise ValueError("Username cannot start with a number")
        return value.lower()

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if len(value) > 100:
            raise ValueError("Full name must be at most 100 characters")
        return value


class UpdateProfileRequest(BaseModel):
    """Schema for updating extended profile details."""

    bio: str | None = None
    avatar_url: str | None = None
    github_url: str | None = None
    linkedin_url: str | None = None
    headline: str | None = None
    location: str | None = None
    institution: str | None = None
    preferred_language: str | None = None
    resume_url: str | None = None


class UserResponse(BaseModel):
    """Public user response schema."""

    id: int = Field(..., description="Unique internal user ID")
    username: str = Field(..., description="Unique username")
    email: EmailStr = Field(..., description="User email address")
    full_name: str = Field(..., description="User full name")
    role: str = Field("user", description="User role (user, admin)")
    is_admin: bool = Field(False, description="Whether user has administrative privileges")
    is_verified: bool = Field(..., description="Whether email is verified")
    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    last_login_at: datetime | None = Field(None, description="Last successful login timestamp")

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def compute_is_admin(self) -> "UserResponse":
        self.is_admin = self.role == "admin"
        return self


class UserProfileResponse(BaseModel):
    """Complete aggregated user and profile details schema."""

    id: int
    username: str
    email: EmailStr
    full_name: str
    role: str = "user"
    is_admin: bool = False
    is_verified: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None

    bio: str | None = None
    avatar_url: str | None = None
    github_url: str | None = None
    linkedin_url: str | None = None
    headline: str | None = None
    location: str | None = None
    institution: str | None = None
    preferred_language: str | None = "python"
    resume_url: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def compute_is_admin(self) -> "UserProfileResponse":
        self.is_admin = self.role == "admin"
        return self


class UserPreferenceResponse(BaseModel):
    """User UI and notification preferences schema."""

    theme: str = "system"
    email_notifications: bool = True
    push_notifications: bool = True

    model_config = ConfigDict(from_attributes=True)


class UserPreferenceUpdate(BaseModel):
    """Schema for updating user preferences."""

    theme: str | None = None
    email_notifications: bool | None = None
    push_notifications: bool | None = None


class AchievementUserOut(BaseModel):
    """Candidate achievement item with unlocked status."""

    id: int
    title: str
    description: str
    icon_url: str | None = None
    unlocked: bool = False
    awarded_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    """Standard message response."""

    message: str = Field(..., description="Informational or success status message")


# Compatibility Aliases
SignupRequest = UserCreate
LoginRequest = UserLogin
TokenResponse = Token
ForgotPasswordRequest = PasswordResetRequest
ResetPasswordRequest = PasswordResetConfirm
UpdateProfileDetailsRequest = UpdateProfileRequest

