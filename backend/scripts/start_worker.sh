#!/usr/bin/env bash
# =============================================================================
# Convenience script to start the ThinkAloudAI LiveKit Voice Agent Worker
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Detect Python interpreter (virtualenv preferred)
if [ -f "$PROJECT_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
elif command -v python3 &> /dev/null; then
    PYTHON_BIN="python3"
elif command -v python &> /dev/null; then
    PYTHON_BIN="python"
else
    echo "Error: Python interpreter not found." >&2
    exit 1
fi

MODE="${1:-dev}"
echo "Starting ThinkAloudAI Voice Worker using $PYTHON_BIN in '$MODE' mode..."

exec "$PYTHON_BIN" scripts/run_voice_agent.py "$MODE" "${@:2}"
