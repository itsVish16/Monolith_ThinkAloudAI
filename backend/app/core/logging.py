import logging
import sys
from typing import Any

import structlog

from app.config import settings


def datadog_trace_injection(logger: Any, log_method: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Injects Datadog trace and span IDs if ddtrace is installed and active."""
    try:
        import ddtrace

        span = ddtrace.tracer.current_span()
        if span:
            event_dict["dd.trace_id"] = str(span.trace_id)
            event_dict["dd.span_id"] = str(span.span_id)
            event_dict["dd.env"] = ddtrace.config.env or ""
            event_dict["dd.service"] = ddtrace.config.service or ""
            event_dict["dd.version"] = ddtrace.config.version or ""
    except ImportError:
        pass
    return event_dict


def configure_logging() -> None:
    """Configures structured console logging for the application."""
    log_level = logging.DEBUG if settings.debug else logging.INFO

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        datadog_trace_injection,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    renderer = (
        structlog.dev.ConsoleRenderer(colors=True)
        if settings.debug
        else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Bridge standard logging to structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
        force=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Returns a structured logger for the specified module name."""
    return structlog.get_logger(name)
