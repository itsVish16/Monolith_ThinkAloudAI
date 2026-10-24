import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import select
from app.core.database import SessionLocal, engine, Base
import app.modules.auth.models  # noqa: F401
import app.modules.interview.models  # noqa: F401
import app.modules.chat.models  # noqa: F401
import app.modules.analytics.models  # noqa: F401
import app.modules.admin.models  # noqa: F401
from app.modules.dsa.models import DSAQuestion, ProblemTag, slugify
from app.modules.tracks.models import (
    AIMLQuestion,
    BehavioralQuestion,
    ContentType,
    PMQuestion,
    Roadmap,
    RoadmapItem,
    RoadmapTopic,
    SystemDesignQuestion,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seeder")


async def ensure_tables_exist():
    """Creates database tables for registered ORM models if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified.")


async def seed_dsa_questions(db) -> tuple[int, int]:
    json_path = BASE_DIR / "data" / "canonical_dsa_questions.json"
    if not json_path.exists():
        logger.warning(f"File {json_path} not found. Skipping DSA questions seed.")
        return 0, 0

    with open(json_path, "r", encoding="utf-8") as f:
        questions_data = json.load(f)

    inserted, updated = 0, 0
    for data in questions_data:
        title = data.get("title")
        if not title:
            continue
        try:
            tags = data.pop("tags", [])
            result = await db.execute(select(DSAQuestion).filter(DSAQuestion.title == title))
            existing_q = result.scalars().first()

            computed_slug = slugify(title)
            hints_val = data.get("hints")
            if isinstance(hints_val, list):
                hints_val = json.dumps(hints_val)
            test_cases_val = data.get("test_cases")
            if isinstance(test_cases_val, dict):
                test_cases_val = json.dumps(test_cases_val)

            if existing_q:
                existing_q.slug = computed_slug
                existing_q.description = data.get("description", existing_q.description)
                existing_q.difficulty = data.get("difficulty", existing_q.difficulty)
                existing_q.function_name = data.get("function_name", existing_q.function_name)
                existing_q.python_starter_code = data.get("python_starter_code", existing_q.python_starter_code)
                existing_q.cpp_starter_code = data.get("cpp_starter_code", existing_q.cpp_starter_code)
                existing_q.cpp_test_harness = data.get("cpp_test_harness", existing_q.cpp_test_harness)
                existing_q.test_cases = test_cases_val if test_cases_val is not None else existing_q.test_cases
                existing_q.hints = hints_val if hints_val is not None else existing_q.hints
                existing_q.optimal_time_complexity = data.get("optimal_time_complexity", existing_q.optimal_time_complexity)
                existing_q.optimal_space_complexity = data.get("optimal_space_complexity", existing_q.optimal_space_complexity)
                q_id = existing_q.id
                updated += 1
            else:
                data["slug"] = computed_slug
                if hints_val is not None:
                    data["hints"] = hints_val
                if test_cases_val is not None:
                    data["test_cases"] = test_cases_val
                new_q = DSAQuestion(**data)
                db.add(new_q)
                await db.flush()
                q_id = new_q.id
                inserted += 1

            if tags:
                existing_tags_res = await db.execute(
                    select(ProblemTag).filter(ProblemTag.question_id == q_id)
                )
                existing_tags = {t.tag_name for t in existing_tags_res.scalars().all()}
                for tag_name in tags:
                    if tag_name not in existing_tags:
                        db.add(ProblemTag(question_id=q_id, tag_name=tag_name))

        except Exception as ex:
            logger.error(f"Error seeding DSA item '{title}': {ex}")

    await db.commit()
    logger.info(f"✅ Canonical DSA Questions: {inserted} inserted, {updated} updated.")
    return inserted, updated


async def seed_system_design_questions(db) -> tuple[int, int]:
    json_path = BASE_DIR / "data" / "canonical_system_design_questions.json"
    if not json_path.exists():
        logger.warning(f"File {json_path} not found. Skipping System Design questions seed.")
        return 0, 0

    with open(json_path, "r", encoding="utf-8") as f:
        topics = json.load(f)

    inserted, updated = 0, 0
    for topic in topics:
        title = topic.get("title")
        if not title:
            continue
        try:
            res = await db.execute(
                select(SystemDesignQuestion).filter(SystemDesignQuestion.title == title)
            )
            existing_q = res.scalars().first()

            if existing_q:
                existing_q.description = topic.get("description", existing_q.description)
                existing_q.domain = topic.get("domain", existing_q.domain)
                existing_q.role = topic.get("role", existing_q.role)
                updated += 1
            else:
                new_q = SystemDesignQuestion(
                    title=title,
                    description=topic.get("description", ""),
                    domain=topic.get("domain"),
                    role=topic.get("role"),
                )
                db.add(new_q)
                inserted += 1
        except Exception as ex:
            logger.error(f"Error seeding System Design question '{title}': {ex}")

    await db.commit()
    logger.info(f"✅ Canonical System Design Questions: {inserted} inserted, {updated} updated.")
    return inserted, updated


async def seed_behavioral_questions(db) -> tuple[int, int]:
    json_path = BASE_DIR / "data" / "canonical_behavioral_questions.json"
    if not json_path.exists():
        logger.warning(f"File {json_path} not found. Skipping Behavioral questions seed.")
        return 0, 0

    with open(json_path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    inserted, updated = 0, 0
    for item in questions:
        title = item.get("title")
        if not title:
            continue
        try:
            res = await db.execute(
                select(BehavioralQuestion).filter(BehavioralQuestion.title == title)
            )
            existing = res.scalars().first()
            if existing:
                existing.description = item.get("description", existing.description)
                existing.category = item.get("category", existing.category)
                updated += 1
            else:
                db.add(BehavioralQuestion(**item))
                inserted += 1
        except Exception as ex:
            logger.error(f"Error seeding Behavioral question '{title}': {ex}")

    await db.commit()
    logger.info(f"✅ Behavioral Questions: {inserted} inserted, {updated} updated.")
    return inserted, updated


async def seed_pm_questions(db) -> tuple[int, int]:
    json_path = BASE_DIR / "data" / "canonical_pm_questions.json"
    if not json_path.exists():
        logger.warning(f"File {json_path} not found. Skipping PM questions seed.")
        return 0, 0

    with open(json_path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    inserted, updated = 0, 0
    for item in questions:
        title = item.get("title")
        if not title:
            continue
        try:
            res = await db.execute(select(PMQuestion).filter(PMQuestion.title == title))
            existing = res.scalars().first()
            if existing:
                existing.description = item.get("description", existing.description)
                existing.category = item.get("category", existing.category)
                updated += 1
            else:
                db.add(PMQuestion(**item))
                inserted += 1
        except Exception as ex:
            logger.error(f"Error seeding PM question '{title}': {ex}")

    await db.commit()
    logger.info(f"✅ Product Management Questions: {inserted} inserted, {updated} updated.")
    return inserted, updated


async def seed_aiml_questions(db) -> tuple[int, int]:
    json_path = BASE_DIR / "data" / "canonical_aiml_questions.json"
    if not json_path.exists():
        logger.warning(f"File {json_path} not found. Skipping AIML questions seed.")
        return 0, 0

    with open(json_path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    inserted, updated = 0, 0
    for item in questions:
        title = item.get("title")
        if not title:
            continue
        try:
            res = await db.execute(select(AIMLQuestion).filter(AIMLQuestion.title == title))
            existing = res.scalars().first()
            if existing:
                existing.description = item.get("description", existing.description)
                existing.domain = item.get("domain", existing.domain)
                existing.role = item.get("role", existing.role)
                updated += 1
            else:
                db.add(AIMLQuestion(**item))
                inserted += 1
        except Exception as ex:
            logger.error(f"Error seeding AI/ML question '{title}': {ex}")

    await db.commit()
    logger.info(f"✅ AI/ML Questions: {inserted} inserted, {updated} updated.")
    return inserted, updated


async def seed_general_roadmaps(db) -> int:
    """Seeds canonical structured interview preparation roadmaps."""
    roadmap_title = "FAANG & Top Tech Software Engineering Interview Roadmap"
    res = await db.execute(select(Roadmap).filter(Roadmap.title == roadmap_title))
    if res.scalars().first():
        logger.info("ℹ️ General Tech Interview Roadmap already exists.")
        return 0

    roadmap = Roadmap(
        is_general=True,
        title=roadmap_title,
        description="Comprehensive 6-week curriculum covering Core DSA, Distributed Systems Architecture, and Behavioral Mastery.",
    )
    db.add(roadmap)
    await db.flush()

    topics_data = [
        {
            "title": "Phase 1: High-Frequency Data Structures & Algorithms",
            "order_index": 1,
            "items": [
                {"title": "Two Sum & Hash Map Mastery", "content_type": "dsa", "estimated_minutes": 30, "timeline_days": 1},
                {"title": "Valid Anagram & Group Anagrams", "content_type": "dsa", "estimated_minutes": 30, "timeline_days": 2},
                {"title": "Longest Substring Without Repeating Characters", "content_type": "dsa", "estimated_minutes": 45, "timeline_days": 3},
                {"title": "3Sum & Two Pointer Patterns", "content_type": "dsa", "estimated_minutes": 45, "timeline_days": 4},
                {"title": "Merge Intervals & Interval Scheduling", "content_type": "dsa", "estimated_minutes": 45, "timeline_days": 5},
            ],
        },
        {
            "title": "Phase 2: Scalable Distributed Systems Architecture",
            "order_index": 2,
            "items": [
                {"title": "Design a Distributed Rate Limiter (Token Bucket / Sliding Window)", "content_type": "system_design", "estimated_minutes": 60, "timeline_days": 8},
                {"title": "Design a URL Shortener (Bitly - Base62 Encoding & Sharding)", "content_type": "system_design", "estimated_minutes": 60, "timeline_days": 10},
                {"title": "Design Real-Time Chat Architecture (WebSocket & Message Queues)", "content_type": "system_design", "estimated_minutes": 75, "timeline_days": 12},
                {"title": "Design Distributed Cache (Redis Cluster & Cache Aside / Write-Back)", "content_type": "system_design", "estimated_minutes": 60, "timeline_days": 14},
            ],
        },
        {
            "title": "Phase 3: Senior Leadership & Behavioral Competencies",
            "order_index": 3,
            "items": [
                {"title": "Handling Critical Production Outages Under Pressure", "content_type": "behavioral", "estimated_minutes": 30, "timeline_days": 16},
                {"title": "Resolving Technical Disagreements with Architecture Leads", "content_type": "behavioral", "estimated_minutes": 30, "timeline_days": 18},
                {"title": "Navigating Ambiguous Requirements and Scoping MVPs", "content_type": "behavioral", "estimated_minutes": 30, "timeline_days": 20},
            ],
        },
    ]

    for topic_data in topics_data:
        topic = RoadmapTopic(
            roadmap_id=roadmap.id,
            title=topic_data["title"],
            order_index=topic_data["order_index"],
        )
        db.add(topic)
        await db.flush()

        for item_data in topic_data["items"]:
            item = RoadmapItem(
                topic_id=topic.id,
                title=item_data["title"],
                content_type=item_data["content_type"],
                estimated_minutes=item_data["estimated_minutes"],
                timeline_days=item_data["timeline_days"],
                is_completed=False,
            )
            db.add(item)

    await db.commit()
    logger.info("✅ Canonical General Interview Roadmap Seeded.")
    return 1


async def seed_all():
    logger.info("🚀 Starting database seeding for ThinkAloudAI Monolith...")
    await ensure_tables_exist()

    async with SessionLocal() as db:
        await seed_dsa_questions(db)
        await seed_system_design_questions(db)
        await seed_behavioral_questions(db)
        await seed_pm_questions(db)
        await seed_aiml_questions(db)
        await seed_general_roadmaps(db)

    # Invalidate Redis question caches if client available
    try:
        from app.core.redis import get_redis
        redis = await get_redis()
        keys = await redis.keys("dsa:questions:*")
        if keys:
            await redis.delete(*keys)
            logger.info(f"🧹 Purged {len(keys)} Redis DSA cache keys.")
    except Exception as e:
        logger.warning(f"Notice: Redis cache invalidation skipped ({e})")

    logger.info("🎉 Database seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed_all())
