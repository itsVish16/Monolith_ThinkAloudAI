import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import anyio
from jose import jwt
from passlib.context import CryptContext

from app.config import settings

# Password hashing context using bcrypt
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pre-computed bcrypt hash used for constant-time comparison when user doesn't exist.
# Prevents timing side-channel attacks that could enumerate registered emails.
DUMMY_HASH = password_context.hash("dummy-password-for-timing-normalization")

# Cap concurrent bcrypt operations per worker process.
# Default anyio threadpool is 40 threads/worker; capping limits CPU thrashing.
_bcrypt_limiter = anyio.CapacityLimiter(settings.bcrypt_concurrency)


def verify_password_sync(plain_password: str, password_hash: str) -> bool:
    """Synchronous password verification."""
    return password_context.verify(plain_password, password_hash)


def get_password_hash_sync(password: str) -> str:
    """Synchronous password hashing."""
    return password_context.hash(password)


# Aliases for standard interface
def get_password_hash(password: str) -> str:
    """Hash a password synchronously."""
    return get_password_hash_sync(password)


async def hash_password(password: str) -> str:
    """Asynchronously hash a password offloaded to thread pool with concurrency limiting."""
    return await anyio.to_thread.run_sync(
        get_password_hash_sync,
        password,
        limiter=_bcrypt_limiter,
    )


async def verify_password(plain_password: str, password_hash: str) -> bool:
    """Asynchronously verify a password offloaded to thread pool with concurrency limiting."""
    return await anyio.to_thread.run_sync(
        verify_password_sync,
        plain_password,
        password_hash,
        limiter=_bcrypt_limiter,
    )


def create_access_token(
    subject: str,
    username: str = "",
    email: str = "",
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Creates a signed JWT access token.
    """
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "username": username,
        "email": email,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(UTC),
        "jti": str(uuid.uuid4()),
        "iss": settings.jwt_issuer,
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.algorithm)


def create_refresh_token(
    subject: str,
    username: str = "",
    email: str = "",
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Creates a signed JWT refresh token.
    """
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.refresh_token_expire_minutes)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "username": username,
        "email": email,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(UTC),
        "jti": str(uuid.uuid4()),
        "iss": settings.jwt_issuer,
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.algorithm)


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    """
    Decodes and validates a JWT token.
    Raises JWTError if invalid or expired.
    Raises ValueError if expected_type does not match or subject is missing.
    """
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.algorithm],
        issuer=settings.jwt_issuer if settings.jwt_issuer else None,
    )
    user_id = payload.get("sub")
    if user_id is None:
        raise ValueError("Token missing subject claim ('sub')")

    if expected_type is not None:
        token_type = payload.get("type")
        if token_type != expected_type:
            raise ValueError(f"Invalid token type: expected '{expected_type}', got '{token_type}'")

    return payload


def generate_otp(length: int = 6) -> str:
    """Generates a secure numeric OTP."""
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def generate_reset_token() -> str:
    """Generates a URL-safe secure random token."""
    return secrets.token_urlsafe(32)
