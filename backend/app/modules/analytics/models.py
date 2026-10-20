from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User


class UserStats(Base):
    """
    Authoritative denormalized user statistics for profile dashboard, streaks, and ratings.
    Directly references users.id via foreign key.
    """

    __tablename__ = "user_stats"

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )

    # Problem solving stats
    problems_solved_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    problems_solved_easy: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    problems_solved_medium: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    problems_solved_hard: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_submissions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    acceptance_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Interview stats
    interviews_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_interview_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    best_interview_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Streaks & Activity
    current_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Global ELO / Platform Rating
    rating: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationship
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class DailyActivity(Base):
    """
    Tracks aggregate daily activity per candidate for GitHub-style contribution heatmaps.
    """

    __tablename__ = "daily_activity"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_date", name="uq_user_daily_activity"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    activity_date: Mapped[date] = mapped_column(
        Date,
        default=lambda: datetime.now(UTC).date(),
        nullable=False,
    )

    problems_solved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    problems_attempted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    submissions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    interviews_done: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    study_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class UserSkillScore(Base):
    """
    Tracks proficiency across specific computer science domains
    (e.g., Arrays, Dynamic Programming, System Design, Communication).
    """

    __tablename__ = "user_skill_scores"
    __table_args__ = (
        UniqueConstraint("user_id", "domain", name="uq_user_domain_skill"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    domain: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    problems_solved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    interviews_done: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class LearningEvent(Base):
    """
    Append-only audit log of significant candidate milestones and learning events for timeline feed.
    """

    __tablename__ = "learning_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Event types: "PROBLEM_SOLVED", "INTERVIEW_COMPLETED", "ACHIEVEMENT_UNLOCKED", "COURSE_COMPLETED"
    event_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    score_change: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    domain: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
