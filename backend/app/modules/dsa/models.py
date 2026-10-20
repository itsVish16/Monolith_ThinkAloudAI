import re
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


def slugify(text: str) -> str:
    """Generates a URL-friendly slug from title."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")


class DSAQuestion(Base):
    __tablename__ = "dsa_questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), index=True, nullable=False)
    slug = Column(String(255), index=True, nullable=True)
    description = Column(Text, nullable=False)
    difficulty = Column(String(50), index=True, nullable=False)
    function_name = Column(String(100), nullable=False, default="solution")
    python_starter_code = Column(Text, nullable=True)
    cpp_starter_code = Column(Text, nullable=True)
    cpp_test_harness = Column(Text, nullable=True)
    test_cases = Column(Text, nullable=False)  # JSON encoded string of test cases

    # Platform metrics & hints
    hints = Column(Text, nullable=True)  # JSON encoded list of hints
    optimal_time_complexity = Column(String(50), nullable=True)
    optimal_space_complexity = Column(String(50), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    submissions = relationship(
        "CodeSubmission", back_populates="question", cascade="all, delete-orphan"
    )
    tags = relationship(
        "ProblemTag", back_populates="question", cascade="all, delete-orphan"
    )


class ProblemTag(Base):
    __tablename__ = "problem_tags"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    question_id = Column(
        Integer,
        ForeignKey("dsa_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tag_name = Column(String(100), index=True, nullable=False)

    question = relationship("DSAQuestion", back_populates="tags")


class CodeSubmission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        Index("ix_submissions_session_question", "session_id", "question_id"),
        Index("ix_submissions_user_question", "user_id", "question_id"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), index=True, nullable=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    question_id = Column(
        Integer,
        ForeignKey("dsa_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code = Column(Text, nullable=False)
    language = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)  # Accepted, Wrong Answer, etc.
    error_message = Column(Text, nullable=True)
    is_submission = Column(Boolean, default=True, nullable=False)

    # Performance metrics
    execution_time_ms = Column(Float, nullable=True)
    memory_used_kb = Column(Float, nullable=True)
    passed_tests = Column(Integer, nullable=True)
    total_tests = Column(Integer, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    question = relationship("DSAQuestion", back_populates="submissions")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), index=True, nullable=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    question_id = Column(
        Integer,
        ForeignKey("dsa_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    question = relationship("DSAQuestion")


class UserProblemStatus(Base):
    __tablename__ = "user_problem_status"
    __table_args__ = (
        Index("ix_user_problem_status_user_question", "user_id", "question_id"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), index=True, nullable=False)
    question_id = Column(
        Integer,
        ForeignKey("dsa_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(String(50), nullable=False)  # "Attempted", "Solved"
    last_attempted_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    best_runtime_ms = Column(Float, nullable=True)
    best_memory_kb = Column(Float, nullable=True)

    question = relationship("DSAQuestion")
