import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.modules.auth.models import User
from app.modules.interview.service import InterviewService


@pytest.fixture
async def auth_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="jane_coder",
        email="jane@example.com",
        full_name="Jane Coder",
        password_hash=get_password_hash("SecretPass123!"),
        is_verified=True,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(auth_user: User) -> dict[str, str]:
    token = create_access_token(
        subject=str(auth_user.id),
        username=auth_user.username,
        email=auth_user.email,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_interview_types(client: AsyncClient):
    res = await client.get("/api/v1/interviews/types")
    assert res.status_code == 200
    data = res.json()
    assert "types" in data
    type_ids = [t["id"] for t in data["types"]]
    assert "dsa" in type_ids
    assert "system_design" in type_ids
    assert "behavioral" in type_ids
    assert "pm" in type_ids
    assert "ai_ml" in type_ids


@pytest.mark.asyncio
async def test_create_interview_session(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    # Unauthenticated should fail (401)
    unauth_res = await client.post(
        "/api/v1/interviews/session",
        json={"interview_type": "dsa", "difficulty": "Medium"},
    )
    assert unauth_res.status_code == 401

    # Authenticated creation
    payload = {
        "interview_type": "dsa",
        "difficulty": "Hard",
        "room_name": "interview_alex_dsa_001",
        "domain": "Algorithms",
    }
    res = await client.post("/api/v1/interviews/session", json=payload, headers=auth_headers)
    assert res.status_code == 201
    session_data = res.json()

    assert session_data["id"] == "interview_alex_dsa_001"
    assert session_data["user_id"] == auth_user.id
    assert session_data["interview_type"] == "dsa"
    assert session_data["difficulty"] == "Hard"
    assert session_data["stage"] == "intro_audio_check"

    # Verify directly in SQLite DB that session links to auth_user.id
    session_obj = await InterviewService.get_session(test_db_session, "interview_alex_dsa_001")
    assert session_obj is not None
    assert session_obj.user_id == auth_user.id


@pytest.mark.asyncio
async def test_generate_token_and_details(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
):
    # 1. Generate LiveKit WebRTC Token
    token_req = {
        "session_id": "session_round_webrtc_99",
        "interview_type": "system_design",
        "domain": "Distributed Storage",
    }
    res = await client.post("/api/v1/interviews/token", json=token_req, headers=auth_headers)
    assert res.status_code == 200
    token_data = res.json()

    assert "token" in token_data
    assert len(token_data["token"]) > 20
    assert token_data["session_id"] == "session_round_webrtc_99"
    assert token_data["room_name"] == "session_round_webrtc_99"
    assert token_data["candidate"] == "Jane Coder"

    # 2. Retrieve session details
    get_res = await client.get("/api/v1/interviews/session_round_webrtc_99", headers=auth_headers)
    assert get_res.status_code == 200
    details = get_res.json()
    assert details["id"] == "session_round_webrtc_99"
    assert details["interview_type"] == "system_design"
    assert details["stage"] == "intro_audio_check"


@pytest.mark.asyncio
async def test_interview_ownership_and_security(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    # Create another user
    other_user = User(
        username="charlie_hacker",
        email="charlie@example.com",
        full_name="Charlie Hacker",
        password_hash=get_password_hash("Hacker123!"),
        is_verified=True,
    )
    test_db_session.add(other_user)
    await test_db_session.commit()
    await test_db_session.refresh(other_user)

    other_token = create_access_token(
        subject=str(other_user.id),
        username=other_user.username,
        email=other_user.email,
    )
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # Jane creates a session
    await client.post(
        "/api/v1/interviews/session",
        json={"interview_type": "behavioral", "room_name": "jane_private_session"},
        headers=auth_headers,
    )

    # Charlie attempts to view Jane's session -> 403 Forbidden
    res = await client.get("/api/v1/interviews/jane_private_session", headers=other_headers)
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]


@pytest.mark.asyncio
async def test_session_lifecycle_and_feedback(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    # Create session
    session_id = "lifecycle_session_001"
    create_res = await client.post(
        "/api/v1/interviews/session",
        json={"interview_type": "dsa", "room_name": session_id},
        headers=auth_headers,
    )
    assert create_res.status_code == 201

    # Update stage to technical_questions
    patch_res = await client.patch(
        f"/api/v1/interviews/{session_id}/stage",
        json={"stage": "technical_questions", "difficulty": "Medium"},
        headers=auth_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["stage"] == "technical_questions"

    # End interview
    end_res = await client.post(f"/api/v1/interviews/{session_id}/end", headers=auth_headers)
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "success"

    # Save feedback rubric
    await InterviewService.save_feedback(
        db=test_db_session,
        session_id=session_id,
        technical_score=85,
        communication_score=90,
        english_score=88,
        strengths=["Clear problem decomposition", "Optimal O(N) solution"],
        weaknesses=["Could discuss memory tradeoffs earlier"],
        improvement_plan=["Practice dynamic programming memoization"],
        recommended_topics=["Graph Algorithms", "Segment Trees"],
    )

    # Retrieve feedback endpoint
    fb_res = await client.get(f"/api/v1/interviews/{session_id}/feedback", headers=auth_headers)
    assert fb_res.status_code == 200
    fb_data = fb_res.json()
    assert fb_data["technical_score"] == 85
    assert fb_data["communication_score"] == 90
    assert fb_data["overall_score"] is not None
    assert "Clear problem decomposition" in fb_data["strengths"]

    # List interviews
    list_res = await client.get("/api/v1/interviews", headers=auth_headers)
    assert list_res.status_code == 200
    interviews = list_res.json()
    assert len(interviews) >= 1
    assert any(i["id"] == session_id for i in interviews)


@pytest.mark.asyncio
async def test_force_end_interview_queues_analysis(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    session_id = "test_end_queue_001"
    create_res = await client.post(
        "/api/v1/interviews/session",
        json={"interview_type": "dsa", "room_name": session_id},
        headers=auth_headers,
    )
    assert create_res.status_code == 201

    # End interview and check task enqueued
    end_res = await client.post(f"/api/v1/interviews/{session_id}/end", headers=auth_headers)
    assert end_res.status_code == 200
    end_data = end_res.json()
    assert end_data["status"] == "success"
    assert "task_id" in end_data
    assert len(end_data["task_id"]) > 10

    # Verify session stage in database is marked completed
    sess_obj = await InterviewService.get_session(test_db_session, session_id)
    assert sess_obj is not None
    assert sess_obj.stage == "completed"

    # Also test the /api/interview/{session_id}/end alias
    alias_session = "test_end_queue_alias_002"
    await client.post(
        "/api/v1/interviews/session",
        json={"interview_type": "behavioral", "room_name": alias_session},
        headers=auth_headers,
    )
    alias_end = await client.post(f"/api/interview/{alias_session}/end", headers=auth_headers)
    assert alias_end.status_code == 200
    assert alias_end.json()["status"] == "success"


@pytest.mark.asyncio
async def test_get_interview_metrics_and_alias(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    session_id = "test_metrics_session_001"
    messages = [
        {"role": "assistant", "content": "Can you explain how a binary search tree works?"},
        {"role": "user", "content": "Umm basically it is a tree where each node has like two children."},
    ]
    create_res = await client.post(
        "/api/v1/interviews/session",
        json={"interview_type": "dsa", "room_name": session_id},
        headers=auth_headers,
    )
    assert create_res.status_code == 201

    # Update state data with messages
    await InterviewService.update_session_stage(
        db=test_db_session,
        session_id=session_id,
        stage="dsa_coding",
        state_data={"messages": messages},
    )

    # 1. Fetch metrics via standard /api/v1/interviews/{session_id}/metrics
    metrics_res = await client.get(f"/api/v1/interviews/{session_id}/metrics", headers=auth_headers)
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()

    assert metrics["session_id"] == session_id
    assert metrics["speech_rate_wpm"] == 135.0
    assert metrics["total_turn_count"] == 2
    assert metrics["user_speaking_time_seconds"] > 0
    assert metrics["interviewer_speaking_time_seconds"] > 0
    assert metrics["filler_word_count"] >= 3
    assert "umm" in metrics["filler_words"]
    assert "basically" in metrics["filler_words"]
    assert "like" in metrics["filler_words"]
    assert 0 <= metrics["audio_quality_score"] <= 100
    assert metrics["sentiment"] in ("positive", "neutral")
    assert isinstance(metrics["metrics_history"], list)
    assert len(metrics["metrics_history"]) == 2

    # 2. Fetch metrics via alias /interviews/{session_id}/metrics
    alias_res = await client.get(f"/interviews/{session_id}/metrics", headers=auth_headers)
    assert alias_res.status_code == 200
    assert alias_res.json()["total_turn_count"] == 2


@pytest.mark.asyncio
async def test_stream_interview_status_and_alias(
    client: AsyncClient,
    auth_user: User,
    test_db_session: AsyncSession,
):
    from app.core.security import create_access_token

    token = create_access_token(
        subject=str(auth_user.id),
        username=auth_user.username,
        email=auth_user.email,
    )
    session_id = "test_stream_session_001"

    # Create session directly
    await InterviewService.create_session(
        db=test_db_session,
        user_id=auth_user.id,
        candidate_name=auth_user.username,
        payload=type("Payload", (), {
            "interview_type": "dsa",
            "room_name": session_id,
            "difficulty": "Medium",
            "domain": None,
            "role": None,
            "custom_prompt": None,
            "question_ids": None,
        })(),
    )

    # Pre-save completed feedback
    await InterviewService.save_feedback(
        db=test_db_session,
        session_id=session_id,
        technical_score=92,
        communication_score=88,
        english_score=90,
        strengths=["Clear logic"],
        weaknesses=["None"],
        improvement_plan=["Keep practicing"],
    )

    # 1. Connect using ?token= query parameter (EventSource mode)
    stream_res = await client.get(f"/api/v1/interviews/{session_id}/stream?token={token}")
    assert stream_res.status_code == 200
    assert "text/event-stream" in stream_res.headers["content-type"]
    stream_text = stream_res.text
    assert "data: " in stream_text
    assert '"type": "heartbeat"' in stream_text
    assert '"type": "completed"' in stream_text
    assert '"event": "InterviewCompleted"' in stream_text

    # 2. Connect via alias /api/interview/{session_id}/stream with Bearer header
    alias_res = await client.get(
        f"/api/interview/{session_id}/stream",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert alias_res.status_code == 200
    assert "text/event-stream" in alias_res.headers["content-type"]
    assert '"event": "InterviewCompleted"' in alias_res.text


@pytest.mark.asyncio
async def test_feedback_with_json_encoded_text_strings(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    session_id = "test_json_string_feedback_001"
    create_res = await client.post(
        "/api/v1/interviews/session",
        json={"interview_type": "dsa", "room_name": session_id},
        headers=auth_headers,
    )
    assert create_res.status_code == 201

    # Simulate PostgreSQL text fields containing JSON-encoded string data
    await InterviewService.save_feedback(
        db=test_db_session,
        session_id=session_id,
        technical_score=80,
        communication_score=85,
        english_score=90,
        strengths='["Fast formulation", "Optimal complexity"]',
        weaknesses='["Missed rare edge cases"]',
        improvement_plan='["Practice backtracking and graphs"]',
        recommended_topics='["Graphs", "Tries"]',
        detailed_metrics={
            "rubric_scores": {"algorithms": 85, "cleanliness": 90},
            "hiring_decision": "Strong Hire",
        },
    )

    # Fetch feedback
    fb_res = await client.get(f"/api/v1/interviews/{session_id}/feedback", headers=auth_headers)
    assert fb_res.status_code == 200
    fb_data = fb_res.json()

    # Verify JSON strings were parsed safely into lists and dicts
    assert isinstance(fb_data["strengths"], list)
    assert "Fast formulation" in fb_data["strengths"]
    assert "Optimal complexity" in fb_data["strengths"]

    assert isinstance(fb_data["weaknesses"], list)
    assert "Missed rare edge cases" in fb_data["weaknesses"]

    assert isinstance(fb_data["improvement_plan"], list)
    assert "Practice backtracking and graphs" in fb_data["improvement_plan"]

    assert isinstance(fb_data["rubric_scores"], dict)
    assert fb_data["rubric_scores"]["algorithms"] == 85


@pytest.mark.asyncio
async def test_interview_types_alias(client: AsyncClient):
    res = await client.get("/api/interview-types")
    assert res.status_code == 200
    assert "types" in res.json()
    assert len(res.json()["types"]) >= 5


@pytest.mark.asyncio
async def test_dsa_session_question_resolution(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
):
    payload = {
        "interview_type": "dsa",
        "difficulty": "Medium",
        "room_name": "dsa_resolution_session_001",
    }
    res = await client.post("/api/v1/interviews/session", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()
    assert "ai_selected_questions" in data
    assert len(data["ai_selected_questions"]) > 0

    q = data["ai_selected_questions"][0]
    # Schema expected by DSAInterview.tsx: id, title, slug, difficulty, description, test_cases, starter_code, hints
    assert "id" in q
    assert "title" in q
    assert "slug" in q
    assert "difficulty" in q
    assert "description" in q
    assert "test_cases" in q
    assert "starter_code" in q
    assert "hints" in q


@pytest.mark.asyncio
async def test_dsa_session_question_resolution_with_ids(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
):
    payload = {
        "interview_type": "dsa",
        "difficulty": "Easy",
        "question_ids": ["1"],
        "room_name": "dsa_ids_session_002",
    }
    res = await client.post("/api/v1/interviews/session", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()
    questions = data["ai_selected_questions"]
    assert len(questions) == 1
    assert questions[0]["id"] == 1 or str(questions[0]["id"]) == "1"


@pytest.mark.asyncio
async def test_system_design_question_resolution(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
):
    payload = {
        "interview_type": "system_design",
        "difficulty": "Hard",
        "room_name": "sd_resolution_session_003",
    }
    res = await client.post("/api/v1/interviews/session", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()
    assert len(data["ai_selected_questions"]) > 0
    q = data["ai_selected_questions"][0]
    assert "id" in q
    assert "title" in q
    assert "difficulty" in q
    assert "description" in q
    assert "architecture_requirements" in q
    assert isinstance(q["architecture_requirements"], list)


@pytest.mark.asyncio
async def test_token_livekit_metadata_and_on_the_fly_fallback(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
    test_db_session: AsyncSession,
):
    import json

    import jwt

    # 1. Create a session directly in DB with EMPTY ai_selected_questions
    empty_session_id = "empty_q_session_999"
    await InterviewService.create_session(
        db=test_db_session,
        user_id=auth_user.id,
        candidate_name=auth_user.full_name,
        payload=type("Payload", (), {
            "interview_type": "dsa",
            "room_name": empty_session_id,
            "difficulty": "Medium",
            "domain": None,
            "role": None,
            "custom_prompt": None,
            "question_ids": None,
        })(),
    )

    # Force empty state_data["ai_selected_questions"] to simulate pre-existing session
    await InterviewService.update_session_stage(
        db=test_db_session,
        session_id=empty_session_id,
        stage="intro_audio_check",
        state_data={"ai_selected_questions": []},
    )

    # 2. Call /token endpoint
    token_res = await client.post(
        "/api/v1/interviews/token",
        json={"session_id": empty_session_id, "interview_type": "dsa"},
        headers=auth_headers,
    )
    assert token_res.status_code == 200
    token_data = token_res.json()

    # Verify on-the-fly fallback resolved questions
    assert "ai_selected_questions" in token_data
    assert len(token_data["ai_selected_questions"]) > 0
    assert token_data["candidate"] == "Jane Coder"

    # Decode JWT to verify identity, display name, metadata, and video grants
    token_jwt = token_data["token"]
    decoded = jwt.decode(token_jwt, options={"verify_signature": False})
    expected_identity = f"user_{auth_user.id}_{empty_session_id[:8]}"
    assert decoded["sub"] == expected_identity
    assert decoded["name"] == "Jane Coder"
    assert decoded["video"]["canPublishData"] is True
    assert decoded["video"]["canPublish"] is True
    assert decoded["video"]["canSubscribe"] is True
    assert decoded["video"]["roomJoin"] is True
    assert decoded["video"]["room"] == empty_session_id

    # Verify metadata JSON in token
    metadata = json.loads(decoded["metadata"])
    assert metadata["candidate_name"] == "Jane Coder"
    assert metadata["user_id"] == str(auth_user.id)
    assert metadata["interview_type"] == "dsa"
    assert len(metadata["ai_selected_questions"]) > 0

    # Verify database session state_data was updated on-the-fly
    updated_session = await InterviewService.get_session(test_db_session, empty_session_id)
    assert len(updated_session.state_data.get("ai_selected_questions", [])) > 0


@pytest.mark.asyncio
async def test_token_concurrent_requests_and_guest_fallback(
    client: AsyncClient,
    auth_user: User,
    auth_headers: dict[str, str],
):
    """
    Verifies that concurrent token requests with the exact same room_name
    (such as React StrictMode initial mount) both succeed with 200 without 500 UniqueViolationError,
    and unauthenticated guest requests gracefully fallback to a valid session.
    """
    race_room = "race-dsa-int-99999"
    payload = {
        "room_name": race_room,
        "interview_type": "dsa",
        "domain": "Algorithms",
        "role": "Software Engineer",
    }

    # Test sequential duplicate request with same room_name
    res1 = await client.post("/api/v1/interviews/token", json=payload, headers=auth_headers)
    res2 = await client.post("/api/v1/interviews/token", json=payload, headers=auth_headers)
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json()["room_name"] == race_room
    assert res2.json()["room_name"] == race_room

    # Test guest request without Authorization header
    guest_room = "guest-dsa-int-11111"
    guest_res = await client.post(
        "/api/v1/interviews/token",
        json={"room_name": guest_room, "interview_type": "general"},
    )
    assert guest_res.status_code == 200
    assert guest_res.json()["room_name"] == guest_room
    assert "token" in guest_res.json()


