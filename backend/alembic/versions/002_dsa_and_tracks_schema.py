"""Add DSA and Tracks tables: dsa_questions, problem_tags, submissions, recommendations, user_problem_status, system_design_questions, system_design_submissions, behavioral_questions, pm_questions, aiml_questions, roadmaps, roadmap_topics, roadmap_items

Revision ID: 002_dsa_and_tracks_schema
Revises: 001_initial_schema
Create Date: 2026-10-03 13:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_dsa_and_tracks_schema"
down_revision: str | Sequence[str] | None = "001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. dsa_questions
    op.create_table(
        "dsa_questions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("difficulty", sa.String(length=50), nullable=False),
        sa.Column("function_name", sa.String(length=100), nullable=False, server_default="solution"),
        sa.Column("python_starter_code", sa.Text(), nullable=True),
        sa.Column("cpp_starter_code", sa.Text(), nullable=True),
        sa.Column("cpp_test_harness", sa.Text(), nullable=True),
        sa.Column("test_cases", sa.Text(), nullable=False),
        sa.Column("hints", sa.Text(), nullable=True),
        sa.Column("optimal_time_complexity", sa.String(length=50), nullable=True),
        sa.Column("optimal_space_complexity", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dsa_questions_id"), "dsa_questions", ["id"], unique=False)
    op.create_index(op.f("ix_dsa_questions_title"), "dsa_questions", ["title"], unique=False)
    op.create_index(op.f("ix_dsa_questions_slug"), "dsa_questions", ["slug"], unique=False)
    op.create_index(op.f("ix_dsa_questions_difficulty"), "dsa_questions", ["difficulty"], unique=False)

    # 2. problem_tags
    op.create_table(
        "problem_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("tag_name", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["dsa_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_problem_tags_id"), "problem_tags", ["id"], unique=False)
    op.create_index(op.f("ix_problem_tags_question_id"), "problem_tags", ["question_id"], unique=False)
    op.create_index(op.f("ix_problem_tags_tag_name"), "problem_tags", ["tag_name"], unique=False)

    # 3. submissions
    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("is_submission", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("execution_time_ms", sa.Float(), nullable=True),
        sa.Column("memory_used_kb", sa.Float(), nullable=True),
        sa.Column("passed_tests", sa.Integer(), nullable=True),
        sa.Column("total_tests", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["question_id"], ["dsa_questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_submissions_id"), "submissions", ["id"], unique=False)
    op.create_index(op.f("ix_submissions_session_id"), "submissions", ["session_id"], unique=False)
    op.create_index(op.f("ix_submissions_user_id"), "submissions", ["user_id"], unique=False)
    op.create_index(op.f("ix_submissions_question_id"), "submissions", ["question_id"], unique=False)
    op.create_index("ix_submissions_session_question", "submissions", ["session_id", "question_id"], unique=False)
    op.create_index("ix_submissions_user_question", "submissions", ["user_id", "question_id"], unique=False)

    # 4. recommendations
    op.create_table(
        "recommendations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["question_id"], ["dsa_questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recommendations_id"), "recommendations", ["id"], unique=False)
    op.create_index(op.f("ix_recommendations_session_id"), "recommendations", ["session_id"], unique=False)
    op.create_index(op.f("ix_recommendations_user_id"), "recommendations", ["user_id"], unique=False)

    # 5. user_problem_status
    op.create_table(
        "user_problem_status",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column(
            "last_attempted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("best_runtime_ms", sa.Float(), nullable=True),
        sa.Column("best_memory_kb", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["question_id"], ["dsa_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_problem_status_id"), "user_problem_status", ["id"], unique=False)
    op.create_index(op.f("ix_user_problem_status_user_id"), "user_problem_status", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_problem_status_question_id"), "user_problem_status", ["question_id"], unique=False)
    op.create_index("ix_user_problem_status_user_question", "user_problem_status", ["user_id", "question_id"], unique=False)

    # 6. system_design_questions
    op.create_table(
        "system_design_questions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("domain", sa.String(length=100), nullable=True),
        sa.Column("role", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_system_design_questions_id"), "system_design_questions", ["id"], unique=False)
    op.create_index(op.f("ix_system_design_questions_title"), "system_design_questions", ["title"], unique=False)
    op.create_index(op.f("ix_system_design_questions_domain"), "system_design_questions", ["domain"], unique=False)
    op.create_index(op.f("ix_system_design_questions_role"), "system_design_questions", ["role"], unique=False)

    # 7. system_design_submissions
    op.create_table(
        "system_design_submissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=True),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("score", sa.Integer(), server_default="0", nullable=False),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("strengths", sa.Text(), nullable=True),
        sa.Column("improvements", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["question_id"], ["system_design_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_system_design_submissions_id"), "system_design_submissions", ["id"], unique=False)
    op.create_index(op.f("ix_system_design_submissions_question_id"), "system_design_submissions", ["question_id"], unique=False)
    op.create_index(op.f("ix_system_design_submissions_user_id"), "system_design_submissions", ["user_id"], unique=False)

    # 8. behavioral_questions
    op.create_table(
        "behavioral_questions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_behavioral_questions_id"), "behavioral_questions", ["id"], unique=False)
    op.create_index(op.f("ix_behavioral_questions_title"), "behavioral_questions", ["title"], unique=False)
    op.create_index(op.f("ix_behavioral_questions_category"), "behavioral_questions", ["category"], unique=False)

    # 9. pm_questions
    op.create_table(
        "pm_questions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pm_questions_id"), "pm_questions", ["id"], unique=False)
    op.create_index(op.f("ix_pm_questions_title"), "pm_questions", ["title"], unique=False)
    op.create_index(op.f("ix_pm_questions_category"), "pm_questions", ["category"], unique=False)

    # 10. aiml_questions
    op.create_table(
        "aiml_questions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("domain", sa.String(length=100), nullable=True),
        sa.Column("role", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_aiml_questions_id"), "aiml_questions", ["id"], unique=False)
    op.create_index(op.f("ix_aiml_questions_domain"), "aiml_questions", ["domain"], unique=False)
    op.create_index(op.f("ix_aiml_questions_role"), "aiml_questions", ["role"], unique=False)

    # 11. roadmaps
    op.create_table(
        "roadmaps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=True),
        sa.Column("is_general", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roadmaps_id"), "roadmaps", ["id"], unique=False)
    op.create_index(op.f("ix_roadmaps_user_id"), "roadmaps", ["user_id"], unique=False)

    # 12. roadmap_topics
    op.create_table(
        "roadmap_topics",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("roadmap_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("order_index", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["roadmap_id"], ["roadmaps.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roadmap_topics_id"), "roadmap_topics", ["id"], unique=False)
    op.create_index(op.f("ix_roadmap_topics_roadmap_id"), "roadmap_topics", ["roadmap_id"], unique=False)

    # 13. roadmap_items
    op.create_table(
        "roadmap_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=50), server_default="custom", nullable=False),
        sa.Column("estimated_minutes", sa.Integer(), server_default="30", nullable=False),
        sa.Column("content_id", sa.String(length=255), nullable=True),
        sa.Column("timeline_days", sa.Integer(), nullable=True),
        sa.Column("is_completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["topic_id"], ["roadmap_topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roadmap_items_id"), "roadmap_items", ["id"], unique=False)
    op.create_index(op.f("ix_roadmap_items_topic_id"), "roadmap_items", ["topic_id"], unique=False)


def downgrade() -> None:
    op.drop_table("roadmap_items")
    op.drop_table("roadmap_topics")
    op.drop_table("roadmaps")
    op.drop_table("aiml_questions")
    op.drop_table("pm_questions")
    op.drop_table("behavioral_questions")
    op.drop_table("system_design_submissions")
    op.drop_table("system_design_questions")
    op.drop_table("user_problem_status")
    op.drop_table("recommendations")
    op.drop_table("submissions")
    op.drop_table("problem_tags")
    op.drop_table("dsa_questions")
