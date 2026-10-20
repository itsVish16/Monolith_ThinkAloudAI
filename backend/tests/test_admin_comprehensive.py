from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_access_token, get_password_hash
from app.modules.auth.models import User
from app.modules.dsa.models import CodeSubmission
from app.modules.interview.models import (
    InterviewFeedback,
    InterviewQuestion,
    InterviewResponse,
    InterviewSession,
)
from app.modules.tracks.models import Roadmap, RoadmapItem, RoadmapTopic


@pytest.fixture
async def regular_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="regular_coder",
        email="coder@example.com",
        full_name="Regular Coder",
        password_hash=get_password_hash("SecretPass123!"),
        is_verified=True,
        role="user",
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user


@pytest.fixture
async def email_admin_user(test_db_session: AsyncSession) -> User:
    # Uses configured admin email but role="user" to verify email-based admin access
    email = settings.admin_emails_list[0] if settings.admin_emails_list else "admin@thinkaloudai.tech"
    user = User(
        username="email_admin",
        email=email,
        full_name="Email Configured Admin",
        password_hash=get_password_hash("SecretPass123!"),
        is_verified=True,
        role="user",
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user


@pytest.fixture
async def role_admin_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="role_admin",
        email="role_admin@example.org",
        full_name="Role Based Admin",
        password_hash=get_password_hash("SecretPass123!"),
        is_verified=True,
        role="admin",
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user


# =============================================================================
# Track 1: Authentication, Permissions & RBAC Verification
# =============================================================================
@pytest.mark.asyncio
async def test_track_1_admin_rbac_permissions(
    client: AsyncClient,
    regular_user: User,
    email_admin_user: User,
    role_admin_user: User,
):
    regular_token = create_access_token(
        subject=str(regular_user.id),
        username=regular_user.username,
        email=regular_user.email,
    )
    email_admin_token = create_access_token(
        subject=str(email_admin_user.id),
        username=email_admin_user.username,
        email=email_admin_user.email,
    )
    role_admin_token = create_access_token(
        subject=str(role_admin_user.id),
        username=role_admin_user.username,
        email=role_admin_user.email,
    )

    # 1. Unauthenticated request -> 401
    res_no_auth = await client.get("/api/v1/admin/users/stats")
    assert res_no_auth.status_code == 401

    # 2. Invalid / corrupted token -> 401
    res_bad_auth = await client.get(
        "/api/v1/admin/users/stats",
        headers={"Authorization": "Bearer invalid.jwt.token"},
    )
    assert res_bad_auth.status_code == 401

    # 3. Regular user without admin privileges -> 403
    res_regular = await client.get(
        "/api/v1/admin/users/stats",
        headers={"Authorization": f"Bearer {regular_token}"},
    )
    assert res_regular.status_code == 403
    assert "Administrative privileges required" in res_regular.json()["detail"]

    # 4. User authorized via email matching settings.admin_emails_list -> 200
    res_email_admin = await client.get(
        "/api/v1/admin/users/stats",
        headers={"Authorization": f"Bearer {email_admin_token}"},
    )
    assert res_email_admin.status_code == 200
    assert "total_users" in res_email_admin.json()

    # 5. User authorized via role="admin" -> 200
    res_role_admin = await client.get(
        "/api/v1/admin/users/stats",
        headers={"Authorization": f"Bearer {role_admin_token}"},
    )
    assert res_role_admin.status_code == 200
    assert "total_users" in res_role_admin.json()


# =============================================================================
# Track 2: User Management & Gamification Verification
# =============================================================================
@pytest.mark.asyncio
async def test_track_2_user_management_and_gamification(
    client: AsyncClient,
    role_admin_user: User,
    regular_user: User,
    test_db_session: AsyncSession,
):
    admin_token = create_access_token(
        subject=str(role_admin_user.id),
        username=role_admin_user.username,
        email=role_admin_user.email,
    )
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. User stats endpoint
    stats_res = await client.get("/api/v1/admin/users/stats", headers=headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_users"] >= 2
    assert stats["verified_users"] >= 2
    assert "growth" in stats

    # 2. List users with pagination and search
    users_res = await client.get(
        f"/api/v1/admin/users?search={regular_user.username}&page=1&limit=10",
        headers=headers,
    )
    assert users_res.status_code == 200
    user_list = users_res.json()
    assert user_list["total"] >= 1
    assert any(u["id"] == regular_user.id for u in user_list["items"])

    # 3. User dossier
    dossier_res = await client.get(f"/api/v1/admin/users/{regular_user.id}", headers=headers)
    assert dossier_res.status_code == 200
    dossier = dossier_res.json()
    assert dossier["user"]["id"] == regular_user.id
    assert "profile" in dossier
    assert "achievements" in dossier

    # 4. Patch user status
    patch_res = await client.patch(
        f"/api/v1/admin/users/{regular_user.id}/status",
        json={"is_verified": True, "full_name": "Upgraded Regular Coder"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["full_name"] == "Upgraded Regular Coder"

    # 5. Achievements CRUD
    create_ach_res = await client.post(
        "/api/v1/admin/achievements",
        json={
            "title": "Bug Hunter",
            "description": "Reported and verified a critical system issue.",
            "icon_url": "https://assets.thinkaloudai.tech/badges/bug-hunter.svg",
            "user_id": regular_user.id,
        },
        headers=headers,
    )
    assert create_ach_res.status_code == 201
    ach_data = create_ach_res.json()
    ach_id = ach_data["id"]

    # List achievements for user
    user_achs_res = await client.get(f"/api/v1/admin/achievements?user_id={regular_user.id}", headers=headers)
    assert user_achs_res.status_code == 200
    assert any(a["title"] == "Bug Hunter" for a in user_achs_res.json())

    # Delete achievement
    del_ach_res = await client.delete(f"/api/v1/admin/achievements/{ach_id}", headers=headers)
    assert del_ach_res.status_code == 200

    # 6. Delete user
    del_user_res = await client.delete(f"/api/v1/admin/users/{regular_user.id}", headers=headers)
    assert del_user_res.status_code == 200
    assert f"User #{regular_user.id} deleted successfully" in del_user_res.json()["message"]

    # Nonexistent user -> 404
    get_404 = await client.get(f"/api/v1/admin/users/{regular_user.id}", headers=headers)
    assert get_404.status_code == 404


# =============================================================================
# Track 3: DSA Problems, Submissions & Roadmap Curriculum Verification
# =============================================================================
@pytest.mark.asyncio
async def test_track_3_coding_and_roadmaps(
    client: AsyncClient,
    role_admin_user: User,
    test_db_session: AsyncSession,
):
    admin_token = create_access_token(
        subject=str(role_admin_user.id),
        username=role_admin_user.username,
        email=role_admin_user.email,
    )
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Coding stats
    coding_stats_res = await client.get("/api/v1/admin/coding/stats", headers=headers)
    assert coding_stats_res.status_code == 200
    c_stats = coding_stats_res.json()
    assert "total_questions" in c_stats
    assert "submissions" in c_stats

    # 2. Roadmap stats
    roadmap = Roadmap(title="Full Stack Track", description="Full Stack roadmap", is_general=True)
    test_db_session.add(roadmap)
    await test_db_session.flush()

    topic = RoadmapTopic(roadmap_id=roadmap.id, title="Backend", order_index=0)
    test_db_session.add(topic)
    await test_db_session.flush()

    item = RoadmapItem(topic_id=topic.id, title="FastAPI", estimated_minutes=45)
    test_db_session.add(item)
    await test_db_session.commit()

    rm_stats_res = await client.get("/api/v1/admin/roadmaps/stats", headers=headers)
    assert rm_stats_res.status_code == 200
    rm_stats = rm_stats_res.json()
    assert rm_stats["total_roadmaps"] >= 1
    assert rm_stats["total_topics"] >= 1
    assert rm_stats["total_items"] >= 1

    # 3. Create DSA question
    create_q_res = await client.post(
        "/api/v1/admin/dsa/questions",
        json={
            "title": "Reverse Linked List",
            "difficulty": "Easy",
            "description": "Given the head of a singly linked list, reverse the list.",
            "function_name": "reverseList",
            "starter_code": "def reverseList(head):\n    pass\n",
            "test_cases": '[{"input": [1,2,3,4,5], "expected": [5,4,3,2,1]}]',
            "hints": '["Iterate through the list and change next pointers."]',
            "optimal_time_complexity": "O(N)",
            "optimal_space_complexity": "O(1)",
        },
        headers=headers,
    )
    assert create_q_res.status_code == 201
    q_data = create_q_res.json()
    q_id = q_data["id"]
    assert q_data["title"] == "Reverse Linked List"

    # 4. List DSA questions
    list_q_res = await client.get("/api/v1/admin/dsa/questions?difficulty=Easy", headers=headers)
    assert list_q_res.status_code == 200
    assert any(q["id"] == q_id for q in list_q_res.json()["items"])

    # 5. Get single DSA question
    single_q_res = await client.get(f"/api/v1/admin/dsa/questions/{q_id}", headers=headers)
    assert single_q_res.status_code == 200
    assert single_q_res.json()["slug"] == q_data["slug"]

    # 6. Update DSA question
    update_q_res = await client.put(
        f"/api/v1/admin/dsa/questions/{q_id}",
        json={"difficulty": "Medium", "optimal_space_complexity": "O(1) iterative"},
        headers=headers,
    )
    assert update_q_res.status_code == 200
    assert update_q_res.json()["difficulty"] == "Medium"

    # 7. Add submission and test submission endpoints
    sub = CodeSubmission(
        session_id="admin_test_session_99",
        user_id=role_admin_user.id,
        question_id=q_id,
        code="def reverseList(head): return head[::-1]",
        language="python",
        status="Accepted",
        is_submission=True,
        execution_time_ms=12.4,
        memory_used_kb=840.0,
        passed_tests=1,
        total_tests=1,
    )
    test_db_session.add(sub)
    await test_db_session.commit()
    await test_db_session.refresh(sub)

    subs_list_res = await client.get(f"/api/v1/admin/dsa/submissions?question_id={q_id}", headers=headers)
    assert subs_list_res.status_code == 200
    assert any(s["id"] == sub.id for s in subs_list_res.json()["items"])

    single_sub_res = await client.get(f"/api/v1/admin/dsa/submissions/{sub.id}", headers=headers)
    assert single_sub_res.status_code == 200
    assert single_sub_res.json()["status"] == "Accepted"

    # 8. Delete DSA question
    del_q_res = await client.delete(f"/api/v1/admin/dsa/questions/{q_id}", headers=headers)
    assert del_q_res.status_code == 200


# =============================================================================
# Track 4: Mock Interviews & Telemetry Overview Verification
# =============================================================================
@pytest.mark.asyncio
async def test_track_4_interviews_and_telemetry(
    client: AsyncClient,
    role_admin_user: User,
    test_db_session: AsyncSession,
):
    admin_token = create_access_token(
        subject=str(role_admin_user.id),
        username=role_admin_user.username,
        email=role_admin_user.email,
    )
    headers = {"Authorization": f"Bearer {admin_token}"}

    now = datetime.now(UTC)
    session = InterviewSession(
        id="session_track4_test_001",
        user_id=role_admin_user.id,
        candidate_name="Track4 Candidate",
        interview_type="DSA",
        difficulty="Medium",
        stage="completed",
        state_data={
            "duration_minutes": 28.0,
            "turns": [
                {
                    "turn_number": 1,
                    "user_text": "I will solve this using a two-pointer approach.",
                    "response_text": "Sounds good, explain the time complexity.",
                    "e2e_response_latency_ms": 380.0,
                    "fast_llm": {"ttft_ms": 95.0, "total_ms": 220.0},
                    "main_llm": {"ttft_ms": 290.0, "total_ms": 680.0},
                }
            ],
        },
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(session)
    await test_db_session.commit()

    q = InterviewQuestion(
        session_id=session.id,
        content="What is the time complexity of QuickSelect?",
        created_at=now,
    )
    test_db_session.add(q)
    await test_db_session.commit()

    resp = InterviewResponse(
        question_id=q.id,
        content="Average case is O(N), worst case is O(N^2).",
        created_at=now,
    )
    test_db_session.add(resp)
    await test_db_session.commit()

    fb = InterviewFeedback(
        session_id=session.id,
        technical_score=85,
        communication_score=80,
        english_score=88,
        overall_score=84,
        strengths="Clear explanation of average vs worst case.",
        weaknesses="Did not mention randomized pivot selection.",
        improvement_plan="Practice Dutch National Flag partitioning.",
    )
    test_db_session.add(fb)
    await test_db_session.commit()

    # 1. Interview stats
    stats_res = await client.get("/api/v1/admin/interviews/stats", headers=headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_interviews"] >= 1
    assert stats["completed_interviews"] >= 1

    # Alias /api/v1/admin/stats
    alias_stats_res = await client.get("/api/v1/admin/stats", headers=headers)
    assert alias_stats_res.status_code == 200
    assert alias_stats_res.json()["total_interviews"] >= 1

    # 2. List interviews
    interviews_res = await client.get("/api/v1/admin/interviews?status=completed", headers=headers)
    assert interviews_res.status_code == 200
    assert any(i["id"] == session.id for i in interviews_res.json()["items"])

    # 3. Audit detail
    audit_res = await client.get(f"/api/v1/admin/interviews/{session.id}", headers=headers)
    assert audit_res.status_code == 200
    audit = audit_res.json()
    assert audit["id"] == session.id
    assert audit["feedback"]["overall_score"] == 84

    # 4. Score override
    override_res = await client.patch(
        f"/api/v1/admin/interviews/{session.id}/score",
        json={
            "technical_score": 90,
            "overall_score": 88,
            "reason": "Exceptional clarity on algorithmic trade-offs",
        },
        headers=headers,
    )
    assert override_res.status_code == 200
    assert override_res.json()["technical_score"] == 90
    assert override_res.json()["overall_score"] == 88

    # 5. Session metrics
    metrics_res = await client.get(f"/api/v1/admin/interviews/{session.id}/metrics", headers=headers)
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert metrics["session_id"] == session.id
    assert "telemetry_summary" in metrics
    assert "speech_metrics" in metrics

    # 6. Global telemetry overview
    telemetry_res = await client.get("/api/v1/admin/telemetry/overview", headers=headers)
    assert telemetry_res.status_code == 200
    telemetry = telemetry_res.json()
    assert "overall_avg_e2e_latency_ms" in telemetry
    assert "slowest_turns" in telemetry

    # 7. Delete interview session (with cascading verification)
    del_sess_res = await client.delete(f"/api/v1/admin/interviews/{session.id}", headers=headers)
    assert del_sess_res.status_code == 200
    assert del_sess_res.json()["message"] == "Interview session deleted"

    # Verify session is deleted
    del_check_res = await client.get(f"/api/v1/admin/interviews/{session.id}", headers=headers)
    assert del_check_res.status_code == 404
