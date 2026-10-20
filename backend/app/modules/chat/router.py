import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.chat.models import ChatMessageModel, ChatSession
from app.modules.chat.schemas import (
    ChatMessageOut,
    ChatSessionOut,
    ChatStreamRequest,
    UpdateSessionTitleRequest,
)
from app.modules.chat.service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post(
    "/chat/stream",
    summary="Stream AI coding assistant response via Server-Sent Events",
    description="Streams real-time LLM responses with tool calls, reasoning/thinking blocks, and roadmap artifacts.",
)
@router.post(
    "/stream",
    include_in_schema=False,
)
async def chat_stream(
    request: ChatStreamRequest,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    return StreamingResponse(
        ChatService.chat_stream_generator(request, current_user.id, redis),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/sessions",
    response_model=list[ChatSessionOut],
    summary="List candidate chat sessions",
)
async def list_chat_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    sessions = await db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(desc(ChatSession.created_at))
        .offset(skip)
        .limit(limit)
    )
    return sessions.all()


@router.get(
    "/sessions/{session_id}/messages",
    response_model=list[ChatMessageOut],
    summary="Get conversation history for a chat session",
)
async def get_session_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = await db.scalar(select(ChatSession).where(ChatSession.id == session_id))
    if not sess:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found"
        )
    if sess.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden to this chat session",
        )

    messages = await db.scalars(
        select(ChatMessageModel)
        .where(ChatMessageModel.session_id == session_id)
        .order_by(ChatMessageModel.id.asc())
    )
    return messages.all()


@router.patch(
    "/sessions/{session_id}/title",
    response_model=ChatSessionOut,
    summary="Update chat session title",
)
async def update_session_title(
    session_id: str,
    payload: UpdateSessionTitleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = await db.scalar(select(ChatSession).where(ChatSession.id == session_id))
    if not sess:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found"
        )
    if sess.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden"
        )

    sess.title = payload.title.strip()
    await db.commit()
    await db.refresh(sess)
    return sess


@router.delete(
    "/sessions/{session_id}",
    summary="Delete a chat session and all messages",
)
async def delete_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = await db.scalar(select(ChatSession).where(ChatSession.id == session_id))
    if not sess:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found"
        )
    if sess.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden"
        )

    await db.execute(delete(ChatSession).where(ChatSession.id == session_id))
    await db.commit()
    return {"message": "Chat session deleted", "session_id": session_id}
