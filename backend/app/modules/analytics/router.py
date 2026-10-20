import structlog
from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.modules.analytics.schemas import (
    HeatmapResponse,
    LeaderboardResponse,
    SkillScoresResponse,
    UserStatsResponse,
)
from app.modules.analytics.service import AnalyticsService
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["analytics"])


@router.get(
    "/stats",
    response_model=UserStatsResponse,
    summary="Get user dashboard statistics",
    description="Retrieves aggregate metrics including solved problems by difficulty, interview counts, average score, streaks, and ELO rating.",
)
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserStatsResponse:
    stats = await AnalyticsService.get_or_create_user_stats(db, current_user.id)
    return UserStatsResponse.model_validate(stats)


@router.get(
    "/activity",
    response_model=HeatmapResponse,
    summary="Get user activity heatmap",
    description="Retrieves daily activity counts (problems solved, interviews completed, study time) for contribution heatmaps.",
)
async def get_activity(
    days: int = Query(default=365, ge=7, le=730, description="Number of past days to query"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HeatmapResponse:
    activities = await AnalyticsService.get_activity_heatmap(db, current_user.id, days=days)
    stats = await AnalyticsService.get_or_create_user_stats(db, current_user.id)
    total_active_days = len([a for a in activities if a.count > 0])

    return HeatmapResponse(
        activities=activities,
        total_active_days=total_active_days,
        current_streak=stats.current_streak,
        longest_streak=stats.longest_streak,
    )


@router.get(
    "/skills",
    response_model=SkillScoresResponse,
    summary="Get user domain skill scores & radar analysis",
    description="Retrieves proficiency scores across CS domains and radar chart dimensions for technical and behavioral metrics.",
)
async def get_skills(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SkillScoresResponse:
    skills, radar_data = await AnalyticsService.get_user_skill_scores(db, current_user.id)
    return SkillScoresResponse(
        skills=skills,
        radar_data=radar_data,
    )


@router.get(
    "/leaderboard",
    response_model=LeaderboardResponse,
    summary="Get global ranking leaderboard",
    description="Retrieves the top global candidates ordered by platform rating and current candidate's relative position.",
)
async def get_leaderboard(
    limit: int = Query(default=10, ge=1, le=100, description="Number of top candidates to retrieve"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> LeaderboardResponse:
    leaderboard, me = await AnalyticsService.get_leaderboard(
        db=db,
        redis=redis,
        current_user_id=current_user.id,
        limit=limit,
    )
    return LeaderboardResponse(
        leaderboard=leaderboard,
        me=me,
    )
