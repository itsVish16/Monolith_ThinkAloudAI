import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.config import settings
from app.core.database import Base, get_db_connect_args, get_normalized_db_url

# Import all models to register them with Base.metadata
from app.modules.auth.models import User, UserPreference, UserProfile  # noqa: F401

for mod in ["tracks", "dsa", "interview", "analytics"]:
    try:
        __import__(f"app.modules.{mod}.models")
    except (ImportError, AttributeError):
        pass
from app.modules.dsa.models import DSAQuestion, ProblemTag, CodeSubmission, Recommendation, UserProblemStatus  # noqa: F401
from app.modules.tracks.models import SystemDesignQuestion, SystemDesignSubmission, BehavioralQuestion, PMQuestion, AIMLQuestion, Roadmap, RoadmapTopic, RoadmapItem  # noqa: F401
from app.modules.interview.models import InterviewSession, InterviewQuestion, InterviewResponse, InterviewFeedback  # noqa: F401
from app.modules.analytics.models import UserStats, DailyActivity, UserSkillScore, LearningEvent  # noqa: F401
from app.modules.chat.models import ChatSession, ChatMessageModel  # noqa: F401
from app.modules.admin.models import Achievement, UserAchievement  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
db_url = get_normalized_db_url(settings.DATABASE_URL)
config.set_main_option("sqlalchemy.url", db_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Run sync migration commands inside a connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode with an async connection."""
    connect_args = get_db_connect_args(settings.DATABASE_URL)
    connectable = create_async_engine(
        db_url,
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
