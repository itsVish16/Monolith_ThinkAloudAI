import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User


def generate_uuid() -> str:
    return str(uuid.uuid4())


class InterviewSession(Base):
    """
    Core interview session tracking state, stage, questions, candidate details,
    guest invite access tokens, and associated feedback.
    """

    __tablename__ = "interview_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    candidate_name: Mapped[str] = mapped_column(String(100), nullable=False)
    candidate_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    interview_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="Behavioral",
    )  # "DSA", "System Design", "Behavioral", "PM", "AI/ML"
    difficulty: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        default="Medium",
    )  # "Easy", "Medium", "Hard"
    stage: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="intro_audio_check",
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="in_progress",
    )  # "scheduled", "in_progress", "completed", "cancelled"
    invite_token: Mapped[str | None] = mapped_column(
        String(64),
        unique=True,
        nullable=True,
        index=True,
    )
    invite_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_anonymous_invite: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    state_data: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

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

    # Relationships
    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])
    questions: Mapped[list["InterviewQuestion"]] = relationship(
        "InterviewQuestion",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InterviewQuestion.created_at.asc()",
    )
    feedback: Mapped["InterviewFeedback | None"] = relationship(
        "InterviewFeedback",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class InterviewQuestion(Base):
    """
    Questions posed during an interview session.
    """

    __tablename__ = "interview_questions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    session: Mapped["InterviewSession"] = relationship("InterviewSession", back_populates="questions")
    responses: Mapped[list["InterviewResponse"]] = relationship(
        "InterviewResponse",
        back_populates="question",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InterviewResponse.created_at.asc()",
    )


class InterviewResponse(Base):
    """
    Candidate responses recorded for a given interview question.
    """

    __tablename__ = "interview_responses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    question_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("interview_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    question: Mapped["InterviewQuestion"] = relationship("InterviewQuestion", back_populates="responses")


class InterviewFeedback(Base):
    """
    Evaluations, rubric scores, and recommendations generated for an interview session.
    """

    __tablename__ = "interview_feedback"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    technical_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    communication_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    english_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    strengths: Mapped[str | None] = mapped_column(Text, nullable=True)
    weaknesses: Mapped[str | None] = mapped_column(Text, nullable=True)
    improvement_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_topics: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    detailed_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    session: Mapped["InterviewSession"] = relationship("InterviewSession", back_populates="feedback")
