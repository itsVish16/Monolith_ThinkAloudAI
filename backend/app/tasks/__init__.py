"""
Background Task Queue and Asynchronous Workers (Redis-powered).
Replaces RabbitMQ and Celery with lightweight Redis task queues.
"""

# Import task definitions to trigger @register_task decorators
import app.tasks.analysis_tasks  # noqa: F401
import app.tasks.execution_tasks  # noqa: F401
from app.tasks.queue import (
    enqueue_task,
    get_task_result,
    register_task,
    set_task_result,
    task_worker_loop,
)

__all__ = [
    "enqueue_task",
    "get_task_result",
    "register_task",
    "set_task_result",
    "task_worker_loop",
]
