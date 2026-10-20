import logging
from collections.abc import Callable

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

logger = logging.getLogger(__name__)


def _get_client_ip(request: Request) -> str:
    """
    Extracts client IP address, respecting proxy headers if configured.
    """
    if settings.rate_limit_trust_proxy_headers:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return get_remote_address(request) or "127.0.0.1"


def create_limiter(key_func: Callable[[Request], str] = _get_client_ip) -> Limiter:
    """
    Initializes SlowAPI Limiter configured with Redis backend.
    Enables in-memory fallback and swallows connection errors when Redis is temporarily
    offline or during offline test execution.
    """
    if not settings.enable_rate_limiting:
        return Limiter(
            key_func=key_func,
            enabled=False,
        )

    storage_uri = settings.REDIS_URL
    if storage_uri.startswith("memory://") or not storage_uri:
        return Limiter(
            key_func=key_func,
            storage_uri="memory://",
            enabled=True,
        )

    return Limiter(
        key_func=key_func,
        storage_uri=storage_uri,
        in_memory_fallback_enabled=True,
        swallow_errors=True,
        enabled=True,
    )


limiter: Limiter = create_limiter()
