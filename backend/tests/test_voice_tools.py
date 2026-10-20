from unittest.mock import AsyncMock, MagicMock

import pytest

from app.voice_agent.tools import (
    execute_agent_tool,
    extract_inline_tool_calls,
)


def test_extract_inline_tool_calls():
    text = (
        "Great idea, let me open the workspace for you.\n"
        "<tool_call>\n"
        '{"name": "open_code_editor", "parameters": {"problem_title": "LRU Cache", "difficulty": "Medium", "problem_statement": "Implement LRU", "language": "python", "starter_code": "class LRUCache: pass"}}\n'
        "</tool_call>\n"
        "Take a look at the starter code on your screen."
    )
    clean_text, tools = extract_inline_tool_calls(text)
    assert len(tools) == 1
    assert tools[0]["name"] == "open_code_editor"
    assert tools[0]["parameters"]["problem_title"] == "LRU Cache"
    assert "<tool_call>" not in clean_text
    assert "Great idea, let me open the workspace for you." in clean_text
    assert "Take a look at the starter code on your screen." in clean_text

@pytest.mark.asyncio
async def test_execute_agent_tool_open_and_close():
    mock_room = MagicMock()
    mock_participant = MagicMock()
    mock_participant.publish_data = AsyncMock()
    mock_room.local_participant = mock_participant

    agent = MagicMock()
    agent.room = mock_room
    agent.state = {"ai_selected_questions": []}
    agent.latest_code = ""

    # Test open_code_editor
    res = await execute_agent_tool(
        "open_code_editor",
        {
            "problem_title": "Two Sum",
            "difficulty": "Easy",
            "problem_statement": "Find two numbers",
            "language": "python",
            "starter_code": "def twoSum(): pass",
        },
        agent,
    )
    assert res["status"] == "success"
    assert agent.state["is_editor_open"] is True
    assert agent.latest_code == "def twoSum(): pass"
    assert mock_participant.publish_data.called

    # Test close_code_editor
    res_close = await execute_agent_tool(
        "close_code_editor",
        {"reason": "Defense phase"},
        agent,
    )
    assert res_close["status"] == "success"
    assert agent.state["is_editor_open"] is False

    # Test update_code_editor with highlight_line
    res_update = await execute_agent_tool(
        "update_code_editor",
        {"code": "# fixed code", "highlight_line": 14},
        agent,
    )
    assert res_update["status"] == "success"
    assert agent.state["highlight_line"] == 14

    # Test capture_candidate_photo
    res_photo = await execute_agent_tool(
        "capture_candidate_photo",
        {"reason": "Observing thinking posture"},
        agent,
    )
    assert res_photo["status"] == "success"
    assert getattr(agent, "_waiting_for_photo", False) is True
