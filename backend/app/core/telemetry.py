import os
from collections.abc import Callable
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Fallback definitions
try:
    from langsmith import traceable
except ImportError:
    def traceable(**kwargs: Any) -> Callable:
        def decorator(func: Callable) -> Callable:
            return func
        return decorator

try:
    from langsmith.wrappers import wrap_openai
except ImportError:
    def wrap_openai(client: Any) -> Any:
        return client


def configure_langsmith(force: bool = False) -> bool:
    """
    Configures LangSmith distributed tracing across the process by exporting
    required environment variables (LANGCHAIN_TRACING_V2, LANGCHAIN_API_KEY, etc.)
    which are read by LangGraph, LangChain, and LangSmith SDK.
    """
    # Check if already active and not forcing reconfiguration
    if not force and os.environ.get("LANGCHAIN_TRACING_V2") == "true" and os.environ.get("LANGCHAIN_API_KEY"):
        return True

    from app.config import settings

    langsmith_key = (
        os.getenv("LANGSMITH_API_KEY")
        or os.getenv("LANGCHAIN_API_KEY")
        or getattr(settings, "langsmith_api_key", "")
    )

    if not langsmith_key or not langsmith_key.strip():
        logger.debug("langsmith_tracing_not_configured_no_api_key")
        return False

    langsmith_key = langsmith_key.strip()
    project = (
        os.getenv("LANGSMITH_PROJECT")
        or os.getenv("LANGCHAIN_PROJECT")
        or getattr(settings, "langsmith_project", "ThinkAloudAI")
    )
    endpoint = (
        os.getenv("LANGSMITH_ENDPOINT")
        or os.getenv("LANGCHAIN_ENDPOINT")
        or getattr(settings, "langsmith_endpoint", "https://api.smith.langchain.com")
    )

    # Export canonical LangChain / LangSmith tracing environment variables
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = langsmith_key
    os.environ["LANGCHAIN_PROJECT"] = project
    os.environ["LANGCHAIN_ENDPOINT"] = endpoint

    os.environ["LANGSMITH_API_KEY"] = langsmith_key
    os.environ["LANGSMITH_PROJECT"] = project
    os.environ["LANGSMITH_ENDPOINT"] = endpoint
    os.environ["LANGSMITH_TRACING"] = "true"

    logger.info(
        "langsmith_distributed_tracing_active",
        project=project,
        endpoint=endpoint,
    )
    return True


def wrap_openai_client(client: Any) -> Any:
    """Wraps an OpenAI or AsyncOpenAI client with LangSmith tracing if available."""
    try:
        return wrap_openai(client)
    except Exception as e:
        logger.warning("failed_to_wrap_openai_client_with_langsmith", error=str(e))
        return client


def configure_datadog(force: bool = False) -> bool:
    """
    Configures Datadog APM distributed tracing for the application.
    If DD_TRACE_ENABLED is true, sets up Datadog environment variables,
    configures tracer parameters, and activates auto-instrumentation
    (FastAPI, Starlette, SQLAlchemy, Redis, and HTTPX).
    """
    from app.config import settings

    enabled_str = str(os.getenv("DD_TRACE_ENABLED", "")).strip().lower()
    is_enabled = enabled_str in ("true", "1", "yes") or getattr(settings, "dd_trace_enabled", False)

    if not is_enabled:
        os.environ["DD_TRACE_ENABLED"] = "false"
        return False

    service = os.getenv("DD_SERVICE") or getattr(settings, "dd_service", "thinkaloudai-monolith")
    env = os.getenv("DD_ENV") or getattr(settings, "dd_env", "production")
    version = os.getenv("DD_VERSION") or getattr(settings, "dd_version", "1.0.0")
    agent_host = os.getenv("DD_AGENT_HOST") or getattr(settings, "dd_agent_host", "localhost")
    agent_port = str(os.getenv("DD_AGENT_PORT") or getattr(settings, "dd_agent_port", 8126))
    site = os.getenv("DD_SITE") or getattr(settings, "dd_site", "datadoghq.com")

    os.environ["DD_TRACE_ENABLED"] = "true"
    os.environ["DD_SERVICE"] = service
    os.environ["DD_ENV"] = env
    os.environ["DD_VERSION"] = version
    os.environ["DD_AGENT_HOST"] = agent_host
    os.environ["DD_AGENT_PORT"] = agent_port
    os.environ["DD_SITE"] = site
    os.environ["DD_LOGS_INJECTION"] = "true"

    api_key = getattr(settings, "dd_api_key", "") or os.getenv("DD_API_KEY", "")
    if api_key:
        os.environ["DD_API_KEY"] = api_key

    try:
        import ddtrace
        from ddtrace import config, tracer

        tracer.enabled = True
        config.service = service
        config.env = env
        config.version = version

        # Import ddtrace.auto to instrument FastAPI, SQLAlchemy, Redis, HTTPX
        import ddtrace.auto  # noqa: F401

        logger.info(
            "datadog_apm_tracing_active",
            service=service,
            env=env,
            version=version,
            agent=f"{agent_host}:{agent_port}",
            site=site,
        )
        return True
    except Exception as e:
        logger.warning("datadog_apm_configuration_failed", error=str(e))
        return False


def dd_trace_span(name: str, resource: str | None = None, service: str | None = None) -> Callable:
    """Decorator to trace custom functions with Datadog APM if available."""
    try:
        import ddtrace
        return ddtrace.tracer.wrap(name=name, resource=resource, service=service)
    except Exception:
        def decorator(func: Callable) -> Callable:
            return func
        return decorator


# Auto-configure telemetry providers on initial import
configure_langsmith()
configure_datadog()

