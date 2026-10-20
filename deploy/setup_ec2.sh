#!/usr/bin/env bash
# =============================================================================
# ThinkAloudAI EC2 Deployment & Setup Script (Ubuntu / Debian)
# Monolith_ThinkAloudAI (frontend/ + backend/)
# Run as root or with sudo:
#   sudo bash deploy/setup_ec2.sh
# =============================================================================

set -e

echo "=========================================================="
echo " Starting ThinkAloudAI Production Environment Provisioning"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# 1. Update OS packages
echo "[1/7] Updating apt repositories..."
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
echo "[2/7] Configuring local Redis..."
systemctl enable redis-server
systemctl restart redis-server
redis-cli ping | grep -q "PONG" && echo " Redis is running and healthy!"

# 3. Install Node.js (v20 LTS) if not installed
if ! command -v node &> /dev/null; then
    echo "[3/7] Installing Node.js LTS (v20)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[3/7] Node.js is already installed ($(node -v))."
fi

# 4. Install UV fast Python package manager
if ! command -v uv &> /dev/null; then
    echo "[4/7] Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

# 5. Configure Monolith Virtual Environment & Dependencies
echo "[5/7] Setting up Python virtual environment in $BACKEND_DIR..."
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

# 6. Setup Frontend Build & www directory
echo "[6/7] Building Frontend SPA in $FRONTEND_DIR..."
mkdir -p /var/www/thinkaloud/frontend
if [ -d "$FRONTEND_DIR" ]; then
    cd "$FRONTEND_DIR"
    npm install
    npm run build
    rm -rf /var/www/thinkaloud/frontend/dist
    cp -r dist /var/www/thinkaloud/frontend/dist
    chown -R www-data:www-data /var/www/thinkaloud
    echo " Frontend built and copied to /var/www/thinkaloud/frontend/dist"
fi

# 7. Configure Nginx and Systemd Services
echo "[7/7] Installing Nginx configuration and Systemd units..."
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
echo " ThinkAloudAI EC2 Provisioning Complete!"
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
