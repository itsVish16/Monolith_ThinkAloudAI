import asyncio
import contextlib
import json
import logging
import os
import re
import time
from typing import Any

from openai import AsyncOpenAI

from app.config import settings
from app.core.telemetry import traceable, wrap_openai_client
from app.voice_agent.prompts import FAST_BRIDGE_PROMPT
from app.voice_agent.state import EvaluationResult

logger = logging.getLogger("voice_agent_llm")

# Opik tracing setup
try:
    import opik
    _opik_api_key = os.getenv("OPIK_API_KEY", "")
    if _opik_api_key:
        opik.configure(api_key=_opik_api_key, workspace=os.getenv("OPIK_WORKSPACE", "default"))
    _track = opik.track
except Exception:
    def _track(**kwargs):
        def _decorator(func):
            return func
        return _decorator


def _get_provider_clients() -> list[tuple[str, AsyncOpenAI, str]]:
    """
    Returns ordered list of available LLM providers for fallback:
    [(provider_name, AsyncOpenAI client, default_model)]
    Order: Sarvam Gemma 4 (Primary if configured) -> Fireworks -> Gemini -> OpenAI
    All clients are wrapped with LangSmith tracing wrappers.
    """
    providers: list[tuple[str, AsyncOpenAI, str]] = []

    # 1. Sarvam AI (Gemma 4 - High Performance)
    if settings.sarvam_api_key:
        sarvam_client = wrap_openai_client(
            AsyncOpenAI(
                api_key=settings.sarvam_api_key,
                base_url=settings.sarvam_base_url,
                default_headers={"api-subscription-key": settings.sarvam_api_key},
                timeout=5.0,
            )
        )
        providers.append(("sarvam", sarvam_client, settings.sarvam_model or "gemma4"))

    # 2. Fireworks AI (Fast & Cost Effective)
    if settings.fireworks_api_key:
        fw_client = wrap_openai_client(
            AsyncOpenAI(
                api_key=settings.fireworks_api_key,
                base_url=settings.fireworks_base_url,
                timeout=6.0,
            )
        )
        providers.append(("fireworks", fw_client, settings.fireworks_model or "accounts/fireworks/models/llama-v3p3-70b-instruct"))

    # 3. Google Gemini (via OpenAI-compatible endpoint)
    if settings.gemini_api_key:
        gemini_client = wrap_openai_client(
            AsyncOpenAI(
                api_key=settings.gemini_api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                timeout=6.0,
            )
        )
        providers.append(("gemini", gemini_client, "gemini-2.0-flash"))

    # 4. OpenAI (Global Standard)
    if settings.openai_api_key:
        openai_client = wrap_openai_client(
            AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=6.0,
            )
        )
        providers.append(("openai", openai_client, "gpt-4o-mini"))

    # If no keys configured, add dummy/mock client to prevent startup crash
    if not providers:
        dummy_client = wrap_openai_client(
            AsyncOpenAI(api_key="none", base_url="http://localhost:8000/mock", timeout=5.0)
        )
        providers.append(("mock", dummy_client, "mock-model"))

    return providers


@traceable(name="call_fast_bridge", run_type="llm")
async def call_fast_bridge(
    messages: list[dict[str, str]],
    opik_trace_id: str | None = None,
    metrics: Any | None = None,
) -> tuple[bool, str, list[str]]:
    """
    Executes a fast speculative LLM call to classify the turn and generate
    either a [DIRECT] full short response or a [BRIDGE] conversational filler.
    Returns (is_direct, full_text, tokens).
    """
    start_time = time.time()
    recent = messages[-4:] if len(messages) > 4 else messages
    formatted = [{"role": "system", "content": FAST_BRIDGE_PROMPT}] + recent

    span = None
    try:
        import opik
        if opik_trace_id:
            trace = opik.Trace(id=opik_trace_id)
            span = trace.span(
                name="fast_bridge_llm",
                type="llm",
                input={"messages": recent, "system_prompt": FAST_BRIDGE_PROMPT},
            )
    except Exception:
        pass

    tokens: list[str] = []
    first_token_time = None
    providers = _get_provider_clients()

    for provider_name, client, model in providers:
        try:
            # Use smaller/faster model for Fireworks/Sarvam if configured
            if provider_name == "sarvam":
                fast_model = settings.sarvam_model or "gemma4"
            elif provider_name == "fireworks":
                fast_model = "accounts/fireworks/routers/glm-5p2-fast"
            else:
                fast_model = model
            response = await client.chat.completions.create(
                model=fast_model,
                messages=formatted,
                max_tokens=60,
                temperature=0.3,
                stream=True,
            )
            async for chunk in response:
                if chunk.choices:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        if first_token_time is None:
                            first_token_time = time.time()
                        tokens.append(delta)
            if tokens:
                break
        except Exception as e:
            logger.warning(f"Fast LLM bridge on provider '{provider_name}' failed: {e}. Trying next provider.")
            tokens.clear()
            first_token_time = None

    if not tokens:
        if span:
            with contextlib.suppress(Exception):
                span.end(output={"error": "All fast bridge providers failed"})
        return False, "", []

    raw_text = "".join(tokens).strip()
    total_ms = (time.time() - start_time) * 1000
    ttft_ms = ((first_token_time or time.time()) - start_time) * 1000

    if metrics and hasattr(metrics, "fast_llm_ttft_ms"):
        metrics.fast_llm_ttft_ms = round(ttft_ms, 1)
        metrics.fast_llm_total_ms = round(total_ms, 1)
        metrics.fast_llm_output = raw_text

    is_direct = raw_text.startswith("[DIRECT]")
    clean_text = raw_text.replace("[DIRECT]", "").replace("[BRIDGE]", "").strip()

    if span:
        with contextlib.suppress(Exception):
            span.end(output={
                "raw_text": raw_text,
                "clean_text": clean_text,
                "is_direct": is_direct,
                "ttft_ms": round(ttft_ms, 1),
                "total_ms": round(total_ms, 1),
            })

    logger.info(f"⚡ [Fast LLM] TTFT: {ttft_ms:.1f}ms | Total: {total_ms:.1f}ms | Output: '{raw_text}'")
    return is_direct, clean_text, tokens


@traceable(name="call_llm", run_type="llm")
async def call_llm(
    messages: list[dict[str, str]],
    system_prompt: str,
    stream_queue: asyncio.Queue | None = None,
    opik_trace_id: str | None = None,
    metrics: Any | None = None,
) -> str:
    """
    Standard streaming LLM query with multi-provider fallback.
    Streams tokens into stream_queue and returns the full response content.
    """
    formatted_messages = [{"role": "system", "content": system_prompt}] + messages
    start_time = time.time()
    full_content: list[str] = []
    first_token_time = None

    span = None
    try:
        import opik
        if opik_trace_id:
            trace = opik.Trace(id=opik_trace_id)
            span = trace.span(name="voice_call_llm", type="llm", input={"messages": messages, "system_prompt": system_prompt})
    except Exception:
        pass

    providers = _get_provider_clients()
    success = False

    for provider_name, client, model in providers:
        full_content.clear()
        first_token_time = None
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=formatted_messages,
                temperature=0.4,
                max_tokens=1024,
                stream=True,
            )

            in_thinking = False
            async for chunk in response:
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    content = getattr(delta, "content", None) or ""
                    if not content:
                        continue

                    # Filter out reasoning tags if any
                    if "<think>" in content or "Thinking Process:" in content:
                        in_thinking = True
                        continue
                    if "</think>" in content:
                        in_thinking = False
                        content = content.split("</think>")[-1].strip()
                    if in_thinking:
                        continue

                    if content:
                        if first_token_time is None:
                            first_token_time = time.time()
                        full_content.append(content)
                        if stream_queue:
                            await stream_queue.put(content)

            if full_content:
                success = True
                logger.info(f"Main LLM stream completed via provider '{provider_name}'")
                break
        except Exception as e:
            logger.warning(f"Provider '{provider_name}' failed during streaming: {e}. Trying fallback.")

    if not success:
        error_msg = " I'm sorry, I'm having trouble connecting right now. Let's continue in just a moment. "
        full_content.append(error_msg)
        if stream_queue:
            await stream_queue.put(error_msg)

    if stream_queue:
        await stream_queue.put(None)

    total_time_ms = (time.time() - start_time) * 1000
    if metrics and hasattr(metrics, "main_llm_total_ms"):
        metrics.main_llm_total_ms = round(total_time_ms, 1)

    if span:
        with contextlib.suppress(Exception):
            span.end(output={"output": "".join(full_content)})

    return "".join(full_content)
@traceable(name="stream_dual_llm", run_type="chain")
async def stream_dual_llm(
    messages: list[dict[str, str]],
    system_prompt: str,
    stream_queue: asyncio.Queue | None = None,
    opik_trace_id: str | None = None,
    stage: str | None = None,
    metrics: Any | None = None,
) -> str:
    """
    Unified Single-Stream Voice LLM Pipeline:
    - Eliminates redundant dual-bridge calls that caused duplicated/echoed speech.
    - Directly streams from the primary high-speed LLM (Sarvam gemma4 or Fireworks).
    - Clamps max_tokens for crisp, conversational 1-2 sentence spoken answers.
    - Yields tokens into stream_queue in real time with sub-500ms TTFT.
    """
    start_time = time.time()
    providers = _get_provider_clients()
    formatted_messages = [{"role": "system", "content": system_prompt}] + messages
    max_tokens = getattr(settings, "voice_agent_max_tokens", 120)

    spoken_tokens: list[str] = []
    first_token_time = None
    success = False

    for provider_name, client, model in providers:
        spoken_tokens.clear()
        first_token_time = None
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=formatted_messages,
                temperature=0.4,
                max_tokens=max_tokens,
                stream=True,
            )
            in_thinking = False
            async for chunk in response:
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    text_chunk = getattr(delta, "content", None) or ""
                    if not text_chunk:
                        continue

                    # Filter out reasoning/chain-of-thought tags
                    if "<think>" in text_chunk or "Thinking Process:" in text_chunk:
                        in_thinking = True
                        continue
                    if "</think>" in text_chunk:
                        in_thinking = False
                        text_chunk = text_chunk.split("</think>")[-1].strip()
                    if in_thinking:
                        continue

                    if text_chunk:
                        if first_token_time is None:
                            first_token_time = time.time()
                        spoken_tokens.append(text_chunk)
                        if stream_queue:
                            await stream_queue.put(text_chunk)

            if spoken_tokens:
                success = True
                ttft_ms = ((first_token_time or time.time()) - start_time) * 1000
                logger.info(f"⚡ [Single LLM Stream] TTFT: {ttft_ms:.1f}ms on '{provider_name}' ({model})")
                break
        except Exception as e:
            logger.warning(f"Voice LLM provider '{provider_name}' error: {e}. Trying fallback.")
            spoken_tokens.clear()

    if not success or not spoken_tokens:
        fallback_speech = "I see. Let's keep going with your explanation and approach."
        spoken_tokens.append(fallback_speech)
        if stream_queue:
            await stream_queue.put(fallback_speech)

    if stream_queue:
        await stream_queue.put(None)

    total_time = (time.time() - start_time) * 1000
    final_spoken = "".join(spoken_tokens).strip()

    if metrics and hasattr(metrics, "main_llm_total_ms"):
        metrics.main_llm_total_ms = round(total_time, 1)

    logger.info(f"🎙️ [Voice LLM] Total completion: {total_time:.1f}ms | Spoken: '{final_spoken[:80]}...'")
    return final_spoken


@traceable(name="evaluate_llm", run_type="llm")
async def evaluate_llm(
    messages: list[dict[str, str]],
    system_prompt: str,
    opik_trace_id: str | None = None,
    metrics: Any | None = None,
) -> EvaluationResult:
    """
    Non-streaming structured evaluation for LangGraph state transition and scoring.
    Uses multi-provider fallback.
    """
    formatted_messages = [{"role": "system", "content": system_prompt}] + messages
    schema_str = EvaluationResult.model_json_schema()
    formatted_messages[0]["content"] += f"\n\nJSON SCHEMA:\n{json.dumps(schema_str, indent=2)}"

    providers = _get_provider_clients()
    raw_json = ""

    for provider_name, client, model in providers:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=formatted_messages,
                temperature=0.0,
                max_tokens=1024,
                response_format={"type": "json_object"},
            )
            raw_json = response.choices[0].message.content or ""
            if raw_json.strip():
                break
        except Exception as e:
            logger.warning(f"evaluate_llm on '{provider_name}' failed: {e}. Trying fallback.")

    cleaned_json = raw_json.strip()
    match = re.search(r"(\{.*\})", cleaned_json, re.DOTALL)
    if match:
        cleaned_json = match.group(1)

    try:
        result = EvaluationResult.model_validate_json(cleaned_json)
        return result
    except Exception as e:
        logger.error(f"Failed to parse EvaluationResult: {e}. Raw: {raw_json}")
        # Safe fallback: keep stage
        return EvaluationResult(
            reasoning="Fallback evaluation due to parsing or network glitch.",
            score=3,
            feedback="Retaining current stage for smooth turn progression.",
            objective_met=False,
            trigger_next_question=False,
        )


@traceable(name="call_analysis_llm", run_type="llm")
async def call_analysis_llm(
    messages: list[dict[str, str]],
    system_prompt: str,
    opik_trace_id: str | None = None,
) -> str:
    """
    Non-streaming LLM call for post-interview rubric evaluation.
    Tries Fireworks (deep reasoning), then Gemini, then OpenAI.
    """
    formatted_messages = [{"role": "system", "content": system_prompt}] + messages
    providers = _get_provider_clients()

    for provider_name, client, model in providers:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=formatted_messages,
                temperature=0.0,
                max_tokens=4096,
                stream=False,
            )
            content = response.choices[0].message.content or ""
            # Strip reasoning tags
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            if content:
                logger.info(f"Post-interview analysis LLM succeeded via '{provider_name}'")
                return content
        except Exception as e:
            logger.warning(f"call_analysis_llm failed on provider '{provider_name}': {e}. Trying fallback.")

    raise RuntimeError("All LLM providers failed for post-interview analysis.")


@traceable(name="analyze_candidate_photo", run_type="llm")
async def analyze_candidate_photo(base64_image: str, reason: str = "") -> str:
    """
    Multimodal vision inspection of candidate webcam frame.
    Returns 1-2 sentence description of candidate expressions, gaze, posture, or notes.
    """
    if not base64_image:
        return "Candidate photo is empty."

    # Normalize base64 URL
    clean_b64 = base64_image
    if "base64," in clean_b64:
        clean_b64 = clean_b64.split("base64,")[1]

    data_url = f"data:image/jpeg;base64,{clean_b64}"

    vision_prompt = (
        f"You are the visual observer for an AI technical interviewer (Context: {reason or 'Candidate problem solving'}). "
        "Describe in 1-2 concise, natural sentences what the candidate is doing in this webcam photo "
        "(e.g., looking intently at the code editor, thinking with hand on chin, smiling, looking down at paper notes, gesturing)."
    )

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": vision_prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]

    providers = _get_provider_clients()
    # Filter to providers that support vision: Gemini, OpenAI, Fireworks vision
    for provider_name, client, model in providers:
        if provider_name not in ("gemini", "openai", "fireworks"):
            continue
        try:
            target_model = "gemini-2.0-flash" if provider_name == "gemini" else ("gpt-4o-mini" if provider_name == "openai" else model)
            response = await client.chat.completions.create(
                model=target_model,
                messages=messages,
                max_tokens=120,
                temperature=0.2,
            )
            content = response.choices[0].message.content or ""
            if content.strip():
                logger.info(f"Vision photo analysis succeeded via '{provider_name}': {content.strip()}")
                return content.strip()
        except Exception as e:
            logger.warning(f"Vision photo analysis on '{provider_name}' failed: {e}. Trying next provider.")

    return f"Candidate is active on camera ({reason or 'solving problem'})."

