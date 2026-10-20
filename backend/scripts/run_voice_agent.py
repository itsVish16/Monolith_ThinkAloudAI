#!/usr/bin/env python3
"""
Convenience script to run the ThinkAloudAI LiveKit Voice Agent Worker.

Usage:
    python scripts/run_voice_agent.py dev       # Run in development mode (hot reload)
    python scripts/run_voice_agent.py start     # Run in production mode
    python scripts/run_voice_agent.py console   # Run in interactive console mode
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from livekit import agents

from app.config import settings
from app.voice_agent.worker import entrypoint, prewarm

if __name__ == "__main__":
    # If no CLI sub-command provided, default to 'dev' for local testing
    if len(sys.argv) == 1:
        sys.argv.append("dev")

    print(f"Starting ThinkAloudAI Voice Agent Worker with command: {sys.argv[1:]}")
    print(f"LiveKit URL: {settings.livekit_url or os.getenv('LIVEKIT_URL', 'Not configured')}")

    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            ws_url=settings.livekit_url or os.getenv("LIVEKIT_URL"),
            api_key=settings.livekit_api_key or os.getenv("LIVEKIT_API_KEY"),
            api_secret=settings.livekit_api_secret or os.getenv("LIVEKIT_API_SECRET"),
        )
    )
