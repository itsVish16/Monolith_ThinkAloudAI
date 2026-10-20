import logging
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.tracks.models import (
    AIMLQuestion,
    BehavioralQuestion,
    PMQuestion,
    Roadmap,
    RoadmapItem,
    RoadmapTopic,
    SystemDesignQuestion,
    SystemDesignSubmission,
)
from app.modules.tracks.schemas import (
    AIMLQuestionDetail,
    BehavioralQuestionDetail,
    PMQuestionDetail,
    RoadmapCreate,
    RoadmapDetail,
    RoadmapItemDetail,
    RoadmapTopicDetail,
    SystemDesignQuestionDetail,
    SystemDesignQuestionSummary,
    SystemDesignSubmissionRequest,
    SystemDesignSubmissionResponse,
)

logger = logging.getLogger(__name__)


class TracksService:
    # =========================================================================
    # System Design
    # =========================================================================
    @staticmethod
    async def list_system_design(
        db: AsyncSession,
        domain: str | None = None,
        role: str | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[SystemDesignQuestionSummary], int]:
        query = select(SystemDesignQuestion)
        count_query = select(func.count(SystemDesignQuestion.id))

        if domain:
            query = query.filter(func.lower(SystemDesignQuestion.domain) == domain.strip().lower())
            count_query = count_query.filter(func.lower(SystemDesignQuestion.domain) == domain.strip().lower())

        if role:
            query = query.filter(func.lower(SystemDesignQuestion.role) == role.strip().lower())
            count_query = count_query.filter(func.lower(SystemDesignQuestion.role) == role.strip().lower())

        if search:
            pattern = f"%{search.strip()}%"
            search_clause = or_(
                SystemDesignQuestion.title.ilike(pattern),
                SystemDesignQuestion.description.ilike(pattern),
            )
            query = query.filter(search_clause)
            count_query = count_query.filter(search_clause)

        total_res = await db.execute(count_query)
        total = total_res.scalar() or 0

        query = query.order_by(SystemDesignQuestion.id.asc()).offset(skip).limit(limit)
        result = await db.execute(query)
        questions = result.scalars().all()

        summaries = [
            SystemDesignQuestionSummary(
                id=q.id,
                title=q.title,
                domain=q.domain,
                role=q.role,
                created_at=q.created_at,
            )
            for q in questions
        ]
        return summaries, total

    @staticmethod
    async def get_system_design(question_id: int, db: AsyncSession) -> SystemDesignQuestionDetail:
        result = await db.execute(
            select(SystemDesignQuestion).filter(SystemDesignQuestion.id == question_id)
        )
        q = result.scalars().first()
        if not q:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"System Design Question {question_id} not found",
            )
        return SystemDesignQuestionDetail.model_validate(q)

    @staticmethod
    async def submit_system_design(
        question_id: int,
        request: SystemDesignSubmissionRequest,
        db: AsyncSession,
        user_id: str | None = None,
    ) -> SystemDesignSubmissionResponse:
        result = await db.execute(
            select(SystemDesignQuestion).filter(SystemDesignQuestion.id == question_id)
        )
        q = result.scalars().first()
        if not q:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"System Design Question {question_id} not found",
            )

        # Baseline evaluation score based on answer completeness
        text_len = len(request.answer_text)
        score = min(95, max(60, 60 + text_len // 50))
        feedback = "Solid architectural coverage including functional/non-functional requirements and data flow considerations."
        strengths = "Good breakdown of core components, database choices, and trade-off considerations."
        improvements = "Consider elaborating on disaster recovery, regional replication, and data partitioning edge cases."

        submission = SystemDesignSubmission(
            question_id=question_id,
            user_id=user_id or "anonymous",
            answer_text=request.answer_text,
            score=score,
            feedback=feedback,
            strengths=strengths,
            improvements=improvements,
        )
        db.add(submission)
        await db.commit()
        await db.refresh(submission)

        return SystemDesignSubmissionResponse.model_validate(submission)

    # =========================================================================
    # Behavioral Questions
    # =========================================================================
    @staticmethod
    async def list_behavioral(
        db: AsyncSession,
        category: str | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[BehavioralQuestionDetail], int]:
        query = select(BehavioralQuestion)
        count_query = select(func.count(BehavioralQuestion.id))

        if category:
            query = query.filter(func.lower(BehavioralQuestion.category) == category.strip().lower())
            count_query = count_query.filter(func.lower(BehavioralQuestion.category) == category.strip().lower())

        if search:
            pattern = f"%{search.strip()}%"
            search_clause = or_(
                BehavioralQuestion.title.ilike(pattern),
                BehavioralQuestion.description.ilike(pattern),
            )
            query = query.filter(search_clause)
            count_query = count_query.filter(search_clause)

        total_res = await db.execute(count_query)
        total = total_res.scalar() or 0

        query = query.order_by(BehavioralQuestion.id.asc()).offset(skip).limit(limit)
        result = await db.execute(query)
        questions = result.scalars().all()

        items = [BehavioralQuestionDetail.model_validate(q) for q in questions]
        return items, total

    @staticmethod
    async def get_behavioral(question_id: int, db: AsyncSession) -> BehavioralQuestionDetail:
        result = await db.execute(
            select(BehavioralQuestion).filter(BehavioralQuestion.id == question_id)
        )
        q = result.scalars().first()
        if not q:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Behavioral Question {question_id} not found",
            )
        return BehavioralQuestionDetail.model_validate(q)

    # =========================================================================
    # Product Management Questions
    # =========================================================================
    @staticmethod
    async def list_pm(
        db: AsyncSession,
        category: str | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[PMQuestionDetail], int]:
        query = select(PMQuestion)
        count_query = select(func.count(PMQuestion.id))

        if category:
            query = query.filter(func.lower(PMQuestion.category) == category.strip().lower())
            count_query = count_query.filter(func.lower(PMQuestion.category) == category.strip().lower())

        if search:
            pattern = f"%{search.strip()}%"
            search_clause = or_(
                PMQuestion.title.ilike(pattern),
                PMQuestion.description.ilike(pattern),
            )
            query = query.filter(search_clause)
            count_query = count_query.filter(search_clause)

        total_res = await db.execute(count_query)
        total = total_res.scalar() or 0

        query = query.order_by(PMQuestion.id.asc()).offset(skip).limit(limit)
        result = await db.execute(query)
        questions = result.scalars().all()

        items = [PMQuestionDetail.model_validate(q) for q in questions]
        return items, total

    @staticmethod
    async def get_pm(question_id: int, db: AsyncSession) -> PMQuestionDetail:
        result = await db.execute(select(PMQuestion).filter(PMQuestion.id == question_id))
        q = result.scalars().first()
        if not q:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product Management Question {question_id} not found",
            )
        return PMQuestionDetail.model_validate(q)

    # =========================================================================
    # AI/ML Questions
    # =========================================================================
    @staticmethod
    async def list_aiml(
        db: AsyncSession,
        domain: str | None = None,
        role: str | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[AIMLQuestionDetail], int]:
        query = select(AIMLQuestion)
        count_query = select(func.count(AIMLQuestion.id))

        if domain:
            query = query.filter(func.lower(AIMLQuestion.domain) == domain.strip().lower())
            count_query = count_query.filter(func.lower(AIMLQuestion.domain) == domain.strip().lower())

        if role:
            query = query.filter(func.lower(AIMLQuestion.role) == role.strip().lower())
            count_query = count_query.filter(func.lower(AIMLQuestion.role) == role.strip().lower())

        if search:
            pattern = f"%{search.strip()}%"
            search_clause = or_(
                AIMLQuestion.title.ilike(pattern),
                AIMLQuestion.description.ilike(pattern),
            )
            query = query.filter(search_clause)
            count_query = count_query.filter(search_clause)

        total_res = await db.execute(count_query)
        total = total_res.scalar() or 0

        query = query.order_by(AIMLQuestion.id.asc()).offset(skip).limit(limit)
        result = await db.execute(query)
        questions = result.scalars().all()

        items = [AIMLQuestionDetail.model_validate(q) for q in questions]
        return items, total

    @staticmethod
    async def get_aiml(question_id: int, db: AsyncSession) -> AIMLQuestionDetail:
        result = await db.execute(select(AIMLQuestion).filter(AIMLQuestion.id == question_id))
        q = result.scalars().first()
        if not q:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"AI/ML Question {question_id} not found",
            )
        return AIMLQuestionDetail.model_validate(q)

    # =========================================================================
    # Roadmaps
    # =========================================================================
    @staticmethod
    async def list_roadmaps(
        db: AsyncSession,
        user_id: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[RoadmapDetail], int]:
        query = select(Roadmap).options(
            selectinload(Roadmap.topics).selectinload(RoadmapTopic.items)
        )
        count_query = select(func.count(Roadmap.id))

        if user_id:
            user_filter = or_(Roadmap.user_id == user_id, Roadmap.is_general.is_(True))
            query = query.filter(user_filter)
            count_query = count_query.filter(user_filter)
        else:
            query = query.filter(Roadmap.is_general.is_(True))
            count_query = count_query.filter(Roadmap.is_general.is_(True))

        total_res = await db.execute(count_query)
        total = total_res.scalar() or 0

        query = query.order_by(Roadmap.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        roadmaps = result.scalars().all()

        items = [
            RoadmapDetail(
                id=r.id,
                user_id=r.user_id,
                is_general=r.is_general,
                title=r.title,
                description=r.description,
                created_at=r.created_at,
                topics=[
                    RoadmapTopicDetail(
                        id=t.id,
                        roadmap_id=t.roadmap_id,
                        title=t.title,
                        order_index=t.order_index,
                        items=[
                            RoadmapItemDetail(
                                id=item.id,
                                topic_id=item.topic_id,
                                title=item.title,
                                content_type=item.content_type,
                                estimated_minutes=item.estimated_minutes,
                                content_id=item.content_id,
                                timeline_days=item.timeline_days,
                                is_completed=item.is_completed,
                            )
                            for item in t.items
                        ],
                    )
                    for t in r.topics
                ],
            )
            for r in roadmaps
        ]
        return items, total

    @staticmethod
    async def get_roadmap(
        roadmap_id: int,
        db: AsyncSession,
        user_id: str | None = None,
    ) -> RoadmapDetail:
        query = (
            select(Roadmap)
            .options(selectinload(Roadmap.topics).selectinload(RoadmapTopic.items))
            .filter(Roadmap.id == roadmap_id)
        )
        if user_id:
            query = query.filter(or_(Roadmap.user_id == user_id, Roadmap.is_general.is_(True)))
        else:
            query = query.filter(Roadmap.is_general.is_(True))

        result = await db.execute(query)
        r = result.scalars().first()
        if not r:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Roadmap {roadmap_id} not found",
            )

        return RoadmapDetail(
            id=r.id,
            user_id=r.user_id,
            is_general=r.is_general,
            title=r.title,
            description=r.description,
            created_at=r.created_at,
            topics=[
                RoadmapTopicDetail(
                    id=t.id,
                    roadmap_id=t.roadmap_id,
                    title=t.title,
                    order_index=t.order_index,
                    items=[
                        RoadmapItemDetail(
                            id=item.id,
                            topic_id=item.topic_id,
                            title=item.title,
                            content_type=item.content_type,
                            estimated_minutes=item.estimated_minutes,
                            content_id=item.content_id,
                            timeline_days=item.timeline_days,
                            is_completed=item.is_completed,
                        )
                        for item in t.items
                    ],
                )
                for t in r.topics
            ],
        )

    @staticmethod
    async def create_roadmap(
        request: RoadmapCreate,
        db: AsyncSession,
        user_id: str | None = None,
    ) -> RoadmapDetail:
        roadmap = Roadmap(
            user_id=user_id,
            is_general=not bool(user_id),
            title=request.title,
            description=request.description,
        )
        db.add(roadmap)
        await db.flush()

        for topic_in in request.topics:
            topic = RoadmapTopic(
                roadmap_id=roadmap.id,
                title=topic_in.title,
                order_index=topic_in.order_index,
            )
            db.add(topic)
            await db.flush()

            for item_in in topic_in.items:
                item = RoadmapItem(
                    topic_id=topic.id,
                    title=item_in.title,
                    content_type=item_in.content_type,
                    estimated_minutes=item_in.estimated_minutes,
                    content_id=item_in.content_id,
                    timeline_days=item_in.timeline_days,
                    is_completed=False,
                )
                db.add(item)

        await db.commit()
        return await TracksService.get_roadmap(roadmap.id, db, user_id=user_id)

    @staticmethod
    async def toggle_item(
        item_id: int,
        is_completed: bool,
        db: AsyncSession,
        user_id: str | None = None,
    ) -> RoadmapItemDetail:
        query = (
            select(RoadmapItem)
            .join(RoadmapTopic, RoadmapItem.topic_id == RoadmapTopic.id)
            .join(Roadmap, RoadmapTopic.roadmap_id == Roadmap.id)
            .filter(RoadmapItem.id == item_id)
        )
        if user_id:
            query = query.filter(or_(Roadmap.user_id == user_id, Roadmap.is_general.is_(True)))

        result = await db.execute(query)
        item = result.scalars().first()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Roadmap Item {item_id} not found or not owned by user",
            )

        item.is_completed = is_completed
        await db.commit()
        await db.refresh(item)

        return RoadmapItemDetail(
            id=item.id,
            topic_id=item.topic_id,
            title=item.title,
            content_type=item.content_type,
            estimated_minutes=item.estimated_minutes,
            content_id=item.content_id,
            timeline_days=item.timeline_days,
            is_completed=item.is_completed,
        )

    @staticmethod
    async def delete_roadmap(
        roadmap_id: int,
        db: AsyncSession,
        user_id: str | None = None,
    ) -> dict[str, str]:
        stmt = select(Roadmap).where(Roadmap.id == roadmap_id)
        res = await db.execute(stmt)
        roadmap = res.scalar_one_or_none()
        if not roadmap:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Roadmap {roadmap_id} not found",
            )
        if roadmap.is_general and user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="General canonical roadmaps cannot be deleted",
            )
        if roadmap.user_id and user_id and str(roadmap.user_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this roadmap",
            )
        await db.delete(roadmap)
        await db.commit()
        return {"status": "success", "message": f"Roadmap {roadmap_id} deleted successfully"}

    @staticmethod
    async def get_scheduled_interviews(
        db: AsyncSession,
        user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        query = (
            select(RoadmapItem, RoadmapTopic, Roadmap)
            .join(RoadmapTopic, RoadmapItem.topic_id == RoadmapTopic.id)
            .join(Roadmap, RoadmapTopic.roadmap_id == Roadmap.id)
            .filter(
                RoadmapItem.content_type.in_(["interview", "mock_interview", "behavioral", "system_design"]),
                RoadmapItem.is_completed.is_(False),
            )
        )
        if user_id:
            query = query.filter(or_(Roadmap.user_id == user_id, Roadmap.is_general.is_(True)))
        else:
            query = query.filter(Roadmap.is_general.is_(True))

        res = await db.execute(query.limit(10))
        scheduled: list[dict[str, Any]] = []
        for item, topic, roadmap in res.all():
            scheduled.append({
                "id": item.id,
                "topic_id": item.topic_id,
                "title": item.title,
                "content_type": item.content_type,
                "content_id": item.content_id or item.content_type,
                "timeline_days": item.timeline_days,
                "is_completed": item.is_completed,
                "category": topic.title,
                "track_type": item.content_type,
                "roadmap_title": roadmap.title,
                "topic_title": topic.title,
                "roadmap_id": roadmap.id,
            })
        return scheduled

