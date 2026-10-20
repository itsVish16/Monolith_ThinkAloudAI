import asyncio
import json
import uuid
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime
from typing import Any

import structlog

from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

TASK_QUEUE_KEY = "thinkaloud:tasks:queue"
TASK_DLQ_KEY = "thinkaloud:tasks:dlq"
TASK_RESULT_PREFIX = "thinkaloud:tasks:result:"

# Handler registry mapping task_name -> async callable(payload: dict)
TaskHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, Any]]
_TASK_REGISTRY: dict[str, TaskHandler] = {}


def register_task(task_name: str):
    """
    Decorator to register a background task handler function.
    Usage:
        @register_task("interview_analysis")
        async def handle_interview_analysis(payload: dict) -> None:
            ...
    """
    def decorator(func: TaskHandler) -> TaskHandler:
        _TASK_REGISTRY[task_name] = func
        logger.info("registered_background_task_handler", task_name=task_name, handler=func.__name__)
        return func
    return decorator


async def enqueue_task(
    task_name: str,
    payload: dict[str, Any],
    max_retries: int = 3,
) -> str:
    """
    Pushes a task into the Redis task queue for asynchronous processing.
    Replaces RabbitMQ message publishing.

    Returns:
        task_id (str): Unique UUID identifier for the enqueued task.
    """
    task_id = str(uuid.uuid4())
    task_envelope = {
        "task_id": task_id,
        "task_name": task_name,
        "payload": payload,
        "attempts": 0,
        "max_retries": max_retries,
        "enqueued_at": datetime.now(UTC).isoformat(),
    }

    redis = await get_redis()
    await redis.lpush(TASK_QUEUE_KEY, json.dumps(task_envelope))
    logger.info("task_enqueued", task_id=task_id, task_name=task_name)
    return task_id


async def get_task_result(task_id: str) -> dict[str, Any] | None:
    """
    Fetches the result of an async task from Redis if available.
    """
    redis = await get_redis()
    raw = await redis.get(f"{TASK_RESULT_PREFIX}{task_id}")
    if raw:
        return json.loads(raw)
    return None


async def set_task_result(task_id: str, result: dict[str, Any], ttl_seconds: int = 86400) -> None:
    """
    Stores an execution result in Redis with TTL.
    """
    redis = await get_redis()
    await redis.setex(f"{TASK_RESULT_PREFIX}{task_id}", ttl_seconds, json.dumps(result))


async def _delayed_requeue(
    task_name: str,
    payload: dict[str, Any],
    delay_seconds: float,
) -> None:
    """
    Non-blocking delayed requeue helper.
    Sleeps in its own background task without blocking the worker BRPOP loop,
    then pushes the task back to TASK_QUEUE_KEY.
    """
    try:
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)
        redis = await get_redis()
        # If payload is already the task envelope
        if isinstance(payload, dict) and "task_id" in payload and "task_name" in payload:
            envelope = payload
        else:
            envelope = {
                "task_id": str(uuid.uuid4()),
                "task_name": task_name,
                "payload": payload,
                "attempts": 1,
                "max_retries": 3,
                "enqueued_at": datetime.now(UTC).isoformat(),
            }
        await redis.lpush(TASK_QUEUE_KEY, json.dumps(envelope))
        logger.info(
            "task_requeued_for_retry",
            task_id=envelope.get("task_id"),
            task_name=task_name,
            attempt=envelope.get("attempts"),
        )
    except Exception as e:
        logger.error("delayed_requeue_failed", task_name=task_name, error=str(e), exc_info=True)


async def task_worker_loop(stop_event: asyncio.Event) -> None:
    """
    Main dispatch loop running as a background task within FastAPI's lifespan.
    Continuously pops tasks from Redis and invokes registered task handlers.
    Zero external broker dependency (No RabbitMQ or Celery required).
    """
    logger.info("redis_task_dispatcher_started", queue=TASK_QUEUE_KEY)

    while not stop_event.is_set():
        try:
            redis = await get_redis()
            # brpop with 1.0 second timeout to permit responsive stop_event checks
            item = await redis.brpop(TASK_QUEUE_KEY, timeout=1.0)
            if item is None:
                continue

            _, raw_payload = item
            try:
                task_data = json.loads(raw_payload)
            except Exception as parse_err:
                logger.error("invalid_task_json_dropped", error=str(parse_err), raw=raw_payload)
                continue

            task_id = task_data.get("task_id", "unknown")
            task_name = task_data.get("task_name")
            payload = task_data.get("payload", {})
            attempts = task_data.get("attempts", 0) + 1
            max_retries = task_data.get("max_retries", 3)

            handler = _TASK_REGISTRY.get(task_name)
            if not handler:
                logger.error("unknown_task_handler", task_id=task_id, task_name=task_name)
                await redis.lpush(TASK_DLQ_KEY, raw_payload)
                await redis.ltrim(TASK_DLQ_KEY, 0, 999)
                continue

            logger.info("processing_task_started", task_id=task_id, task_name=task_name, attempt=attempts)

            try:
                result = await handler(payload)
                logger.info("processing_task_succeeded", task_id=task_id, task_name=task_name)
                if result is not None and isinstance(result, dict):
                    await set_task_result(task_id, {"status": "completed", "result": result})
            except Exception as exec_err:
                logger.error(
                    "processing_task_failed",
                    task_id=task_id,
                    task_name=task_name,
                    attempt=attempts,
                    error=str(exec_err),
                    exc_info=True,
                )
                if attempts < max_retries:
                    task_data["attempts"] = attempts
                    backoff = min(60, 2 ** attempts)
                    asyncio.create_task(_delayed_requeue(task_name, task_data, backoff))
                    logger.info("task_scheduled_for_retry", task_id=task_id, next_attempt=attempts + 1, delay=backoff)
                else:
                    logger.error("task_moved_to_dlq", task_id=task_id, task_name=task_name)
                    task_data["failed_at"] = datetime.now(UTC).isoformat()
                    task_data["error"] = str(exec_err)
                    await redis.lpush(TASK_DLQ_KEY, json.dumps(task_data))
                    await redis.ltrim(TASK_DLQ_KEY, 0, 999)
                    await set_task_result(
                        task_id,
                        {"status": "failed", "error": str(exec_err)},
                    )

        except asyncio.CancelledError:
            logger.info("redis_task_dispatcher_cancelled")
            break
        except Exception as e:
            if stop_event.is_set():
                break
            logger.error("redis_task_dispatcher_loop_error", error=str(e), exc_info=True)
            await asyncio.sleep(1.0)

    logger.info("redis_task_dispatcher_shutdown_complete")
