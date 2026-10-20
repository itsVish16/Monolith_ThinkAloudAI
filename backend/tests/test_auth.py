import pytest
from httpx import AsyncClient

from app.core.security import decode_token, get_password_hash, verify_password
from app.modules.auth.dependencies import get_current_admin
from app.modules.auth.models import User
from tests.conftest import FakeRedis


@pytest.mark.asyncio
async def test_security_password_hashing():
    password = "SuperSecretPassword123!"
    hashed = get_password_hash(password)
    assert hashed != password
    assert await verify_password(password, hashed) is True
    assert await verify_password("WrongPassword123!", hashed) is False


@pytest.mark.asyncio
async def test_full_auth_flow(client: AsyncClient, fake_redis: FakeRedis):
    # 1. Register a new user
    user_payload = {
        "username": "candidate_alex",
        "email": "alex@example.com",
        "full_name": "Alex Developer",
        "password": "Password123!",
    }
    reg_res = await client.post("/api/v1/auth/register", json=user_payload)
    assert reg_res.status_code == 201
    assert "User registered successfully" in reg_res.json()["message"]

    # 1b. Duplicate username registration should fail (409)
    dup_res = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "candidate_alex",
            "email": "different_email@example.com",
            "full_name": "Different Name",
            "password": "Password123!",
        },
    )
    assert dup_res.status_code == 409

    # 2. Login before email verification should fail (403)
    login_payload = {
        "email": "alex@example.com",
        "password": "Password123!",
    }
    unverified_login_res = await client.post("/api/v1/auth/login", json=login_payload)
    assert unverified_login_res.status_code == 403
    assert "verify your email" in unverified_login_res.json()["detail"].lower()

    # 2b. Login with wrong password should fail (401)
    wrong_pwd_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "alex@example.com", "password": "WrongPassword123!"},
    )
    assert wrong_pwd_res.status_code == 401

    # 2c. Resend verification OTP
    resend_res = await client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "alex@example.com"},
    )
    assert resend_res.status_code == 200

    # 3. Verify Email using OTP stored in Redis
    otp = await fake_redis.get("user:email-verification:alex@example.com")
    assert otp is not None
    assert len(otp) == 6

    verify_res = await client.post(
        "/api/v1/auth/verify-email",
        json={"email": "alex@example.com", "token": otp},
    )
    assert verify_res.status_code == 200
    assert "Email verified successfully" in verify_res.json()["message"]

    # 4. Login after verification should succeed
    login_res = await client.post("/api/v1/auth/login", json=login_payload)
    assert login_res.status_code == 200
    tokens = login_res.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    decoded_access = decode_token(access_token, expected_type="access")
    assert decoded_access["username"] == "candidate_alex"

    # 5. Access /me protected endpoint
    headers = {"Authorization": f"Bearer {access_token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    user_info = me_res.json()
    assert user_info["email"] == "alex@example.com"
    assert user_info["username"] == "candidate_alex"
    assert user_info["is_verified"] is True

    # 5b. Update /me username and full_name
    update_me_res = await client.patch(
        "/api/v1/auth/me",
        json={"full_name": "Alexander Developer"},
        headers=headers,
    )
    assert update_me_res.status_code == 200
    assert update_me_res.json()["full_name"] == "Alexander Developer"

    # 6. Access /profile endpoint
    prof_res = await client.get("/api/v1/auth/profile", headers=headers)
    assert prof_res.status_code == 200
    prof_data = prof_res.json()
    assert prof_data["username"] == "candidate_alex"
    assert prof_data["preferred_language"] == "python"

    # 7. Update extended profile
    patch_payload = {
        "bio": "Senior distributed systems engineer",
        "headline": "Software Engineer @ ThinkAloud",
        "preferred_language": "cpp",
        "location": "San Francisco, CA",
    }
    update_prof_res = await client.patch("/api/v1/auth/profile", json=patch_payload, headers=headers)
    assert update_prof_res.status_code == 200
    updated_prof = update_prof_res.json()
    assert updated_prof["bio"] == "Senior distributed systems engineer"
    assert updated_prof["headline"] == "Software Engineer @ ThinkAloud"
    assert updated_prof["preferred_language"] == "cpp"

    # 8. Refresh Token flow
    refresh_res = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_res.status_code == 200
    new_tokens = refresh_res.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != access_token

    # 9. Password Reset flow
    forgot_res = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "alex@example.com"},
    )
    assert forgot_res.status_code == 200

    reset_otp = await fake_redis.get("user:password-reset:alex@example.com")
    assert reset_otp is not None
    assert len(reset_otp) == 6

    reset_res = await client.post(
        "/api/v1/auth/reset-password",
        json={
            "email": "alex@example.com",
            "otp": reset_otp,
            "new_password": "BrandNewPassword456!",
        },
    )
    assert reset_res.status_code == 200
    assert "Password reset successful" in reset_res.json()["message"]

    # Login with new password
    new_login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "alex@example.com", "password": "BrandNewPassword456!"},
    )
    assert new_login_res.status_code == 200

    # 10. Logout and verify token revocation
    logout_res = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": new_tokens["refresh_token"]},
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
    )
    assert logout_res.status_code == 200

    # Using the logged out access token should now be rejected (401)
    bad_me_res = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
    )
    assert bad_me_res.status_code == 401


@pytest.mark.asyncio
async def test_admin_dependency():
    admin_user = User(
        id=1,
        username="admin_user",
        email="admin@thinkaloudai.tech",
        full_name="Admin",
        password_hash="hash",
        role="admin",
        is_verified=True,
    )
    verified_admin = await get_current_admin(current_user=admin_user)
    assert verified_admin.id == 1

    regular_user = User(
        id=2,
        username="regular_user",
        email="regular@example.com",
        full_name="Regular",
        password_hash="hash",
        role="user",
        is_verified=True,
    )
    with pytest.raises(Exception) as excinfo:
        await get_current_admin(current_user=regular_user)
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_health_endpoints(client: AsyncClient):
    live_res = await client.get("/health/live")
    assert live_res.status_code == 200
    assert live_res.json()["status"] == "alive"

    root_res = await client.get("/")
    assert root_res.status_code == 200
    assert root_res.json()["status"] == "online"


@pytest.mark.asyncio
async def test_atomic_rate_limiting_expiration(fake_redis: FakeRedis):
    from app.modules.auth.service import AuthService, check_rate_limit

    key = "test:rate:limit:user123"
    window = 300

    # 1. First attempt: atomically increments to 1 and sets expiry window
    count1 = await AuthService.check_rate_limit(fake_redis, key, window)  # type: ignore
    assert count1 == 1
    assert fake_redis._ttls.get(key) == 300

    # 2. Second attempt: atomically increments to 2 and refreshes expiry window
    count2 = await check_rate_limit(fake_redis, key, window)  # type: ignore
    assert count2 == 2
    assert fake_redis._ttls.get(key) == 300

