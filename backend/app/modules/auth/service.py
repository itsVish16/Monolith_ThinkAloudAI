import hmac
import json
from datetime import UTC, datetime

import structlog
from fastapi import BackgroundTasks, HTTPException, status
from jose import JWTError, jwt
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    create_refresh_token,
    generate_otp,
    hash_password,
    verify_password,
)
from app.modules.auth.email_service import enqueue_email
from app.modules.auth.models import User, UserPreference, UserProfile
from app.modules.auth.schemas import (
    AchievementUserOut,
    LogoutRequest,
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

logger = structlog.get_logger(__name__)

# Redis cache keys
TOKEN_BLACKLIST_PREFIX = "token:blacklist:"
LOGIN_ATTEMPTS_PREFIX = "login:attempts:"
OTP_ATTEMPTS_PREFIX = "user:otp_attempts:"
RESET_TOKEN_PREFIX = "user:password-reset:"
VERIFY_TOKEN_PREFIX = "user:email-verification:"
PROFILE_CACHE_PREFIX = "user:profile:"


class AuthService:
    """Service layer handling user registration, authentication, tokens, and profiles."""

    # --- Cache and Key Helpers ---

    @staticmethod
    def _profile_cache_key(user_id: int) -> str:
        return f"{PROFILE_CACHE_PREFIX}{user_id}"

    @staticmethod
    def _reset_token_key(email: str) -> str:
        return f"{RESET_TOKEN_PREFIX}{email.lower()}"

    @staticmethod
    def _verify_token_key(email: str) -> str:
        return f"{VERIFY_TOKEN_PREFIX}{email.lower()}"

    @staticmethod
    def _login_attempts_key(email: str) -> str:
        return f"{LOGIN_ATTEMPTS_PREFIX}{email.lower()}"

    @staticmethod
    def _otp_attempts_key(email: str) -> str:
        return f"{OTP_ATTEMPTS_PREFIX}{email.lower()}"

    @staticmethod
    async def is_token_blacklisted(redis: Redis, jti: str) -> bool:
        """Checks if a JWT jti is blacklisted."""
        return await redis.get(f"{TOKEN_BLACKLIST_PREFIX}{jti}") is not None

    @staticmethod
    async def blacklist_token(redis: Redis, jti: str, ttl_seconds: int) -> None:
        """Blacklists a JWT jti for the duration of its remaining lifetime."""
        if ttl_seconds > 0:
            await redis.set(f"{TOKEN_BLACKLIST_PREFIX}{jti}", "1", ex=ttl_seconds)

    @classmethod
    async def check_rate_limit(
        cls,
        redis: Redis,
        attempts_key: str,
        window: int,
    ) -> int:
        """
        Atomically increments attempt counter and sets expiration window using an atomic Redis pipeline.
        Ensures keys never get stuck with infinite TTL if a restart happens.
        Returns the updated attempt count.
        """
        pipe = redis.pipeline()
        pipe.incr(attempts_key)
        pipe.expire(attempts_key, window)
        res = await pipe.execute()
        return int(res[0])

    # --- User Lookup Helpers ---

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
        """Retrieves a user by primary key ID with profile eager-loaded."""
        stmt = (
            select(User)
            .options(selectinload(User.profile), selectinload(User.preference))
            .where(User.id == user_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
        """Retrieves a user by unique email address."""
        stmt = (
            select(User)
            .options(selectinload(User.profile), selectinload(User.preference))
            .where(User.email == email.lower())
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
        """Retrieves a user by unique username."""
        stmt = (
            select(User)
            .options(selectinload(User.profile), selectinload(User.preference))
            .where(User.username == username.lower())
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    # --- Core Auth Methods ---

    @classmethod
    async def register(
        cls,
        payload: UserCreate,
        background_tasks: BackgroundTasks,
        db: AsyncSession,
        redis: Redis,
    ) -> str:
        """
        Registers a new user account, creates default profile/preferences,
        generates an email verification OTP, and queues the email.
        """
        email = str(payload.email).lower()
        existing_email_user = await cls.get_user_by_email(db, email)
        existing_username_user = await cls.get_user_by_username(db, payload.username)

        if existing_email_user is not None:
            if existing_email_user.is_verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email is already registered",
                )
            else:
                # If existing unverified user is re-registering
                if existing_username_user and existing_username_user.id != existing_email_user.id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Username is already taken",
                    )
                password_hash = await hash_password(payload.password)
                existing_email_user.username = payload.username
                existing_email_user.full_name = payload.full_name
                existing_email_user.password_hash = password_hash
                try:
                    await db.commit()
                    await db.refresh(existing_email_user)
                except IntegrityError:
                    await db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Email or username already exists",
                    )
                user = existing_email_user
        else:
            if existing_username_user is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Username is already taken",
                )

            password_hash = await hash_password(payload.password)
            user = User(
                username=payload.username,
                email=email,
                full_name=payload.full_name,
                password_hash=password_hash,
                is_verified=False,
                role="admin" if email in settings.admin_emails_list else "user",
            )
            # Create associated empty profile and preferences
            user.profile = UserProfile()
            user.preference = UserPreference()

            db.add(user)
            try:
                await db.commit()
                await db.refresh(user)
            except IntegrityError:
                await db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email or username already exists",
                )

        verification_otp = generate_otp(6)
        await redis.set(cls._verify_token_key(user.email), verification_otp, ex=settings.otp_ttl_seconds)

        logger.info("verification_otp_generated", email=user.email, user_id=user.id)
        background_tasks.add_task(
            enqueue_email,
            "verification_email",
            user.email,
            {"otp": verification_otp},
        )

        return verification_otp

    @classmethod
    async def login(
        cls,
        payload: UserLogin,
        db: AsyncSession,
        redis: Redis,
    ) -> Token:
        """
        Authenticates a user by email and password.
        Guarded against brute-force attacks via Redis attempt counter and constant-time dummy verification.
        """
        email = str(payload.email).lower()
        attempts_key = cls._login_attempts_key(email)
        attempts = int(await redis.get(attempts_key) or 0)

        if attempts >= settings.max_login_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please try again later.",
            )

        user = await cls.get_user_by_email(db, email)

        if user is None:
            # Side-channel timing attack protection
            await verify_password("dummy-password", DUMMY_HASH)
            await cls.check_rate_limit(redis, attempts_key, settings.login_lockout_seconds)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not await verify_password(payload.password, user.password_hash):
            await cls.check_rate_limit(redis, attempts_key, settings.login_lockout_seconds)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please verify your email before logging in",
            )

        # Clear login attempts on success
        await redis.delete(attempts_key)

        # Update last login and auto-promote to admin if email matches admin list
        user.last_login_at = datetime.now(UTC)
        if email in settings.admin_emails_list and user.role != "admin":
            user.role = "admin"
        await db.commit()

        access_token = create_access_token(
            subject=str(user.id),
            username=user.username,
            email=user.email,
            extra_claims={"role": user.role},
        )
        refresh_token = create_refresh_token(
            subject=str(user.id),
            username=user.username,
            email=user.email,
            extra_claims={"role": user.role},
        )

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )

    @classmethod
    async def refresh_token(
        cls,
        payload: RefreshTokenRequest,
        db: AsyncSession,
        redis: Redis,
    ) -> Token:
        """
        Validates refresh token, blacklists it to prevent reuse, and issues a fresh token pair.
        """
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

        try:
            decode_payload = jwt.decode(
                payload.refresh_token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.algorithm],
            )
            user_id = decode_payload.get("sub")
            token_type = decode_payload.get("type")
            jti = decode_payload.get("jti")

            if user_id is None or token_type != "refresh" or jti is None:
                raise credentials_exception
        except (JWTError, ValueError):
            raise credentials_exception

        if await cls.is_token_blacklisted(redis, jti):
            raise credentials_exception

        user = await cls.get_user_by_id(db, int(user_id))
        if user is None:
            raise credentials_exception

        # Invalidate old refresh token
        exp = decode_payload.get("exp", 0)
        remaining_ttl = max(int(exp - datetime.now(UTC).timestamp()), 1)
        await cls.blacklist_token(redis, jti, remaining_ttl)

        new_access_token = create_access_token(
            subject=str(user.id),
            username=user.username,
            email=user.email,
            extra_claims={"role": user.role},
        )
        new_refresh_token = create_refresh_token(
            subject=str(user.id),
            username=user.username,
            email=user.email,
            extra_claims={"role": user.role},
        )

        return Token(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
        )

    @classmethod
    async def logout(
        cls,
        access_token: str,
        payload: LogoutRequest | None,
        redis: Redis,
    ) -> dict[str, str]:
        """Revokes the current access token and refresh token."""
        # Blacklist access token
        try:
            acc_payload = jwt.decode(access_token, settings.JWT_SECRET_KEY, algorithms=[settings.algorithm])
            jti = acc_payload.get("jti")
            if jti:
                exp = acc_payload.get("exp", 0)
                ttl = max(int(exp - datetime.now(UTC).timestamp()), 1)
                await cls.blacklist_token(redis, jti, ttl)
        except JWTError:
            pass

        # Blacklist refresh token if provided
        if payload and payload.refresh_token:
            try:
                ref_payload = jwt.decode(payload.refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.algorithm])
                ref_jti = ref_payload.get("jti")
                if ref_jti:
                    exp = ref_payload.get("exp", 0)
                    ttl = max(int(exp - datetime.now(UTC).timestamp()), 1)
                    await cls.blacklist_token(redis, ref_jti, ttl)
            except JWTError:
                pass

        return {"message": "Logged out successfully"}

    @classmethod
    async def forgot_password(
        cls,
        payload: PasswordResetRequest,
        background_tasks: BackgroundTasks,
        db: AsyncSession,
        redis: Redis,
    ) -> dict[str, str]:
        """Initiates password reset by issuing an OTP if the user exists."""
        email = str(payload.email).lower()
        user = await cls.get_user_by_email(db, email)

        if user is not None:
            reset_otp = generate_otp(6)
            await redis.set(cls._reset_token_key(email), reset_otp, ex=settings.otp_ttl_seconds)
            logger.info("password_reset_otp_generated", email=email)
            background_tasks.add_task(
                enqueue_email,
                "password_reset_email",
                email,
                {"otp": reset_otp},
            )
            if settings.debug:
                return {"message": f"Password reset OTP generated: {reset_otp}"}

        return {"message": "If the email is registered, password reset instructions have been sent."}

    @classmethod
    async def reset_password(
        cls,
        payload: PasswordResetConfirm,
        db: AsyncSession,
        redis: Redis,
    ) -> dict[str, str]:
        """Verifies reset OTP and updates user password."""
        email = str(payload.email).lower()
        attempts_key = cls._otp_attempts_key(email)
        attempts = int(await redis.get(attempts_key) or 0)

        if attempts >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed OTP attempts. Please request a new OTP after 15 minutes.",
            )

        user = await cls.get_user_by_email(db, email)
        if user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset request")

        stored_otp = await redis.get(cls._reset_token_key(email))
        if stored_otp is None or not hmac.compare_digest(stored_otp, payload.otp):
            new_attempts = await cls.check_rate_limit(redis, attempts_key, 900)
            if new_attempts >= 5:
                await redis.delete(cls._reset_token_key(email))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many failed OTP attempts. Please request a new OTP after 15 minutes.",
                )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

        # Clear OTP and attempts
        await redis.delete(attempts_key)
        await redis.delete(cls._reset_token_key(email))

        # Update password
        user.password_hash = await hash_password(payload.new_password)
        await db.commit()

        # Invalidate cached profile
        await redis.delete(cls._profile_cache_key(user.id))

        return {"message": "Password reset successful"}

    @classmethod
    async def verify_email(
        cls,
        payload: VerifyEmailRequest,
        background_tasks: BackgroundTasks,
        db: AsyncSession,
        redis: Redis,
    ) -> dict[str, str]:
        """Verifies account via OTP and sends welcome email."""
        email = str(payload.email).lower()
        attempts_key = cls._otp_attempts_key(email)
        attempts = int(await redis.get(attempts_key) or 0)

        if attempts >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed OTP attempts. Please request a new OTP after 15 minutes.",
            )

        user = await cls.get_user_by_email(db, email)
        if user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification request")

        stored_token = await redis.get(cls._verify_token_key(email))
        if stored_token is None or not hmac.compare_digest(stored_token, payload.token):
            new_attempts = await cls.check_rate_limit(redis, attempts_key, 900)
            if new_attempts >= 5:
                await redis.delete(cls._verify_token_key(email))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many failed OTP attempts. Please request a new OTP after 15 minutes.",
                )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token")

        await redis.delete(attempts_key)
        await redis.delete(cls._verify_token_key(email))

        user.is_verified = True
        await db.commit()
        await redis.delete(cls._profile_cache_key(user.id))

        background_tasks.add_task(
            enqueue_email,
            "welcome_email",
            user.email,
            {"full_name": user.full_name},
        )

        return {"message": "Email verified successfully"}

    @classmethod
    async def resend_verification(
        cls,
        payload: ResendVerificationRequest,
        background_tasks: BackgroundTasks,
        db: AsyncSession,
        redis: Redis,
    ) -> dict[str, str]:
        """Issues a new email verification OTP if user is unverified."""
        email = str(payload.email).lower()
        user = await cls.get_user_by_email(db, email)

        if user is None:
            return {"message": "If the email exists, verification instructions have been sent."}

        if user.is_verified:
            return {"message": "Email is already verified"}

        verification_otp = generate_otp(6)
        await redis.set(cls._verify_token_key(email), verification_otp, ex=settings.otp_ttl_seconds)
        logger.info("verification_otp_regenerated", email=email)
        background_tasks.add_task(
            enqueue_email,
            "verification_email",
            email,
            {"otp": verification_otp},
        )

        if settings.debug:
            return {"message": f"Verification OTP generated: {verification_otp}"}

        return {"message": "If the email exists, verification instructions have been sent."}

    # --- Profile Operations ---

    @classmethod
    async def get_user_profile(cls, user: User, db: AsyncSession, redis: Redis) -> UserProfileResponse:
        """Retrieves aggregated user and profile details with Redis caching."""
        cache_key = cls._profile_cache_key(user.id)
        cached = await redis.get(cache_key)
        if cached:
            try:
                data = json.loads(cached)
                return UserProfileResponse.model_validate(data)
            except Exception:
                pass

        profile = user.profile
        if profile is None:
            stmt = select(UserProfile).where(UserProfile.user_id == user.id)
            res = await db.execute(stmt)
            profile = res.scalar_one_or_none()
            if not profile:
                profile = UserProfile(user_id=user.id)
                db.add(profile)
                await db.commit()
                await db.refresh(profile)

        response = UserProfileResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_verified=user.is_verified,
            created_at=user.created_at,
            updated_at=user.updated_at,
            last_login_at=user.last_login_at,
            bio=profile.bio,
            avatar_url=profile.avatar_url,
            github_url=profile.github_url,
            linkedin_url=profile.linkedin_url,
            headline=profile.headline,
            location=profile.location,
            institution=profile.institution,
            preferred_language=profile.preferred_language,
            resume_url=profile.resume_url,
        )

        await redis.setex(
            cache_key,
            settings.profile_cache_ttl_seconds,
            response.model_dump_json(),
        )
        return response

    @classmethod
    async def update_user(
        cls,
        user: User,
        payload: UpdateUserRequest,
        db: AsyncSession,
        redis: Redis,
    ) -> UserResponse:
        """Updates basic user account information (full_name or username)."""
        if payload.username is not None and payload.username.lower() != user.username.lower():
            existing = await cls.get_user_by_username(db, payload.username)
            if existing and existing.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Username already taken",
                )
            user.username = payload.username.lower()

        if payload.full_name is not None:
            user.full_name = payload.full_name.strip()

        try:
            await db.commit()
            await db.refresh(user)
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )

        await redis.delete(cls._profile_cache_key(user.id))
        return UserResponse.model_validate(user)

    @classmethod
    async def update_profile(
        cls,
        user: User,
        payload: UpdateProfileRequest,
        db: AsyncSession,
        redis: Redis,
    ) -> UserProfileResponse:
        """Updates extended profile details (bio, social links, preferences)."""
        stmt = select(UserProfile).where(UserProfile.user_id == user.id)
        res = await db.execute(stmt)
        profile = res.scalar_one_or_none()

        if not profile:
            profile = UserProfile(user_id=user.id)
            db.add(profile)

        update_data = payload.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            setattr(profile, key, val)

        await db.commit()
        await db.refresh(profile)
        await redis.delete(cls._profile_cache_key(user.id))

        return await cls.get_user_profile(user, db, redis)

    @classmethod
    async def get_profile_by_username(
        cls,
        username: str,
        db: AsyncSession,
        redis: Redis,
    ) -> UserProfileResponse:
        """Retrieves public user profile by username."""
        user = await cls.get_user_by_username(db, username)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with username '{username}' not found",
            )
        return await cls.get_user_profile(user, db, redis)

    @classmethod
    async def get_user_preferences(
        cls,
        user_id: int,
        db: AsyncSession,
    ) -> UserPreferenceResponse:
        """Retrieves user UI and notification preferences, creating defaults if not set."""
        stmt = select(UserPreference).where(UserPreference.user_id == user_id)
        res = await db.execute(stmt)
        pref = res.scalar_one_or_none()

        if not pref:
            pref = UserPreference(
                user_id=user_id,
                theme="system",
                email_notifications=True,
                push_notifications=True,
            )
            db.add(pref)
            await db.commit()
            await db.refresh(pref)

        return UserPreferenceResponse.model_validate(pref)

    @classmethod
    async def update_user_preferences(
        cls,
        user_id: int,
        payload: UserPreferenceUpdate,
        db: AsyncSession,
    ) -> UserPreferenceResponse:
        """Updates user UI and notification preferences."""
        stmt = select(UserPreference).where(UserPreference.user_id == user_id)
        res = await db.execute(stmt)
        pref = res.scalar_one_or_none()

        if not pref:
            pref = UserPreference(user_id=user_id)
            db.add(pref)

        update_data = payload.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            if val is not None:
                setattr(pref, key, val)

        await db.commit()
        await db.refresh(pref)
        return UserPreferenceResponse.model_validate(pref)

    @classmethod
    async def get_user_achievements(
        cls,
        user_id: int,
        db: AsyncSession,
    ) -> list[AchievementUserOut]:
        """Lists all system achievements with candidate unlocked status."""
        from app.modules.admin.models import Achievement, UserAchievement

        ach_stmt = select(Achievement).order_by(Achievement.id.asc())
        ach_res = await db.execute(ach_stmt)
        all_achs = ach_res.scalars().all()

        user_ach_stmt = select(UserAchievement).where(UserAchievement.user_id == user_id)
        user_ach_res = await db.execute(user_ach_stmt)
        awarded_map = {ua.achievement_id: ua.awarded_at for ua in user_ach_res.scalars().all()}

        output = []
        for a in all_achs:
            unlocked = a.id in awarded_map
            output.append(
                AchievementUserOut(
                    id=a.id,
                    title=a.title,
                    description=a.description,
                    icon_url=a.icon_url,
                    unlocked=unlocked,
                    awarded_at=awarded_map.get(a.id),
                )
            )
        return output


async def check_rate_limit(redis: Redis, attempts_key: str, window: int) -> int:
    """
    Atomically increments attempt counter and sets expiration window using an atomic Redis pipeline.
    Ensures keys never get stuck with infinite TTL if a restart happens.
    """
    return await AuthService.check_rate_limit(redis, attempts_key, window)
