import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.modules.auth.models import User


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
async def test_admin_schedule_interview_and_guest_flow(
    client: AsyncClient,
    admin_user: User,
):
    """
    Validates complete lifecycle:
    1. Admin fetches available questions.
    2. Admin schedules an interview for a guest candidate with email and name.
    3. Admin inspects scheduled interviews list.
    4. Guest candidate inspects invitation details without logging in (zero auth).
    5. Guest candidate joins interview and receives WebRTC token without login.
    6. Admin cancels interview and verifies invite token is invalidated.
    """
    admin_token = create_access_token(
        subject=str(admin_user.id),
        username=admin_user.username,
        email=admin_user.email,
    )
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Fetch available questions for DSA track
    resp = await client.get("/api/v1/admin/interviews/available-questions?track=dsa", headers=headers)
    assert resp.status_code == 200
    questions_data = resp.json()
    assert questions_data["track"] == "dsa"
    assert len(questions_data["questions"]) > 0

    # 2. Admin schedules interview for guest candidate
    schedule_payload = {
        "candidate_name": "Sarah Connor",
        "candidate_email": "sarah.connor@example.com",
        "interview_type": "dsa",
        "difficulty": "Medium",
        "question_ids": ["two-sum"],
        "custom_questions": [
            {
                "title": "Reverse Linked List in Linear Time",
                "description": "Reverse a singly linked list in-place.",
                "difficulty": "Easy",
            }
        ],
        "notes": "Assess edge-case handling and recursion tradeoffs.",
        "send_email": False,
        "expires_in_days": 7,
    }
    schedule_resp = await client.post("/api/v1/admin/interviews/schedule", json=schedule_payload, headers=headers)
    assert schedule_resp.status_code == 201
    scheduled = schedule_resp.json()
    assert scheduled["candidate_name"] == "Sarah Connor"
    assert scheduled["candidate_email"] == "sarah.connor@example.com"
    assert scheduled["interview_type"] == "dsa"
    assert scheduled["invite_token"] is not None
    assert scheduled["invite_url"] is not None
    assert len(scheduled["ai_selected_questions"]) == 2

    invite_token = scheduled["invite_token"]
    session_id = scheduled["session_id"]

    # 3. Admin lists scheduled interviews
    list_resp = await client.get("/api/v1/admin/interviews/scheduled", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 1
    found = any(item["id"] == session_id for item in list_data["items"])
    assert found is True

    # 4. Guest candidate opens invitation link WITHOUT authentication headers
    guest_preview_resp = await client.get(f"/api/v1/interviews/invite/{invite_token}")
    assert guest_preview_resp.status_code == 200
    guest_preview = guest_preview_resp.json()
    assert guest_preview["candidate_name"] == "Sarah Connor"
    assert guest_preview["interview_type"] == "dsa"
    assert guest_preview["is_valid"] is True
    assert guest_preview["is_expired"] is False
    assert guest_preview["questions_count"] == 2

    # 5. Guest candidate joins interview directly WITHOUT registering or logging in
    guest_join_resp = await client.post(f"/api/v1/interviews/invite/{invite_token}/join")
    assert guest_join_resp.status_code == 200
    guest_join = guest_join_resp.json()
    assert guest_join["token"] is not None
    assert guest_join["url"] is not None
    assert guest_join["room_name"] == session_id
    assert guest_join["candidate_name"] == "Sarah Connor"

    # Guest can also check session details using anonymous invite permission
    session_check_resp = await client.get(f"/api/v1/interviews/{session_id}")
    assert session_check_resp.status_code == 200
    session_data = session_check_resp.json()
    assert session_data["status"] == "in_progress"
    assert session_data["is_anonymous_invite"] is True

    # 6. Admin cancels scheduled interview
    cancel_resp = await client.delete(f"/api/v1/admin/interviews/scheduled/{session_id}", headers=headers)
    assert cancel_resp.status_code == 200

    # 7. Cancelled invitation blocks guest entry
    cancelled_join_resp = await client.post(f"/api/v1/interviews/invite/{invite_token}/join")
    assert cancelled_join_resp.status_code == 410
