#!/usr/bin/env bash
# =============================================================================
# ThinkAloudAI Production Continuous Update Script (Backend Only)
# Monolith_ThinkAloudAI
# Use this script whenever pulling latest code on EC2:
#   sudo bash deploy/deploy_update.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "=========================================================="
echo " Starting ThinkAloudAI Backend Production Rollout"
echo "=========================================================="

cd "$PROJECT_ROOT"

# 1. Update Git Repository
if [ -d ".git" ]; then
    echo "[1/4] Pulling latest git changes..."
    git pull origin main || echo "Git pull skipped or working on local branch."
fi

# 2. Update Backend Python Dependencies
echo "[2/4] Updating Backend dependencies..."
cd "$BACKEND_DIR"

if [ -f "$BACKEND_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
    ALEMBIC_BIN="$BACKEND_DIR/.venv/bin/alembic"
else
    PYTHON_BIN="python3"
    ALEMBIC_BIN="alembic"
fi

if command -v uv &> /dev/null; then
    uv pip install -e . --python "$PYTHON_BIN"
else
    "$PYTHON_BIN" -m pip install -e .
fi

# 3. Apply Database Migrations & Seeds
echo "[3/4] Applying PostgreSQL migrations..."
"$ALEMBIC_BIN" upgrade head

echo "Seeding canonical questions and tracks..."
"$PYTHON_BIN" scripts/seed_database.py

# 4. Restart Systemd Services
echo "[4/4] Restarting backend and voice agent services..."
systemctl restart thinkaloud-backend
systemctl restart thinkaloud-worker
systemctl reload nginx

echo "=========================================================="
echo " Rollout Complete! Verifying Service Status:"
echo "=========================================================="
systemctl is-active thinkaloud-backend && echo " Backend API: ACTIVE"
systemctl is-active thinkaloud-worker && echo " Voice Agent Worker: ACTIVE"
systemctl is-active nginx && echo " Nginx: ACTIVE"
echo "=========================================================="
