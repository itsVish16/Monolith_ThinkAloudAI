import asyncio
import base64
import contextlib
import inspect
import io
import json
import logging
import os
import time
import wave
from typing import Any

import httpx
import websockets
from livekit import rtc
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectionError,
    APIConnectOptions,
    stt,
    tts,
)
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from livekit.agents.utils import AudioBuffer, is_given

try:
    from sarvamai import (
        AsyncSarvamAI,
        RealtimeAudioInput,
        RealtimeEnd,
    )
except ImportError:
    AsyncSarvamAI = None  # type: ignore
    RealtimeAudioInput = None  # type: ignore
    RealtimeEnd = None  # type: ignore

try:
    from livekit.plugins import cartesia
except ImportError:
    cartesia = None  # type: ignore

try:
    from livekit.plugins import deepgram
except ImportError:
    deepgram = None  # type: ignore

try:
    from livekit.plugins import openai
except ImportError:
    openai = None  # type: ignore

try:
    from livekit.plugins import silero
except ImportError:
    silero = None  # type: ignore

try:
    from livekit.plugins import speechmatics
except ImportError:
    speechmatics = None  # type: ignore

from app.config import settings

logger = logging.getLogger("voice_agent_stt_tts")


class SarvamRealtimeSpeechStream(stt.SpeechStream):
    """
    Real-time bidirectional WebSocket speech stream powered by Sarvam saaras:v3-realtime.
    Streams linear16 raw PCM audio directly over WebSockets and emits LiveKit SpeechEvents.
    """

    def __init__(
        self,
        *,
        stt_instance: "SarvamRealtimeSTT",
        api_key: str,
        language: str = "en-IN",
        model: str = "saaras:v3-realtime",
        mode: str = "transcribe",
        stream_type: str = "balanced",
        sample_rate: int = 16000,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ):
        super().__init__(stt=stt_instance, conn_options=conn_options, sample_rate=sample_rate)
        self._api_key = api_key
        self._language = language
        self._model = model
        self._mode = mode
        self._stream_type = stream_type
        self._sample_rate = sample_rate
        if AsyncSarvamAI is not None:
            self._client = AsyncSarvamAI(api_subscription_key=self._api_key)
        else:
            self._client = None

    async def _run(self) -> None:
        if not self._client:
            logger.error("sarvamai SDK is not installed.")
            return

        logger.info(
            f"Connecting to Sarvam Realtime STT WebSocket (model={self._model}, lang={self._language})"
        )
        while not self._input_ch.closed:
            try:
                async with self._client.speech_to_text_realtime_streaming.connect(
                    language_code=self._language,
                    model=self._model,
                    mode=self._mode,
                    stream_type=self._stream_type,
                    encoding="linear16",
                    sample_rate=str(self._sample_rate),
                ) as ws:
                    logger.info("Connected to Sarvam Realtime STT WebSocket successfully.")

                    async def send_audio():
                        # 100ms buffer at 16kHz mono 16-bit = 3200 bytes
                        chunk_size = int(self._sample_rate * 0.1 * 2)
                        buf = bytearray()

                        try:
                            async for frame in self._input_ch:
                                if isinstance(frame, rtc.AudioFrame):
                                    buf.extend(frame.data.tobytes())
                                    while len(buf) >= chunk_size:
                                        chunk = bytes(buf[:chunk_size])
                                        del buf[:chunk_size]
                                        b64_audio = base64.b64encode(chunk).decode("utf-8")
                                        await ws.send_realtime_audio_input(
                                            RealtimeAudioInput(audio=b64_audio)
                                        )
                                flush_sentinel_cls = getattr(stt, "RecognizeStream", getattr(stt, "SpeechStream", None))
                                _FlushSentinel = getattr(flush_sentinel_cls, "_FlushSentinel", None)
                                if _FlushSentinel and isinstance(frame, _FlushSentinel) and buf:
                                    b64_audio = base64.b64encode(bytes(buf)).decode("utf-8")
                                    buf.clear()
                                    await ws.send_realtime_audio_input(
                                        RealtimeAudioInput(audio=b64_audio)
                                    )
                        except asyncio.CancelledError:
                            pass
                        finally:
                            try:
                                if buf:
                                    b64_audio = base64.b64encode(bytes(buf)).decode("utf-8")
                                    buf.clear()
                                    await ws.send_realtime_audio_input(
                                        RealtimeAudioInput(audio=b64_audio)
                                    )
                                await ws.send_realtime_end(RealtimeEnd())
                            except Exception:
                                pass

                    async def receive_events():
                        try:
                            async for message in ws:
                                event = getattr(message, "event", None) or getattr(message, "type", None)
                                text = getattr(message, "text", None) or getattr(message, "transcript", "")
                                if isinstance(text, str):
                                    text = text.strip()

                                if event in ("transcript.partial", "transcript"):
                                    if text:
                                        self._event_ch.send_nowait(
                                            stt.SpeechEvent(
                                                type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
                                                alternatives=[
                                                    stt.SpeechData(language=self._language, text=text)
                                                ]
                                            )
                                        )
                                elif event == "transcript.final":
                                    if text:
                                        logger.info(f"Sarvam STT Final Transcript: '{text}'")
                                        self._event_ch.send_nowait(
                                            stt.SpeechEvent(
                                                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                                                alternatives=[
                                                    stt.SpeechData(language=self._language, text=text)
                                                ]
                                            )
                                        )
                                elif event in ("speech.start", "vad.speech_start"):
                                    self._event_ch.send_nowait(
                                        stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
                                    )
                                elif event in ("speech.end", "vad.speech_end"):
                                    self._event_ch.send_nowait(
                                        stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)
                                    )
                                elif event == "error":
                                    err_msg = getattr(message, "message", None) or getattr(message, "error", str(message))
                                    logger.error(f"Sarvam Realtime STT Error event: {err_msg}")
                                    break
                        except asyncio.CancelledError:
                            pass
                        except Exception as e:
                            logger.error(f"Error receiving Sarvam STT events: {e}")
                            raise

                    send_task = asyncio.create_task(send_audio())
                    recv_task = asyncio.create_task(receive_events())

                    done, pending = await asyncio.wait(
                        [send_task, recv_task],
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    if send_task in done and not recv_task.done():
                        with contextlib.suppress(TimeoutError, asyncio.CancelledError):
                            await asyncio.wait_for(recv_task, timeout=1.2)
                    for t in pending:
                        if not t.done():
                            t.cancel()
                    if self._input_ch.closed:
                        break

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Sarvam Realtime STT WebSocket loop error: {e}")
                if self._input_ch.closed:
                    raise APIConnectionError(f"Sarvam STT WebSocket failed: {e}") from e
                await asyncio.sleep(0.5)


class SarvamRealtimeSTT(stt.STT):
    """
    LiveKit STT provider using Sarvam AI Saaras v3 realtime streaming over WebSockets.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        language: str = "en-IN",
        model: str = "saaras:v3-realtime",
        mode: str = "transcribe",
        stream_type: str = "balanced",
        sample_rate: int = 16000,
    ):
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True,
                interim_results=True,
            )
        )
        self._api_key = (api_key or settings.sarvam_api_key).strip()
        self._language = language
        self._model = model
        self._mode = mode
        self._stream_type = stream_type
        self._sample_rate = sample_rate

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "Sarvam AI (Saaras v3 Realtime)"

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechStream:
        resolved_lang = language if is_given(language) else self._language
        return SarvamRealtimeSpeechStream(
            stt_instance=self,
            api_key=self._api_key,
            language=resolved_lang,
            model=self._model,
            mode=self._mode,
            stream_type=self._stream_type,
            sample_rate=self._sample_rate,
            conn_options=conn_options,
        )

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        resolved_lang = language if is_given(language) else self._language
        wav_bytes = rtc.combine_audio_frames(buffer).to_wav_bytes()
        client = AsyncSarvamAI(api_subscription_key=self._api_key)
        resp = await client.speech_to_text.transcribe(
            file=wav_bytes,
            model="saaras:v3",
            language_code=resolved_lang,
            mode=self._mode,
        )
        transcript = getattr(resp, "transcript", "") or ""
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language=resolved_lang, text=transcript)],
        )


class AssemblyAIRealtimeSpeechStream(stt.SpeechStream):
    """
    Real-time bidirectional WebSocket speech stream powered by AssemblyAI Realtime API.
    Streams raw 16kHz linear16 PCM audio directly over WebSockets and emits LiveKit SpeechEvents.
    """

    def __init__(
        self,
        *,
        stt_instance: "AssemblyAIRealtimeSTT",
        api_key: str,
        sample_rate: int = 16000,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ):
        super().__init__(stt=stt_instance, conn_options=conn_options, sample_rate=sample_rate)
        self._api_key = api_key
        self._sample_rate = sample_rate

    async def _run(self) -> None:
        if not self._api_key:
            logger.error("AssemblyAI API key is missing.")
            return

        ws_url = f"{settings.assemblyai_ws_url}?sample_rate={self._sample_rate}"
        logger.info(f"Connecting to AssemblyAI Realtime STT WebSocket ({ws_url})")

        connect_kwargs: dict[str, Any] = {}
        if "additional_headers" in inspect.signature(websockets.connect).parameters:
            connect_kwargs["additional_headers"] = {"Authorization": self._api_key}
        else:
            connect_kwargs["extra_headers"] = {"Authorization": self._api_key}

        while not self._input_ch.closed:
            try:
                async with websockets.connect(ws_url, **connect_kwargs) as ws:
                    logger.info("Connected to AssemblyAI Realtime STT WebSocket successfully.")

                    async def send_audio():
                        # 100ms buffer at 16kHz mono 16-bit = 3200 bytes
                        chunk_size = int(self._sample_rate * 0.1 * 2)
                        buf = bytearray()

                        try:
                            async for frame in self._input_ch:
                                if isinstance(frame, rtc.AudioFrame):
                                    buf.extend(frame.data.tobytes())
                                    while len(buf) >= chunk_size:
                                        chunk = bytes(buf[:chunk_size])
                                        del buf[:chunk_size]
                                        await ws.send(chunk)
                                flush_sentinel_cls = getattr(stt, "RecognizeStream", getattr(stt, "SpeechStream", None))
                                _FlushSentinel = getattr(flush_sentinel_cls, "_FlushSentinel", None)
                                if _FlushSentinel and isinstance(frame, _FlushSentinel) and buf:
                                    await ws.send(bytes(buf))
                                    buf.clear()
                        except asyncio.CancelledError:
                            pass
                        finally:
                            try:
                                if buf:
                                    await ws.send(bytes(buf))
                                    buf.clear()
                                await ws.send(json.dumps({"terminate_session": True}))
                            except Exception:
                                pass

                    async def receive_events():
                        try:
                            async for raw_msg in ws:
                                try:
                                    if isinstance(raw_msg, bytes):
                                        data = json.loads(raw_msg.decode("utf-8"))
                                    else:
                                        data = json.loads(raw_msg)
                                except Exception:
                                    continue

                                msg_type = data.get("message_type")
                                if msg_type == "SessionBegins":
                                    session_id = data.get("session_id")
                                    logger.info(f"AssemblyAI STT session established: {session_id}")
                                elif msg_type == "PartialTranscript":
                                    text = (data.get("text") or "").strip()
                                    if text:
                                        self._event_ch.send_nowait(
                                            stt.SpeechEvent(
                                                type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
                                                alternatives=[stt.SpeechData(language="en", text=text)],
                                            )
                                        )
                                elif msg_type == "FinalTranscript":
                                    text = (data.get("text") or "").strip()
                                    if text:
                                        logger.info(f"AssemblyAI STT Final Transcript: '{text}'")
                                        self._event_ch.send_nowait(
                                            stt.SpeechEvent(
                                                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                                                alternatives=[stt.SpeechData(language="en", text=text)],
                                            )
                                        )
                                elif msg_type == "SessionTerminated":
                                    break
                                elif "error" in data:
                                    logger.error(f"AssemblyAI Realtime STT Error event: {data.get('error')}")
                                    break
                        except asyncio.CancelledError:
                            pass
                        except Exception as e:
                            logger.error(f"Error receiving AssemblyAI STT events: {e}")
                            raise

                    send_task = asyncio.create_task(send_audio())
                    recv_task = asyncio.create_task(receive_events())

                    done, pending = await asyncio.wait(
                        [send_task, recv_task],
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if send_task in done and not recv_task.done():
                        with contextlib.suppress(TimeoutError, asyncio.CancelledError):
                            await asyncio.wait_for(recv_task, timeout=1.2)
                    for t in pending:
                        if not t.done():
                            t.cancel()
                    if self._input_ch.closed:
                        break

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"AssemblyAI Realtime STT WebSocket loop error: {e}")
                if self._input_ch.closed:
                    raise APIConnectionError(f"AssemblyAI STT WebSocket failed: {e}") from e
                await asyncio.sleep(0.5)


class AssemblyAIRealtimeSTT(stt.STT):
    """
    LiveKit STT provider using AssemblyAI Realtime WebSocket streaming.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        sample_rate: int = 16000,
    ):
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True,
                interim_results=True,
            )
        )
        self._api_key = (api_key or settings.assemblyai_api_key).strip()
        self._sample_rate = sample_rate

    @property
    def model(self) -> str:
        return "assemblyai-realtime"

    @property
    def provider(self) -> str:
        return "AssemblyAI (Realtime WebSocket)"

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechStream:
        return AssemblyAIRealtimeSpeechStream(
            stt_instance=self,
            api_key=self._api_key,
            sample_rate=self._sample_rate,
            conn_options=conn_options,
        )

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        wav_bytes = rtc.combine_audio_frames(buffer).to_wav_bytes()
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {"authorization": self._api_key}
            upload_resp = await client.post(
                "https://api.assemblyai.com/v2/upload",
                headers=headers,
                content=wav_bytes,
            )
            upload_resp.raise_for_status()
            audio_url = upload_resp.json().get("upload_url")

            transcript_resp = await client.post(
                "https://api.assemblyai.com/v2/transcript",
                headers=headers,
                json={"audio_url": audio_url},
            )
            transcript_resp.raise_for_status()
            transcript_id = transcript_resp.json().get("id")

            transcript_text = ""
            for _ in range(30):
                await asyncio.sleep(0.5)
                poll_resp = await client.get(
                    f"https://api.assemblyai.com/v2/transcript/{transcript_id}",
                    headers=headers,
                )
                poll_data = poll_resp.json()
                if poll_data.get("status") == "completed":
                    transcript_text = poll_data.get("text", "")
                    break
                elif poll_data.get("status") == "error":
                    break

        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language="en", text=transcript_text)],
        )


class SarvamChunkedStream(tts.ChunkedStream):
    """
    LiveKit ChunkedStream for Sarvam AI WebSocket streaming TTS (bulbul:v4-flash).
    Streams synthesized MP3 audio chunks via bidirectional WebSocket, pushing
    directly into LiveKit AudioEmitter with automatic background decoding.
    Includes seamless HTTP REST fallback if WebSocket connection is unavailable.
    """

    def __init__(
        self,
        *,
        tts_instance: "SarvamTTS",
        input_text: str,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts_instance, input_text=input_text, conn_options=conn_options)
        self._sarvam_tts = tts_instance

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        text = self._input_text.strip()
        if not text:
            return

        if not self._sarvam_tts.api_key:
            logger.error("Sarvam API key is missing for TTS.")
            return

        base_ws_url = self._sarvam_tts.ws_url or "wss://api.sarvam.ai/text-to-speech/ws"
        model = self._sarvam_tts.model or "bulbul:v4-flash"
        sep = "&" if "?" in base_ws_url else "?"
        ws_url = f"{base_ws_url}{sep}model={model}&send_completion_event=true"

        connect_kwargs: dict[str, Any] = {}
        header_dict = {"Api-Subscription-Key": self._sarvam_tts.api_key}
        if "additional_headers" in inspect.signature(websockets.connect).parameters:
            connect_kwargs["additional_headers"] = header_dict
        else:
            connect_kwargs["extra_headers"] = header_dict

        req_id = f"sarvam_ws_tts_{int(time.time() * 1000)}"

        try:
            logger.info(f"Connecting to Sarvam TTS WebSocket ({ws_url}) for model {model}...")
            async with websockets.connect(ws_url, **connect_kwargs) as ws:
                # 1. Send configuration frame
                config_data = {
                    "type": "config",
                    "data": {
                        "model": model,
                        "target_language_code": self._sarvam_tts.language,
                        "speaker": self._sarvam_tts.speaker,
                        "pace": self._sarvam_tts.pace,
                        "speech_sample_rate": str(self._sarvam_tts.sample_rate),
                    },
                }
                await ws.send(json.dumps(config_data))

                # 2. Send text payload
                await ws.send(json.dumps({"type": "text", "data": {"text": text}}))

                # 3. Send flush frame
                await ws.send(json.dumps({"type": "flush"}))

                # Initialize AudioEmitter for streaming MP3
                output_emitter.initialize(
                    request_id=req_id,
                    sample_rate=self._sarvam_tts.sample_rate,
                    num_channels=1,
                    mime_type="audio/mp3",
                )

                received_audio = False
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except Exception:
                        continue

                    msg_type = msg.get("type")
                    if msg_type == "audio":
                        audio_b64 = msg.get("data", {}).get("audio", "")
                        if audio_b64:
                            audio_bytes = base64.b64decode(audio_b64)
                            output_emitter.push(audio_bytes)
                            received_audio = True
                    elif msg_type == "event" and msg.get("data", {}).get("event_type") == "final":
                        break
                    elif msg_type == "error":
                        err_msg = msg.get("data", {}).get("message", "Sarvam TTS WebSocket error")
                        logger.error(f"Sarvam TTS WebSocket error: {err_msg}")
                        raise tts.TTSError(f"Sarvam TTS error: {err_msg}")

                output_emitter.flush()
                output_emitter.end_input()
                if received_audio:
                    return

        except Exception as ws_err:
            logger.warning(
                f"Sarvam WebSocket TTS failed ({ws_err}), attempting HTTP REST fallback..."
            )
            await self._run_http_fallback(output_emitter, text, req_id)

    async def _run_http_fallback(self, output_emitter: tts.AudioEmitter, text: str, req_id: str) -> None:
        headers = {
            "api-subscription-key": self._sarvam_tts.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": [text],
            "target_language_code": self._sarvam_tts.language,
            "speaker": self._sarvam_tts.speaker,
            "pitch": 0,
            "pace": self._sarvam_tts.pace,
            "loudness": 1.5,
            "speech_sample_rate": self._sarvam_tts.sample_rate,
            "enable_preprocessing": True,
            "model": self._sarvam_tts.model,
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.sarvam.ai/text-to-speech",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        audios = data.get("audios", [])
        if not audios:
            return

        wav_bytes = base64.b64decode(audios[0])
        pcm_bytes = b""
        actual_sample_rate = self._sarvam_tts.sample_rate
        num_channels = 1

        try:
            with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
                actual_sample_rate = wf.getframerate()
                num_channels = wf.getnchannels()
                pcm_bytes = wf.readframes(wf.getnframes())
        except Exception:
            pcm_bytes = wav_bytes

        if not getattr(output_emitter, "_started", False):
            output_emitter.initialize(
                request_id=req_id,
                sample_rate=actual_sample_rate,
                num_channels=num_channels,
                mime_type="audio/pcm",
            )
        if pcm_bytes:
            output_emitter.push(pcm_bytes)
        output_emitter.flush()
        output_emitter.end_input()


class SarvamTTS(tts.TTS):
    """
    LiveKit TTS provider using Sarvam AI WebSocket streaming TTS (bulbul:v4-flash).
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        speaker: str | None = None,
        language: str | None = None,
        pace: float | None = None,
        sample_rate: int | None = None,
        ws_url: str | None = None,
    ):
        rate = sample_rate or getattr(settings, "sarvam_tts_sample_rate", None) or 24000
        super().__init__(
            capabilities=tts.TTSCapabilities(
                streaming=False,
                aligned_transcript=False,
            ),
            sample_rate=rate,
            num_channels=1,
        )
        self._api_key = (api_key or getattr(settings, "sarvam_api_key", "")).strip()
        self._model = model or getattr(settings, "sarvam_tts_model", None) or "bulbul:v4-flash"
        self._speaker = speaker or getattr(settings, "sarvam_tts_speaker", None) or "shubh_en_numbers"
        self._language = language or getattr(settings, "sarvam_tts_language", None) or "en-IN"
        self._pace = pace or getattr(settings, "sarvam_tts_pace", None) or 1.0
        self._sample_rate = rate
        self._ws_url = ws_url or getattr(settings, "sarvam_tts_ws_url", None) or "wss://api.sarvam.ai/text-to-speech/ws"

    @property
    def api_key(self) -> str:
        return self._api_key

    @property
    def model(self) -> str:
        return self._model

    @property
    def speaker(self) -> str:
        return self._speaker

    @property
    def language(self) -> str:
        return self._language

    @property
    def pace(self) -> float:
        return self._pace

    @property
    def ws_url(self) -> str:
        return self._ws_url

    @property
    def provider(self) -> str:
        return f"Sarvam AI ({self._model})"

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        return SarvamChunkedStream(
            tts_instance=self,
            input_text=text,
            conn_options=conn_options,
        )


def get_stt_adapter() -> stt.STT:
    """
    Factory creating the optimal STT adapter based on system configuration.
    Priority:
      1. AssemblyAI Realtime WebSocket (if configured)
      2. Sarvam Saaras v3 Realtime STT (if configured)
      3. Deepgram STT (if configured or plugin available)
      4. OpenAI STT (if configured or plugin available)
      5. Speechmatics STT (if configured or plugin available)
    Resilient multi-tier fallbacks ensure no unhandled exceptions crash the worker process.
    """
    # 1. AssemblyAI STT
    assembly_key = (getattr(settings, "assemblyai_api_key", "") or os.getenv("ASSEMBLYAI_API_KEY", "")).strip()
    if assembly_key and not assembly_key.startswith("<"):
        try:
            logger.info("Using AssemblyAI Realtime WebSocket STT Adapter")
            return AssemblyAIRealtimeSTT(
                api_key=assembly_key,
                sample_rate=getattr(settings, "assemblyai_sample_rate", 16000),
            )
        except Exception as e:
            logger.warning(f"AssemblyAI STT initialization failed, trying fallback: {e}")

    # 2. Sarvam Saaras v3 STT
    sarvam_key = (getattr(settings, "sarvam_api_key", "") or os.getenv("SARVAM_API_KEY", "")).strip()
    if sarvam_key and not sarvam_key.startswith("<"):
        try:
            logger.info("Using Sarvam Saaras v3 Realtime STT Adapter")
            return SarvamRealtimeSTT(
                api_key=sarvam_key,
                language=getattr(settings, "sarvam_stt_language", "en-IN"),
            )
        except Exception as e:
            logger.warning(f"Sarvam Realtime STT initialization failed, trying fallback: {e}")

    # 3. Deepgram STT
    deepgram_key = (getattr(settings, "deepgram_api_key", "") or os.getenv("DEEPGRAM_API_KEY", "")).strip()
    if deepgram is not None:
        try:
            if deepgram_key and not deepgram_key.startswith("<"):
                logger.info("Using Deepgram STT Adapter with configured key")
                return deepgram.STT(api_key=deepgram_key)
            elif os.getenv("DEEPGRAM_API_KEY"):
                logger.info("Using Deepgram STT Adapter from environment")
                return deepgram.STT()
        except Exception as e:
            logger.warning(f"Deepgram STT initialization failed, trying fallback: {e}")

    # 4. OpenAI STT
    openai_key = (
        getattr(settings, "openai_api_key", "")
        or os.getenv("OPENAI_API_KEY", "")
        or os.getenv("LLM_API_KEY", "")
    ).strip()
    if openai is not None:
        try:
            if openai_key and not openai_key.startswith("<"):
                logger.info("Using OpenAI Whisper STT Adapter with configured key")
                return openai.STT(api_key=openai_key)
            elif os.getenv("OPENAI_API_KEY"):
                logger.info("Using OpenAI Whisper STT Adapter from environment")
                return openai.STT()
        except Exception as e:
            logger.warning(f"OpenAI STT initialization failed, trying fallback: {e}")

    # 5. Speechmatics STT
    speechmatics_key = (getattr(settings, "speechmatics_api_key", "") or os.getenv("SPEECHMATICS_API_KEY", "")).strip()
    if speechmatics is not None:
        try:
            if speechmatics_key and not speechmatics_key.startswith("<"):
                logger.info("Using Speechmatics STT Adapter with configured key")
                return speechmatics.STT(api_key=speechmatics_key, language="en")
            elif os.getenv("SPEECHMATICS_API_KEY"):
                logger.info("Using Speechmatics STT Adapter from environment")
                return speechmatics.STT(language="en")
            else:
                logger.info("Using Speechmatics STT Adapter default")
                return speechmatics.STT(language="en")
        except Exception as e:
            logger.warning(f"Speechmatics STT initialization failed, trying fallback: {e}")

    # 6. Resilient Best-Effort Fallback to prevent startup crashes
    logger.warning("No STT credentials configured. Initializing best-effort fallback adapter.")
    if deepgram is not None:
        try:
            return deepgram.STT(api_key=deepgram_key or "dummy-key-to-prevent-crash")
        except Exception:
            pass
    if openai is not None:
        try:
            return openai.STT(api_key=openai_key or "dummy-key-to-prevent-crash")
        except Exception:
            pass
    if speechmatics is not None:
        try:
            return speechmatics.STT(language="en")
        except Exception:
            pass

    raise RuntimeError(
        "No STT provider could be initialized. Please configure SARVAM_API_KEY, DEEPGRAM_API_KEY, or OPENAI_API_KEY."
    )


def get_tts_adapter() -> tts.TTS:
    """
    Factory creating the optimal streaming TTS adapter.
    Priority:
      1. Sarvam AI (bulbul:v3) (if configured)
      2. Cartesia Streaming TTS (if configured or plugin available)
      3. OpenAI TTS (if configured or plugin available)
      4. Deepgram TTS (if configured or plugin available)
    Resilient multi-tier fallbacks ensure no unhandled exceptions crash the worker process.
    """
    # 1. Sarvam bulbul:v4-flash WebSocket Streaming TTS
    sarvam_key = (getattr(settings, "sarvam_api_key", "") or os.getenv("SARVAM_API_KEY", "")).strip()
    if sarvam_key and not sarvam_key.startswith("<"):
        try:
            logger.info("Using Sarvam bulbul:v4-flash WebSocket Streaming TTS Adapter")
            return SarvamTTS(
                api_key=sarvam_key,
                model=getattr(settings, "sarvam_tts_model", "bulbul:v4-flash"),
                speaker=getattr(settings, "sarvam_tts_speaker", "shubh_en_numbers"),
                language=getattr(settings, "sarvam_tts_language", "en-IN"),
                pace=getattr(settings, "sarvam_tts_pace", 1.0),
                sample_rate=getattr(settings, "sarvam_tts_sample_rate", 24000),
                ws_url=getattr(settings, "sarvam_tts_ws_url", "wss://api.sarvam.ai/text-to-speech/ws"),
            )
        except Exception as e:
            logger.warning(f"Sarvam TTS initialization failed, trying fallback: {e}")

    # 2. Cartesia Streaming TTS
    cartesia_key = (getattr(settings, "cartesia_api_key", "") or os.getenv("CARTESIA_API_KEY", "")).strip()
    if cartesia is not None:
        try:
            if cartesia_key and not cartesia_key.startswith("<"):
                logger.info("Using Cartesia Streaming TTS Adapter with configured key")
                return cartesia.TTS(api_key=cartesia_key, voice="248be419-c632-4f23-adf1-5324ed7dbf10")
            elif os.getenv("CARTESIA_API_KEY"):
                logger.info("Using Cartesia Streaming TTS Adapter from environment")
                return cartesia.TTS(voice="248be419-c632-4f23-adf1-5324ed7dbf10")
        except Exception as e:
            logger.warning(f"Cartesia TTS initialization failed, trying fallback: {e}")

    # 3. OpenAI TTS
    openai_key = (
        getattr(settings, "openai_api_key", "")
        or os.getenv("OPENAI_API_KEY", "")
        or os.getenv("LLM_API_KEY", "")
    ).strip()
    if openai is not None:
        try:
            if openai_key and not openai_key.startswith("<"):
                logger.info("Using OpenAI TTS Adapter with configured key")
                return openai.TTS(api_key=openai_key, voice="alloy")
            elif os.getenv("OPENAI_API_KEY"):
                logger.info("Using OpenAI TTS Adapter from environment")
                return openai.TTS(voice="alloy")
        except Exception as e:
            logger.warning(f"OpenAI TTS initialization failed, trying fallback: {e}")

    # 4. Deepgram TTS
    deepgram_key = (getattr(settings, "deepgram_api_key", "") or os.getenv("DEEPGRAM_API_KEY", "")).strip()
    if deepgram is not None:
        try:
            if deepgram_key and not deepgram_key.startswith("<"):
                logger.info("Using Deepgram TTS Adapter with configured key")
                return deepgram.TTS(api_key=deepgram_key)
            elif os.getenv("DEEPGRAM_API_KEY"):
                logger.info("Using Deepgram TTS Adapter from environment")
                return deepgram.TTS()
        except Exception as e:
            logger.warning(f"Deepgram TTS initialization failed, trying fallback: {e}")

    # 5. Resilient Best-Effort Fallback to prevent startup crashes
    logger.warning("No TTS credentials configured. Initializing best-effort fallback adapter.")
    if cartesia is not None:
        try:
            return cartesia.TTS(api_key=cartesia_key or "dummy-key-to-prevent-crash", voice="248be419-c632-4f23-adf1-5324ed7dbf10")
        except Exception:
            pass
    if openai is not None:
        try:
            return openai.TTS(api_key=openai_key or "dummy-key-to-prevent-crash", voice="alloy")
        except Exception:
            pass
    if deepgram is not None:
        try:
            return deepgram.TTS(api_key=deepgram_key or "dummy-key-to-prevent-crash")
        except Exception:
            pass

    raise RuntimeError(
        "No TTS provider could be initialized. Please configure SARVAM_API_KEY, CARTESIA_API_KEY, or OPENAI_API_KEY."
    )


def get_vad_adapter():
    """
    Factory creating Silero Voice Activity Detector.
    """
    if silero is not None:
        return silero.VAD.load()
    return None
