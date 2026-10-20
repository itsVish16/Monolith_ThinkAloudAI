import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import decode_token
from app.modules.auth.models import User
from app.modules.auth.service import AuthService

logger = structlog.get_logger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> User:
    """
    Dependency that extracts and validates the JWT access token from the Authorization header,
    checks if it has been blacklisted, and loads the user from the database.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token, expected_type="access")
        user_id_str = payload.get("sub")
        jti = payload.get("jti")
        if not user_id_str or not jti:
            raise credentials_exception
        user_id = int(user_id_str)
    except (JWTError, ValueError) as err:
        logger.warning("invalid_token_presented", error=str(err))
        raise credentials_exception

    # Check blacklist in Redis
    if await AuthService.is_token_blacklisted(redis, jti):
        logger.warning("blacklisted_token_presented", user_id=user_id, jti=jti)
        raise credentials_exception

    user = await AuthService.get_user_by_id(db, user_id)
    if user is None:
        logger.warning("user_not_found_for_token", user_id=user_id)
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Dependency ensuring the authenticated user has verified their email.
    """
    if not current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address must be verified to access this resource",
        )
    return current_user


async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Dependency ensuring the authenticated user has administrative privileges.
    Checks user.role == 'admin' or email match against configured admin emails.
    """
    email = current_user.email.lower().strip()
    is_admin_role = current_user.role == "admin"
    is_admin_email = email in settings.admin_emails_list

    if not (is_admin_role or is_admin_email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required",
        )
    return current_user
