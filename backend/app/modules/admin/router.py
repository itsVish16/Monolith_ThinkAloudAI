from typing import Any

from fastapi import APIRouter, Depends, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.modules.admin.schemas import (
    AchievementCreate,
    AdminScheduleInterviewRequest,
    AdminScheduleInterviewResponse,
    AvailableQuestionsResponse,
    CodingStatsResponse,
    DSAQuestionCreate,
    DSAQuestionUpdate,
    InterviewScoreOverride,
    InterviewStatsResponse,
    RoadmapStatsResponse,
    ScheduledInterviewsListResponse,
    UserStatsResponse,
)
from app.modules.admin.service import AdminService
from app.modules.auth.dependencies import get_current_admin
from app.modules.auth.models import User

router = APIRouter(tags=["admin"])


# -----------------------------------------------------------------------------
# 1. User Management & Gamification Endpoints
# -----------------------------------------------------------------------------
@router.get("/users/stats", response_model=UserStatsResponse)
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Returns total, verified, unverified user counts and 7-day registration growth."""
    return await AdminService.get_user_stats(db)


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    role: str | None = Query(None),
    is_verified: bool | None = Query(None),
):
    """Paginated list of platform users with search and filter capabilities."""
    return await AdminService.list_users(
        db=db,
        page=page,
        limit=limit,
        search=search,
        role=role,
        is_verified=is_verified,
    )


@router.get("/users/{user_id}")
async def get_user_dossier(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Fetch complete user dossier including profile, preferences, and unlocked badges."""
    return await AdminService.get_user_dossier(db, user_id)


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Update user verification status, role, or profile name."""
    return await AdminService.update_user_status(db, user_id, payload)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Permanently delete user and clean up cascaded entity references."""
    return await AdminService.delete_user(db, user_id, current_admin_id=admin.id)


@router.get("/achievements")
async def get_achievements(
    user_id: int | None = Query(None, description="Optional user ID to filter awarded badges"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Return available system achievement badges or user awards."""
    return await AdminService.list_achievements(db, user_id=user_id)


@router.post("/achievements", status_code=status.HTTP_201_CREATED)
async def create_achievement(
    payload: AchievementCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Create a new system achievement badge or award it to a specific user."""
    return await AdminService.create_achievement(db, payload)


@router.delete("/achievements/{achievement_id}")
async def delete_achievement(
    achievement_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Delete a system achievement badge or revoke an awarded user badge."""
    return await AdminService.delete_achievement(db, achievement_id)


# -----------------------------------------------------------------------------
# 2. Coding & Track Admin Endpoints
# -----------------------------------------------------------------------------
@router.get("/coding/stats", response_model=CodingStatsResponse)
async def get_coding_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Returns platform coding statistics: problems, runs, submissions, and pass rates."""
    return await AdminService.get_coding_stats(db)


@router.get("/roadmaps/stats", response_model=RoadmapStatsResponse)
async def get_roadmap_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Returns curriculum roadmap statistics: total roadmaps, topics, and items."""
    return await AdminService.get_roadmap_stats(db)


@router.get("/dsa/questions")
async def list_admin_dsa_questions(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    search: str | None = Query(None),
    difficulty: str | None = Query(None),
):
    """Paginated list of all DSA questions with search and difficulty filters."""
    return await AdminService.list_dsa_questions(
        db=db,
        page=page,
        limit=limit,
        search=search,
        difficulty=difficulty,
    )


@router.get("/dsa/questions/{question_id}")
async def get_admin_dsa_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Fetch complete details of a single DSA question."""
    return await AdminService.get_dsa_question(db, question_id)


@router.post("/dsa/questions", status_code=status.HTTP_201_CREATED)
async def create_admin_dsa_question(
    payload: DSAQuestionCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Create a new DSA question with starter code, test cases, and hints."""
    return await AdminService.create_dsa_question(db, payload)


@router.put("/dsa/questions/{question_id}")
async def update_admin_dsa_question(
    question_id: int,
    payload: DSAQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Update question content, test harness, starter code, and complexities."""
    return await AdminService.update_dsa_question(db, question_id, payload)


@router.delete("/dsa/questions/{question_id}")
async def delete_admin_dsa_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Delete a DSA question and all its associated submissions and tags."""
    return await AdminService.delete_dsa_question(db, question_id)


@router.get("/dsa/submissions")
async def list_admin_dsa_submissions(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    question_id: int | None = Query(None),
):
    """Paginated list of code submissions with optional status and question filtering."""
    return await AdminService.list_dsa_submissions(
        db=db,
        page=page,
        limit=limit,
        status=status,
        question_id=question_id,
    )


@router.get("/dsa/submissions/{submission_id}")
async def get_admin_dsa_submission(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Get single code submission details with submitted code and execution details."""
    return await AdminService.get_dsa_submission(db, submission_id)


# -----------------------------------------------------------------------------
# 3. Mock Interviews Audit & Grading Endpoints
# -----------------------------------------------------------------------------
@router.get("/interviews/stats", response_model=InterviewStatsResponse)
@router.get("/stats", response_model=InterviewStatsResponse)
async def get_interview_admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Returns mock interview aggregated statistics with duration and track breakdown."""
    return await AdminService.get_interview_stats(db)


@router.get("/interviews")
async def list_admin_interviews(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    interview_type: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
):
    """List mock interview sessions with joined candidate email, score, and duration."""
    return await AdminService.list_interviews(
        db=db,
        page=page,
        limit=limit,
        interview_type=interview_type,
        status=status,
        search=search,
    )


@router.post(
    "/interviews/schedule",
    response_model=AdminScheduleInterviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule candidate interview",
    description="Admin schedules an interview for a candidate with selected questions and generates/emails direct invite link.",
)
async def schedule_interview(
    payload: AdminScheduleInterviewRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return await AdminService.schedule_interview(db=db, payload=payload, admin_user=admin)


@router.get(
    "/interviews/scheduled",
    response_model=ScheduledInterviewsListResponse,
    summary="List scheduled interviews",
    description="Returns paginated list of scheduled interviews with status, candidate info, direct invite link, and completion metrics.",
)
async def list_scheduled_interviews(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return await AdminService.list_scheduled_interviews(
        db=db,
        page=page,
        limit=limit,
        status=status,
        search=search,
    )


@router.get(
    "/interviews/available-questions",
    response_model=AvailableQuestionsResponse,
    summary="List available questions for interview scheduling",
    description="Returns available questions categorized by track (DSA, System Design, Behavioral, PM, AI/ML) for admin selection.",
)
async def get_available_questions(
    track: str | None = Query("dsa"),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return await AdminService.get_available_questions(
        db=db,
        track=track or "dsa",
        search=search,
    )


@router.delete(
    "/interviews/scheduled/{session_id}",
    summary="Cancel a scheduled interview",
    description="Cancels a scheduled candidate interview and invalidates its direct invite link.",
)
async def cancel_scheduled_interview(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    return await AdminService.cancel_scheduled_interview(db=db, session_id=session_id)


@router.get("/interviews/{session_id}")
async def get_admin_interview_detail(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Complete audit session response with user info, feedback rubric, and transcript."""
    return await AdminService.get_interview_audit(db, session_id)


@router.patch("/interviews/{session_id}/score")
async def update_admin_interview_score(
    session_id: str,
    payload: InterviewScoreOverride,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Override interview evaluation scores and document moderation reasoning."""
    return await AdminService.override_interview_score(db, session_id, payload)


@router.delete("/interviews/{session_id}")
async def delete_admin_interview(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Delete an interview session and all its associated questions and feedback."""
    return await AdminService.delete_interview(db, session_id)


@router.get("/interviews/{session_id}/metrics")
async def get_admin_session_metrics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Granular turn-by-turn latency metrics and speech analytics for session deep-dive."""
    return await AdminService.get_session_metrics(db, session_id)


# -----------------------------------------------------------------------------
# 4. Latency & Telemetry Overview Endpoints
# -----------------------------------------------------------------------------
@router.get("/telemetry/overview")
async def get_telemetry_overview(
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    admin: User = Depends(get_current_admin),
):
    """Global AI voice pipeline telemetry overview matching TelemetryAnalytics dashboard."""
    return await AdminService.get_telemetry_overview(db=db, redis=redis, limit=limit)
