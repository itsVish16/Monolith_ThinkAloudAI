import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.tasks.analysis_tasks import (
    extract_speaking_analytics,
    format_transcript,
)
from app.tasks.queue import (
    _TASK_REGISTRY,
    TASK_DLQ_KEY,
    TASK_QUEUE_KEY,
    _delayed_requeue,
    enqueue_task,
    register_task,
    set_task_result,
    task_worker_loop,
)
from app.voice_agent.graphs.factory import build_graph
from app.voice_agent.prompts import (
    INTERVIEW_PERSONAS,
    STAGE_PROMPTS,
)
from app.voice_agent.state import EvaluationResult, InterviewStage


def test_interview_stage_enum():
    assert InterviewStage.DSA_PRESENTATION == "dsa_presentation"
    assert InterviewStage.DSA_APPROACH == "dsa_approach"
    assert InterviewStage.DSA_CODING == "dsa_coding"
    assert InterviewStage.DSA_TESTING == "dsa_testing"
    assert InterviewStage.WRAP_UP == "wrap_up"
    assert InterviewStage.COMPLETED == "completed"


def test_evaluation_result_validation():
    result = EvaluationResult(
        reasoning="Good explanation of two-pointer approach.",
        score=5,
        feedback="Optimal time complexity O(N).",
        objective_met=True,
        trigger_next_question=False,
    )
    assert result.score == 5
    assert result.objective_met is True
    assert result.trigger_next_question is False


def test_interview_personas_and_prompts():
    assert "dsa" in INTERVIEW_PERSONAS
    assert "system_design" in INTERVIEW_PERSONAS
    assert "hr" in INTERVIEW_PERSONAS
    assert "pm" in INTERVIEW_PERSONAS
    assert "ai_ml" in INTERVIEW_PERSONAS

    assert "dsa_presentation" in STAGE_PROMPTS
    assert "dsa_approach" in STAGE_PROMPTS
    assert "dsa_coding" in STAGE_PROMPTS
    assert "dsa_testing" in STAGE_PROMPTS
    assert "wrap_up" in STAGE_PROMPTS


@pytest.mark.parametrize("track", ["dsa", "system_design", "hr", "pm", "ai_ml", "general"])
def test_build_graph_for_all_tracks(track):
    compiled_graph = build_graph(track)
    assert compiled_graph is not None
    # LangGraph StateGraph instance has nodes and edges
    assert hasattr(compiled_graph, "ainvoke")


def test_format_transcript():
    raw_messages = [
        {"role": "system", "content": "System prompt ignore me"},
        {"role": "assistant", "content": "Hi, welcome to the interview!"},
        {"role": "user", "content": "[Candidate Visual Observation: ok] Let me explain my approach."},
        {"role": "assistant", "content": "[DIRECT] Sounds great!"},
    ]
    formatted = format_transcript(raw_messages)
    assert "System prompt" not in formatted
    assert "[Candidate Visual Observation: ok]" not in formatted
    assert "[DIRECT]" not in formatted
    assert "Interviewer: Hi, welcome to the interview!" in formatted
    assert "Candidate: Let me explain my approach." in formatted
    assert "Interviewer: Sounds great!" in formatted


def test_extract_speaking_analytics():
    raw_messages = [
        {"role": "assistant", "content": "What is the time complexity of your solution?"},
        {"role": "user", "content": "Umm basically it runs in linear time like O of N."},
    ]
    analytics = extract_speaking_analytics(raw_messages)
    assert analytics["candidate_percentage"] > 0
    assert analytics["ai_percentage"] > 0
    assert analytics["filler_words"]["umm"] == 1
    assert analytics["filler_words"]["basically"] == 1
    assert analytics["filler_words"]["like"] == 1


@pytest.mark.asyncio
async def test_task_registry_and_worker_loop():
    executed_events = []

    @register_task("test_mock_task")
    async def handle_mock(payload: dict):
        executed_events.append(payload.get("msg"))
        return {"status": "ok", "echo": payload.get("msg")}

    assert "test_mock_task" in _TASK_REGISTRY

    # Mock Redis client
    mock_redis = AsyncMock()
    queue_store = []

    async def mock_lpush(key, val):
        queue_store.append(val)
        return len(queue_store)

    async def mock_brpop(key, timeout=1.0):
        if queue_store:
            return (key, queue_store.pop(0))
        await asyncio.sleep(0.01)
        return None

    mock_redis.lpush.side_effect = mock_lpush
    mock_redis.brpop.side_effect = mock_brpop
    mock_redis.setex = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with patch("app.tasks.queue.get_redis", return_value=mock_redis):
        # 1. Enqueue task
        task_id = await enqueue_task("test_mock_task", {"msg": "hello_redis"})
        assert task_id is not None
        assert len(queue_store) == 1

        # 2. Run worker loop briefly
        stop_event = asyncio.Event()
        worker = asyncio.create_task(task_worker_loop(stop_event))

        # Give loop moment to process
        await asyncio.sleep(0.05)
        stop_event.set()
        await worker

        assert "hello_redis" in executed_events

        # 3. Test set and get result (worker automatically stored result, then manual call)
        await set_task_result(task_id, {"done": True})
        assert mock_redis.setex.call_count == 2


@pytest.mark.asyncio
async def test_delayed_requeue_and_dlq_capping():
    import json

    mock_redis = AsyncMock()
    mock_redis.lpush = AsyncMock()
    mock_redis.ltrim = AsyncMock()

    with patch("app.tasks.queue.get_redis", return_value=mock_redis):
        # 1. Test _delayed_requeue pushes envelope back to TASK_QUEUE_KEY
        await _delayed_requeue("retry_sample", {"data": 123}, delay_seconds=0.001)
        assert mock_redis.lpush.call_count == 1
        call_queue, call_payload = mock_redis.lpush.call_args_list[0][0]
        assert call_queue == TASK_QUEUE_KEY
        parsed = json.loads(call_payload)
        assert parsed["task_name"] == "retry_sample"
        assert parsed["payload"] == {"data": 123}

    # 2. Test worker loop trims DLQ to 1000 items (0, 999) on failing task exceeding max_retries
    failing_queue = [
        json.dumps({
            "task_id": "fail-123",
            "task_name": "unknown_task_xyz",
            "payload": {},
            "attempts": 3,
            "max_retries": 3,
        })
    ]

    mock_redis_worker = AsyncMock()

    async def mock_brpop(key, timeout=1.0):
        if failing_queue:
            return (key, failing_queue.pop(0))
        await asyncio.sleep(0.01)
        return None

    mock_redis_worker.brpop.side_effect = mock_brpop
    mock_redis_worker.lpush = AsyncMock()
    mock_redis_worker.ltrim = AsyncMock()
    mock_redis_worker.setex = AsyncMock()

    with patch("app.tasks.queue.get_redis", return_value=mock_redis_worker):
        stop_event = asyncio.Event()
        worker = asyncio.create_task(task_worker_loop(stop_event))

        await asyncio.sleep(0.05)
        stop_event.set()
        await worker

        # Verifies DLQ was pushed and capped with ltrim(TASK_DLQ_KEY, 0, 999)
        mock_redis_worker.lpush.assert_called_with(TASK_DLQ_KEY, mock_redis_worker.lpush.call_args[0][1])
        mock_redis_worker.ltrim.assert_called_with(TASK_DLQ_KEY, 0, 999)


def test_assemblyai_stt_adapter_initialization():
    from app.config import settings
    from app.voice_agent.stt_tts import AssemblyAIRealtimeSTT, get_stt_adapter

    # 1. Direct class instantiation
    stt_inst = AssemblyAIRealtimeSTT(api_key="mock_assemblyai_key", sample_rate=16000)
    assert stt_inst.provider == "AssemblyAI (Realtime WebSocket)"
    assert stt_inst.model == "assemblyai-realtime"
    assert stt_inst.capabilities.streaming is True

    # 2. Factory creation when settings.assemblyai_api_key is set
    with patch.object(settings, "assemblyai_api_key", "test_assembly_key_123"):
        adapter = get_stt_adapter()
        assert isinstance(adapter, AssemblyAIRealtimeSTT)


def test_sarvam_tts_adapter_initialization():
    from app.config import settings
    from app.voice_agent.stt_tts import SarvamTTS, get_tts_adapter

    # 1. Direct class instantiation with defaults
    default_tts = SarvamTTS(api_key="mock_sarvam_key")
    assert default_tts.model == "bulbul:v4-flash"
    assert default_tts.speaker == "shubh_en_numbers"
    assert default_tts.sample_rate == 24000
    assert "bulbul:v4-flash" in default_tts.provider
    assert "wss://api.sarvam.ai/text-to-speech/ws" in default_tts.ws_url

    # 2. Direct class instantiation with custom parameters
    tts_inst = SarvamTTS(
        api_key="mock_sarvam_key",
        model="bulbul:v4-flash",
        speaker="shubh_en_numbers",
        language="en-IN",
        sample_rate=24000,
    )
    assert tts_inst.model == "bulbul:v4-flash"
    assert tts_inst.speaker == "shubh_en_numbers"
    assert tts_inst.sample_rate == 24000
    assert "bulbul:v4-flash" in tts_inst.provider

    # 3. Factory creation when settings.sarvam_api_key is set
    with patch.object(settings, "sarvam_api_key", "test_sarvam_key_456"):
        adapter = get_tts_adapter()
        assert isinstance(adapter, SarvamTTS)
        assert adapter.model == "bulbul:v4-flash"
        assert adapter.speaker == "shubh_en_numbers"
        assert adapter.sample_rate == 24000


def test_sarvam_gemma4_llm_provider_setup():
    from app.config import settings
    from app.voice_agent.llm import _get_provider_clients

    with (
        patch.object(settings, "sarvam_api_key", "mock_sarvam_llm_key"),
        patch.object(settings, "sarvam_model", "gemma4"),
    ):
            providers = _get_provider_clients()
            assert len(providers) >= 1
            # Primary provider must be Sarvam with Gemma 4 model
            provider_name, client, model = providers[0]
            assert provider_name == "sarvam"
            assert model == "gemma4"


def test_langsmith_tracing_environment_configuration():
    from app.config import settings

    # Ensure LangSmith settings are available
    assert hasattr(settings, "langsmith_api_key")
    assert hasattr(settings, "langsmith_project")
    assert hasattr(settings, "langsmith_endpoint")
    assert settings.langsmith_project == "ThinkAloudAI"

    # Test traceable decorator doesn't break function execution
    from app.voice_agent.llm import traceable

    @traceable(name="unit_test_traceable")
    def sample_traced(val: int) -> int:
        return val * 2

    assert sample_traced(21) == 42
