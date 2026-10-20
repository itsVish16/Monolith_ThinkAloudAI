import logging

from redis.asyncio import ConnectionPool, Redis

from app.config import settings

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None
_client: Redis | None = None


async def get_redis() -> Redis:
    """
    Returns an async Redis client instance, reusing the connection pool.
    """
    global _client, _pool
    if _client is None:
        pool_kwargs = {
            "decode_responses": True,
            "max_connections": settings.redis_max_connections,
            "health_check_interval": 30,
        }
        # Only pass SSL args when using TLS (rediss://) URLs
        if settings.REDIS_URL.startswith("rediss://"):
            pool_kwargs["ssl_cert_reqs"] = "none"

        _pool = ConnectionPool.from_url(settings.REDIS_URL, **pool_kwargs)
        _client = Redis(connection_pool=_pool)
        logger.info("Redis connection pool created")
    return _client


async def close_redis() -> None:
    """
    Closes the Redis client and connection pool.
    """
    global _pool, _client

    if _client:
        await _client.close()
        _client = None
    if _pool:
        await _pool.disconnect()
        _pool = None
    logger.info("Redis connection pool closed")
