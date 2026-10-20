#!/usr/bin/env bash
# =============================================================================
# ThinkAloudAI EC2 Backend Setup Script (Ubuntu / Debian)
# Sets up Backend Monolith + LiveKit Voice Worker + Local Redis + Nginx Reverse Proxy
# (Frontend is deployed on Vercel)
# Run as root or with sudo:
#   sudo bash deploy/setup_ec2.sh
# =============================================================================

set -e

echo "=========================================================="
echo " Starting ThinkAloudAI Backend Production Setup (EC2)"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

# 1. Update OS packages
echo "[1/5] Updating apt repositories and installing backend dependencies..."
apt-get update -y
apt-get install -y \
    curl \
    git \
    build-essential \
    software-properties-common \
    redis-server \
    nginx \
    certbot \
    python3-certbot-nginx \
    python3-pip \
    python3-venv \
    python3-dev \
    libpq-dev

# 2. Configure and start Redis on localhost
echo "[2/5] Configuring local Redis..."
systemctl enable redis-server
systemctl restart redis-server
redis-cli ping | grep -q "PONG" && echo " Redis is running and healthy!"

# 3. Install UV fast Python package manager
if ! command -v uv &> /dev/null; then
    echo "[3/5] Installing Astral uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

# 4. Configure Monolith Virtual Environment & Dependencies
echo "[4/5] Setting up Python virtual environment in $BACKEND_DIR..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

.venv/bin/pip install --upgrade pip
if command -v uv &> /dev/null; then
    uv pip install -e . --python .venv/bin/python
else
    .venv/bin/pip install -e .
fi

# 5. Configure Nginx and Systemd Services
echo "[5/5] Installing Nginx reverse proxy and Systemd units..."
cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/thinkaloud
ln -sf /etc/nginx/sites-available/thinkaloud /etc/nginx/sites-enabled/thinkaloud
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Install systemd service files with dynamic path replacement
sed "s|/home/ubuntu/ThinkAloudAI/ThinkAloudAI-Monolith|$BACKEND_DIR|g" "$SCRIPT_DIR/thinkaloud-backend.service" > /etc/systemd/system/thinkaloud-backend.service
sed "s|/home/ubuntu/ThinkAloudAI/ThinkAloudAI-Monolith|$BACKEND_DIR|g" "$SCRIPT_DIR/thinkaloud-worker.service" > /etc/systemd/system/thinkaloud-worker.service

systemctl daemon-reload
systemctl enable thinkaloud-backend
systemctl enable thinkaloud-worker

echo "=========================================================="
echo " ThinkAloudAI EC2 Backend Setup Complete!"
echo "=========================================================="
echo "Next steps:"
echo " 1. Configure $BACKEND_DIR/.env with your RDS & API keys"
echo " 2. Run database migrations: cd $BACKEND_DIR && .venv/bin/alembic upgrade head"
echo " 3. Seed question bank: .venv/bin/python scripts/seed_database.py"
echo " 4. Start services:"
echo "      sudo systemctl start thinkaloud-backend"
echo "      sudo systemctl start thinkaloud-worker"
echo " 5. Check logs with: journalctl -u thinkaloud-backend -f"
echo " 6. Setup HTTPS with: sudo certbot --nginx"
echo "=========================================================="
