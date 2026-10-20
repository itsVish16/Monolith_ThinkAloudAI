import os
from functools import cached_property
from os import cpu_count
from urllib.parse import quote_plus

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Unified configuration settings for ThinkAloudAI Monolith.
    Supports reading from environment variables and .env files.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application / Server Settings ---
    debug: bool = False
    app_name: str = "ThinkAloudAI Platform"
    app_version: str = "1.0.0"
    api_prefix: str = "/api/v1"
    frontend_base_url: str = Field(
        default="https://thinkaloudai.tech",
        validation_alias=AliasChoices("FRONTEND_BASE_URL", "frontend_base_url"),
    )
    cors_allowed_origins: str = Field(
        default="https://thinkaloudai.tech,https://www.thinkaloudai.tech,http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000",
        validation_alias=AliasChoices("CORS_ALLOWED_ORIGINS", "cors_allowed_origins"),
    )

    # --- AWS RDS PostgreSQL Settings ---
    RDS_HOST: str | None = Field(
        default=None,
        validation_alias=AliasChoices("RDS_HOST", "rds_host"),
    )
    RDS_PORT: int = Field(
        default=5432,
        validation_alias=AliasChoices("RDS_PORT", "rds_port"),
    )
    RDS_DB_NAME: str | None = Field(
        default=None,
        validation_alias=AliasChoices("RDS_DB_NAME", "rds_db_name", "RDS_DATABASE", "rds_database"),
    )
    RDS_USERNAME: str | None = Field(
        default=None,
        validation_alias=AliasChoices("RDS_USERNAME", "rds_username", "RDS_USER", "rds_user"),
    )
    RDS_PASSWORD: str | None = Field(
        default=None,
        validation_alias=AliasChoices("RDS_PASSWORD", "rds_password"),
    )
    RDS_SSL_MODE: str = Field(
        default="prefer",
        validation_alias=AliasChoices("RDS_SSL_MODE", "rds_ssl_mode"),
    )  # "disable", "prefer", "require", "verify-full"
    RDS_CA_BUNDLE_PATH: str | None = Field(
        default="/app/certs/global-bundle.pem",
        validation_alias=AliasChoices("RDS_CA_BUNDLE_PATH", "rds_ca_bundle_path"),
    )

    # --- Database Settings & Connection Pool (Tuned for RDS micro instances) ---
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://thinkaloud:thinkaloud_dev@localhost:5432/postgres",
        validation_alias=AliasChoices(
            "DATABASE_URL",
            "USER_SERVICE_DATABASE_URL",
            "MAIN_SERVICE_DATABASE_URL",
            "POSTGRES_URL",
            "database_url",
        ),
    )
    db_pool_size: int = Field(
        default=5,
        validation_alias=AliasChoices("DB_POOL_SIZE", "db_pool_size"),
    )
    db_max_overflow: int = Field(
        default=5,
        validation_alias=AliasChoices("DB_MAX_OVERFLOW", "db_max_overflow"),
    )
    db_pool_timeout: int = Field(
        default=30,
        validation_alias=AliasChoices("DB_POOL_TIMEOUT", "db_pool_timeout"),
    )
    db_pool_recycle: int = Field(
        default=300,
        validation_alias=AliasChoices("DB_POOL_RECYCLE", "db_pool_recycle"),
    )

    # --- Redis Settings ---
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        validation_alias=AliasChoices("REDIS_URL", "redis_url"),
    )
    redis_max_connections: int = 100

    # --- Security & JWT Settings ---
    JWT_SECRET_KEY: str = Field(
        default="dev-secret-key-change-me",
        validation_alias=AliasChoices("JWT_SECRET_KEY", "SECRET_KEY", "jwt_secret_key", "secret_key"),
    )
    algorithm: str = Field(
        default="HS256",
        validation_alias=AliasChoices("JWT_ALGORITHM", "algorithm", "jwt_algorithm"),
    )
    jwt_issuer: str = "thinkaloud-monolith"
    access_token_expire_minutes: int = Field(
        default=30,
        validation_alias=AliasChoices("ACCESS_TOKEN_EXPIRE_MINUTES", "access_token_expire_minutes"),
    )
    refresh_token_expire_minutes: int = Field(
        default=10080,  # 7 days
        validation_alias=AliasChoices("REFRESH_TOKEN_EXPIRE_MINUTES", "refresh_token_expire_minutes"),
    )
    admin_emails: str = Field(
        default="admin@thinkaloudai.tech,vishalsaini160204@gmail.com",
        validation_alias=AliasChoices("ADMIN_EMAILS", "admin_emails"),
    )
    bcrypt_concurrency: int = cpu_count() or 4

    # --- Rate Limiting & Auth Policies ---
    enable_rate_limiting: bool = True
    rate_limit_trust_proxy_headers: bool = False
    rate_limit_signup: str = "5/minute"
    rate_limit_login: str = "10/minute"
    rate_limit_refresh: str = "10/minute"
    rate_limit_forgot_password: str = "5/minute"
    rate_limit_reset_password: str = "5/minute"
    rate_limit_verify_email: str = "5/minute"
    rate_limit_resend_verification: str = "5/minute"

    profile_cache_ttl_seconds: int = 300
    otp_ttl_seconds: int = 900
    max_login_attempts: int = 5
    login_lockout_seconds: int = 900

    # --- Email Service (Resend) ---
    resend_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("RESEND_API_KEY", "resend_api_key", "RESEND_KEY", "resend_key"),
    )
    email_from: str = Field(
        default="ThinkAloudAI <onboarding@resend.dev>",
        validation_alias=AliasChoices("EMAIL_FROM", "email_from", "RESEND_FROM_EMAIL", "resend_from_email"),
    )
    email_delivery_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("EMAIL_DELIVERY_ENABLED", "email_delivery_enabled"),
    )

    # --- LiveKit WebRTC Cloud ---
    livekit_url: str = Field(
        default="",
        validation_alias=AliasChoices("LIVEKIT_URL", "livekit_url"),
    )
    livekit_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("LIVEKIT_API_KEY", "livekit_api_key"),
    )
    livekit_api_secret: str = Field(
        default="",
        validation_alias=AliasChoices("LIVEKIT_API_SECRET", "livekit_api_secret"),
    )

    # --- Sarvam AI (Voice STT / TTS & Voice Agent LLM) ---
    sarvam_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("SARVAM_API_KEY", "sarvam_api_key"),
    )
    sarvam_base_url: str = "https://api.sarvam.ai/v2"
    sarvam_model: str = "gemma4"
    sarvam_tts_model: str = Field(
        default="bulbul:v4-flash",
        validation_alias=AliasChoices("SARVAM_TTS_MODEL", "sarvam_tts_model"),
    )
    sarvam_tts_speaker: str = Field(
        default="shubh_en_numbers",
        validation_alias=AliasChoices("SARVAM_TTS_SPEAKER", "sarvam_tts_speaker"),
    )
    sarvam_tts_language: str = Field(
        default="en-IN",
        validation_alias=AliasChoices("SARVAM_TTS_LANGUAGE", "sarvam_tts_language"),
    )
    sarvam_tts_pace: float = Field(
        default=1.0,
        validation_alias=AliasChoices("SARVAM_TTS_PACE", "sarvam_tts_pace"),
    )
    sarvam_tts_sample_rate: int = Field(
        default=24000,
        validation_alias=AliasChoices("SARVAM_TTS_SAMPLE_RATE", "sarvam_tts_sample_rate"),
    )
    sarvam_tts_ws_url: str = Field(
        default="wss://api.sarvam.ai/text-to-speech/ws",
        validation_alias=AliasChoices("SARVAM_TTS_WS_URL", "sarvam_tts_ws_url"),
    )
    sarvam_stt_model: str = "saaras:v3"
    sarvam_stt_language: str = "en-IN"

    # --- LiveKit Voice Agent Tuning ---
    voice_agent_endpointing_delay: float = Field(
        default=0.6,
        description="Minimum duration of silence (seconds) before finalizing a speech turn.",
        validation_alias=AliasChoices("VOICE_AGENT_ENDPOINTING_DELAY", "voice_agent_endpointing_delay"),
    )
    voice_agent_max_tokens: int = Field(
        default=120,
        description="Max token limit for spoken turns to guarantee fast voice latency.",
        validation_alias=AliasChoices("VOICE_AGENT_MAX_TOKENS", "voice_agent_max_tokens"),
    )

    # --- Fireworks AI ---
    fireworks_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("FIREWORKS_API_KEY", "fireworks_api_key"),
    )
    fireworks_base_url: str = "https://api.fireworks.ai/inference/v1"
    fireworks_model: str = "accounts/fireworks/routers/glm-5p2-fast"

    # --- Additional LLM Keys ---
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENAI_API_KEY", "openai_api_key"),
    )
    anthropic_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ANTHROPIC_API_KEY", "anthropic_api_key"),
    )
    gemini_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_API_KEY", "gemini_api_key"),
    )

    # --- E2B Sandbox Execution & Search ---
    e2b_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("E2B_API_KEY", "e2b_api_key"),
    )
    tavily_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("TAVILY_API_KEY", "tavily_api_key"),
    )

    assemblyai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ASSEMBLYAI_API_KEY", "assemblyai_api_key"),
    )
    assemblyai_sample_rate: int = 16000
    assemblyai_ws_url: str = "wss://api.assemblyai.com/v2/realtime/ws"

    # --- Deepgram, Cartesia, & Speechmatics Voice Fallbacks ---
    deepgram_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("DEEPGRAM_API_KEY", "deepgram_api_key"),
    )
    cartesia_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("CARTESIA_API_KEY", "cartesia_api_key"),
    )
    speechmatics_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("SPEECHMATICS_API_KEY", "speechmatics_api_key"),
    )

    # --- Observability & Tracing (LangSmith & Opik) ---
    langsmith_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "LANGSMITH_API_KEY",
            "LANGCHAIN_API_KEY",
            "LangSmith_API_KEY",
            "langsmith_api_key",
            "langchain_api_key",
        ),
    )
    langsmith_project: str = Field(
        default="ThinkAloudAI",
        validation_alias=AliasChoices(
            "LANGSMITH_PROJECT",
            "LANGCHAIN_PROJECT",
            "langsmith_project",
            "langchain_project",
        ),
    )
    langsmith_endpoint: str = Field(
        default="https://api.smith.langchain.com",
        validation_alias=AliasChoices(
            "LANGSMITH_ENDPOINT",
            "LANGCHAIN_ENDPOINT",
            "langsmith_endpoint",
            "langchain_endpoint",
        ),
    )
    langchain_tracing_v2: bool = Field(
        default=True,
        validation_alias=AliasChoices("LANGCHAIN_TRACING_V2", "langchain_tracing_v2", "LANGSMITH_TRACING"),
    )

    opik_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPIK_API_KEY", "opik_api_key"),
    )
    opik_workspace: str = "default"
    opik_project_name: str = "ThinkAloud.ai"

    dd_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("DD_API_KEY", "dd_api_key"),
    )
    dd_site: str = Field(
        default="datadoghq.com",
        validation_alias=AliasChoices("DD_SITE", "dd_site"),
    )
    dd_env: str = Field(
        default="production",
        validation_alias=AliasChoices("DD_ENV", "dd_env"),
    )
    dd_service: str = Field(
        default="thinkaloudai-monolith",
        validation_alias=AliasChoices("DD_SERVICE", "dd_service"),
    )
    dd_version: str = Field(
        default="1.0.0",
        validation_alias=AliasChoices("DD_VERSION", "dd_version"),
    )
    dd_agent_host: str = Field(
        default="localhost",
        validation_alias=AliasChoices("DD_AGENT_HOST", "dd_agent_host"),
    )
    dd_agent_port: int = Field(
        default=8126,
        validation_alias=AliasChoices("DD_AGENT_PORT", "dd_agent_port"),
    )
    dd_trace_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("DD_TRACE_ENABLED", "dd_trace_enabled"),
    )
    dd_logs_injection: bool = Field(
        default=True,
        validation_alias=AliasChoices("DD_LOGS_INJECTION", "dd_logs_injection"),
    )

    def model_post_init(self, __context) -> None:
        # Fallback check for JWT Secret Key
        if self.JWT_SECRET_KEY == "dev-secret-key-change-me":
            env_secret = os.environ.get("JWT_SECRET_KEY") or os.environ.get("SECRET_KEY")
            if env_secret:
                self.JWT_SECRET_KEY = env_secret.strip()

        # Sanitize string fields
        self.resend_api_key = self.resend_api_key.strip().strip("'\"")
        self.email_from = self.email_from.strip().strip("'\"")
        self.livekit_url = self.livekit_url.strip().strip("'\"")
        self.livekit_api_key = self.livekit_api_key.strip().strip("'\"")
        self.livekit_api_secret = self.livekit_api_secret.strip().strip("'\"")
        self.sarvam_api_key = self.sarvam_api_key.strip().strip("'\"")
        self.assemblyai_api_key = self.assemblyai_api_key.strip().strip("'\"")
        self.langsmith_api_key = self.langsmith_api_key.strip().strip("'\"")
        self.fireworks_api_key = self.fireworks_api_key.strip().strip("'\"")
        self.e2b_api_key = self.e2b_api_key.strip().strip("'\"")
        self.tavily_api_key = self.tavily_api_key.strip().strip("'\"")

        # Sanitize RDS configuration
        if self.RDS_HOST:
            self.RDS_HOST = self.RDS_HOST.strip().strip("'\"")
        if self.RDS_DB_NAME:
            self.RDS_DB_NAME = self.RDS_DB_NAME.strip().strip("'\"")
        if self.RDS_USERNAME:
            self.RDS_USERNAME = self.RDS_USERNAME.strip().strip("'\"")
        if self.RDS_PASSWORD:
            self.RDS_PASSWORD = self.RDS_PASSWORD.strip().strip("'\"")
        if self.RDS_SSL_MODE:
            self.RDS_SSL_MODE = self.RDS_SSL_MODE.strip().strip("'\"")
        if self.RDS_CA_BUNDLE_PATH:
            self.RDS_CA_BUNDLE_PATH = self.RDS_CA_BUNDLE_PATH.strip().strip("'\"")

        # Dynamically synthesize DATABASE_URL if RDS_HOST and RDS_DB_NAME are set
        if self.RDS_HOST and self.RDS_DB_NAME:
            user = quote_plus(self.RDS_USERNAME) if self.RDS_USERNAME else ""
            pwd = f":{quote_plus(self.RDS_PASSWORD)}" if self.RDS_PASSWORD else ""
            auth = f"{user}{pwd}@" if (user or pwd) else ""
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{auth}{self.RDS_HOST}:{self.RDS_PORT}/{self.RDS_DB_NAME}"
            )

        if self.resend_api_key:
            self.email_delivery_enabled = True

    @cached_property
    def cors_allowed_origins_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]
        return origins or ["http://localhost:3000"]

    @cached_property
    def admin_emails_list(self) -> list[str]:
        emails = [email.strip().lower() for email in self.admin_emails.split(",") if email.strip()]
        return emails

    @property
    def LIVEKIT_URL(self) -> str:
        return self.livekit_url

    @property
    def LIVEKIT_API_KEY(self) -> str:
        return self.livekit_api_key

    @property
    def LIVEKIT_API_SECRET(self) -> str:
        return self.livekit_api_secret

    @property
    def DB_POOL_SIZE(self) -> int:
        return self.db_pool_size

    @property
    def DB_MAX_OVERFLOW(self) -> int:
        return self.db_max_overflow

    @property
    def DB_POOL_TIMEOUT(self) -> int:
        return self.db_pool_timeout

    @property
    def DB_POOL_RECYCLE(self) -> int:
        return self.db_pool_recycle

    @property
    def FIREWORKS_API_KEY(self) -> str:
        return self.fireworks_api_key

    @property
    def FIREWORKS_BASE_URL(self) -> str:
        return self.fireworks_base_url

    @property
    def FIREWORKS_MODEL(self) -> str:
        return self.fireworks_model

    @property
    def TAVILY_API_KEY(self) -> str:
        return self.tavily_api_key

    @property
    def OPIK_API_KEY(self) -> str:
        return self.opik_api_key

    @property
    def SARVAM_API_KEY(self) -> str:
        return self.sarvam_api_key

    @property
    def SARVAM_BASE_URL(self) -> str:
        return self.sarvam_base_url

    @property
    def SARVAM_MODEL(self) -> str:
        return self.sarvam_model


settings = Settings()
