import asyncio
import contextlib
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import app.tasks  # Register background task handlers
from app.config import settings
from app.core.database import engine, get_db
from app.core.logging import configure_logging
from app.core.rate_limit import limiter
from app.core.redis import close_redis, get_redis
from app.core.telemetry import configure_datadog, configure_langsmith
from app.middleware.logging import RequestContextLogMiddleware
from app.modules.admin.router import router as admin_router
from app.modules.analytics.router import router as analytics_router
from app.modules.auth.email_service import email_worker_loop
from app.modules.auth.models import User
from app.modules.auth.router import router as auth_router
from app.modules.chat.router import router as chat_router
from app.modules.dsa.router import router as dsa_router
from app.modules.interview.router import (
    generate_token,
    get_current_user_or_guest,
    get_interview_types,
)
from app.modules.interview.router import (
    router as interview_router,
)
from app.modules.interview.schemas import LiveKitTokenRequest
from app.modules.tracks.router import router as tracks_router
from app.tasks.queue import task_worker_loop

# Initialize structured logging
configure_logging()
logger = structlog.get_logger(__name__)

cors_origins = settings.cors_allowed_origins_list
allow_credentials = cors_origins != ["*"]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Lifespan context manager that handles startup initialization and graceful shutdown:
    - Warns if insecure dev JWT secret is in use
    - Verifies Postgres connectivity
    - Initializes Redis connection pool
    - Launches background email queue worker
    - Shuts down background workers and disposes connection pools on termination
    """
    logger.info("application_startup_initiated", app=settings.app_name, version=settings.app_version)

    if settings.JWT_SECRET_KEY == "dev-secret-key-change-me":
        logger.warning(
            "insecure_jwt_secret_in_use",
            detail="Using default JWT_SECRET_KEY. Configure a strong random secret via JWT_SECRET_KEY in production.",
        )

    # 0. Configure distributed tracing & observability (LangSmith & Datadog APM)
    configure_langsmith()
    configure_datadog()

    # 1. Database Pre-check
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("database_precheck_successful")
    except Exception as e:
        logger.warning("database_precheck_failed_on_startup", error=str(e))

    # 2. Redis Pre-check
    try:
        redis_client = await get_redis()
        await redis_client.ping()
        logger.info("redis_precheck_successful")
    except Exception as e:
        logger.warning("redis_precheck_failed_on_startup", error=str(e))

    # 3. Start background workers (Email queue and Redis task queue)
    stop_event = asyncio.Event()
    email_task = asyncio.create_task(email_worker_loop(stop_event))
    task_dispatcher = asyncio.create_task(task_worker_loop(stop_event))

    yield

    # --- Graceful Shutdown ---
    logger.info("application_shutdown_initiated")
    stop_event.set()
    email_task.cancel()
    task_dispatcher.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await asyncio.gather(email_task, task_dispatcher, return_exceptions=True)

    await close_redis()
    await engine.dispose()
    logger.info("application_shutdown_complete")


app = FastAPI(
    title=settings.app_name,
    description="Unified API Monolith backend for ThinkAloudAI platform.",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate Limiter setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Context Logging Middleware
app.add_middleware(RequestContextLogMiddleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Unhandled Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "unhandled_server_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Include Domain Routers
app.include_router(auth_router, prefix="/api/v1/auth")
app.include_router(dsa_router, prefix="/api/v1/dsa")
app.include_router(tracks_router, prefix="/api/v1/tracks")
app.include_router(tracks_router, prefix="")
app.include_router(interview_router, prefix="/api/v1/interviews")
app.include_router(interview_router, prefix="/interviews")
app.include_router(interview_router, prefix="/api/interview")
app.include_router(interview_router, prefix="/api/interviews")
app.include_router(analytics_router, prefix="/api/v1/analytics")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(chat_router, prefix="")
app.include_router(admin_router, prefix="/api/v1/admin")
app.include_router(admin_router, prefix="/admin")
app.include_router(admin_router, prefix="/api/admin")


@app.get("/api/interview-types", tags=["interviews"], include_in_schema=False)
async def get_interview_types_alias():
    return await get_interview_types()


@app.post("/api/token", tags=["interviews"], include_in_schema=False)
async def generate_token_root_alias(
    payload: LiveKitTokenRequest,
    current_user: User = Depends(get_current_user_or_guest),
    db: AsyncSession = Depends(get_db),
):
    return await generate_token(payload=payload, current_user=current_user, db=db)



# --- Health & Diagnostic Endpoints ---
@app.get("/", tags=["health"])
async def root():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health/live", tags=["health"])
async def health_live():
    """Liveness probe: verifies process is running."""
    return {"status": "alive"}


@app.get("/health/ready", tags=["health"])
@app.get("/health", tags=["health"])
@app.get("/api/v1/health", tags=["health"])
async def health_ready(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Readiness probe: validates Postgres and Redis health."""
    health: dict = {"status": "healthy", "dependencies": {}}

    try:
        await db.execute(text("SELECT 1"))
        health["dependencies"]["postgres"] = "up"
    except Exception as e:
        health["dependencies"]["postgres"] = f"down ({e})"
        health["status"] = "degraded"

    try:
        await redis.ping()
        health["dependencies"]["redis"] = "up"
    except Exception as e:
        health["dependencies"]["redis"] = f"down ({e})"
        health["status"] = "degraded"

    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)
