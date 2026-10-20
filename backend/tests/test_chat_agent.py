import json

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.modules.auth.models import User
from app.modules.chat.models import ChatMessageModel, ChatSession
from app.modules.chat.tools import (
    create_user_roadmap,
    get_current_time,
    get_dsa_questions,
    get_user_submissions,
)
from app.modules.tracks.models import Roadmap


@pytest.fixture
async def auth_user(test_db_session: AsyncSession) -> User:
    user = User(
        username="chat_tester",
        email="chat_tester@example.com",
        full_name="Chat Tester",
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
async def test_chat_tools_execution(test_db_session: AsyncSession):
    # 1. Test get_current_time
    time_str = get_current_time.invoke({})
    assert len(time_str) > 10

    # 2. Test get_dsa_questions
    questions_res = await get_dsa_questions.ainvoke({})
    assert "Available DSA Questions" in questions_res or "No questions" in questions_res

    # 3. Test get_user_submissions
    subs_res = await get_user_submissions.ainvoke({"session_id": "non_existent_session"})
    assert "No code submissions found" in subs_res

    # 4. Test create_user_roadmap tool directly
    roadmap_payload = {
        "title": "Full Stack Mastery Roadmap",
        "description": "Comprehensive full stack development path",
        "topics": [
            {
                "title": "Frontend Essentials",
                "items": [
                    {"title": "React Hooks & State", "estimated_minutes": 45},
                    {"title": "Tailwind CSS Styling", "estimated_minutes": 30},
                ],
            },
            {
                "title": "Backend Architectures",
                "items": [
                    {"title": "FastAPI Async Patterns", "estimated_minutes": 60},
                    {"title": "PostgreSQL Indexing", "estimated_minutes": 40},
                ],
            },
        ],
    }
    roadmap_raw_result = await create_user_roadmap.ainvoke(
        roadmap_payload,
        config={"configurable": {"user_id": "test_user_123"}},
    )
    result_data = json.loads(roadmap_raw_result)
    assert result_data["status"] == "success"
    assert "roadmap_id" in result_data
    roadmap_id = result_data["roadmap_id"]

    # Verify roadmap was persisted in database
    rm = await test_db_session.scalar(select(Roadmap).where(Roadmap.id == roadmap_id))
    assert rm is not None
    assert rm.title == "Full Stack Mastery Roadmap"


@pytest.mark.asyncio
async def test_chat_sessions_api_lifecycle(
    client: AsyncClient, auth_user: User, auth_headers: dict[str, str], test_db_session: AsyncSession
):
    # 1. Create a session and message directly in database
    session_id = "test-chat-session-001"
    sess = ChatSession(id=session_id, user_id=auth_user.id, title="Algorithm Exploration")
    test_db_session.add(sess)
    await test_db_session.flush()

    msg1 = ChatMessageModel(session_id=session_id, role="user", content="Explain Dijkstra's Algorithm")
    msg2 = ChatMessageModel(session_id=session_id, role="assistant", content="Dijkstra's finds the shortest paths...")
    test_db_session.add(msg1)
    test_db_session.add(msg2)
    await test_db_session.commit()

    # 2. Test GET /api/v1/chat/sessions
    res = await client.get("/api/v1/chat/sessions", headers=auth_headers)
    assert res.status_code == 200
    sessions = res.json()
    assert len(sessions) >= 1
    assert any(s["id"] == session_id for s in sessions)

    # 3. Test GET /api/v1/chat/sessions/{session_id}/messages
    res_msgs = await client.get(f"/api/v1/chat/sessions/{session_id}/messages", headers=auth_headers)
    assert res_msgs.status_code == 200
    messages = res_msgs.json()
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"

    # 4. Test PATCH /api/v1/chat/sessions/{session_id}/title
    res_title = await client.patch(
        f"/api/v1/chat/sessions/{session_id}/title",
        json={"title": "Shortest Path Graph Algorithms"},
        headers=auth_headers,
    )
    assert res_title.status_code == 200
    assert res_title.json()["title"] == "Shortest Path Graph Algorithms"

    # 5. Test DELETE /api/v1/chat/sessions/{session_id}
    res_del = await client.delete(f"/api/v1/chat/sessions/{session_id}", headers=auth_headers)
    assert res_del.status_code == 200
    assert res_del.json()["session_id"] == session_id

    # Verify session is deleted
    res_check = await client.get(f"/api/v1/chat/sessions/{session_id}/messages", headers=auth_headers)
    assert res_check.status_code == 404
