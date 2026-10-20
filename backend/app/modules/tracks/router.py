import logging

from fastapi import APIRouter, Depends, Header, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import decode_token
from app.modules.auth.models import User
from app.modules.auth.service import AuthService
from app.modules.tracks.schemas import (
    AIMLListResponse,
    AIMLQuestionDetail,
    BehavioralListResponse,
    BehavioralQuestionDetail,
    PMListResponse,
    PMQuestionDetail,
    RoadmapCreate,
    RoadmapDetail,
    RoadmapItemDetail,
    RoadmapListResponse,
    SystemDesignListResponse,
    SystemDesignQuestionDetail,
    SystemDesignSubmissionRequest,
    SystemDesignSubmissionResponse,
)
from app.modules.tracks.service import TracksService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Interview Tracks"])


async def get_optional_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> User | None:
    """Extracts authenticated user if Bearer token is provided, else returns None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split("Bearer ", 1)[1].strip()
    try:
        payload = decode_token(token, expected_type="access")
        user_id_str = payload.get("sub")
        jti = payload.get("jti")
        if not user_id_str or not jti:
            return None
        if await AuthService.is_token_blacklisted(redis, jti):
            return None
        return await AuthService.get_user_by_id(db, int(user_id_str))
    except Exception:
        return None


# =============================================================================
# System Design Endpoints
# =============================================================================
@router.get(
    "/system-design",
    response_model=SystemDesignListResponse,
    summary="List System Design questions",
)
async def list_system_design(
    domain: str | None = Query(None, description="Filter by domain/category"),
    role: str | None = Query(None, description="Filter by target role"),
    search: str | None = Query(None, description="Search keyword"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await TracksService.list_system_design(
        db=db, domain=domain, role=role, search=search, skip=skip, limit=limit
    )
    return SystemDesignListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get(
    "/system-design/{question_id}",
    response_model=SystemDesignQuestionDetail,
    summary="Get System Design question details",
)
async def get_system_design_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
):
    return await TracksService.get_system_design(question_id, db)


@router.post(
    "/system-design/{question_id}/submit",
    response_model=SystemDesignSubmissionResponse,
    summary="Submit answer for System Design evaluation",
)
async def submit_system_design(
    question_id: int,
    request: SystemDesignSubmissionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    user_id = str(current_user.id) if current_user else "anonymous"
    return await TracksService.submit_system_design(
        question_id=question_id, request=request, db=db, user_id=user_id
    )


# =============================================================================
# Behavioral Questions Endpoints
# =============================================================================
@router.get(
    "/behavioral",
    response_model=BehavioralListResponse,
    summary="List Behavioral interview questions",
)
async def list_behavioral(
    category: str | None = Query(None, description="Filter by behavioral category"),
    search: str | None = Query(None, description="Search keyword"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await TracksService.list_behavioral(
        db=db, category=category, search=search, skip=skip, limit=limit
    )
    return BehavioralListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get(
    "/behavioral/{question_id}",
    response_model=BehavioralQuestionDetail,
    summary="Get Behavioral question details",
)
async def get_behavioral_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
):
    return await TracksService.get_behavioral(question_id, db)


# =============================================================================
# Product Management (PM) Endpoints
# =============================================================================
@router.get(
    "/pm",
    response_model=PMListResponse,
    summary="List Product Management interview questions",
)
async def list_pm(
    category: str | None = Query(None, description="Filter by PM category"),
    search: str | None = Query(None, description="Search keyword"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await TracksService.list_pm(
        db=db, category=category, search=search, skip=skip, limit=limit
    )
    return PMListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get(
    "/pm/{question_id}",
    response_model=PMQuestionDetail,
    summary="Get Product Management question details",
)
async def get_pm_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
):
    return await TracksService.get_pm(question_id, db)


# =============================================================================
# AI/ML Engineering Endpoints
# =============================================================================
@router.get(
    "/aiml",
    response_model=AIMLListResponse,
    summary="List AI/ML interview questions",
)
async def list_aiml(
    domain: str | None = Query(None, description="Filter by AI/ML domain"),
    role: str | None = Query(None, description="Filter by role"),
    search: str | None = Query(None, description="Search keyword"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    items, total = await TracksService.list_aiml(
        db=db, domain=domain, role=role, search=search, skip=skip, limit=limit
    )
    return AIMLListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get(
    "/aiml/{question_id}",
    response_model=AIMLQuestionDetail,
    summary="Get AI/ML question details",
)
async def get_aiml_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
):
    return await TracksService.get_aiml(question_id, db)


# =============================================================================
# Roadmaps Endpoints
# =============================================================================
@router.get(
    "/roadmaps",
    response_model=RoadmapListResponse,
    summary="List curated and user-specific interview roadmaps",
)
async def list_roadmaps(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    user_id = str(current_user.id) if current_user else None
    items, total = await TracksService.list_roadmaps(
        db=db, user_id=user_id, skip=skip, limit=limit
    )
    return RoadmapListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get(
    "/roadmaps/interviews/scheduled",
    summary="Get scheduled interviews for current user from active roadmaps",
)
async def get_scheduled_interviews(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    user_id = str(current_user.id) if current_user else None
    return await TracksService.get_scheduled_interviews(db=db, user_id=user_id)


@router.get(
    "/roadmaps/{roadmap_id}",
    response_model=RoadmapDetail,
    summary="Get roadmap details by ID",
)
async def get_roadmap(
    roadmap_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    user_id = str(current_user.id) if current_user else None
    return await TracksService.get_roadmap(roadmap_id=roadmap_id, db=db, user_id=user_id)


@router.delete(
    "/roadmaps/{roadmap_id}",
    summary="Delete a custom roadmap",
)
async def delete_roadmap(
    roadmap_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    user_id = str(current_user.id) if current_user else None
    return await TracksService.delete_roadmap(roadmap_id=roadmap_id, db=db, user_id=user_id)


@router.post(
    "/roadmaps",
    response_model=RoadmapDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a custom interview roadmap",
)
async def create_roadmap(
    request: RoadmapCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    user_id = str(current_user.id) if current_user else None
    return await TracksService.create_roadmap(request=request, db=db, user_id=user_id)


@router.patch(
    "/roadmaps/items/{item_id}/toggle",
    response_model=RoadmapItemDetail,
    summary="Toggle roadmap item completed status",
)
async def toggle_roadmap_item(
    item_id: int,
    is_completed: bool = Query(..., description="Target completion boolean"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    user_id = str(current_user.id) if current_user else None
    return await TracksService.toggle_item(
        item_id=item_id, is_completed=is_completed, db=db, user_id=user_id
    )
