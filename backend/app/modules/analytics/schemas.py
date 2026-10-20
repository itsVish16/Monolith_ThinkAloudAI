from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class UserStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    problems_solved_total: int = 0
    problems_solved_easy: int = 0
    problems_solved_medium: int = 0
    problems_solved_hard: int = 0
    total_submissions: int = 0
    acceptance_rate: float = 0.0
    interviews_completed: int = 0
    avg_interview_score: float = 0.0
    best_interview_score: int = 0
    current_streak: int = 0
    longest_streak: int = 0
    last_activity_date: date | None = None
    rating: int = 1200


class DailyActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    activity_date: date
    date: str | None = None
    problems_solved: int = 0
    problems_attempted: int = 0
    submissions_count: int = 0
    interviews_done: int = 0
    study_minutes: int = 0
    count: int = 0  # Combined activity intensity score for heatmaps


class HeatmapResponse(BaseModel):
    activities: list[DailyActivityResponse] = Field(default_factory=list)
    total_active_days: int = 0
    current_streak: int = 0
    longest_streak: int = 0


class SkillScoreItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    domain: str
    score: float = 0.0
    problems_solved: int = 0
    interviews_done: int = 0
    updated_at: datetime | None = None


class RadarDimension(BaseModel):
    subject: str
    A: float
    fullMark: int = 100


class SkillScoresResponse(BaseModel):
    skills: list[SkillScoreItem] = Field(default_factory=list)
    radar_data: list[RadarDimension] = Field(default_factory=list)


class LeaderboardUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rank: int | None = None
    user_id: int
    candidate_name: str
    username: str | None = None
    score: int = 0
    rating: int = 1200
    interviews_completed: int = 0
    problems_solved: int = 0


class LeaderboardResponse(BaseModel):
    leaderboard: list[LeaderboardUserItem] = Field(default_factory=list)
    me: LeaderboardUserItem | None = None
