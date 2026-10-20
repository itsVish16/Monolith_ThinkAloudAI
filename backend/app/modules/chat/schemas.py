from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatStreamRequest(BaseModel):
    session_id: str
    message: str
    images: list[str] | None = Field(default_factory=list)


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: str
    role: str
    content: str
    created_at: datetime


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None = None
    created_at: datetime


class UpdateSessionTitleRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
