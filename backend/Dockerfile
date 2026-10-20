# =============================================================================
# Stage 1: Build virtual environment using uv
# =============================================================================
FROM python:3.12-slim AS builder

# Set build-time environment flags for uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install build dependencies required for compiling C extensions (psycopg2/asyncpg/bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install official uv binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency specifications first to leverage Docker layer caching
COPY pyproject.toml uv.lock* ./

# Synchronize dependencies into /opt/venv without installing the editable root project yet
RUN uv sync --frozen --no-dev --no-install-project || uv sync --no-dev --no-install-project

# Copy application source code and install project into virtualenv
COPY . .
RUN uv sync --frozen --no-dev || uv sync --no-dev

# =============================================================================
# Stage 2: Minimal runtime image
# =============================================================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install runtime libraries, curl for healthcheck, and g++ for code execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Download AWS Global CA bundle for RDS SSL verification
RUN mkdir -p /app/certs && (curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/certs/global-bundle.pem || true)

# Copy uv binary for executing migrations and scripts in container
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy pre-built virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv

# Configure PATH to use the virtual environment by default
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy application source code, data, migrations, and scripts
COPY . .

# Expose monolith API port
EXPOSE 8000

# Container liveness health check
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:8000/health/live || exit 1

# Start unified FastAPI application via uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--proxy-headers", "--forwarded-allow-ips=*"]
