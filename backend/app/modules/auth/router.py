from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.redis import get_redis
from app.modules.auth.dependencies import (
    get_current_active_user,
    get_current_user,
    oauth2_scheme,
)
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    AchievementUserOut,
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
    UserPreferenceResponse,
    UserPreferenceUpdate,
    UserProfileResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.modules.auth.service import AuthService

router = APIRouter(tags=["auth"])


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
    description="Registers a new user and dispatches a 6-digit email verification OTP.",
)
@router.post(
    "/signup",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
@limiter.limit(settings.rate_limit_signup)
async def register(
    request: Request,
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    otp = await AuthService.register(payload, background_tasks, db, redis)
    if settings.debug:
        return MessageResponse(message=f"User registered successfully. Verification OTP: {otp}")
    return MessageResponse(message="User registered successfully. Please verify your email using the OTP sent.")


@router.post(
    "/login",
    response_model=Token,
    summary="Authenticate user and obtain JWT tokens",
    description="Authenticates with email and password. Returns access and refresh JWT tokens.",
)
@limiter.limit(settings.rate_limit_login)
async def login(
    request: Request,
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> Token:
    return await AuthService.login(payload, db, redis)


@router.post(
    "/refresh",
    response_model=Token,
    summary="Refresh access token",
    description="Issues a fresh access and refresh token pair using a valid refresh token.",
)
@limiter.limit(settings.rate_limit_refresh)
async def refresh_token(
    request: Request,
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> Token:
    return await AuthService.refresh_token(payload, db, redis)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout user and invalidate tokens",
    description="Blacklists the access token and provided refresh token in Redis.",
)
async def logout(
    payload: LogoutRequest | None = None,
    token: str = Depends(oauth2_scheme),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    result = await AuthService.logout(token, payload, redis)
    return MessageResponse(message=result["message"])


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user account",
    description="Retrieves account details for the authenticated user.",
)
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user account",
    description="Updates basic user account details (full_name or username).",
)
async def update_me(
    payload: UpdateUserRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> UserResponse:
    return await AuthService.update_user(current_user, payload, db, redis)


@router.get(
    "/profile",
    response_model=UserProfileResponse,
    summary="Get complete user profile",
    description="Retrieves extended profile and account information.",
)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> UserProfileResponse:
    return await AuthService.get_user_profile(current_user, db, redis)


@router.patch(
    "/profile",
    response_model=UserProfileResponse,
    summary="Update extended user profile",
    description="Updates developer bio, social links, preferred language, and headlines.",
)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> UserProfileResponse:
    return await AuthService.update_profile(current_user, payload, db, redis)


@router.get(
    "/profile/{username}",
    response_model=UserProfileResponse,
    summary="Get public user profile by username",
    description="Retrieves public portfolio and profile details for any registered developer.",
)
async def get_public_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> UserProfileResponse:
    return await AuthService.get_profile_by_username(username, db, redis)


@router.get(
    "/me/preferences",
    response_model=UserPreferenceResponse,
    summary="Get current user preferences",
    description="Retrieves UI theme and notification preferences.",
)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPreferenceResponse:
    return await AuthService.get_user_preferences(current_user.id, db)


@router.put(
    "/me/preferences",
    response_model=UserPreferenceResponse,
    summary="Update current user preferences",
    description="Updates UI theme, email and push notification settings.",
)
@router.patch(
    "/me/preferences",
    response_model=UserPreferenceResponse,
    include_in_schema=False,
)
async def update_preferences(
    payload: UserPreferenceUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> UserPreferenceResponse:
    return await AuthService.update_user_preferences(current_user.id, payload, db)


@router.get(
    "/achievements",
    response_model=list[AchievementUserOut],
    summary="List candidate achievements & badges",
    description="Lists all system badges with candidate unlock status and award dates.",
)
async def get_my_achievements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AchievementUserOut]:
    return await AuthService.get_user_achievements(current_user.id, db)


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request password reset OTP",
    description="Sends a 6-digit password reset OTP to the registered email address.",
)
@limiter.limit(settings.rate_limit_forgot_password)
async def forgot_password(
    request: Request,
    payload: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    res = await AuthService.forgot_password(payload, background_tasks, db, redis)
    return MessageResponse(message=res["message"])


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password with OTP",
    description="Verifies the OTP and updates the account password.",
)
@limiter.limit(settings.rate_limit_reset_password)
async def reset_password(
    request: Request,
    payload: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    res = await AuthService.reset_password(payload, db, redis)
    return MessageResponse(message=res["message"])


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify account email via OTP",
    description="Confirms user email address using the received 6-digit verification code.",
)
@limiter.limit(settings.rate_limit_verify_email)
async def verify_email(
    request: Request,
    payload: VerifyEmailRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    res = await AuthService.verify_email(payload, background_tasks, db, redis)
    return MessageResponse(message=res["message"])


@router.post(
    "/resend-verification",
    response_model=MessageResponse,
    summary="Resend verification OTP",
    description="Issues and sends a fresh 6-digit email verification OTP.",
)
@limiter.limit(settings.rate_limit_resend_verification)
async def resend_verification(
    request: Request,
    payload: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    res = await AuthService.resend_verification(payload, background_tasks, db, redis)
    return MessageResponse(message=res["message"])
