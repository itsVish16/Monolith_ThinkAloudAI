import ssl
from unittest.mock import patch

from app.config import Settings
from app.core.database import (
    build_ssl_context,
    get_db_connect_args,
    get_normalized_db_url,
    strip_ssl_query_params,
)


def test_rds_settings_defaults():
    """Verify default connection pool sizing and RDS configs for micro instances."""
    s = Settings(_env_file=None)
    assert s.db_pool_size == 5
    assert s.DB_POOL_SIZE == 5
    assert s.db_max_overflow == 5
    assert s.DB_MAX_OVERFLOW == 5
    assert s.db_pool_timeout == 30
    assert s.DB_POOL_TIMEOUT == 30
    assert s.db_pool_recycle == 300
    assert s.DB_POOL_RECYCLE == 300
    assert s.RDS_PORT == 5432
    assert s.RDS_SSL_MODE == "prefer"
    assert s.RDS_CA_BUNDLE_PATH == "/app/certs/global-bundle.pem"


def test_dynamic_database_url_synthesis():
    """Verify DATABASE_URL is dynamically constructed when RDS_HOST and RDS_DB_NAME are set."""
    s = Settings(
        _env_file=None,
        RDS_HOST="thinkaloud-db.c3xyz.us-east-1.rds.amazonaws.com",
        RDS_PORT=5432,
        RDS_DB_NAME="thinkaloud_monolith",
        RDS_USERNAME="rdsadmin",
        RDS_PASSWORD="supersecretpassword!@#",
    )
    assert "postgresql+asyncpg://rdsadmin:supersecretpassword%21%40%23@thinkaloud-db.c3xyz.us-east-1.rds.amazonaws.com:5432/thinkaloud_monolith" in s.DATABASE_URL


def test_dynamic_database_url_without_credentials():
    """Verify DATABASE_URL synthesis without username/password."""
    s = Settings(
        _env_file=None,
        RDS_HOST="10.0.1.50",
        RDS_PORT=5433,
        RDS_DB_NAME="testdb",
    )
    assert s.DATABASE_URL == "postgresql+asyncpg://10.0.1.50:5433/testdb"


def test_strip_ssl_query_params():
    """Verify libpq SSL query params are cleanly stripped so asyncpg does not crash."""
    url = "postgresql+asyncpg://user:pass@mydb.rds.amazonaws.com:5432/db?sslmode=require&target_session_attrs=primary"
    cleaned = strip_ssl_query_params(url)
    assert "sslmode" not in cleaned
    assert "target_session_attrs=primary" in cleaned

    url_only_ssl = "postgresql://user:pass@mydb.rds.amazonaws.com:5432/db?sslmode=require"
    cleaned_only = strip_ssl_query_params(url_only_ssl)
    assert cleaned_only == "postgresql://user:pass@mydb.rds.amazonaws.com:5432/db"


def test_get_normalized_db_url():
    """Verify get_normalized_db_url handles schemes, encoded passwords, and strips sslmode."""
    # Test postgresql:// -> postgresql+asyncpg:// and strip ?sslmode=require
    raw = "postgresql://user:p%40ss@mydb.rds.amazonaws.com:5432/db?sslmode=require"
    normalized = get_normalized_db_url(raw)
    assert normalized == "postgresql+asyncpg://user:p%40ss@mydb.rds.amazonaws.com:5432/db"

    # Test postgres:// scheme
    raw2 = "postgres://admin:secret@127.0.0.1:5432/devdb"
    assert get_normalized_db_url(raw2) == "postgresql+asyncpg://admin:secret@127.0.0.1:5432/devdb"


def test_tcp_keepalives_in_connect_args():
    """Verify TCP keepalives are set to prevent AWS NAT Gateway 350-second idle drops."""
    args = get_db_connect_args("postgresql+asyncpg://user:pass@localhost:5432/test")
    server_settings = args.get("server_settings", {})
    assert server_settings.get("tcp_keepalives_idle") == "60"
    assert server_settings.get("tcp_keepalives_interval") == "10"
    assert server_settings.get("tcp_keepalives_count") == "5"


def test_build_ssl_context_modes():
    """Verify SSLContext check_hostname and verify_mode across various SSL modes."""
    # prefer / require (encryption without strict hostname check)
    ctx_req = build_ssl_context("require")
    assert ctx_req.check_hostname is False
    assert ctx_req.verify_mode == ssl.CERT_NONE

    ctx_pref = build_ssl_context("prefer")
    assert ctx_pref.check_hostname is False
    assert ctx_pref.verify_mode == ssl.CERT_NONE

    # verify-ca (CA verification without hostname check)
    ctx_ca = build_ssl_context("verify-ca")
    assert ctx_ca.check_hostname is False
    assert ctx_ca.verify_mode == ssl.CERT_REQUIRED

    # verify-full (Strict CA and hostname verification)
    ctx_full = build_ssl_context("verify-full")
    assert ctx_full.check_hostname is True
    assert ctx_full.verify_mode == ssl.CERT_REQUIRED


def test_get_db_connect_args_ssl_activation():
    """Verify SSLContext is attached when RDS is enabled or requested via URL."""
    # Local without RDS: no ssl attached
    with patch("app.core.database.settings.RDS_HOST", None):
        args_local = get_db_connect_args("postgresql+asyncpg://user:pass@localhost:5432/db")
        assert "ssl" not in args_local

    # URL specifies sslmode=require
    with patch("app.core.database.settings.RDS_HOST", None):
        args_url = get_db_connect_args("postgresql+asyncpg://user:pass@localhost:5432/db?sslmode=require")
        assert "ssl" in args_url
        assert isinstance(args_url["ssl"], ssl.SSLContext)

    # RDS_HOST is configured
    with patch("app.core.database.settings.RDS_HOST", "my-rds.amazonaws.com"), \
         patch("app.core.database.settings.RDS_SSL_MODE", "prefer"):
        args_rds = get_db_connect_args("postgresql+asyncpg://user:pass@my-rds.amazonaws.com:5432/db")
        assert "ssl" in args_rds
        assert isinstance(args_rds["ssl"], ssl.SSLContext)

    # RDS with SSL disabled explicitly
    with patch("app.core.database.settings.RDS_HOST", "my-rds.amazonaws.com"), \
         patch("app.core.database.settings.RDS_SSL_MODE", "disable"):
        args_rds_disabled = get_db_connect_args("postgresql+asyncpg://user:pass@my-rds.amazonaws.com:5432/db")
        assert "ssl" not in args_rds_disabled


def test_sqlite_connect_args_empty():
    """Verify sqlite urls return empty connect_args to avoid dialect errors."""
    assert get_db_connect_args("sqlite+aiosqlite:///:memory:") == {}
