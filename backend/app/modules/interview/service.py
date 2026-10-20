import contextlib
import json
import re
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.modules.dsa.models import DSAQuestion, slugify
from app.modules.interview.models import (
    InterviewFeedback,
    InterviewSession,
)
from app.modules.interview.schemas import CreateSessionRequest
from app.modules.tracks.models import (
    AIMLQuestion,
    BehavioralQuestion,
    PMQuestion,
    SystemDesignQuestion,
)

logger = structlog.get_logger(__name__)

# Base and canonical data directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = BASE_DIR / "data"


def _load_canonical_data(filename: str) -> list[dict[str, Any]]:
    path = DATA_DIR / filename
    if not path.exists():
        alt_path = Path.cwd() / "data" / filename
        if alt_path.exists():
            path = alt_path
    if path.exists():
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("canonical_json_load_failed", filename=filename, error=str(e))
    return []


# Attempt to load LiveKit API
try:
    from livekit.api import AccessToken, VideoGrants
except ImportError:
    try:
        from livekit.api import AccessToken  # type: ignore
        from livekit.api import VideoGrant as VideoGrants
    except ImportError:
        AccessToken = None  # type: ignore
        VideoGrants = None  # type: ignore


class InterviewService:
    @staticmethod
    def generate_token(
        identity: str,
        room_name: str,
        user_id: int | str = "guest_user",
        interview_type: str = "general",
        ai_selected_questions: list[dict[str, Any]] | None = None,
        candidate_name: str | None = None,
    ) -> str:
        """
        Generates a secure LiveKit WebRTC Access Token with embedded candidate metadata.
        Uses settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET.
        """
        api_key = settings.LIVEKIT_API_KEY or "devkey"
        api_secret = settings.LIVEKIT_API_SECRET or "secret"

        display_name = candidate_name or identity

        # Prevent duplicate participant collisions:
        # Generate unique identity user_{user_id}_{room_prefix} if raw identity passed
        unique_identity = identity
        if not identity.startswith("user_") and user_id is not None:
            room_prefix = str(room_name)[:8]
            unique_identity = f"user_{user_id}_{room_prefix}"

        if AccessToken is not None and VideoGrants is not None:
            token = AccessToken(
                api_key=api_key,
                api_secret=api_secret,
            )

            grants = VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
            with contextlib.suppress(Exception):
                grants.name = display_name

            token.with_identity(unique_identity)
            token.with_name(display_name)
            token.with_grants(grants)

            metadata = json.dumps({
                "candidate_name": display_name,
                "user_id": str(user_id),
                "interview_type": interview_type,
                "ai_selected_questions": ai_selected_questions or [],
            })
            token.with_metadata(metadata)
            return token.to_jwt()

        # Fallback dummy JWT in minimal test/mock environments where livekit-api is absent
        logger.warning("livekit_api_sdk_not_available_using_mock_token")
        return f"mock_livekit_token_{uuid.uuid4().hex}"

    @staticmethod
    def clean_display_name(raw_name: str | None) -> str:
        """Cleans and standardizes candidate display name."""
        if not raw_name:
            return "Candidate"
        raw_name = str(raw_name).strip()
        if "@" in raw_name:
            raw_name = raw_name.split("@")[0]
        cleaned = re.sub(r"\d+", "", raw_name).strip()
        cleaned = re.sub(r"[._\-+]+", " ", cleaned).strip()
        cleaned = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned)
        cleaned = cleaned.title().strip()
        return cleaned or "Candidate"

    @staticmethod
    def compute_domain_weighted_score(
        interview_type: str | None,
        tech: float | None,
        comm: float | None,
        eng: float | None,
        detailed_metrics: dict[str, Any] | None = None,
    ) -> int:
        """
        Calculates rubric score weighted by interview track.
        Normalizes any 0-10 scale component or overall score to standard 0-100 scale
        and clamps result to [0, 100].
        """
        if detailed_metrics and isinstance(detailed_metrics, dict) and detailed_metrics.get("overall_score") is not None:
            try:
                score = float(detailed_metrics["overall_score"])
                if 0 < score <= 10.0:
                    score = score * 10.0
                return min(100, max(0, round(score)))
            except (ValueError, TypeError):
                pass

        t = float(tech or 0)
        c = float(comm or 0)
        e = float(eng or 0)

        # Scale 0-10 to 0-100 if detected
        if 0 < t <= 10.0:
            t = t * 10.0
        if 0 < c <= 10.0:
            c = c * 10.0
        if 0 < e <= 10.0:
            e = e * 10.0

        t = min(100.0, max(0.0, t))
        c = min(100.0, max(0.0, c))
        e = min(100.0, max(0.0, e))

        i_type_clean = (interview_type or "").lower()

        if any(k in i_type_clean for k in ["dsa", "swe", "coding"]):
            raw = 0.60 * t + 0.25 * c + 0.15 * e
        elif any(k in i_type_clean for k in ["system_design", "sd"]):
            raw = 0.55 * t + 0.30 * c + 0.15 * e
        elif any(k in i_type_clean for k in ["behavioral", "hr"]):
            raw = 0.20 * t + 0.70 * c + 0.10 * e
        elif any(k in i_type_clean for k in ["pm", "product"]):
            raw = 0.55 * t + 0.35 * c + 0.10 * e
        elif any(k in i_type_clean for k in ["ai", "ml"]):
            raw = 0.60 * t + 0.25 * c + 0.15 * e
        else:
            raw = 0.40 * t + 0.40 * c + 0.20 * e

        return min(100, max(0, round(raw)))

    @staticmethod
    def clean_transcript(raw_messages: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        """
        Strips internal prompt instructions, visual tags, and system markers
        from candidate conversation messages.
        """
        if not raw_messages:
            return []

        cleaned: list[dict[str, Any]] = []
        for msg in raw_messages:
            if msg.get("role") == "system":
                continue
            content = str(msg.get("content", ""))
            content = re.sub(r"\[Candidate Visual Observation:.*?\]\s*", "", content)
            content = re.sub(r"\[Candidate Whiteboard Observation:.*?\]\s*", "", content)
            content = re.sub(r"\[Candidate says:\s*", "", content)
            content = re.sub(r"\[SYSTEM:.*?\]\s*", "", content)
            content = content.strip()
            if content:
                cleaned.append({
                    "role": msg.get("role", "assistant"),
                    "content": content,
                })
        return cleaned

    @classmethod
    def _format_dsa_question(cls, q: Any, fallback_id: int = 1) -> dict[str, Any]:
        if isinstance(q, DSAQuestion):
            q_id = q.id
            title = q.title
            slug = q.slug or slugify(title)
            difficulty = q.difficulty
            description = q.description
            test_cases = q.test_cases
            py_code = q.python_starter_code or "class Solution:\n    def solution(self):\n        pass"
            cpp_code = q.cpp_starter_code or ""
            hints = q.hints
            fn_name = q.function_name or "solution"
            opt_time = q.optimal_time_complexity or "O(N)"
            opt_space = q.optimal_space_complexity or "O(1)"
        else:
            q_id = q.get("id") or fallback_id
            title = q.get("title", "DSA Coding Problem")
            slug = q.get("slug") or slugify(title)
            difficulty = q.get("difficulty", "Medium")
            description = q.get("description", "")
            test_cases = q.get("test_cases", "[]")
            py_code = q.get("python_starter_code") or "class Solution:\n    def solution(self):\n        pass"
            cpp_code = q.get("cpp_starter_code") or ""
            hints = q.get("hints")
            fn_name = q.get("function_name", "solution")
            opt_time = q.get("optimal_time_complexity", "O(N)")
            opt_space = q.get("optimal_space_complexity", "O(1)")

        if isinstance(test_cases, (dict, list)):
            test_cases = json.dumps(test_cases)
        if isinstance(hints, (dict, list)):
            hints = json.dumps(hints)

        return {
            "id": q_id,
            "title": title,
            "slug": slug,
            "difficulty": difficulty,
            "description": description,
            "test_cases": test_cases,
            "starter_code": py_code,
            "python_starter_code": py_code,
            "cpp_starter_code": cpp_code,
            "hints": hints,
            "function_name": fn_name,
            "optimal_time_complexity": opt_time,
            "optimal_space_complexity": opt_space,
        }

    @classmethod
    async def _resolve_dsa_questions(
        cls,
        db: AsyncSession,
        difficulty: str | None,
        question_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        target_diff = (difficulty or "Medium").capitalize()
        selected: list[dict[str, Any]] = []

        # 1. If explicit question_ids provided
        if question_ids:
            int_ids: list[int] = []
            str_ids: list[str] = []
            for q in question_ids:
                s = str(q).strip()
                if s.isdigit():
                    int_ids.append(int(s))
                else:
                    str_ids.append(s.lower())

            # Try DB lookup first
            try:
                conds = []
                if int_ids:
                    conds.append(DSAQuestion.id.in_(int_ids))
                if str_ids:
                    conds.append(func.lower(DSAQuestion.slug).in_(str_ids))
                    conds.append(func.lower(DSAQuestion.title).in_(str_ids))
                if conds:
                    stmt = select(DSAQuestion).where(or_(*conds))
                    res = await db.execute(stmt)
                    for item in res.scalars().all():
                        selected.append(cls._format_dsa_question(item))
            except Exception as e:
                logger.warning("dsa_db_query_failed", error=str(e))

            # If not all found in DB, check canonical JSON
            found_ids = {str(q["id"]) for q in selected} | {str(q.get("slug", "")).lower() for q in selected}
            canonical_items = _load_canonical_data("canonical_dsa_questions.json")
            for idx, item in enumerate(canonical_items, start=1):
                item_slug = (item.get("slug") or slugify(item.get("title", ""))).lower()
                item_title = item.get("title", "").lower()
                if (
                    str(idx) not in found_ids
                    and item_slug not in found_ids
                    and (
                        idx in int_ids
                        or str(idx) in question_ids
                        or item_slug in str_ids
                        or item_title in str_ids
                    )
                ):
                    selected.append(cls._format_dsa_question(item, fallback_id=idx))
                    found_ids.add(str(idx))
                    found_ids.add(item_slug)

            if selected:
                return selected

        # 2. Pick 1 problem by difficulty from DB
        try:
            stmt = (
                select(DSAQuestion)
                .where(func.lower(DSAQuestion.difficulty) == target_diff.lower())
                .limit(1)
            )
            res = await db.execute(stmt)
            for item in res.scalars().all():
                selected.append(cls._format_dsa_question(item))

            if not selected:
                stmt_any = select(DSAQuestion).limit(1)
                res_any = await db.execute(stmt_any)
                for item in res_any.scalars().all():
                    selected.append(cls._format_dsa_question(item))
        except Exception as e:
            logger.warning("dsa_db_difficulty_query_failed", error=str(e))

        if selected:
            return selected

        # 3. Fallback to canonical JSON
        canonical_items = _load_canonical_data("canonical_dsa_questions.json")
        matching = [
            (idx, item) for idx, item in enumerate(canonical_items, start=1)
            if item.get("difficulty", "").lower() == target_diff.lower()
        ]
        if not matching:
            matching = list(enumerate(canonical_items, start=1))

        for idx, item in matching[:1]:
            selected.append(cls._format_dsa_question(item, fallback_id=idx))

        # 4. Ultimate safety fallback
        if not selected:
            selected.append({
                "id": 1,
                "title": "Two Sum",
                "slug": "two-sum",
                "difficulty": target_diff,
                "description": "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.",
                "test_cases": json.dumps([
                    {"args": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
                    {"args": {"nums": [3, 2, 4], "target": 6}, "expected": [1, 2]},
                ]),
                "starter_code": "class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        pass",
                "python_starter_code": "class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        pass",
                "cpp_starter_code": "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        return {};\n    }\n};",
                "hints": "[\"Use a hash map to look up the complement in O(1) time.\"]",
                "function_name": "twoSum",
                "optimal_time_complexity": "O(N)",
                "optimal_space_complexity": "O(N)",
            })

        return selected

    @classmethod
    def _format_system_design_question(
        cls,
        q: Any,
        fallback_id: int = 1,
        default_difficulty: str = "Medium",
    ) -> dict[str, Any]:
        if isinstance(q, SystemDesignQuestion):
            q_id = q.id
            title = q.title
            description = q.description
            domain = q.domain or "Distributed Systems & Storage"
            role = q.role or "Senior Software Engineer"
        else:
            q_id = q.get("id") or fallback_id
            title = q.get("title", "Design a Distributed System")
            description = q.get("description", "")
            domain = q.get("domain", "Distributed Systems & Storage")
            role = q.get("role", "Senior Software Engineer")

        return {
            "id": q_id,
            "title": title,
            "difficulty": default_difficulty,
            "description": description,
            "domain": domain,
            "role": role,
            "architecture_requirements": [
                "Functional and non-functional requirements scoping",
                "High availability, fault tolerance, and data durability",
                "Scalable data model, API design, and storage partitioning",
                "Latency optimization, caching, and network bandwidth considerations",
            ],
        }

    @classmethod
    async def _resolve_system_design_questions(
        cls,
        db: AsyncSession,
        difficulty: str | None,
        question_ids: list[str] | None = None,
        domain: str | None = None,
        role: str | None = None,
    ) -> list[dict[str, Any]]:
        target_diff = difficulty or "Medium"
        selected: list[dict[str, Any]] = []

        if question_ids:
            int_ids = [int(q) for q in question_ids if str(q).isdigit()]
            str_ids = [str(q).lower() for q in question_ids]
            try:
                conds = []
                if int_ids:
                    conds.append(SystemDesignQuestion.id.in_(int_ids))
                if str_ids:
                    conds.append(func.lower(SystemDesignQuestion.title).in_(str_ids))
                if conds:
                    stmt = select(SystemDesignQuestion).where(or_(*conds))
                    res = await db.execute(stmt)
                    for item in res.scalars().all():
                        selected.append(cls._format_system_design_question(item, default_difficulty=target_diff))
            except Exception as e:
                logger.warning("sd_db_query_failed", error=str(e))

            if not selected:
                canonical_items = _load_canonical_data("canonical_system_design_questions.json")
                for idx, item in enumerate(canonical_items, start=1):
                    item_title = item.get("title", "").lower()
                    if idx in int_ids or str(idx) in question_ids or any(s in item_title for s in str_ids):
                        selected.append(cls._format_system_design_question(item, fallback_id=idx, default_difficulty=target_diff))
                        break

            if selected:
                return selected

        # Query DB if domain or default
        try:
            conds = []
            if domain:
                conds.append(func.lower(SystemDesignQuestion.domain).like(f"%{domain.lower()}%"))
            stmt = select(SystemDesignQuestion)
            if conds:
                stmt = stmt.where(*conds)
            stmt = stmt.limit(1)
            res = await db.execute(stmt)
            item = res.scalars().first()
            if item:
                selected.append(cls._format_system_design_question(item, default_difficulty=target_diff))
        except Exception as e:
            logger.warning("sd_db_query_failed", error=str(e))

        if selected:
            return selected

        # Canonical System Design fallback
        canonical_items = _load_canonical_data("canonical_system_design_questions.json")
        matched_item = None
        fallback_idx = 1
        if domain:
            for idx, item in enumerate(canonical_items, start=1):
                if domain.lower() in (item.get("domain") or "").lower():
                    matched_item = item
                    fallback_idx = idx
                    break

        if not matched_item and canonical_items:
            # Canonical system design problems like URL Shortener or Rate Limiter
            for idx, item in enumerate(canonical_items, start=1):
                t = item.get("title", "").lower()
                if "url shortener" in t or "rate limiter" in t:
                    matched_item = item
                    fallback_idx = idx
                    break
            if not matched_item:
                matched_item = canonical_items[0]
                fallback_idx = 1

        if matched_item:
            selected.append(cls._format_system_design_question(matched_item, fallback_id=fallback_idx, default_difficulty=target_diff))

        if not selected:
            selected.append({
                "id": 1,
                "title": "Design a URL Shortener (TinyURL / Bit.ly)",
                "difficulty": target_diff,
                "description": "Design a globally distributed URL shortening service converting long URLs into compact 7-character aliases with ultra-fast HTTP redirects under 20ms.",
                "domain": domain or "Backend / Core Distributed Systems",
                "role": role or "Senior Software Engineer",
                "architecture_requirements": [
                    "High availability (99.999% uptime) - redirect reads must never fail",
                    "Ultra-low latency redirects (< 20ms at P99)",
                    "Data durability over a minimum 5-year retention lifecycle",
                    "Dedicated Key Generation Service (KGS) or Base62 collision-free scheme",
                ],
            })

        return selected

    @classmethod
    async def _resolve_behavioral_questions(
        cls,
        db: AsyncSession,
        difficulty: str | None,
        question_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        selected: list[dict[str, Any]] = []
        try:
            stmt = select(BehavioralQuestion).limit(1)
            res = await db.execute(stmt)
            for item in res.scalars().all():
                selected.append({
                    "id": item.id,
                    "title": item.title,
                    "difficulty": difficulty or "Medium",
                    "description": item.description,
                    "category": item.category or "Ownership & Crisis Management",
                    "rubric": [
                        "STAR method (Situation, Task, Action, Result)",
                        "Clear ownership and measurable business impact",
                        "Self-awareness and constructive reflection",
                    ],
                })
        except Exception as e:
            logger.warning("behavioral_db_query_failed", error=str(e))

        if not selected:
            canonical_items = _load_canonical_data("canonical_behavioral_questions.json")
            for idx, item in enumerate(canonical_items[:1], start=1):
                selected.append({
                    "id": idx,
                    "title": item.get("title", "Behavioral Question"),
                    "difficulty": difficulty or "Medium",
                    "description": item.get("description", ""),
                    "category": item.get("category", "Ownership & Crisis Management"),
                    "rubric": [
                        "STAR method (Situation, Task, Action, Result)",
                        "Clear ownership and measurable business impact",
                        "Self-awareness and constructive reflection",
                    ],
                })

        if not selected:
            selected.append({
                "id": 1,
                "title": "Handling Critical Production Outage Under Pressure",
                "difficulty": difficulty or "Medium",
                "description": "Tell me about a time when a critical system failed in production. Walk me through how you triaged the issue, communicated with stakeholders, coordinated the fix, and implemented preventive safeguards afterwards.",
                "category": "Ownership & Crisis Management",
                "rubric": [
                    "STAR method (Situation, Task, Action, Result)",
                    "Clear ownership and measurable business impact",
                    "Self-awareness and constructive reflection",
                ],
            })

        return selected

    @classmethod
    async def _resolve_pm_questions(
        cls,
        db: AsyncSession,
        difficulty: str | None,
        question_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        selected: list[dict[str, Any]] = []
        try:
            stmt = select(PMQuestion).limit(1)
            res = await db.execute(stmt)
            for item in res.scalars().all():
                selected.append({
                    "id": item.id,
                    "title": item.title,
                    "difficulty": difficulty or "Medium",
                    "description": item.description,
                    "category": item.category or "Product Sense & Design",
                    "framework": [
                        "User personas and empathy",
                        "Prioritization and trade-offs",
                        "North Star metrics and success measurement",
                    ],
                })
        except Exception as e:
            logger.warning("pm_db_query_failed", error=str(e))

        if not selected:
            canonical_items = _load_canonical_data("canonical_pm_questions.json")
            for idx, item in enumerate(canonical_items[:1], start=1):
                selected.append({
                    "id": idx,
                    "title": item.get("title", "Product Management Question"),
                    "difficulty": difficulty or "Medium",
                    "description": item.get("description", ""),
                    "category": item.get("category", "Product Sense & Design"),
                    "framework": [
                        "User personas and empathy",
                        "Prioritization and trade-offs",
                        "North Star metrics and success measurement",
                    ],
                })

        if not selected:
            selected.append({
                "id": 1,
                "title": "Design a New Feature for Spotify to Improve Social Discovery",
                "difficulty": difficulty or "Medium",
                "description": "How would you design a social music discovery feature for Spotify? Walk through user personas, pain points, core user flows, monetization vs engagement trade-offs, and key North Star metrics.",
                "category": "Product Sense & Design",
                "framework": [
                    "User personas and empathy",
                    "Prioritization and trade-offs",
                    "North Star metrics and success measurement",
                ],
            })

        return selected

    @classmethod
    async def _resolve_aiml_questions(
        cls,
        db: AsyncSession,
        difficulty: str | None,
        question_ids: list[str] | None = None,
        domain: str | None = None,
        role: str | None = None,
    ) -> list[dict[str, Any]]:
        selected: list[dict[str, Any]] = []
        try:
            stmt = select(AIMLQuestion).limit(1)
            res = await db.execute(stmt)
            for item in res.scalars().all():
                selected.append({
                    "id": item.id,
                    "title": item.title,
                    "difficulty": difficulty or "Medium",
                    "description": item.description,
                    "domain": item.domain or domain or "Generative AI & LLMs",
                    "role": item.role or role or "AI Engineer",
                    "evaluation_criteria": [
                        "Theoretical depth & mathematical understanding",
                        "System architecture & real-world trade-offs",
                        "Production stability & inference efficiency",
                    ],
                })
        except Exception as e:
            logger.warning("aiml_db_query_failed", error=str(e))

        if not selected:
            canonical_items = _load_canonical_data("canonical_aiml_questions.json")
            for idx, item in enumerate(canonical_items[:1], start=1):
                selected.append({
                    "id": idx,
                    "title": item.get("title", "AI/ML Question"),
                    "difficulty": difficulty or "Medium",
                    "description": item.get("description", ""),
                    "domain": item.get("domain") or domain or "Generative AI & LLMs",
                    "role": item.get("role") or role or "AI Engineer",
                    "evaluation_criteria": [
                        "Theoretical depth & mathematical understanding",
                        "System architecture & real-world trade-offs",
                        "Production stability & inference efficiency",
                    ],
                })

        if not selected:
            selected.append({
                "id": 1,
                "title": "Fine-Tuning vs RAG Trade-offs for Enterprise LLM Applications",
                "difficulty": difficulty or "Medium",
                "description": "When should an enterprise choose LoRA / QLoRA fine-tuning versus Retrieval-Augmented Generation (RAG)? Discuss knowledge freshness, training costs, data privacy, latency constraints, and hallucination reduction.",
                "domain": domain or "Generative AI & LLMs",
                "role": role or "AI Engineer / LLM Specialist",
                "evaluation_criteria": [
                    "Theoretical depth & mathematical understanding",
                    "System architecture & real-world trade-offs",
                    "Production stability & inference efficiency",
                ],
            })

        return selected

    @classmethod
    async def resolve_questions(
        cls,
        db: AsyncSession,
        interview_type: str | None,
        difficulty: str | None = "Medium",
        question_ids: list[str] | None = None,
        domain: str | None = None,
        role: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Dynamically resolves valid interview questions based on the track, difficulty,
        and specified question IDs. Queries database tables first with automatic
        fallback to canonical JSON definitions in data/.
        """
        clean_type = (interview_type or "behavioral").lower().strip()

        if any(k in clean_type for k in ["dsa", "coding", "swe"]):
            return await cls._resolve_dsa_questions(db, difficulty, question_ids)
        elif any(k in clean_type for k in ["system_design", "sd", "system", "sys_design"]):
            return await cls._resolve_system_design_questions(db, difficulty, question_ids, domain, role)
        elif any(k in clean_type for k in ["pm", "product"]):
            return await cls._resolve_pm_questions(db, difficulty, question_ids)
        elif any(k in clean_type for k in ["ai", "ml", "aiml"]):
            return await cls._resolve_aiml_questions(db, difficulty, question_ids, domain, role)
        else:
            return await cls._resolve_behavioral_questions(db, difficulty, question_ids)

    @classmethod
    async def create_session(
        cls,
        db: AsyncSession,
        user_id: int,
        candidate_name: str,
        payload: CreateSessionRequest,
    ) -> InterviewSession:
        """
        Creates and persists a new InterviewSession directly linked to users.id.
        """
        session_id = payload.room_name or f"interview_{uuid.uuid4().hex[:12]}"
        candidate_display = cls.clean_display_name(candidate_name)

        difficulty_val = getattr(payload, "difficulty", None) or "Medium"
        question_ids_val = getattr(payload, "question_ids", None)
        domain_val = getattr(payload, "domain", None)
        role_val = getattr(payload, "role", None)
        custom_prompt_val = getattr(payload, "custom_prompt", None)
        interview_type_val = getattr(payload, "interview_type", "behavioral")

        selected_questions = await cls.resolve_questions(
            db=db,
            interview_type=interview_type_val,
            difficulty=difficulty_val,
            question_ids=question_ids_val,
            domain=domain_val,
            role=role_val,
        )

        initial_state = {
            "stage": "intro_audio_check",
            "messages": [],
            "candidate_name": candidate_display,
            "resume_summary": "",
            "evaluations": [],
            "start_time": time.time(),
            "max_duration_minutes": 50,
            "interview_type": interview_type_val,
            "latest_visual_context": None,
            "ai_selected_questions": selected_questions,
            "active_question_index": 0,
            "domain": domain_val,
            "role": role_val,
            "custom_prompt": custom_prompt_val,
        }

        now = datetime.now(UTC)
        session = InterviewSession(
            id=session_id,
            user_id=user_id,
            candidate_name=candidate_display,
            interview_type=interview_type_val,
            difficulty=difficulty_val,
            stage="intro_audio_check",
            state_data=initial_state,
            created_at=now,
            updated_at=now,
        )

        try:
            db.add(session)
            await db.commit()
            await db.refresh(session)
            return session
        except IntegrityError:
            await db.rollback()
            existing = await cls.get_session(db, session_id)
            if existing:
                return existing
            raise

    @classmethod
    async def get_session(
        cls,
        db: AsyncSession,
        session_id: str,
    ) -> InterviewSession | None:
        """Fetches an InterviewSession by session_id with joined feedback and questions."""
        stmt = (
            select(InterviewSession)
            .options(
                joinedload(InterviewSession.feedback),
                joinedload(InterviewSession.questions),
            )
            .where(InterviewSession.id == session_id)
        )
        result = await db.execute(stmt)
        return result.unique().scalar_one_or_none()

    @classmethod
    async def get_user_sessions(
        cls,
        db: AsyncSession,
        user_id: int,
        limit: int = 50,
    ) -> list[InterviewSession]:
        """Fetches all interview sessions for a specific user ordered chronologically descending."""
        stmt = (
            select(InterviewSession)
            .options(joinedload(InterviewSession.feedback))
            .where(InterviewSession.user_id == user_id)
            .order_by(InterviewSession.created_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.unique().scalars().all())

    @classmethod
    async def update_session_stage(
        cls,
        db: AsyncSession,
        session_id: str,
        stage: str,
        state_data: dict[str, Any] | None = None,
        difficulty: str | None = None,
    ) -> InterviewSession | None:
        """Updates the state machine stage and payload data for an active session."""
        session = await cls.get_session(db, session_id)
        if not session:
            return None

        session.stage = stage
        if stage == "completed":
            session.status = "completed"
        if state_data is not None:
            session.state_data = state_data
        if difficulty is not None:
            session.difficulty = difficulty
        session.updated_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(session)
        return session

    @classmethod
    async def complete_session(
        cls,
        db: AsyncSession,
        session_id: str,
        state_data: dict[str, Any] | None = None,
    ) -> InterviewSession | None:
        """Marks a session as permanently completed."""
        session = await cls.get_session(db, session_id)
        if not session:
            return None

        session.stage = "completed"
        session.status = "completed"
        if state_data is not None:
            session.state_data = state_data
        session.updated_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(session)
        return session

    @classmethod
    async def save_feedback(
        cls,
        db: AsyncSession,
        session_id: str,
        technical_score: int | None = None,
        communication_score: int | None = None,
        english_score: int | None = None,
        strengths: Any | None = None,
        weaknesses: Any | None = None,
        improvement_plan: Any | None = None,
        recommended_topics: Any | None = None,
        detailed_metrics: dict[str, Any] | None = None,
    ) -> InterviewFeedback:
        """
        Saves or updates feedback and rubric score analysis for a session.
        """
        session = await cls.get_session(db, session_id)
        interview_type = session.interview_type if session else "Behavioral"
        overall_score = cls.compute_domain_weighted_score(
            interview_type=interview_type,
            tech=float(technical_score) if technical_score is not None else None,
            comm=float(communication_score) if communication_score is not None else None,
            eng=float(english_score) if english_score is not None else None,
            detailed_metrics=detailed_metrics,
        )

        def serialize_text(val: Any) -> str | None:
            if val is None:
                return None
            if isinstance(val, (list, dict)):
                return json.dumps(val)
            return str(val)

        now = datetime.now(UTC)
        stmt = (
            pg_insert(InterviewFeedback)
            .values(
                id=str(uuid.uuid4()),
                session_id=session_id,
                technical_score=technical_score,
                communication_score=communication_score,
                english_score=english_score,
                overall_score=overall_score,
                strengths=serialize_text(strengths),
                weaknesses=serialize_text(weaknesses),
                improvement_plan=serialize_text(improvement_plan),
                recommended_topics=recommended_topics,
                detailed_metrics=detailed_metrics,
                created_at=now,
            )
            .on_conflict_do_update(
                index_elements=["session_id"],
                set_={
                    "technical_score": technical_score,
                    "communication_score": communication_score,
                    "english_score": english_score,
                    "overall_score": overall_score,
                    "strengths": serialize_text(strengths),
                    "weaknesses": serialize_text(weaknesses),
                    "improvement_plan": serialize_text(improvement_plan),
                    "recommended_topics": recommended_topics,
                    "detailed_metrics": detailed_metrics,
                },
            )
            .returning(InterviewFeedback)
        )

        result = await db.execute(stmt)
        await db.commit()
        return result.scalar_one()

    @classmethod
    async def get_session_feedback(
        cls,
        db: AsyncSession,
        session_id: str,
    ) -> InterviewFeedback | None:
        """Fetches rubric feedback for a given interview session."""
        stmt = select(InterviewFeedback).where(InterviewFeedback.session_id == session_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def get_guest_session_by_token(
        cls,
        db: AsyncSession,
        invite_token: str,
    ) -> InterviewSession | None:
        """Retrieves an InterviewSession by its unique URL-safe invite_token."""
        stmt = (
            select(InterviewSession)
            .options(
                joinedload(InterviewSession.feedback),
                joinedload(InterviewSession.questions),
            )
            .where(InterviewSession.invite_token == invite_token)
        )
        result = await db.execute(stmt)
        return result.unique().scalar_one_or_none()

    @staticmethod
    def _is_expired(expires_at: datetime | None) -> bool:
        if not expires_at:
            return False
        if expires_at.tzinfo is None:
            return expires_at < datetime.now(UTC).replace(tzinfo=None)
        return expires_at < datetime.now(UTC)

    @classmethod
    async def get_guest_invite_details(
        cls,
        db: AsyncSession,
        invite_token: str,
    ) -> dict[str, Any]:
        """Validates and retrieves public invitation details for guest candidate."""
        sess = await cls.get_guest_session_by_token(db, invite_token)
        if not sess:
            raise HTTPException(status_code=404, detail="Invitation link not found or invalid.")

        is_expired = bool(cls._is_expired(sess.invite_expires_at))
        is_completed = bool(sess.stage == "completed" or sess.status == "completed")
        is_cancelled = bool(sess.status == "cancelled")
        is_valid = bool(not is_expired and not is_cancelled and not is_completed)

        questions = (sess.state_data or {}).get("ai_selected_questions", []) if isinstance(sess.state_data, dict) else []
        if not questions and sess.questions:
            questions = [{"title": q.title, "difficulty": q.difficulty} for q in sess.questions]
        titles = [q.get("title", f"Question {i+1}") for i, q in enumerate(questions)] if isinstance(questions, list) else []

        return {
            "session_id": sess.id,
            "invite_token": sess.invite_token,
            "candidate_name": sess.candidate_name,
            "candidate_email": sess.candidate_email,
            "interview_type": sess.interview_type,
            "difficulty": sess.difficulty,
            "stage": sess.stage,
            "status": sess.status,
            "scheduled_at": sess.scheduled_at,
            "expires_at": sess.invite_expires_at,
            "is_valid": is_valid,
            "is_expired": is_expired,
            "is_completed": is_completed,
            "questions_count": len(questions) if isinstance(questions, list) else 0,
            "question_count": len(questions) if isinstance(questions, list) else 0,
            "question_titles": titles,
        }

    @classmethod
    async def join_guest_session(
        cls,
        db: AsyncSession,
        invite_token: str,
    ) -> dict[str, Any]:
        """Allows a guest candidate to directly join their interview room without logging in."""
        sess = await cls.get_guest_session_by_token(db, invite_token)
        if not sess:
            raise HTTPException(status_code=404, detail="Invitation link not found or invalid.")

        if sess.status == "cancelled":
            raise HTTPException(status_code=410, detail="This interview invitation has been cancelled by the administrator.")
        if cls._is_expired(sess.invite_expires_at):
            raise HTTPException(status_code=410, detail="This interview invitation link has expired.")
        if sess.status == "completed" or sess.stage == "completed":
            raise HTTPException(
                status_code=400,
                detail="This interview invitation has already been completed and cannot be reopened."
            )

        # If session is scheduled, mark it in_progress
        if sess.status == "scheduled":
            sess.status = "in_progress"
            if sess.stage in ("not_started", "idle"):
                sess.stage = "intro_audio_check"
            await db.commit()
            await db.refresh(sess)

        questions = (sess.state_data or {}).get("ai_selected_questions", []) if isinstance(sess.state_data, dict) else []
        if not questions and sess.questions:
            questions = [{"title": q.title, "difficulty": q.difficulty} for q in sess.questions]

        unique_identity = f"guest_{sess.id[:8]}_{uuid.uuid4().hex[:6]}"
        room_name = sess.id
        clean_name = cls.clean_display_name(sess.candidate_name)

        token = cls.generate_token(
            identity=unique_identity,
            room_name=room_name,
            user_id=sess.user_id or 0,
            interview_type=sess.interview_type,
            ai_selected_questions=questions,
            candidate_name=clean_name,
        )

        livekit_url = settings.LIVEKIT_URL or "wss://livekit.thinkaloudai.tech"

        return {
            "token": token,
            "url": livekit_url,
            "room_name": room_name,
            "roomName": room_name,
            "candidate": clean_name,
            "candidate_name": clean_name,
            "session_id": sess.id,
            "interview_type": sess.interview_type,
            "ai_selected_questions": questions,
        }

    @classmethod
    async def get_guest_report(
        cls,
        db: AsyncSession,
        invite_token: str,
    ) -> dict[str, Any]:
        """Returns public feedback report for completed guest interview."""
        sess = await cls.get_guest_session_by_token(db, invite_token)
        if not sess:
            raise HTTPException(status_code=404, detail="Invitation link not found or invalid.")

        fb = sess.feedback

        def parse_list(val: Any) -> list[str]:
            if not val:
                return []
            if isinstance(val, list):
                return [str(x) for x in val]
            if isinstance(val, str):
                try:
                    p = json.loads(val)
                    if isinstance(p, list):
                        return [str(x) for x in p]
                    return [str(p)]
                except Exception:
                    return [val]
            return [str(val)]

        summary = None
        if fb and isinstance(fb.detailed_metrics, dict):
            summary = fb.detailed_metrics.get("executive_summary") or fb.detailed_metrics.get("summary")

        return {
            "session_id": sess.id,
            "candidate_name": sess.candidate_name,
            "candidate_email": sess.candidate_email,
            "interview_type": sess.interview_type,
            "difficulty": sess.difficulty,
            "stage": sess.stage,
            "status": sess.status,
            "overall_score": fb.overall_score if fb else None,
            "technical_score": fb.technical_score if fb else None,
            "communication_score": fb.communication_score if fb else None,
            "english_score": fb.english_score if fb else None,
            "strengths": parse_list(fb.strengths) if fb else [],
            "weaknesses": parse_list(fb.weaknesses) if fb else [],
            "improvement_plan": parse_list(fb.improvement_plan) if fb else [],
            "executive_summary": summary,
            "created_at": sess.created_at,
        }

