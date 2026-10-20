import sys
import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger(__name__)


class RequestContextLogMiddleware(BaseHTTPMiddleware):
    """
    Middleware that assigns a unique request ID, binds context variables for structured
    logging, synchronizes Datadog APM trace tags and response headers, and records
    request completion timing and status.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start_time = time.perf_counter()

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )

        # Datadog APM span enrichment
        dd_trace_id = None
        try:
            import ddtrace
            span = ddtrace.tracer.current_span()
            if span:
                span.set_tag("http.request_id", request_id)
                span.set_tag("http.client_ip", request.client.host if request.client else "")
                span.set_tag("http.url_path", request.url.path)
                dd_trace_id = str(span.trace_id)
                structlog.contextvars.bind_contextvars(
                    dd_trace_id=dd_trace_id,
                    dd_span_id=str(span.span_id),
                )
        except Exception:
            pass

        try:
            response = await call_next(request)
        except Exception:
            try:
                import ddtrace
                span = ddtrace.tracer.current_span()
                if span:
                    span.set_exc_info(*sys.exc_info())
            except Exception:
                pass
            logger.exception("request_failed_with_exception")
            raise

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        response.headers["X-Request-ID"] = request_id
        if dd_trace_id:
            response.headers["X-Datadog-Trace-ID"] = dd_trace_id

        # Record HTTP status on Datadog span if active
        try:
            import ddtrace
            span = ddtrace.tracer.current_span()
            if span:
                span.set_tag("http.status_code", response.status_code)
                if response.status_code >= 500:
                    span.error = 1
        except Exception:
            pass

        logger.info(
            "request_completed",
            status_code=response.status_code,
            duration_ms=round(elapsed_ms, 2),
        )

        return response
