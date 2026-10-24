import asyncio
import logging
from pathlib import Path
import sys

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.core.database import engine, Base

# Import all models to register with Base.metadata
import app.modules.auth.models  # noqa: F401
import app.modules.dsa.models  # noqa: F401
import app.modules.tracks.models  # noqa: F401
import app.modules.interview.models  # noqa: F401
import app.modules.chat.models  # noqa: F401
import app.modules.analytics.models  # noqa: F401
import app.modules.admin.models  # noqa: F401

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("init_db")


async def init_tables():
    logger.info("Verifying and creating all database tables for ThinkAloudAI...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("All database tables verified and created successfully!")


if __name__ == "__main__":
    asyncio.run(init_tables())
