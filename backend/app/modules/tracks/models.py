import enum
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ContentType(enum.StrEnum):
    dsa = "dsa"
    system_design = "system_design"
    behavioral = "behavioral"
    mock_interview = "mock_interview"
    custom = "custom"


class SystemDesignQuestion(Base):
    __tablename__ = "system_design_questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)
    domain = Column(String(100), index=True, nullable=True)
    role = Column(String(100), index=True, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    submissions = relationship(
        "SystemDesignSubmission", back_populates="question", cascade="all, delete-orphan"
    )


class SystemDesignSubmission(Base):
    __tablename__ = "system_design_submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    question_id = Column(
        Integer,
        ForeignKey("system_design_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(String(255), index=True, nullable=True)
    answer_text = Column(Text, nullable=False)
    score = Column(Integer, nullable=False, default=0)
    feedback = Column(Text, nullable=True)
    strengths = Column(Text, nullable=True)
    improvements = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    question = relationship("SystemDesignQuestion", back_populates="submissions")


class BehavioralQuestion(Base):
    __tablename__ = "behavioral_questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(100), index=True, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )


class PMQuestion(Base):
    __tablename__ = "pm_questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(100), index=True, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )


class AIMLQuestion(Base):
    __tablename__ = "aiml_questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    domain = Column(String(100), index=True, nullable=True)
    role = Column(String(100), index=True, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )


class Roadmap(Base):
    __tablename__ = "roadmaps"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), index=True, nullable=True)  # Nullable for general roadmaps
    is_general = Column(Boolean, default=False, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    topics = relationship(
        "RoadmapTopic", back_populates="roadmap", cascade="all, delete-orphan", order_by="RoadmapTopic.order_index"
    )


class RoadmapTopic(Base):
    __tablename__ = "roadmap_topics"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    roadmap_id = Column(
        Integer, ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(255), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)

    roadmap = relationship("Roadmap", back_populates="topics")
    items = relationship(
        "RoadmapItem", back_populates="topic", cascade="all, delete-orphan", order_by="RoadmapItem.id"
    )


class RoadmapItem(Base):
    __tablename__ = "roadmap_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    topic_id = Column(
        Integer, ForeignKey("roadmap_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(255), nullable=False)
    content_type = Column(
        String(50), nullable=False, default=ContentType.custom.value
    )
    estimated_minutes = Column(Integer, default=30)
    content_id = Column(String(255), nullable=True)
    timeline_days = Column(Integer, nullable=True)
    is_completed = Column(Boolean, default=False, nullable=False)

    topic = relationship("RoadmapTopic", back_populates="items")
