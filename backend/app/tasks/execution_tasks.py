import asyncio
import json
from typing import Any

import structlog
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.redis import get_redis
from app.modules.dsa.models import CodeSubmission
from app.modules.dsa.runner import run_code_isolated
from app.tasks.queue import register_task

logger = structlog.get_logger(__name__)


@register_task("code_execution")
async def execute_code_async(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Non-blocking async task handler for sandboxed code execution.
    Executes Python or C++ solutions against test cases in an isolated subprocess/e2b runner.
    """
    submission_id = payload.get("submission_id")
    code = payload["code"]
    language = payload.get("language", "python")
    test_cases_json = payload.get("test_cases", "[]")
    default_function_name = payload.get("function_name", "solution")
    cpp_test_harness = payload.get("cpp_test_harness", "")
    session_id = payload.get("session_id")

    logger.info(
        "async_code_execution_started",
        submission_id=submission_id,
        language=language,
        session_id=session_id,
    )

    # Offload blocking runner to worker thread to avoid blocking asyncio event loop
    result: dict[str, Any] = await asyncio.to_thread(
        run_code_isolated,
        code=code,
        language=language,
        test_cases_json=test_cases_json,
        default_function_name=default_function_name,
        cpp_test_harness=cpp_test_harness,
    )

    # If linked to a database submission record, update its status & metrics
    if submission_id:
        try:
            async with SessionLocal() as db:
                stmt = select(CodeSubmission).where(CodeSubmission.id == int(submission_id))
                sub_res = await db.execute(stmt)
                submission = sub_res.scalar_one_or_none()
                if submission:
                    submission.status = result.get("status", "Error")
                    submission.error_message = result.get("error")
                    submission.execution_time_ms = result.get("runtime_ms")
                    submission.passed_tests = result.get("passed_tests")
                    submission.total_tests = result.get("total_tests")
                    await db.commit()
                    logger.info("updated_code_submission_record", submission_id=submission_id, status=submission.status)
        except Exception as db_err:
            logger.error("failed_to_update_code_submission", submission_id=submission_id, error=str(db_err))

    # Publish execution event to Redis pub/sub for real-time frontend notifications
    try:
        redis = await get_redis()
        event_payload = {
            "event": "CodeExecutionCompleted",
            "submission_id": submission_id,
            "session_id": session_id,
            "status": result.get("status"),
            "passed_tests": result.get("passed_tests"),
            "total_tests": result.get("total_tests"),
            "runtime_ms": result.get("runtime_ms"),
            "error": result.get("error"),
        }
        await redis.publish("execution_events", json.dumps(event_payload))
    except Exception as redis_err:
        logger.warning("failed_to_publish_execution_event", error=str(redis_err))

    logger.info("async_code_execution_finished", submission_id=submission_id, status=result.get("status"))
    return result
