import os
import re
import ssl
from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, quote_plus, unquote_plus, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def strip_ssl_query_params(url: str) -> str:
    """
    Strips libpq SSL query parameters (like sslmode, sslrootcert, etc.) from the URL.
    asyncpg crashes with a TypeError if passed libpq ssl query parameters in the connection URL.
    """
    if not url or "?" not in url:
        return url

    parsed = urlsplit(url)
    ssl_keys = {
        "sslmode",
        "ssl",
        "sslrootcert",
        "sslcert",
        "sslkey",
        "sslpassword",
        "sslcrl",
        "sslcompression",
        "sslfactory",
    }
    query_params = parse_qsl(parsed.query, keep_blank_values=True)
    filtered = [(k, v) for k, v in query_params if k.lower() not in ssl_keys]
    new_query = urlencode(filtered)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))


def get_normalized_db_url(raw_url: str) -> str:
    """
    Normalizes a database URL:
    - Converts postgresql:// or postgres:// to postgresql+asyncpg://
    - Safely URL-encodes credentials (username and password)
    - Strips query string parameters like ?sslmode=... before passing to asyncpg
    """
    if not raw_url:
        return "postgresql+asyncpg://thinkaloud:thinkaloud_dev@localhost:5432/postgres"

    url = raw_url.strip()
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    match = re.match(r"^(postgresql\+asyncpg://)(.*)@([^@/]+(?::\d+)?(?:/.*)?)$", url)
    if match:
        proto, creds, rest = match.groups()
        if ":" in creds:
            u, p = creds.split(":", 1)
            encoded_u = quote_plus(unquote_plus(u))
            encoded_p = quote_plus(unquote_plus(p))
            url = f"{proto}{encoded_u}:{encoded_p}@{rest}"

    return strip_ssl_query_params(url)


def build_ssl_context(ssl_mode: str = "prefer") -> ssl.SSLContext:
    """
    Builds an ssl.SSLContext configured for AWS RDS PostgreSQL.
    Loads the CA bundle from RDS_CA_BUNDLE_PATH or certifi.
    Configures check_hostname and verify_mode based on ssl_mode:
    - "verify-full": check_hostname=True, verify_mode=CERT_REQUIRED
    - "verify-ca": check_hostname=False, verify_mode=CERT_REQUIRED
    - "require" / "prefer": check_hostname=False, verify_mode=CERT_NONE
    """
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

    ca_bundle_path = None
    local_certs = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "certs", "global-bundle.pem"))
    if settings.RDS_CA_BUNDLE_PATH and os.path.exists(settings.RDS_CA_BUNDLE_PATH):
        ca_bundle_path = settings.RDS_CA_BUNDLE_PATH
    elif os.path.exists(local_certs):
        ca_bundle_path = local_certs
    else:
        try:
            import certifi
            certifi_path = certifi.where()
            if os.path.exists(certifi_path):
                ca_bundle_path = certifi_path
        except ImportError:
            pass

    if ca_bundle_path:
        try:
            ctx.load_verify_locations(cafile=ca_bundle_path)
        except Exception:
            ctx.load_default_certs()
    else:
        ctx.load_default_certs()

    mode = ssl_mode.strip().lower()
    if mode == "verify-full":
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
    elif mode == "verify-ca":
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_REQUIRED
    else:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    return ctx


def get_db_connect_args(raw_url: str | None = None) -> dict:
    """
    Returns connect_args dictionary for SQLAlchemy asyncpg engine:
    - TCP keepalives to prevent AWS NAT Gateway 350-second idle connection drops:
        tcp_keepalives_idle = 60
        tcp_keepalives_interval = 10
        tcp_keepalives_count = 5
    - SSLContext when SSL is requested or RDS is enabled
    """
    url_to_check = raw_url if raw_url is not None else (settings.DATABASE_URL or "")

    if url_to_check.startswith("sqlite"):
        return {}

    connect_args: dict = {
        "server_settings": {
            "tcp_keepalives_idle": "60",
            "tcp_keepalives_interval": "10",
            "tcp_keepalives_count": "5",
        }
    }

    url_ssl_mode = None
    if "?" in url_to_check:
        parsed = urlsplit(url_to_check)
        query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
        for k, v in query_params.items():
            if k.lower() in ("sslmode", "ssl"):
                url_ssl_mode = v.strip().lower()
                break

    rds_enabled = bool(settings.RDS_HOST)
    rds_ssl_mode = (settings.RDS_SSL_MODE or "prefer").strip().lower()

    ssl_enabled = False
    effective_ssl_mode = "prefer"

    if url_ssl_mode is not None:
        if url_ssl_mode not in ("disable", "false", "0", "no", "off"):
            ssl_enabled = True
            effective_ssl_mode = url_ssl_mode
    elif rds_enabled:
        if rds_ssl_mode not in ("disable", "false", "0", "no", "off"):
            ssl_enabled = True
            effective_ssl_mode = rds_ssl_mode
    elif rds_ssl_mode in ("require", "verify-ca", "verify-full"):
        ssl_enabled = True
        effective_ssl_mode = rds_ssl_mode

    if ssl_enabled:
        ssl_context = build_ssl_context(effective_ssl_mode)
        if ssl_context:
            connect_args["ssl"] = ssl_context

    return connect_args


db_url: str = get_normalized_db_url(settings.DATABASE_URL)
connect_args: dict = get_db_connect_args(settings.DATABASE_URL)

engine_kwargs: dict = {}
if db_url.startswith("postgresql"):
    engine_kwargs.update(
        {
            "pool_pre_ping": True,
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
            "pool_timeout": settings.db_pool_timeout,
            "pool_recycle": settings.db_pool_recycle,
            "connect_args": connect_args,
        }
    )

engine: AsyncEngine = create_async_engine(
    db_url,
    echo=settings.debug,
    **engine_kwargs,
)

SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy ORM models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an async database session."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
