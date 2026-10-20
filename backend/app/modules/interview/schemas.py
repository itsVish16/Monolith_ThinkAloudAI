from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class InterviewTypeItem(BaseModel):
    id: str = Field(..., description="Identifier for the interview track, e.g. 'dsa', 'system_design'")
    name: str = Field(..., description="Human-readable title for the interview track")
    description: str = Field(..., description="Detailed description of what the interview entails")


class InterviewTypesResponse(BaseModel):
    types: list[InterviewTypeItem] = Field(..., description="List of available interview types")


class CreateSessionRequest(BaseModel):
    interview_type: str = Field(
        default="dsa",
        description="Interview track: dsa, system_design, behavioral, pm, ai_ml",
        examples=["dsa", "system_design", "behavioral", "pm", "ai_ml"],
    )
    difficulty: str | None = Field(default="Medium", description="Target difficulty: Easy, Medium, Hard")
    room_name: str | None = Field(default=None, description="Optional custom room/session identifier")
    question_ids: list[str] | None = Field(default=None, description="Optional list of specific question IDs")
    domain: str | None = Field(default=None, description="Optional domain context (e.g. Distributed Systems)")
    role: str | None = Field(default=None, description="Optional target role context")
    custom_prompt: str | None = Field(default=None, description="Optional custom instructions for AI interviewer")


class SessionStateUpdate(BaseModel):
    stage: str | None = Field(default=None, description="Updated stage for state machine")
    state_data: dict[str, Any] | None = Field(default=None, description="Updated state JSON dictionary")
    difficulty: str | None = Field(default=None, description="Updated difficulty level")


class LiveKitTokenRequest(BaseModel):
    room_name: str | None = Field(default=None, description="Room identifier to connect")
    session_id: str | None = Field(default=None, description="Session ID to connect")
    interview_type: str | None = Field(default="dsa", description="Type of interview")
    question_ids: list[str] | None = Field(default=None, description="Optional question IDs to link")
    domain: str | None = Field(default=None, description="Domain context for system design")
    role: str | None = Field(default=None, description="Target role context")


class LiveKitTokenResponse(BaseModel):
    token: str = Field(..., description="LiveKit JWT access token for WebRTC connection")
    url: str = Field(..., description="LiveKit WebSocket / HTTP connection URL")
    room_name: str = Field(..., description="LiveKit Room Name")
    roomName: str = Field(..., description="Legacy alias for room_name")
    candidate: str = Field(..., description="Candidate display name")
    session_id: str = Field(..., description="Interview Session ID")
    ai_selected_questions: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Pre-selected question pool for this session",
    )


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="allow")

    id: str | None = None
    session_id: str
    technical_score: int | None = None
    communication_score: int | None = None
    english_score: int | None = None
    overall_score: int | None = None
    strengths: Any | None = None
    weaknesses: Any | None = None
    improvement_plan: Any | None = None
    rubric_scores: Any | None = None
    recommended_topics: Any | None = None
    detailed_metrics: dict[str, Any] | None = None
    created_at: datetime | None = None


class SpeechMetricsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="allow")

    session_id: str | None = Field(default=None, description="Interview session ID")
    speech_rate_wpm: float = Field(default=135.0, description="Estimated words per minute")
    total_turn_count: int = Field(default=0, description="Total conversational turns")
    user_speaking_time_seconds: float = Field(default=0.0, description="Total candidate speaking duration in seconds")
    interviewer_speaking_time_seconds: float = Field(default=0.0, description="Total interviewer speaking duration in seconds")
    filler_word_count: int = Field(default=0, description="Total count of filler words")
    filler_words: list[str] = Field(default_factory=list, description="Detected filler words")
    audio_quality_score: float = Field(default=95.0, description="Estimated audio quality score (0-100)")
    sentiment: str = Field(default="neutral", description="Candidate speech sentiment ('positive' / 'neutral')")
    metrics_history: list[Any] = Field(default_factory=list, description="Turn metrics history")
    candidate_name: str | None = None
    interview_type: str | None = None
    summary: dict[str, Any] | None = None
    turns: list[Any] | None = None


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: int | None = None
    candidate_name: str
    candidate_email: str | None = None
    interview_type: str
    difficulty: str | None = None
    stage: str
    status: str = "in_progress"
    invite_token: str | None = None
    scheduled_at: datetime | None = None
    is_anonymous_invite: bool = False
    state_data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    feedback: FeedbackResponse | None = None
    transcript: list[dict[str, Any]] | None = None
    ai_selected_questions: list[dict[str, Any]] = Field(default_factory=list)


class GuestInviteDetailsResponse(BaseModel):
    session_id: str
    invite_token: str
    candidate_name: str
    candidate_email: str | None = None
    interview_type: str
    difficulty: str | None = None
    stage: str
    status: str
    scheduled_at: datetime | None = None
    expires_at: datetime | None = None
    is_valid: bool = True
    is_expired: bool = False
    is_completed: bool = False
    questions_count: int = 0
    question_count: int = 0
    question_titles: list[str] = Field(default_factory=list)


class GuestJoinInterviewResponse(BaseModel):
    token: str
    url: str
    room_name: str
    roomName: str
    candidate: str
    candidate_name: str
    session_id: str
    interview_type: str
    ai_selected_questions: list[dict[str, Any]] = Field(default_factory=list)


class GuestInterviewReportResponse(BaseModel):
    session_id: str
    candidate_name: str
    candidate_email: str | None = None
    interview_type: str
    difficulty: str | None = None
    stage: str
    status: str
    overall_score: int | None = None
    technical_score: int | None = None
    communication_score: int | None = None
    english_score: int | None = None
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_plan: list[str] = Field(default_factory=list)
    executive_summary: str | None = None
    created_at: datetime | None = None

