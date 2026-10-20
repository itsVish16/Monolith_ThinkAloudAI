from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.modules.auth.models import User, UserProfile
from app.modules.dsa.models import CodeSubmission
from app.modules.interview.models import InterviewFeedback, InterviewSession


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

    profile = UserProfile(
        user_id=user.id,
        bio="Full stack engineer passionate about systems and algorithms.",
        github_url="https://github.com/verifiedcoder",
        linkedin_url="https://linkedin.com/in/verifiedcoder",
    )
    test_db_session.add(profile)
    await test_db_session.commit()

    return user


@pytest.fixture
async def target_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="target_user",
        email="target@example.com",
        full_name="Target User",
        password_hash=get_password_hash("SecretPass123!"),
        is_verified=False,
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


# -----------------------------------------------------------------------------
# 1. User Management & Gamification Tests
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_user_management_lifecycle(
    client: AsyncClient,
    verified_user: User,
    target_user: User,
    admin_user: User,
):
    admin_token = create_access_token(subject=str(admin_user.id), username=admin_user.username, email=admin_user.email)
    user_token = create_access_token(subject=str(verified_user.id), username=verified_user.username, email=verified_user.email)
    headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    # 1. Non-admin is blocked
    res = await client.delete(f"/api/v1/admin/users/{target_user.id}", headers=user_headers)
    assert res.status_code == 403

    # 2. List users with is_verified filter
    res = await client.get("/api/v1/admin/users?is_verified=true", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert any(u["id"] == verified_user.id for u in data["items"])
    assert not any(u["id"] == target_user.id for u in data["items"])

    # 3. Update user status & full name
    patch_res = await client.patch(
        f"/api/v1/admin/users/{target_user.id}/status",
        json={"is_verified": True, "full_name": "Target User Updated"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["is_verified"] is True
    assert patch_res.json()["full_name"] == "Target User Updated"

    # 4. Cannot delete self
    self_delete_res = await client.delete(f"/api/v1/admin/users/{admin_user.id}", headers=headers)
    assert self_delete_res.status_code == 400

    # 5. Successfully delete target user
    delete_res = await client.delete(f"/api/v1/admin/users/{target_user.id}", headers=headers)
    assert delete_res.status_code == 200
    assert "deleted successfully" in delete_res.json()["message"]

    # 6. User dossier on deleted user returns 404
    get_res = await client.get(f"/api/v1/admin/users/{target_user.id}", headers=headers)
    assert get_res.status_code == 404

    # 7. Second delete attempt returns 404
    repeat_delete_res = await client.delete(f"/api/v1/admin/users/{target_user.id}", headers=headers)
    assert repeat_delete_res.status_code == 404


@pytest.mark.asyncio
async def test_achievements_gamification_lifecycle(
    client: AsyncClient,
    verified_user: User,
    admin_user: User,
):
    admin_token = create_access_token(subject=str(admin_user.id), username=admin_user.username, email=admin_user.email)
    user_token = create_access_token(subject=str(verified_user.id), username=verified_user.username, email=verified_user.email)
    headers = {"Authorization": f"Bearer {admin_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    # Non-admin forbidden
    forbidden = await client.post(
        "/api/v1/admin/achievements",
        json={"title": "Unauthorized Badge", "description": "Should fail"},
        headers=user_headers,
    )
    assert forbidden.status_code == 403

    # 1. Create a system achievement
    create_res = await client.post(
        "/api/v1/admin/achievements",
        json={
            "title": "System Architect",
            "description": "Scored 90+ on 3 System Design interviews.",
            "icon_url": "https://assets.thinkaloudai.tech/badges/system-architect.svg",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    ach1 = create_res.json()
    assert ach1["id"] is not None
    assert ach1["title"] == "System Architect"

    # 2. Create and award an achievement to a specific user
    award_res = await client.post(
        "/api/v1/admin/achievements",
        json={
            "name": "Algorithm Master",
            "description": "Solved 50 Hard DSA problems.",
            "icon": "https://assets.thinkaloudai.tech/badges/algorithm-master.svg",
            "user_id": verified_user.id,
        },
        headers=headers,
    )
    assert award_res.status_code == 201
    ach2 = award_res.json()
    assert ach2["user_id"] == verified_user.id

    # 3. List all achievements
    list_res = await client.get("/api/v1/admin/achievements", headers=headers)
    assert list_res.status_code == 200
    all_achs = list_res.json()
    assert len(all_achs) >= 2
    assert any(a["title"] == "System Architect" for a in all_achs)

    # 4. List achievements for user
    user_ach_res = await client.get(f"/api/v1/admin/achievements?user_id={verified_user.id}", headers=headers)
    assert user_ach_res.status_code == 200
    user_achs = user_ach_res.json()
    assert any(a["title"] == "Algorithm Master" for a in user_achs)

    # 5. User dossier contains unlocked achievements
    dossier_res = await client.get(f"/api/v1/admin/users/{verified_user.id}", headers=headers)
    assert dossier_res.status_code == 200
    dossier = dossier_res.json()
    assert "achievements" in dossier
    assert len(dossier["achievements"]) >= 1
    assert dossier["achievements"][0]["title"] == "Algorithm Master"

    # 6. Delete achievement
    delete_res = await client.delete(f"/api/v1/admin/achievements/{ach1['id']}", headers=headers)
    assert delete_res.status_code == 200
    assert "deleted successfully" in delete_res.json()["message"]

    # 7. Deleting non-existent achievement returns 404
    del_404 = await client.delete("/api/v1/admin/achievements/999999", headers=headers)
    assert del_404.status_code == 404


# -----------------------------------------------------------------------------
# 2. DSA Problem Management Tests (with dual prefix verification)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_dsa_problem_management_full_crud(
    client: AsyncClient,
    admin_user: User,
    test_db_session: AsyncSession,
):
    admin_token = create_access_token(subject=str(admin_user.id), username=admin_user.username, email=admin_user.email)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create Question via /admin/dsa/questions
    create_payload = {
        "title": "Median of Two Sorted Arrays",
        "difficulty": "Hard",
        "description": "Given two sorted arrays nums1 and nums2, return the median of the two sorted arrays.",
        "starter_code": "def findMedianSortedArrays(nums1, nums2):\n    pass\n",
        "function_name": "findMedianSortedArrays",
        "test_cases": '[{"input": [[1, 3], [2]], "expected": 2.0}]',
        "hints": '["Use binary search on the smaller array."]',
        "optimal_time_complexity": "O(log(min(m, n)))",
        "optimal_space_complexity": "O(1)",
    }
    create_res = await client.post("/admin/dsa/questions", json=create_payload, headers=headers)
    assert create_res.status_code == 201
    q = create_res.json()
    q_id = q["id"]
    assert q["title"] == "Median of Two Sorted Arrays"
    assert q["difficulty"] == "Hard"

    # 2. Fetch Single Question via /api/v1/admin/dsa/questions/{id} (Dual prefix check)
    get_res = await client.get(f"/api/v1/admin/dsa/questions/{q_id}", headers=headers)
    assert get_res.status_code == 200
    q_data = get_res.json()
    assert q_data["id"] == q_id
    assert q_data["function_name"] == "findMedianSortedArrays"
    assert "findMedianSortedArrays" in q_data["python_starter_code"]

    # 3. Update Question via /admin/dsa/questions/{id}
    update_res = await client.put(
        f"/admin/dsa/questions/{q_id}",
        json={
            "difficulty": "Medium",
            "optimal_time_complexity": "O(log(m + n))",
            "starter_code": "def findMedianSortedArrays(nums1, nums2):\n    # Optimized\n    pass\n",
        },
        headers=headers,
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["difficulty"] == "Medium"
    assert updated_data["optimal_time_complexity"] == "O(log(m + n))"

    # 4. Insert dummy submission and query submissions
    submission = CodeSubmission(
        session_id="sess_test_123",
        user_id=admin_user.id,
        question_id=q_id,
        code="def findMedianSortedArrays(nums1, nums2): return 2.0",
        language="python",
        status="Accepted",
        is_submission=True,
        execution_time_ms=45.2,
        memory_used_kb=1420.0,
        passed_tests=5,
        total_tests=5,
    )
    test_db_session.add(submission)
    await test_db_session.commit()
    await test_db_session.refresh(submission)

    # 5. List submissions via /admin/dsa/submissions
    subs_res = await client.get(f"/admin/dsa/submissions?question_id={q_id}&status=Accepted", headers=headers)
    assert subs_res.status_code == 200
    subs_data = subs_res.json()
    assert subs_data["total"] >= 1
    assert any(s["id"] == submission.id for s in subs_data["items"])

    # 6. Fetch single submission via /admin/dsa/submissions/{id}
    single_sub_res = await client.get(f"/admin/dsa/submissions/{submission.id}", headers=headers)
    assert single_sub_res.status_code == 200
    sub_detail = single_sub_res.json()
    assert sub_detail["id"] == submission.id
    assert sub_detail["status"] == "Accepted"
    assert sub_detail["execution_time_ms"] == 45.2

    # 7. Delete Question via /admin/dsa/questions/{id}
    del_res = await client.delete(f"/admin/dsa/questions/{q_id}", headers=headers)
    assert del_res.status_code == 200
    assert "deleted successfully" in del_res.json()["message"]

    # 8. Verify deleted question returns 404
    verify_404 = await client.get(f"/admin/dsa/questions/{q_id}", headers=headers)
    assert verify_404.status_code == 404


# -----------------------------------------------------------------------------
# 3. Mock Interviews Audit & Grading Tests
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_mock_interviews_audit_and_grading(
    client: AsyncClient,
    admin_user: User,
    verified_user: User,
    test_db_session: AsyncSession,
):
    admin_token = create_access_token(subject=str(admin_user.id), username=admin_user.username, email=admin_user.email)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create Mock Interview Session
    now = datetime.now(UTC)
    session = InterviewSession(
        id="session_audit_test_001",
        user_id=verified_user.id,
        candidate_name="Verified Candidate",
        interview_type="System Design",
        difficulty="Hard",
        stage="completed",
        state_data={
            "duration_minutes": 32.5,
            "messages": [
                {"role": "interviewer", "content": "How would you design a distributed rate limiter?"},
                {"role": "candidate", "content": "I would use Redis with a sliding window counter algorithm."},
            ],
        },
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(session)
    await test_db_session.commit()

    feedback = InterviewFeedback(
        session_id=session.id,
        technical_score=82,
        communication_score=78,
        english_score=85,
        overall_score=82,
        strengths="Clear explanation of sliding window algorithm\nGood Redis architecture",
        weaknesses="Did not address Redis cluster partitioning",
        improvement_plan="Study Redis Cluster hash slots",
    )
    test_db_session.add(feedback)
    await test_db_session.commit()

    # 2. Test GET /interviews list with contract checks
    res = await client.get("/api/admin/interviews?interview_type=System Design&status=completed", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert data["total"] >= 1
    found_item = next((item for item in data["items"] if item["id"] == session.id), None)
    assert found_item is not None
    assert found_item["user_email"] == verified_user.email
    assert found_item["score"] == 82
    assert found_item["candidate_name"] == "Verified Candidate"
    assert found_item["duration_minutes"] == 32.5

    # 3. Test GET /interviews/{session_id} audit detail
    audit_res = await client.get(f"/api/admin/interviews/{session.id}", headers=headers)
    assert audit_res.status_code == 200
    audit = audit_res.json()
    assert audit["id"] == session.id
    assert audit["candidate_name"] == "Verified Candidate"
    assert audit["user"]["email"] == verified_user.email
    assert audit["feedback"]["overall_score"] == 82
    assert len(audit["transcript"]) == 2
    assert audit["transcript"][1]["role"] == "candidate"

    # 4. Test PATCH /interviews/{session_id}/score override
    override_res = await client.patch(
        f"/api/admin/interviews/{session.id}/score",
        json={
            "technical_score": 92,
            "communication_score": 88,
            "english_score": 90,
            "overall_score": 90,
            "reason": "Demonstrated deep mastery during follow-up query",
        },
        headers=headers,
    )
    assert override_res.status_code == 200
    override_data = override_res.json()
    assert override_data["overall_score"] == 90
    assert override_data["technical_score"] == 92

    # Verify score was updated in DB
    refetched = await client.get(f"/api/admin/interviews/{session.id}", headers=headers)
    assert refetched.json()["feedback"]["overall_score"] == 90

    # 5. Test GET /interviews/stats and /stats
    stats_res = await client.get("/api/admin/stats", headers=headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_interviews"] >= 1
    assert stats["total_users"] >= 1
    assert stats["completed_interviews"] >= 1
    assert stats["total_minutes"] > 0
    assert "categories" in stats
    assert stats["categories"]["system_design"] >= 1

    # 6. Test GET /interviews/{session_id}/metrics
    metrics_res = await client.get(f"/api/admin/interviews/{session.id}/metrics", headers=headers)
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert metrics["session_id"] == session.id
    assert "speech_metrics" in metrics
    assert "telemetry_summary" in metrics
    assert "turns" in metrics
    assert metrics["speech_metrics"]["audio_quality"] in ["good", "excellent"]
    assert metrics["telemetry_summary"]["avg_e2e_latency_ms"] > 0
    assert len(metrics["turns"]) >= 1


# -----------------------------------------------------------------------------
# 4. Telemetry Overview Tests
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_telemetry_overview_contract(
    client: AsyncClient,
    admin_user: User,
):
    admin_token = create_access_token(subject=str(admin_user.id), username=admin_user.username, email=admin_user.email)
    headers = {"Authorization": f"Bearer {admin_token}"}

    res = await client.get("/api/admin/telemetry/overview?limit=25", headers=headers)
    assert res.status_code == 200
    telemetry = res.json()

    # Verify fields required by TelemetryAnalytics.tsx
    assert "analyzed_sessions_count" in telemetry
    assert "overall_avg_e2e_latency_ms" in telemetry
    assert "overall_avg_main_ttft_ms" in telemetry
    assert "overall_avg_fast_ttft_ms" in telemetry
    assert "slowest_turns" in telemetry
    assert "recent_sessions" in telemetry

    # Verify system infrastructure metrics
    assert "active_webrtc_sessions" in telemetry
    assert "redis_memory_status" in telemetry
    assert "db_pool_usage" in telemetry
    assert "avg_voice_latency_ms" in telemetry
    assert "stt_roundtrip_latency_ms" in telemetry
    assert "tts_roundtrip_latency_ms" in telemetry
