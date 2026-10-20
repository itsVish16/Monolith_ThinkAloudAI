from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AdminUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    full_name: str | None = None
    is_verified: bool
    role: str = "user"
    created_at: datetime


class UserStatsResponse(BaseModel):
    total_users: int
    verified_users: int
    unverified_users: int
    growth: list[dict[str, Any]] = []


class CodingStatsResponse(BaseModel):
    total_questions: int
    runs: int
    submissions: int
    passed_submissions: int


class RoadmapStatsResponse(BaseModel):
    total_roadmaps: int
    total_topics: int
    total_items: int


class InterviewCategoryStats(BaseModel):
    dsa: int = 0
    system_design: int = 0
    behavioral: int = 0
    pm: int = 0
    aiml: int = 0


class InterviewStatsResponse(BaseModel):
    total_users: int = 0
    total_interviews: int = 0
    completed_interviews: int = 0
    total_minutes: float = 0.0
    avg_score: float = 0.0
    avg_duration_minutes: float = 25.0
    categories: InterviewCategoryStats = Field(default_factory=InterviewCategoryStats)
    growth: list[dict[str, Any]] = []


class AchievementCreate(BaseModel):
    title: str | None = None
    name: str | None = None
    description: str
    icon_url: str | None = None
    icon: str | None = None
    user_id: int | None = None


class AchievementOut(BaseModel):
    id: int
    title: str
    name: str
    description: str
    icon_url: str | None = None
    icon: str | None = None
    user_id: int | None = None
    created_at: datetime | None = None


class DSAQuestionCreate(BaseModel):
    title: str
    slug: str | None = None
    difficulty: str = "Medium"
    description: str
    function_name: str | None = "solution"
    starter_code: str | None = None
    python_starter_code: str | None = None
    cpp_starter_code: str | None = None
    cpp_test_harness: str | None = None
    test_cases: Any = "[]"
    hints: Any | None = "[]"
    optimal_time_complexity: str | None = None
    optimal_space_complexity: str | None = None


class DSAQuestionUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    difficulty: str | None = None
    description: str | None = None
    function_name: str | None = None
    starter_code: str | None = None
    python_starter_code: str | None = None
    cpp_starter_code: str | None = None
    cpp_test_harness: str | None = None
    test_cases: Any | None = None
    hints: Any | None = None
    optimal_time_complexity: str | None = None
    optimal_space_complexity: str | None = None


class InterviewScoreOverride(BaseModel):
    technical_score: int | None = None
    communication_score: int | None = None
    english_score: int | None = None
    overall_score: int | None = None
    reason: str | None = None


class AdminScheduleInterviewRequest(BaseModel):
    candidate_name: str = Field(..., min_length=2, max_length=100, description="Full name of candidate")
    candidate_email: str = Field(..., max_length=255, description="Email of candidate")
    interview_type: str = Field(default="dsa", description="Interview track: dsa, system_design, behavioral, pm, ai_ml")
    difficulty: str | None = Field(default="Medium", description="Difficulty: Easy, Medium, Hard")
    question_ids: list[str] | None = Field(default=None, description="Optional question IDs or slugs selected by admin")
    custom_questions: list[dict[str, Any]] | None = Field(default=None, description="Optional custom questions designed by admin")
    scheduled_at: datetime | None = Field(default=None, description="Scheduled date and time (ISO format)")
    expires_in_days: int | None = Field(default=7, ge=1, le=90, description="Invite link validity in days")
    domain: str | None = None
    role: str | None = None
    custom_prompt: str | None = None
    notes: str | None = None
    send_email: bool = Field(default=True, description="Whether to automatically send invitation email to candidate")


class AdminScheduleInterviewResponse(BaseModel):
    session_id: str
    invite_token: str
    invite_url: str
    candidate_name: str
    candidate_email: str
    interview_type: str
    difficulty: str | None = None
    stage: str
    status: str
    scheduled_at: datetime | None = None
    invite_expires_at: datetime | None = None
    created_at: datetime
    ai_selected_questions: list[dict[str, Any]] = []
    email_sent: bool = False


class ScheduledInterviewItem(BaseModel):
    id: str
    session_id: str | None = None
    invite_token: str | None = None
    invite_url: str | None = None
    candidate_name: str
    candidate_email: str | None = None
    interview_type: str
    difficulty: str | None = None
    stage: str
    status: str
    scheduled_at: datetime | None = None
    invite_expires_at: datetime | None = None
    created_at: datetime
    score: int | None = None
    questions_count: int = 0
    question_titles: list[str] = []


class ScheduledInterviewsListResponse(BaseModel):
    items: list[ScheduledInterviewItem]
    total: int
    page: int
    limit: int
    pages: int


class AvailableQuestionItem(BaseModel):
    id: Any
    title: str
    difficulty: str
    track: str
    category: str | None = None
    description: str | None = None
    slug: str | None = None


class AvailableQuestionsResponse(BaseModel):
    track: str
    total: int
    questions: list[AvailableQuestionItem]

