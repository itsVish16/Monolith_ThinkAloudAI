import logging

from fastapi import APIRouter, Depends, Header, Query
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import decode_token
from app.modules.auth.models import User
from app.modules.auth.service import AuthService
from app.modules.dsa.schemas import (
    CodeSubmissionOut,
    CodeSubmissionRequest,
    CodeSubmissionResponse,
    QuestionDetail,
    QuestionListResponse,
    QuestionSummary,
    UserProblemStatusOut,
)
from app.modules.dsa.service import DSAService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["DSA Questions"])


async def get_optional_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> User | None:
    """
    Extracts authenticated user if Bearer token is provided, otherwise returns None.
    Allows public browsing and guest sandbox code executions.
    """
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


@router.get(
    "/questions",
    response_model=QuestionListResponse,
    summary="List DSA questions with optional filtering and pagination",
)
async def list_questions(
    difficulty: str | None = Query(None, description="Filter by difficulty (Easy, Medium, Hard)"),
    tag: str | None = Query(None, description="Filter by topic tag (e.g. Array, DP)"),
    search: str | None = Query(None, description="Search by title or description keyword"),
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """
    Returns paginated DSA questions filtered by difficulty, tag, or keyword search.
    """
    items, total = await DSAService.list_questions(
        db=db,
        redis=redis,
        skip=skip,
        limit=limit,
        difficulty=difficulty,
        tag=tag,
        search=search,
    )
    return QuestionListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get(
    "/questions/{id_or_slug}",
    response_model=QuestionDetail,
    summary="Get detailed DSA question by ID or slug",
)
async def get_question(
    id_or_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Fetches full question details including description, starter code, test cases, and hints.
    Accepts both integer IDs (e.g. 1) and URL-friendly slugs (e.g. 'two-sum').
    """
    return await DSAService.get_question(id_or_slug, db)


@router.post(
    "/questions/{id_or_slug}/run",
    response_model=CodeSubmissionResponse,
    summary="Dry run code against question test cases without formal submission",
)
async def run_solution(
    id_or_slug: str,
    request: CodeSubmissionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Dry run execution: runs code against question test cases (or custom test cases if provided).
    Results are returned immediately with detailed per-test outputs without creating a submission record.
    """
    return await DSAService.run_solution(id_or_slug, request, db)


@router.post(
    "/questions/{id_or_slug}/submit",
    response_model=CodeSubmissionResponse,
    summary="Submit code solution for formal evaluation against all test cases",
)
async def submit_solution(
    id_or_slug: str,
    request: CodeSubmissionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Formal submission: executes code against all test cases in isolated runner,
    stores result in PostgreSQL submissions table, and tracks user problem status.
    """
    user_id = current_user.id if current_user else None
    session_id = request.session_id or (str(current_user.id) if current_user else "anonymous")

    return await DSAService.submit_solution(
        id_or_slug=id_or_slug,
        request=request,
        db=db,
        user_id=user_id,
        session_id=session_id,
    )


@router.get(
    "/questions/{id_or_slug}/submissions",
    response_model=list[CodeSubmissionOut],
    summary="Get submission history for a question",
)
async def get_question_submissions(
    id_or_slug: str,
    session_id: str | None = Query(None, description="Optional guest session ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Retrieves previous submissions for the specified question for the current user or session.
    """
    user_id = current_user.id if current_user else None
    return await DSAService.get_question_submissions(
        id_or_slug=id_or_slug,
        db=db,
        user_id=user_id,
        session_id=session_id,
    )


@router.get(
    "/recommendations",
    summary="Get recommended questions for practice",
)
async def get_recommendations(
    session_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Returns suggested unsolved problems for the user.
    """
    user_id = current_user.id if current_user else None
    questions = await DSAService.get_recommendations(
        db=db,
        user_id=user_id,
        session_id=session_id,
    )
    return [
        QuestionSummary(
            id=q.id,
            title=q.title,
            slug=q.slug,
            difficulty=q.difficulty,
            function_name=q.function_name,
            optimal_time_complexity=q.optimal_time_complexity,
            optimal_space_complexity=q.optimal_space_complexity,
            tags=[t.tag_name for t in q.tags] if q.tags else [],
            created_at=q.created_at,
        )
        for q in questions
    ]


@router.get(
    "/status",
    response_model=list[UserProblemStatusOut],
    summary="Get problem status for current user or session",
)
async def get_user_status(
    session_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Returns problem status (Attempted, Solved) across all problems for the candidate."""
    user_id = current_user.id if current_user else None
    return await DSAService.get_user_problem_statuses(
        db=db,
        user_id=user_id,
        session_id=session_id,
    )


@router.get(
    "/submissions",
    response_model=list[CodeSubmissionOut],
    summary="Get recent code submissions for current candidate",
)
@router.get(
    "/submissions/{session_id}",
    response_model=list[CodeSubmissionOut],
    include_in_schema=False,
)
async def get_candidate_submissions(
    session_id: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Returns submissions across all problems for the candidate or specified session."""
    effective_session = session_id or (str(current_user.id) if current_user else None)
    user_id = current_user.id if current_user else None
    return await DSAService.get_user_all_submissions(
        db=db,
        user_id=user_id,
        session_id=effective_session,
        limit=limit,
    )
