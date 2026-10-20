import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.modules.auth.models import User


@pytest.fixture
async def verified_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="verified_coder",
        email="verified@example.com",
        full_name="Verified Coder",
        password_hash=get_password_hash("SecretPass123!"),
        is_verified=True,
        role="user",
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user

@pytest.fixture
async def admin_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="admin_boss",
        email="admin@thinkaloudai.tech",
        full_name="Admin Boss",
        password_hash=get_password_hash("SecretPass123!"),
        is_verified=True,
        role="admin",
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user

@pytest.mark.asyncio
async def test_admin_and_chat_endpoints(
    client: AsyncClient,
    verified_user: User,
    admin_user: User,
):
    user_token = create_access_token(subject=str(verified_user.id), username=verified_user.username, email=verified_user.email)
    admin_token = create_access_token(subject=str(admin_user.id), username=admin_user.username, email=admin_user.email)

    # 1. Test Admin Stats with admin token
    res = await client.get("/api/v1/admin/users/stats", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert "total_users" in data
    assert "verified_users" in data

    # Fallback /admin/coding/stats
    coding_res = await client.get("/admin/coding/stats", headers={"Authorization": f"Bearer {admin_token}"})
    assert coding_res.status_code == 200
    coding_data = coding_res.json()
    assert "total_questions" in coding_data

    # Fallback /api/admin/stats
    interview_admin_res = await client.get("/api/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
    assert interview_admin_res.status_code == 200
    interview_data = interview_admin_res.json()
    assert "total_interviews" in interview_data

    # 2. Test Non-admin blocked from admin endpoints
    forbidden_res = await client.get("/api/v1/admin/users/stats", headers={"Authorization": f"Bearer {user_token}"})
    assert forbidden_res.status_code == 403

    # 3. Test Chat Sessions listing
    chat_sessions_res = await client.get("/api/v1/chat/sessions", headers={"Authorization": f"Bearer {user_token}"})
    assert chat_sessions_res.status_code == 200
    assert isinstance(chat_sessions_res.json(), list)

    # Test Chat Sessions fallback /sessions
    fallback_sessions_res = await client.get("/sessions", headers={"Authorization": f"Bearer {user_token}"})
    assert fallback_sessions_res.status_code == 200
    assert isinstance(fallback_sessions_res.json(), list)
