from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# --- System Design Schemas ---
class SystemDesignQuestionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    domain: str | None = None
    role: str | None = None
    created_at: datetime


class SystemDesignQuestionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    domain: str | None = None
    role: str | None = None
    created_at: datetime


class SystemDesignListResponse(BaseModel):
    items: list[SystemDesignQuestionSummary]
    total: int
    skip: int
    limit: int


class SystemDesignSubmissionRequest(BaseModel):
    answer_text: str = Field(..., min_length=10, description="User's system design solution")


class SystemDesignSubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: int
    user_id: str | None = None
    score: int
    feedback: str | None = None
    strengths: str | None = None
    improvements: str | None = None
    created_at: datetime


# --- Behavioral Schemas ---
class BehavioralQuestionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    category: str | None = None
    created_at: datetime


class BehavioralListResponse(BaseModel):
    items: list[BehavioralQuestionDetail]
    total: int
    skip: int
    limit: int


# --- Product Management Schemas ---
class PMQuestionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    category: str | None = None
    created_at: datetime


class PMListResponse(BaseModel):
    items: list[PMQuestionDetail]
    total: int
    skip: int
    limit: int


# --- AI/ML Schemas ---
class AIMLQuestionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    domain: str | None = None
    role: str | None = None
    created_at: datetime


class AIMLListResponse(BaseModel):
    items: list[AIMLQuestionDetail]
    total: int
    skip: int
    limit: int


# --- Roadmap Schemas ---
class RoadmapItemBase(BaseModel):
    title: str
    content_type: str = "custom"
    estimated_minutes: int = 30
    content_id: str | None = None
    timeline_days: int | None = None


class RoadmapItemCreate(RoadmapItemBase):
    pass


class RoadmapItemDetail(RoadmapItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic_id: int
    is_completed: bool = False


class RoadmapTopicCreate(BaseModel):
    title: str
    order_index: int = 0
    items: list[RoadmapItemCreate] = []


class RoadmapTopicDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    roadmap_id: int
    title: str
    order_index: int
    items: list[RoadmapItemDetail] = []


class RoadmapCreate(BaseModel):
    title: str
    description: str | None = None
    topics: list[RoadmapTopicCreate] = []


class RoadmapDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str | None = None
    is_general: bool
    title: str
    description: str | None = None
    created_at: datetime
    topics: list[RoadmapTopicDetail] = []


class RoadmapListResponse(BaseModel):
    items: list[RoadmapDetail]
    total: int
    skip: int
    limit: int
