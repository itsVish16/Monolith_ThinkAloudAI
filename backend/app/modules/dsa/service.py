import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.dsa.models import (
    CodeSubmission,
    DSAQuestion,
    ProblemTag,
    UserProblemStatus,
)
from app.modules.dsa.runner import run_code_isolated
from app.modules.dsa.schemas import (
    CodeSubmissionRequest,
    CodeSubmissionResponse,
    QuestionDetail,
    QuestionSummary,
    TestResult,
)

logger = logging.getLogger(__name__)


class DSAService:
    @staticmethod
    async def list_questions(
        db: AsyncSession,
        redis: Redis | None = None,
        skip: int = 0,
        limit: int = 50,
        difficulty: str | None = None,
        tag: str | None = None,
        search: str | None = None,
    ) -> tuple[list[QuestionSummary], int]:
        """
        Lists DSA questions with pagination, filtering by difficulty and tag, and text search.
        Caches general queries in Redis when applicable.
        """
        cache_key = None
        if redis and not search and not tag and not difficulty:
            cache_key = f"dsa:questions:skip={skip}:limit={limit}"
            try:
                cached = await redis.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    items = [QuestionSummary(**item) for item in data.get("items", [])]
                    return items, data.get("total", len(items))
            except Exception as e:
                logger.warning("redis_cache_read_error", error=str(e))

        # Base query
        query = select(DSAQuestion).options(selectinload(DSAQuestion.tags))
        count_query = select(func.count(DSAQuestion.id))

        if difficulty:
            diff_normalized = difficulty.strip().capitalize()
            query = query.filter(func.lower(DSAQuestion.difficulty) == diff_normalized.lower())
            count_query = count_query.filter(func.lower(DSAQuestion.difficulty) == diff_normalized.lower())

        if tag:
            tag_filter = tag.strip().lower()
            query = query.join(DSAQuestion.tags).filter(
                func.lower(ProblemTag.tag_name) == tag_filter
            )
            count_query = count_query.join(DSAQuestion.tags).filter(
                func.lower(ProblemTag.tag_name) == tag_filter
            )

        if search:
            search_pattern = f"%{search.strip()}%"
            search_clause = or_(
                DSAQuestion.title.ilike(search_pattern),
                DSAQuestion.description.ilike(search_pattern),
            )
            query = query.filter(search_clause)
            count_query = count_query.filter(search_clause)

        total_res = await db.execute(count_query)
        total = total_res.scalar() or 0

        query = query.order_by(DSAQuestion.id.asc()).offset(skip).limit(limit)
        result = await db.execute(query)
        questions = result.scalars().all()

        summaries: list[QuestionSummary] = []
        for q in questions:
            tags = [t.tag_name for t in q.tags] if q.tags else []
            summaries.append(
                QuestionSummary(
                    id=q.id,
                    title=q.title,
                    slug=q.slug,
                    difficulty=q.difficulty,
                    function_name=q.function_name,
                    optimal_time_complexity=q.optimal_time_complexity,
                    optimal_space_complexity=q.optimal_space_complexity,
                    tags=tags,
                    created_at=q.created_at,
                )
            )

        if cache_key and redis:
            try:
                cache_payload = {
                    "total": total,
                    "items": [s.model_dump(mode="json") for s in summaries],
                }
                await redis.set(cache_key, json.dumps(cache_payload), ex=1800)
            except Exception as e:
                logger.warning("redis_cache_write_error", error=str(e))

        return summaries, total

    @staticmethod
    async def _resolve_question(id_or_slug: int | str, db: AsyncSession) -> DSAQuestion:
        str_val = str(id_or_slug).strip()
        query = select(DSAQuestion).options(selectinload(DSAQuestion.tags))
        if str_val.isdigit():
            query = query.filter(DSAQuestion.id == int(str_val))
        else:
            query = query.filter(
                or_(
                    DSAQuestion.slug == str_val,
                    DSAQuestion.title.ilike(str_val.replace("-", " ")),
                )
            )

        result = await db.execute(query)
        question = result.scalars().first()
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"DSA Question '{id_or_slug}' not found",
            )
        return question

    @staticmethod
    async def get_question(id_or_slug: int | str, db: AsyncSession) -> QuestionDetail:
        """
        Retrieves a question by integer ID or slug/title.
        """
        question = await DSAService._resolve_question(id_or_slug, db)
        tags = [t.tag_name for t in question.tags] if question.tags else []
        return QuestionDetail(
            id=question.id,
            title=question.title,
            slug=question.slug,
            description=question.description,
            difficulty=question.difficulty,
            function_name=question.function_name,
            python_starter_code=question.python_starter_code,
            cpp_starter_code=question.cpp_starter_code,
            cpp_test_harness=question.cpp_test_harness,
            test_cases=question.test_cases,
            hints=question.hints,
            optimal_time_complexity=question.optimal_time_complexity,
            optimal_space_complexity=question.optimal_space_complexity,
            tags=tags,
            created_at=question.created_at,
        )

    @staticmethod
    async def run_solution(
        id_or_slug: int | str,
        request: CodeSubmissionRequest,
        db: AsyncSession,
    ) -> CodeSubmissionResponse:
        """
        Dry runs code against question test cases (or custom cases) without saving a submission.
        """
        question = await DSAService._resolve_question(id_or_slug, db)

        custom_tc = request.custom_test_cases
        if custom_tc is not None and not isinstance(custom_tc, str):
            test_cases_json = json.dumps(custom_tc)
        else:
            test_cases_json = custom_tc or question.test_cases

        run_result = await asyncio.to_thread(
            run_code_isolated,
            code=request.code,
            function_name=question.function_name,
            test_cases_json=test_cases_json,
            language=request.language.lower(),
            test_harness=question.cpp_test_harness,
        )

        test_results = [
            TestResult(**tr) for tr in run_result.get("test_results", [])
        ]

        return CodeSubmissionResponse(
            status=run_result.get("status", "Error"),
            passed_tests=run_result.get("passed_tests", 0),
            total_tests=run_result.get("total_tests", 0),
            execution_time_ms=run_result.get("execution_time_ms", 0.0),
            memory_used_kb=run_result.get("memory_used_kb", 0.0),
            memory_kb=run_result.get("memory_kb", 1024.0),
            memory_mb=run_result.get("memory_mb", 1.0),
            error_message=run_result.get("error_message"),
            submission_id=None,
            output=f"Dry run executed: {run_result.get('passed_tests', 0)}/{run_result.get('total_tests', 0)} tests passed.",
            test_results=test_results,
        )

    @staticmethod
    async def submit_solution(
        id_or_slug: int | str,
        request: CodeSubmissionRequest,
        db: AsyncSession,
        user_id: int | None = None,
        session_id: str | None = None,
    ) -> CodeSubmissionResponse:
        """
        Submits code for evaluation against all test cases, records the submission in PostgreSQL,
        and updates UserProblemStatus.
        """
        question = await DSAService._resolve_question(id_or_slug, db)
        question_id = question.id

        # Execute code in isolated runner
        run_result = await asyncio.to_thread(
            run_code_isolated,
            code=request.code,
            function_name=question.function_name,
            test_cases_json=question.test_cases,
            language=request.language.lower(),
            test_harness=question.cpp_test_harness,
        )

        status_str = run_result.get("status", "Error")
        exec_time = run_result.get("execution_time_ms")
        mem_used = run_result.get("memory_used_kb")
        passed = run_result.get("passed_tests", 0)
        total = run_result.get("total_tests", 0)
        err_msg = run_result.get("error_message")

        effective_session = session_id or request.session_id or (str(user_id) if user_id else "anonymous")

        # Save submission record
        submission = CodeSubmission(
            session_id=effective_session,
            user_id=user_id,
            question_id=question_id,
            code=request.code,
            language=request.language.lower(),
            status=status_str,
            error_message=err_msg,
            is_submission=True,
            execution_time_ms=exec_time,
            memory_used_kb=mem_used,
            passed_tests=passed,
            total_tests=total,
        )
        db.add(submission)
        await db.flush()

        # Update UserProblemStatus
        if effective_session:
            status_res = await db.execute(
                select(UserProblemStatus).filter(
                    UserProblemStatus.user_id == effective_session,
                    UserProblemStatus.question_id == question_id,
                )
            )
            user_status = status_res.scalars().first()
            was_already_solved = (user_status is not None and user_status.status == "Solved")
            is_accepted = status_str == "Accepted"
            new_status = "Solved" if is_accepted else "Attempted"

            if not user_status:
                user_status = UserProblemStatus(
                    user_id=effective_session,
                    question_id=question_id,
                    status=new_status,
                    best_runtime_ms=exec_time if is_accepted else None,
                    best_memory_kb=mem_used if is_accepted else None,
                    last_attempted_at=datetime.now(UTC),
                )
                db.add(user_status)
            else:
                if is_accepted or user_status.status != "Solved":
                    user_status.status = new_status
                user_status.last_attempted_at = datetime.now(UTC)
                if is_accepted:
                    if user_status.best_runtime_ms is None or (
                        exec_time and exec_time < user_status.best_runtime_ms
                    ):
                        user_status.best_runtime_ms = exec_time
                    if user_status.best_memory_kb is None or (
                        mem_used and mem_used < user_status.best_memory_kb
                    ):
                        user_status.best_memory_kb = mem_used

            if user_id:
                try:
                    from app.modules.analytics.service import AnalyticsService
                    await AnalyticsService.log_activity(
                        db=db,
                        user_id=user_id,
                        activity_type="SUBMISSION",
                        count=1,
                        domain="DSA",
                        reference_id=str(submission.id),
                    )
                    if is_accepted and not was_already_solved:
                        await AnalyticsService.log_activity(
                            db=db,
                            user_id=user_id,
                            activity_type="PROBLEM_SOLVED",
                            count=1,
                            domain="DSA",
                            reference_id=str(question_id),
                            metadata={"question_id": question_id, "difficulty": question.difficulty},
                        )
                except Exception as analytics_err:
                    logger.warning(f"Failed to record analytics for submission: {analytics_err}")

        await db.commit()
        await db.refresh(submission)

        test_results = [
            TestResult(**tr) for tr in run_result.get("test_results", [])
        ]

        return CodeSubmissionResponse(
            status=status_str,
            passed_tests=passed,
            total_tests=total,
            execution_time_ms=exec_time or 0.0,
            memory_used_kb=mem_used or 0.0,
            memory_kb=mem_used or 1024.0,
            memory_mb=round((mem_used / 1024.0), 2) if mem_used else 1.0,
            error_message=err_msg,
            submission_id=submission.id,
            output=f"Submission {submission.id} completed with status: {status_str}",
            test_results=test_results,
        )

    @staticmethod
    async def get_question_submissions(
        id_or_slug: int | str,
        db: AsyncSession,
        user_id: int | None = None,
        session_id: str | None = None,
    ) -> list[CodeSubmission]:
        """Returns past submissions for this question by user or session."""
        question = await DSAService._resolve_question(id_or_slug, db)
        query = select(CodeSubmission).filter(
            CodeSubmission.question_id == question.id,
            CodeSubmission.is_submission.is_(True),
        )
        if user_id:
            query = query.filter(
                or_(
                    CodeSubmission.user_id == user_id,
                    CodeSubmission.session_id == str(user_id),
                )
            )
        elif session_id:
            query = query.filter(CodeSubmission.session_id == session_id)

        query = query.order_by(CodeSubmission.created_at.desc()).limit(20)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_recommendations(
        db: AsyncSession,
        user_id: int | None = None,
        session_id: str | None = None,
    ) -> list[DSAQuestion]:
        """Provides smart question recommendations based on unsolved questions."""
        target_id = str(user_id) if user_id else session_id
        solved_ids_query = select(UserProblemStatus.question_id).filter(
            UserProblemStatus.status == "Solved"
        )
        if target_id:
            solved_ids_query = solved_ids_query.filter(UserProblemStatus.user_id == target_id)

        solved_res = await db.execute(solved_ids_query)
        solved_ids = set(solved_res.scalars().all())

        query = (
            select(DSAQuestion)
            .options(selectinload(DSAQuestion.tags))
            .filter(~DSAQuestion.id.in_(solved_ids) if solved_ids else True)
            .order_by(DSAQuestion.id.asc())
            .limit(10)
        )
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_user_all_submissions(
        db: AsyncSession,
        user_id: int | None = None,
        session_id: str | None = None,
        limit: int = 50,
    ) -> list[CodeSubmission]:
        """Returns past submissions across all questions for a user or session."""
        query = select(CodeSubmission).filter(CodeSubmission.is_submission.is_(True))
        if user_id:
            query = query.filter(
                or_(
                    CodeSubmission.user_id == user_id,
                    CodeSubmission.session_id == str(user_id),
                )
            )
        elif session_id:
            query = query.filter(
                or_(
                    CodeSubmission.session_id == session_id,
                    CodeSubmission.session_id == str(session_id),
                )
            )
        else:
            return []

        query = query.order_by(CodeSubmission.created_at.desc()).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_user_problem_statuses(
        db: AsyncSession,
        user_id: int | None = None,
        session_id: str | None = None,
    ) -> list[UserProblemStatus]:
        """Returns problem solving status across questions for user or session."""
        target_id = str(user_id) if user_id else session_id
        if not target_id:
            return []
        query = select(UserProblemStatus).filter(UserProblemStatus.user_id == target_id)
        result = await db.execute(query)
        return list(result.scalars().all())
