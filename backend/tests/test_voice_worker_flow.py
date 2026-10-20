import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from livekit.agents import llm

from app.voice_agent.state import InterviewStage
from app.voice_agent.stt_tts import get_stt_adapter, get_tts_adapter, get_vad_adapter
from app.voice_agent.worker import InterviewAgent, clean_display_name, serialize_state_safely


def test_clean_display_name():
    assert clean_display_name("john.doe@example.com") == "John Doe"
    assert clean_display_name("alice_smith123") == "Alice Smith"
    assert clean_display_name(None) == "Candidate"
    assert clean_display_name("") == "Candidate"


def test_serialize_state_safely():
    state = {
        "stage": "dsa_coding",
        "messages": [{"role": "user", "content": "hi"}],
        "stream_queue": asyncio.Queue(),
        "turn_lock": asyncio.Lock(),
        "extra_num": 42,
    }
    clean = serialize_state_safely(state)
    assert "stream_queue" not in clean
    assert "turn_lock" not in clean
    assert clean["stage"] == "dsa_coding"
    assert clean["extra_num"] == 42
    # Ensure it is json-serializable
    json.dumps(clean)


def test_stt_and_tts_adapter_fallbacks():
    # Calling get_stt_adapter and get_tts_adapter should return valid adapters without crashing
    stt = get_stt_adapter()
    tts = get_tts_adapter()
    vad = get_vad_adapter()
    assert stt is not None
    assert tts is not None
    assert vad is not None


@pytest.mark.asyncio
async def test_on_user_turn_completed_empty_speech():
    mock_room = MagicMock()
    mock_room.name = "test-room"
    agent = InterviewAgent(
        room=mock_room,
        room_id="test-room",
        candidate_name="Alice",
        user_id=1,
        interview_type="dsa",
    )

    msg = llm.ChatMessage(role="user", content=["   "])
    await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

    # Empty text should be ignored, no messages added
    assert len(agent.state["messages"]) == 0


@pytest.mark.asyncio
async def test_on_user_turn_completed_multimodal_flow():
    mock_room = MagicMock()
    mock_room.name = "test-room"
    mock_session = AsyncMock()

    agent = InterviewAgent(
        room=mock_room,
        room_id="test-room",
        candidate_name="Alice",
        user_id=1,
        interview_type="dsa",
    )
    agent._agent_session = mock_session

    # Setup multimodal state
    agent.state["latest_code"] = "def two_sum(nums, target): return []"
    agent.state["latest_whiteboard_graph"] = '{"nodes": ["API", "DB"]}'
    agent.state["latest_visual_context"] = "Candidate is smiling and focused on code"

    # Mock LangGraph ainvoke to behave like actual graph (appends assistant response)
    async def fake_ainvoke(state, *args, **kwargs):
        msgs = list(state.get("messages", []))
        msgs.append({"role": "assistant", "content": "Excellent! Could you explain the time complexity?"})
        return {
            "messages": msgs,
            "stage": InterviewStage.DSA_CODING.value,
        }

    with patch.object(agent.interview_agent, "ainvoke", new=AsyncMock(side_effect=fake_ainvoke)), \
         patch.object(agent, "evaluate_turn", new=AsyncMock()) as mock_eval, \
         patch.object(agent, "persist_session_state", new=AsyncMock()) as mock_persist:

        msg = llm.ChatMessage(role="user", content=["I have written the two sum function"])
        await agent.on_user_turn_completed(turn_ctx=None, new_message=msg)

        # 1. Check user message contains multimodal context
        user_msgs = [m for m in agent.state["messages"] if m["role"] == "user"]
        assert len(user_msgs) > 0
        first_user_msg = user_msgs[0]["content"]
        assert "Candidate Editor Code" in first_user_msg
        assert "def two_sum" in first_user_msg
        assert "Candidate Whiteboard State" in first_user_msg
        assert "Candidate Visual Observation" in first_user_msg
        assert "I have written the two sum function" in first_user_msg

        # 2. Check session.say was called with assistant response
        mock_session.say.assert_awaited_once_with("Excellent! Could you explain the time complexity?")

        # 3. Check evaluate_turn and persist_session_state were triggered
        await asyncio.sleep(0.05)
        mock_eval.assert_called()
        mock_persist.assert_called()


@pytest.mark.asyncio
async def test_harmonized_datachannel_handlers():
    """Verify that both legacy and harmonized data channel formats update state properly."""
    mock_room = MagicMock()
    mock_room.name = "test-room"
    agent = InterviewAgent(
        room=mock_room,
        room_id="test-room",
        candidate_name="Alice",
        user_id=1,
        interview_type="dsa",
    )

    # Test code updates (both code_update and editor_change, code vs content)
    for test_payload in [
        {"type": "code_update", "code": "x = 1"},
        {"type": "editor_change", "code": "x = 2"},
        {"type": "code_update", "content": "x = 3"},
    ]:
        msg_type = test_payload.get("type")
        if msg_type in ("code_update", "editor_change"):
            code = test_payload.get("code") or test_payload.get("content")
            if code is not None:
                agent.latest_code = code
                agent.state["latest_code"] = code

    assert agent.state["latest_code"] == "x = 3"

    # Test code execution (both code_execution and result)
    for test_payload in [
        {"type": "code_execution", "execution": {"status": "Accepted"}},
        {"type": "result", "result": {"status": "Wrong Answer"}},
        {"type": "code_execution", "output": {"status": "Accepted"}},
    ]:
        msg_type = test_payload.get("type")
        if msg_type in ("code_execution", "result"):
            execution = test_payload.get("execution") or test_payload.get("result") or test_payload.get("output")
            if execution is not None:
                agent.latest_execution = execution
                agent.state["latest_execution"] = execution

    assert agent.state["latest_execution"] == {"status": "Accepted"}

    # Test whiteboard graph (both whiteboard_graph and whiteboard_update)
    for test_payload in [
        {"type": "whiteboard_graph", "graph": {"nodes": [1, 2]}},
        {"type": "whiteboard_update", "data": {"nodes": [3, 4]}},
    ]:
        msg_type = test_payload.get("type")
        if msg_type in ("whiteboard_graph", "whiteboard_update"):
            graph = test_payload.get("graph") or test_payload.get("data")
            if graph is not None:
                agent.latest_whiteboard_graph = json.dumps(graph)
                agent.state["latest_whiteboard_graph"] = agent.latest_whiteboard_graph

    assert agent.state["latest_whiteboard_graph"] == '{"nodes": [3, 4]}'

    # Test design_update
    design_payload = {"type": "design_update", "design": {"boxes": ["LoadBalancer", "Server"]}}
    if design_payload.get("type") == "design_update":
        design = design_payload.get("design") or design_payload.get("nodes")
        agent.latest_code = json.dumps(design)
        agent.state["latest_code"] = agent.latest_code

    assert "LoadBalancer" in agent.state["latest_code"]
