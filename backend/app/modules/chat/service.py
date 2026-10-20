import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import desc, select

from app.core.database import SessionLocal
from app.modules.chat.agent import build_chat_agent, generate_chat_title
from app.modules.chat.models import ChatMessageModel, ChatSession
from app.modules.chat.schemas import ChatStreamRequest
from app.modules.chat.tools import TOOL_REGISTRY

logger = logging.getLogger(__name__)


class ChatService:
    @staticmethod
    async def chat_stream_generator(
        request: ChatStreamRequest,
        user_id: int,
        redis: Redis | None = None,
    ) -> AsyncGenerator[str, None]:
        session_id = request.session_id
        user_query = request.message
        images = request.images or []

        # 1. Fetch or create ChatSession in DB
        async with SessionLocal() as db:
            session = await db.scalar(
                select(ChatSession).where(
                    ChatSession.id == session_id,
                    ChatSession.user_id == user_id,
                )
            )
            is_new_session = False
            if not session:
                session = ChatSession(
                    id=session_id,
                    user_id=user_id,
                    title="New Chat",
                )
                db.add(session)
                await db.commit()
                await db.refresh(session)
                is_new_session = True
            elif not session.title or session.title == "New Chat":
                is_new_session = True

            # 2. Format user content (supporting multimodal images)
            if images and len(images) > 0:
                user_content: Any = [{"type": "text", "text": user_query}]
                for img in images:
                    user_content.append({"type": "image_url", "image_url": {"url": img}})
                db_content = json.dumps(user_content)
            else:
                user_content = user_query
                db_content = user_query

            # Save user message to database
            user_msg = ChatMessageModel(
                session_id=session_id,
                role="user",
                content=db_content,
            )
            db.add(user_msg)
            await db.commit()

            # 3. Fetch past conversation history (last 15 messages)
            history_rows = await db.scalars(
                select(ChatMessageModel)
                .where(ChatMessageModel.session_id == session_id)
                .order_by(desc(ChatMessageModel.id))
                .limit(16)
            )
            ordered_msgs = list(reversed(history_rows.all()))

        # Build messages payload for LangChain/LangGraph
        history = []
        for msg in ordered_msgs:
            if msg.role not in ["user", "human", "assistant", "ai", "system"]:
                continue
            # Skip the newly added message from history since we append it below
            if msg.id == user_msg.id:
                continue

            try:
                parsed = json.loads(msg.content)
                if isinstance(parsed, list):
                    history.append((msg.role, parsed))
                else:
                    history.append((msg.role, msg.content))
            except Exception:
                history.append((msg.role, msg.content))

        # Context injection with session_id note
        if isinstance(user_content, str):
            injected_user_prompt = (
                f"{user_content}\n\n"
                f"[System Note: User session_id is '{session_id}'. Use this if you call get_user_submissions.]"
            )
        else:
            injected_user_prompt = user_content + [
                {
                    "type": "text",
                    "text": f"\n\n[System Note: User session_id is '{session_id}'. Use this if you call get_user_submissions.]",
                }
            ]

        inputs = {"messages": history + [("user", injected_user_prompt)]}

        # 4. Emit execution start event
        exec_id = f"exec_{int(time.time() * 1000)}"
        yield f"data: {json.dumps({'type': 'execution_start', 'executionId': exec_id, 'time': time.time()})}\n\n"

        # 5. Handle automatic chat title generation for new sessions
        if is_new_session:
            async def _bg_title():
                title = await generate_chat_title(user_query)
                if title:
                    async with SessionLocal() as db_inner:
                        s = await db_inner.scalar(
                            select(ChatSession).where(ChatSession.id == session_id)
                        )
                        if s:
                            s.title = title
                            await db_inner.commit()
                    return title
                return None

            title_task = asyncio.create_task(_bg_title())
        else:
            title_task = None

        # 6. Stream LangGraph events
        agent = build_chat_agent()
        active_tools: dict[str, dict[str, Any]] = {}
        assistant_tokens: list[str] = []
        in_think = False
        stream_buffer = ""

        try:
            config = {
                "configurable": {
                    "thread_id": session_id,
                    "user_id": str(user_id),
                },
                "run_name": "chat_agent_turn",
                "tags": ["chat_agent", f"user_{user_id}", f"session_{session_id}"],
                "metadata": {
                    "session_id": session_id,
                    "user_id": user_id,
                },
            }

            async for event in agent.astream_events(inputs, version="v2", config=config):
                kind = event.get("event")
                name = event.get("name", "")
                run_id = str(event.get("run_id", ""))

                # Check if title task completed
                if title_task and title_task.done() and not title_task.cancelled():
                    new_title = title_task.result()
                    if new_title:
                        yield f"data: {json.dumps({'type': 'rename_chat', 'title': new_title})}\n\n"
                    title_task = None

                # Tool Started
                if kind == "on_tool_start":
                    tool_input = event.get("data", {}).get("input", {})
                    meta = TOOL_REGISTRY.get(
                        name,
                        {
                            "title": name.replace("_", " ").title(),
                            "icon": "terminal",
                            "description": f"Executing {name}",
                        },
                    )
                    start_t = time.time()
                    active_tools[run_id] = {
                        "name": name,
                        "startTime": int(start_t * 1000),
                        "start_t": start_t,
                    }

                    tool_call_payload = {
                        "type": "tool_call",
                        "toolId": run_id,
                        "title": meta["title"],
                        "description": meta["description"],
                        "icon": meta["icon"],
                        "startTime": int(start_t * 1000),
                        "args": tool_input,
                    }
                    yield f"data: {json.dumps(tool_call_payload)}\n\n"

                # Tool Finished
                elif kind == "on_tool_end":
                    tool_output = event.get("data", {}).get("output", "")
                    tool_info = active_tools.get(run_id, {})
                    start_t = tool_info.get("start_t", time.time())
                    end_t = time.time()
                    duration_ms = int((end_t - start_t) * 1000)

                    # Extract output summary
                    output_summary = "Tool execution completed."
                    parsed_output = tool_output
                    if hasattr(tool_output, "content"):
                        parsed_output = tool_output.content

                    if isinstance(parsed_output, str):
                        try:
                            json_obj = json.loads(parsed_output)
                            if isinstance(json_obj, dict):
                                output_summary = json_obj.get("message") or output_summary
                                # Check if roadmap was generated
                                if "roadmap_id" in json_obj:
                                    r_id = json_obj["roadmap_id"]
                                    yield f"data: {json.dumps({'type': 'roadmap', 'id': str(r_id)})}\n\n"
                        except Exception:
                            output_summary = parsed_output[:120].strip()
                    elif isinstance(parsed_output, dict):
                        output_summary = parsed_output.get("message") or output_summary
                        if "roadmap_id" in parsed_output:
                            r_id = parsed_output["roadmap_id"]
                            yield f"data: {json.dumps({'type': 'roadmap', 'id': str(r_id)})}\n\n"

                    tool_result_payload = {
                        "type": "tool_result",
                        "toolId": run_id,
                        "toolName": tool_info.get("name", name),
                        "status": "completed",
                        "endTime": int(end_t * 1000),
                        "duration": duration_ms,
                        "outputSummary": output_summary,
                        "output": str(parsed_output)[:500],
                    }
                    yield f"data: {json.dumps(tool_result_payload)}\n\n"

                # Model Stream Chunk
                elif kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if hasattr(chunk, "content") and chunk.content:
                        token = chunk.content
                        if not isinstance(token, str):
                            continue

                        stream_buffer += token

                        # Parse <think>...</think> reasoning tags
                        while stream_buffer:
                            if not in_think:
                                if "<think>" in stream_buffer:
                                    parts = stream_buffer.split("<think>", 1)
                                    if parts[0]:
                                        assistant_tokens.append(parts[0])
                                        yield f"data: {json.dumps({'type': 'token', 'text': parts[0]})}\n\n"
                                    yield f"data: {json.dumps({'type': 'thinking_start'})}\n\n"
                                    in_think = True
                                    stream_buffer = parts[1]
                                elif "<" in stream_buffer and "<think>".startswith(
                                    stream_buffer[stream_buffer.find("<") :]
                                ):
                                    idx = stream_buffer.find("<")
                                    if idx > 0:
                                        assistant_tokens.append(stream_buffer[:idx])
                                        yield f"data: {json.dumps({'type': 'token', 'text': stream_buffer[:idx]})}\n\n"
                                        stream_buffer = stream_buffer[idx:]
                                    break
                                else:
                                    assistant_tokens.append(stream_buffer)
                                    yield f"data: {json.dumps({'type': 'token', 'text': stream_buffer})}\n\n"
                                    stream_buffer = ""
                            else:
                                if "</think>" in stream_buffer:
                                    parts = stream_buffer.split("</think>", 1)
                                    if parts[0]:
                                        yield f"data: {json.dumps({'type': 'thinking_delta', 'text': parts[0]})}\n\n"
                                    yield f"data: {json.dumps({'type': 'thinking_end'})}\n\n"
                                    in_think = False
                                    stream_buffer = parts[1]
                                elif "<" in stream_buffer and "</think>".startswith(
                                    stream_buffer[stream_buffer.find("<") :]
                                ):
                                    idx = stream_buffer.find("<")
                                    if idx > 0:
                                        yield f"data: {json.dumps({'type': 'thinking_delta', 'text': stream_buffer[:idx]})}\n\n"
                                        stream_buffer = stream_buffer[idx:]
                                    break
                                else:
                                    yield f"data: {json.dumps({'type': 'thinking_delta', 'text': stream_buffer})}\n\n"
                                    stream_buffer = ""

            # Close any pending think block
            if in_think:
                yield f"data: {json.dumps({'type': 'thinking_end'})}\n\n"

            # Flush any remaining buffer
            if stream_buffer:
                assistant_tokens.append(stream_buffer)
                yield f"data: {json.dumps({'type': 'token', 'text': stream_buffer})}\n\n"

            # Finalize title if still pending
            if title_task and not title_task.done():
                try:
                    new_title = await asyncio.wait_for(title_task, timeout=2.0)
                    if new_title:
                        yield f"data: {json.dumps({'type': 'rename_chat', 'title': new_title})}\n\n"
                except Exception:
                    pass

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

            # 7. Persist assistant response to database
            final_content = "".join(assistant_tokens).strip()
            if final_content:
                async with SessionLocal() as db_save:
                    ai_msg = ChatMessageModel(
                        session_id=session_id,
                        role="assistant",
                        content=final_content,
                    )
                    db_save.add(ai_msg)
                    await db_save.commit()

        except Exception as e:
            logger.error(f"Error during chat streaming: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
