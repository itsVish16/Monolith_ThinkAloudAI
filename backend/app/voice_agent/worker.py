import asyncio
import json
import logging
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, RoomInputOptions

from app.config import settings
from app.core.database import SessionLocal
from app.core.telemetry import configure_langsmith
from app.modules.interview.service import InterviewService
from app.tasks.queue import enqueue_task
from app.voice_agent.graphs.base import evaluate_and_route
from app.voice_agent.graphs.factory import build_graph
from app.voice_agent.llm import analyze_candidate_photo
from app.voice_agent.state import InterviewStage
from app.voice_agent.stt_tts import get_stt_adapter, get_tts_adapter, get_vad_adapter
from app.voice_agent.tools import execute_agent_tool, extract_inline_tool_calls

load_dotenv(".env")
load_dotenv(".env.local", override=True)

# Ensure LangSmith distributed tracing is active in worker process
configure_langsmith()

if settings.livekit_url:
    os.environ.setdefault("LIVEKIT_URL", settings.livekit_url)
if settings.livekit_api_key:
    os.environ.setdefault("LIVEKIT_API_KEY", settings.livekit_api_key)
if settings.livekit_api_secret:
    os.environ.setdefault("LIVEKIT_API_SECRET", settings.livekit_api_secret)

logger = logging.getLogger("voice_agent_worker")


def clean_display_name(raw_name: str | None) -> str:
    """Standardizes candidate display name."""
    if not raw_name:
        return "Candidate"
    raw_name = str(raw_name).strip()
    if "@" in raw_name:
        raw_name = raw_name.split("@")[0]
    cleaned = re.sub(r"\d+", "", raw_name).strip()
    cleaned = re.sub(r"[._\-+]+", " ", cleaned).strip()
    cleaned = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned)
    cleaned = cleaned.title().strip()
    return cleaned or "Candidate"


def serialize_state_safely(state: dict) -> dict:
    """Removes non-serializable objects (queues, locks, complex classes) before DB persistence."""
    clean_state = {}
    for k, v in state.items():
        if k in ("stream_queue", "current_turn_metrics", "turn_lock"):
            continue
        try:
            json.dumps(v)
            clean_state[k] = v
        except (TypeError, OverflowError):
            if hasattr(v, "model_dump"):
                clean_state[k] = v.model_dump()
            elif isinstance(v, list):
                clean_state[k] = [item.model_dump() if hasattr(item, "model_dump") else str(item) for item in v]
            else:
                clean_state[k] = str(v)
    return clean_state


class InterviewAgent(Agent):
    """
    Real-time LiveKit Agent managing conversational turns, state machine progression,
    and multimodal editor context for candidate interviews.
    """

    def __init__(
        self,
        room: Any,
        room_id: str,
        candidate_name: str,
        user_id: int | str,
        interview_type: str,
        ai_selected_questions: list[dict[str, Any]] | None = None,
        session_data: dict[str, Any] | None = None,
    ):
        endpointing_delay = getattr(settings, "voice_agent_endpointing_delay", 0.6)
        super().__init__(
            instructions="AI Interviewer Agent",
            allow_interruptions=True,
            min_endpointing_delay=endpointing_delay,
        )
        self.room = room
        self.room_id = room_id
        self.candidate_name = clean_display_name(candidate_name)
        self.user_id = user_id
        self.interview_type = interview_type
        self.turn_lock = asyncio.Lock()
        self.last_interaction_time = time.time()
        self.wrap_up_spoken = False
        self._analysis_published = False
        self._last_question_index = 0
        self._agent_session = None

        # Build track-specific LangGraph state machine
        self.interview_agent = build_graph(self.interview_type)
        logger.info(
            f"Initializing InterviewAgent room={self.room_id} candidate={self.candidate_name} type={self.interview_type}"
        )

        if session_data and "state_data" in session_data:
            self.state = session_data["state_data"]
            self.ai_selected_questions = self.state.get("ai_selected_questions") or ai_selected_questions or []
            logger.info(f"Resumed existing interview session. Current stage: {self.state.get('stage')}")
        else:
            self.ai_selected_questions = ai_selected_questions or []
            self.state = {
                "messages": [],
                "stage": InterviewStage.INTRO_AUDIO_CHECK.value,
                "candidate_name": self.candidate_name,
                "resume_summary": None,
                "evaluations": [],
                "start_time": time.time(),
                "max_duration_minutes": 50,
                "interview_type": self.interview_type,
                "latest_visual_context": None,
                "ai_selected_questions": self.ai_selected_questions,
                "active_question_index": 0,
                "latest_code": None,
                "latest_execution": None,
                "latest_whiteboard_context": None,
                "latest_whiteboard_graph": None,
                "opik_trace_id": self.room_id,
                "turns_in_stage": 0,
                "should_end": False,
            }
            logger.info("Initialized new interview session state starting at intro_audio_check.")

        self.latest_code = self.state.get("latest_code")
        self.latest_execution = self.state.get("latest_execution")
        self.latest_whiteboard_graph = self.state.get("latest_whiteboard_graph")
        self.last_execution_time = 0.0
        self.has_unprompted_execution = False

    async def evaluate_turn(self) -> None:
        """Runs the LangGraph evaluate_and_route node asynchronously in the background."""
        try:
            eval_state = dict(self.state)
            eval_res = await evaluate_and_route(eval_state)
            if eval_res:
                self.state.update(eval_res)

                # Check if question index changed
                new_idx = self.state.get("active_question_index", 0)
                if new_idx != self._last_question_index:
                    old_idx = self._last_question_index
                    self._last_question_index = new_idx
                    logger.info(f"Advancing to question {new_idx + 1}. Emitting next_question event.")
                    payload = json.dumps({"type": "next_question", "question_index": new_idx})
                    if self.room and self.room.local_participant:
                        await self.room.local_participant.publish_data(payload.encode("utf-8"))

                    # Inject explicit transition awareness so agent explains the move to candidate
                    self.state.setdefault("messages", []).append({
                        "role": "system",
                        "content": (
                            f"[INTERVIEW TRANSITION: Problem {old_idx + 1} has concluded. "
                            f"The workspace is now loaded with Problem {new_idx + 1}. "
                            f"Acknowledge their work on the previous problem and introduce the new challenge clearly.]"
                        )
                    })

                logger.info(f"Turn evaluated successfully. Next stage: {self.state['stage']}")

                # Trigger termination if completed
                if self.state.get("should_end") and self.state["stage"] == InterviewStage.COMPLETED.value:
                    logger.info("Evaluation indicated session complete. Triggering disconnect.")
                    asyncio.create_task(self.trigger_termination())

                # Problem reveal broadcast
                core_stages = [
                    "dsa_presentation", "dsa_approach", "dsa_coding", "dsa_testing",
                    "system_design_requirements", "aiml_fundamentals",
                ]
                if self.state["stage"] in core_stages:
                    payload = json.dumps({"type": "reveal_problem"})
                    if self.room and self.room.local_participant:
                        await self.room.local_participant.publish_data(payload.encode("utf-8"))

                # Persist session state to database
                await self.persist_session_state()

        except Exception as e:
            logger.error(f"Error during background turn evaluation: {e}", exc_info=True)

    async def persist_session_state(self) -> None:
        """Persists clean session state data to PostgreSQL."""
        try:
            clean_state = serialize_state_safely(self.state)
            async with SessionLocal() as db:
                await InterviewService.update_session_stage(
                    db=db,
                    session_id=self.room_id,
                    stage=self.state["stage"],
                    state_data=clean_state,
                )
        except Exception as e:
            logger.error(f"Failed to persist session state for {self.room_id}: {e}")

    async def trigger_termination(self) -> None:
        """Gracefully completes the interview and dispatches analysis."""
        if self._analysis_published:
            return
        self._analysis_published = True

        logger.info(f"Triggering session completion for room: {self.room_id}")
        await self.persist_session_state()

        # Enqueue post-interview analysis to Redis Task Queue (Zero RabbitMQ!)
        try:
            payload = {
                "session_id": self.room_id,
                "user_id": str(self.user_id),
                "candidate_name": self.candidate_name,
                "interview_type": self.interview_type,
                "messages": self.state["messages"],
                "opik_trace_id": self.state.get("opik_trace_id"),
            }
            task_id = await enqueue_task("interview_analysis", payload)
            logger.info("enqueued_interview_analysis_task", session_id=self.room_id, task_id=task_id)
        except Exception as e:
            logger.error(f"Failed to enqueue interview analysis task: {e}")

        # Disconnect from WebRTC room
        await asyncio.sleep(2.0)
        if self.room:
            await self.room.disconnect()

    async def on_user_turn_completed(self, turn_ctx: Any, new_message: Any) -> None:
        """
        Callback invoked by LiveKit Agents when candidate speech is transcribed.
        Extracts speech text, injects multimodal editor/whiteboard/camera context,
        invokes the LangGraph state machine, speaks the response, and initiates
        background evaluation and state persistence.
        """
        # 1. Extract candidate speech text with robust fallbacks
        user_text = ""
        if hasattr(new_message, "text_content") and new_message.text_content:
            user_text = new_message.text_content
        elif hasattr(new_message, "content") and new_message.content:
            if isinstance(new_message.content, list):
                user_text = " ".join(str(c) for c in new_message.content if c)
            else:
                user_text = str(new_message.content)
        elif hasattr(new_message, "text") and new_message.text:
            user_text = str(new_message.text)

        user_text = user_text.strip() if isinstance(user_text, str) else str(user_text).strip()

        # 2. If text is empty or whitespace, ignore turn
        if not user_text:
            logger.info("Candidate speech is empty or whitespace only. Ignoring turn.")
            return

        logger.info(f"Candidate turn completed. Transcribed text: '{user_text}'")

        # 3. Attach multimodal context if present
        multimodal_prefixes = []

        # Whiteboard visual observation & whiteboard state
        wb_ctx = self.state.get("latest_whiteboard_context")
        if wb_ctx and "Camera is on" not in str(wb_ctx) and "Model not loaded" not in str(wb_ctx) and "Failed to process" not in str(wb_ctx):
            multimodal_prefixes.append(f"[Candidate Whiteboard Observation: {wb_ctx}]")
            self.state["latest_whiteboard_context"] = None

        if self.state.get("latest_whiteboard_graph"):
            wb_graph = self.state.get("latest_whiteboard_graph")
            if wb_graph and str(wb_graph).strip():
                multimodal_prefixes.append(f"[Candidate Whiteboard State: {wb_graph}]")

        # Camera observation
        vis_ctx = self.state.get("latest_visual_context")
        if vis_ctx and "Camera is on" not in str(vis_ctx) and "Model not loaded" not in str(vis_ctx) and "Failed to process" not in str(vis_ctx):
            multimodal_prefixes.append(f"[Candidate Visual Observation: {vis_ctx}]")
            self.state["latest_visual_context"] = None

        # IDE editor code context
        if self.state.get("latest_code"):
            code_ctx = self.state.get("latest_code")
            if code_ctx and str(code_ctx).strip():
                multimodal_prefixes.append(f"[Candidate Editor Code:\n{code_ctx}\n]")

        if multimodal_prefixes:
            user_text = "\n".join(multimodal_prefixes) + f"\nCandidate says: {user_text}"

        # 4. Append user message to conversation history
        self.state["messages"].append({"role": "user", "content": user_text})

        # 5. Acquire turn lock and execute LangGraph state machine
        async with self.turn_lock:
            # Synchronize latest live attributes into LangGraph state
            if getattr(self, "latest_code", None) is not None:
                self.state["latest_code"] = self.latest_code
            if getattr(self, "latest_execution", None) is not None:
                self.state["latest_execution"] = self.latest_execution
            if getattr(self, "latest_whiteboard_graph", None) is not None:
                self.state["latest_whiteboard_graph"] = self.latest_whiteboard_graph
            if getattr(self, "ai_selected_questions", None):
                self.state["ai_selected_questions"] = self.ai_selected_questions

            try:
                # 6. Invoke LangGraph state machine with LangSmith tracing metadata
                run_config = {
                    "run_name": "voice_interviewer_turn",
                    "tags": ["voice_agent", self.interview_type, self.state.get("stage", "turn")],
                    "metadata": {
                        "session_id": self.room_id,
                        "candidate_name": self.candidate_name,
                        "interview_type": self.interview_type,
                        "stage": self.state.get("stage"),
                    },
                }
                try:
                    resp = await self.interview_agent.ainvoke(self.state, config=run_config)
                except TypeError:
                    resp = await self.interview_agent.ainvoke(self.state)
                self.state.update(resp)

                # 7. Extract the last assistant response message
                assistant_msgs = [m for m in self.state.get("messages", []) if m.get("role") == "assistant"]
                if assistant_msgs:
                    last_msg = assistant_msgs[-1]["content"]
                elif self.state.get("messages"):
                    last_msg = self.state["messages"][-1]["content"]
                else:
                    last_msg = ""

                # 8. Parse and execute any AI tool calls (open_code_editor, close_code_editor, etc.)
                clean_msg, inline_tools = extract_inline_tool_calls(last_msg)
                for t in inline_tools:
                    t_name = t.get("name") or t.get("tool")
                    t_args = t.get("parameters") or t.get("args") or {}
                    if t_name:
                        logger.info(f"AI Interviewer invoked tool: {t_name}")
                        await execute_agent_tool(t_name, t_args, self)

                # 9. Speak clean response (with tool markup stripped) using LiveKit session.say
                session_instance = getattr(self, "_agent_session", None)
                if not session_instance:
                    try:
                        session_instance = self.session
                    except Exception:
                        session_instance = None

                if session_instance and clean_msg:
                    await session_instance.say(clean_msg)

            except asyncio.CancelledError:
                logger.info("Agent turn speech generation interrupted by candidate.")
                raise
            except Exception as e:
                logger.error(f"Error during turn processing: {e}", exc_info=True)

        # 9. Trigger background evaluation and state persistence
        asyncio.create_task(self.evaluate_turn())
        asyncio.create_task(self.persist_session_state())

        # 10. Reset interaction timer
        self.last_interaction_time = time.time()


async def entrypoint(ctx: JobContext) -> None:
    """
    LiveKit Agent entry point function invoked when a participant joins a room.
    """
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    room_name = ctx.room.name
    logger.info(f"Connected to LiveKit room: {room_name}")

    # Extract user metadata from participant token
    participant = await ctx.wait_for_participant()
    metadata: dict[str, Any] = {}
    if participant.metadata:
        try:
            metadata = json.loads(participant.metadata)
        except Exception:
            metadata = {}

    candidate_name = metadata.get("candidate_name", participant.identity or "Candidate")
    user_id = metadata.get("user_id", "1")
    interview_type = metadata.get("interview_type", "general")
    ai_selected_questions = metadata.get("ai_selected_questions", [])

    # Load session state from database if existing
    session_data = None
    try:
        async with SessionLocal() as db:
            existing = await InterviewService.get_session(db, room_name)
            if existing and existing.state_data:
                session_data = {"state_data": existing.state_data}
    except Exception as e:
        logger.warning(f"Could not load existing session {room_name}: {e}")

    # Initialize InterviewAgent
    agent = InterviewAgent(
        room=ctx.room,
        room_id=room_name,
        candidate_name=candidate_name,
        user_id=user_id,
        interview_type=interview_type,
        ai_selected_questions=ai_selected_questions,
        session_data=session_data,
    )

    # Initialize STT, TTS, and VAD adapters
    stt_adapter = get_stt_adapter()
    tts_adapter = get_tts_adapter()
    vad_adapter = get_vad_adapter()

    session = AgentSession(
        stt=stt_adapter,
        tts=tts_adapter,
        vad=vad_adapter,
    )
    agent._agent_session = session

    # Harmonized DataChannel event listener
    @ctx.room.on("data_received")
    def on_data_received(data_packet: Any) -> None:
        try:
            raw_str = data_packet.data.decode("utf-8")
            data = json.loads(raw_str)
            msg_type = data.get("type")

            # 1. Code update / Editor change / Debounced silent snapshot
            if msg_type in ("code_update", "editor_change", "code_sync"):
                code = data.get("code") if data.get("code") is not None else data.get("content")
                summary = data.get("summary")
                if code is not None:
                    agent.latest_code = code
                    agent.state["latest_code"] = code
                if summary:
                    agent.state["latest_code_summary"] = summary
                logger.info(f"Received candidate code update via '{msg_type}'.")

            # 2. Code execution result
            elif msg_type in ("code_execution", "result"):
                execution = data.get("execution") or data.get("result") or data.get("output")
                summary = data.get("summary")
                if execution is not None:
                    agent.latest_execution = execution
                    agent.state["latest_execution"] = execution
                    agent.last_execution_time = time.time()
                    agent.has_unprompted_execution = True
                    logger.info(f"Received candidate code execution result via '{msg_type}'.")
                if summary:
                    agent.state["latest_execution_summary"] = summary
                code = data.get("code") or data.get("content")
                if code is not None:
                    agent.latest_code = code
                    agent.state["latest_code"] = code

            # 3. Candidate Webcam Photo Snapshot (Response to capture_candidate_photo)
            elif msg_type == "candidate_photo":
                photo_data = data.get("data")
                photo_reason = data.get("reason", "Visual observation")
                if photo_data:
                    logger.info("Received candidate webcam photo. Analyzing with vision model...")
                    async def _handle_photo():
                        try:
                            vis_desc = await analyze_candidate_photo(photo_data, photo_reason)
                            agent.state["latest_visual_context"] = vis_desc
                            logger.info(f"Updated latest_visual_context: {vis_desc}")
                        except Exception as e:
                            logger.warning(f"Photo analysis failed: {e}")
                    asyncio.create_task(_handle_photo())

            # 3. Whiteboard graph / update
            elif msg_type in ("whiteboard_graph", "whiteboard_update"):
                graph = data.get("graph") or data.get("data")
                if graph is not None:
                    graph_str = json.dumps(graph) if isinstance(graph, (dict, list)) else str(graph)
                    agent.latest_whiteboard_graph = graph_str
                    agent.state["latest_whiteboard_graph"] = graph_str
                    logger.info(f"Received candidate whiteboard graph via '{msg_type}'.")

            # 4. System design diagram update
            elif msg_type == "design_update":
                design = data.get("design") or data.get("nodes") or data.get("content")
                if design is not None:
                    design_str = json.dumps(design) if isinstance(design, (dict, list)) else str(design)
                    agent.latest_code = design_str
                    agent.state["latest_code"] = design_str
                    logger.info("Received candidate design update via 'design_update'.")

            # 5. Candidate signaled ready
            elif msg_type == "candidate_ready":
                agent.last_interaction_time = time.time()
                logger.info("Received 'candidate_ready' signal. Triggering turn evaluation.")
                asyncio.create_task(agent.evaluate_turn())

            # 6. Candidate submitted solution or coding time expired
            elif msg_type in ("coding_time_expired", "solution_submitted"):
                agent.last_interaction_time = time.time()
                reason = "coding time window has expired" if msg_type == "coding_time_expired" else "candidate has locked in their final solution"
                logger.info(f"Received '{msg_type}' signal ({reason}). Prompting defense walk-through.")
                defense_prompt = f"[SYSTEM: The {reason}. Transition from the coding phase into the algorithm defense. Ask the candidate to walk through their algorithm's Time and Space complexity, edge case handling, and potential optimization trade-offs in 1-2 spoken sentences.]"
                agent.state["messages"].append({"role": "user", "content": defense_prompt})
                async def handle_defense():
                    try:
                        async with agent.turn_lock:
                            try:
                                resp = await agent.interview_agent.ainvoke(agent.state)
                            except TypeError:
                                resp = await agent.interview_agent.ainvoke(agent.state)
                            agent.state.update(resp)
                            assistant_msgs = [m for m in agent.state.get("messages", []) if m.get("role") == "assistant"]
                            if assistant_msgs:
                                await session.say(assistant_msgs[-1]["content"])
                            asyncio.create_task(agent.evaluate_turn())
                    except Exception as defense_err:
                        logger.warning(f"Defense prompt reaction failed: {defense_err}")
                asyncio.create_task(handle_defense())

            # 7. Candidate Quick Voice Directives / Interactive Prompt
            elif msg_type in ("candidate_directive", "chat_message", "user_text"):
                directive_text = data.get("text") or data.get("prompt")
                if directive_text:
                    logger.info(f"Received candidate quick directive: {directive_text}")
                    class _SimpleDirectiveMsg:
                        text_content = directive_text
                    asyncio.create_task(agent.on_user_turn_completed(None, _SimpleDirectiveMsg()))

        except Exception as err:
            logger.warning(f"Error handling incoming data channel message: {err}")

    # Participant event handlers for late-joining participant metadata synchronization
    @ctx.room.on("participant_connected")
    def on_participant_connected(p: Any) -> None:
        logger.info(f"Participant connected: {p.identity}")
        if p.metadata:
            try:
                meta = json.loads(p.metadata)
                if meta.get("ai_selected_questions") and not agent.ai_selected_questions:
                    agent.ai_selected_questions = meta["ai_selected_questions"]
                    agent.state["ai_selected_questions"] = agent.ai_selected_questions
                    logger.info(f"Synchronized ai_selected_questions from connected participant ({len(meta['ai_selected_questions'])} questions).")
            except Exception as e:
                logger.warning(f"Could not parse participant metadata: {e}")

    @ctx.room.on("participant_metadata_changed")
    def on_participant_metadata_changed(p: Any, old_metadata: Any) -> None:
        logger.info(f"Participant metadata changed for: {p.identity}")
        if p.metadata:
            try:
                meta = json.loads(p.metadata)
                if meta.get("ai_selected_questions"):
                    agent.ai_selected_questions = meta["ai_selected_questions"]
                    agent.state["ai_selected_questions"] = agent.ai_selected_questions
                    logger.info(f"Updated ai_selected_questions dynamically ({len(agent.ai_selected_questions)} questions).")
            except Exception as e:
                logger.warning(f"Could not parse updated metadata: {e}")

    # Disconnect handler
    @ctx.room.on("disconnected")
    def on_disconnected() -> None:
        logger.info(f"Room {room_name} disconnected. Scheduling cleanup.")
        asyncio.create_task(agent.trigger_termination())

    # Silence monitor task (handles proactive test results acknowledgment + silence nudges)
    async def silence_monitor() -> None:
        while not agent._analysis_published:
            await asyncio.sleep(4.0)
            stage = agent.state.get("stage", "")

            # Acknowledge unprompted code execution after a 3s pause
            if (
                stage in ("dsa_coding", "dsa_approach", "dsa_testing")
                and getattr(agent, "has_unprompted_execution", False)
                and time.time() - getattr(agent, "last_execution_time", 0) > 3.0
            ):
                agent.has_unprompted_execution = False
                agent.last_interaction_time = time.time()

                exec_info = agent.state.get("latest_execution") or {}
                st = exec_info.get("status", "") if isinstance(exec_info, dict) else str(exec_info)
                raw_data = exec_info.get("raw") or {} if isinstance(exec_info, dict) else {}
                passed = raw_data.get("passed_tests", 0)
                total = raw_data.get("total_tests", 0)

                if st == "Accepted":
                    nudge = f"[SYSTEM: The candidate just ran their code and all tests passed ({passed}/{total}). Acknowledge warmly in 1-2 spoken sentences and ask about time and space complexity.]"
                else:
                    nudge = f"[SYSTEM: The candidate ran their code with status '{st}' ({passed}/{total} passed). Acknowledge gently in 1-2 spoken sentences and ask what they think caused the issue.]"

                logger.info(f"Proactively responding to candidate code execution: {st}")
                agent.state["messages"].append({"role": "user", "content": nudge})
                try:
                    async with agent.turn_lock:
                        reaction_config = {
                            "run_name": "voice_interviewer_code_reaction",
                            "tags": ["voice_agent", agent.interview_type, "code_execution_reaction"],
                            "metadata": {
                                "session_id": agent.room_id,
                                "candidate_name": agent.candidate_name,
                                "interview_type": agent.interview_type,
                                "stage": agent.state.get("stage"),
                            },
                        }
                        try:
                            resp = await agent.interview_agent.ainvoke(agent.state, config=reaction_config)
                        except TypeError:
                            resp = await agent.interview_agent.ainvoke(agent.state)
                        agent.state.update(resp)
                        assistant_msgs = [m for m in agent.state.get("messages", []) if m.get("role") == "assistant"]
                        if assistant_msgs:
                            await session.say(assistant_msgs[-1]["content"])
                        asyncio.create_task(agent.evaluate_turn())
                except Exception as exec_react_err:
                    logger.warning(f"Code execution reaction failed: {exec_react_err}")
                continue

            # Standard silence nudge if candidate is quiet for > 45s in core stage
            elapsed_silence = time.time() - agent.last_interaction_time
            if stage in ("dsa_coding", "dsa_approach", "system_design_hld", "system_design_requirements") and elapsed_silence > 45:
                agent.last_interaction_time = time.time()
                nudge = "[SYSTEM: The candidate has been silent for 45 seconds. Offer a gentle, encouraging 1-sentence prompt.]"
                agent.state["messages"].append({"role": "user", "content": nudge})
                try:
                    async with agent.turn_lock:
                        nudge_config = {
                            "run_name": "voice_interviewer_silence_nudge",
                            "tags": ["voice_agent", agent.interview_type, "silence_nudge"],
                            "metadata": {
                                "session_id": agent.room_id,
                                "candidate_name": agent.candidate_name,
                                "interview_type": agent.interview_type,
                                "stage": agent.state.get("stage"),
                            },
                        }
                        try:
                            resp = await agent.interview_agent.ainvoke(agent.state, config=nudge_config)
                        except TypeError:
                            resp = await agent.interview_agent.ainvoke(agent.state)
                        agent.state.update(resp)
                        assistant_msgs = [m for m in agent.state.get("messages", []) if m.get("role") == "assistant"]
                        if assistant_msgs:
                            await session.say(assistant_msgs[-1]["content"])
                except Exception as ex:
                    logger.warning(f"Silence nudge failed: {ex}")

    asyncio.create_task(silence_monitor())

    # Start the agent session
    await session.start(
        room=ctx.room,
        agent=agent,
        room_input_options=RoomInputOptions(text_enabled=False),
    )
    logger.info("LiveKit AgentSession running.")

    # Send initial greeting if new session
    if not agent.state["messages"]:
        await asyncio.sleep(1.0)
        norm_type = agent.interview_type.replace("_", " ").title()
        greeting = (
            f"Hi {agent.candidate_name}! Welcome, I am Aarav, your technical interviewer today from ThinkAloudAI. "
            f"I will be conducting your {norm_type} session. Before we begin, can you hear and see me clearly?"
        )
        agent.state["messages"] = [{"role": "assistant", "content": greeting}]
        await agent.persist_session_state()
        try:
            await session.say(greeting)
        except Exception as greet_err:
            logger.warning(f"Could not say initial greeting: {greet_err}")


def prewarm(proc: agents.JobProcess) -> None:
    """Pre-warm function to initialize models and connection pools before job acceptance."""
    logger.info("Pre-warming LiveKit Agent process...")
    try:
        get_vad_adapter()
    except Exception as e:
        logger.warning(f"Pre-warm VAD notice: {e}")


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            ws_url=settings.livekit_url,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
        )
    )
