# ThinkAloudAI — Single-Instance EC2 Deployment (Docker)

A self-contained way to run the complete ThinkAloudAI platform on one EC2 instance (or any Docker host) — no Vercel and no Amazon RDS required. For the Vercel + RDS architecture, see [README.md](README.md).

```
.
├── frontend/          React 19 + Vite + TypeScript SPA
├── backend/           FastAPI modular monolith (PostgreSQL + Redis + LiveKit)
├── docker-compose.yml Full stack: nginx → FastAPI → Postgres + Redis
├── .env.example       Compose / database settings
└── backend/.env.example   Application secrets & integrations
```

**Stack:** React 19 · Vite · FastAPI · PostgreSQL 16 · Redis 7 · LiveKit · Docker

---

## 1. Quick start on EC2 (Docker)

### Recommended instance

- **Ubuntu 22.04 / 24.04**, `t3.small` (2 GB RAM) or larger.
- Security group inbound rules: **22** (SSH), **80** (HTTP), optionally **443** (HTTPS).

> On a 1 GB instance, add swap before building — the Vite production build can otherwise run out of memory:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

### Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### Clone and configure

```bash
git clone https://github.com/itsVish16/Monolith_ThinkAloudAI.git
cd Monolith_ThinkAloudAI

# Infrastructure settings (DB password, workers, port)
cp .env.example .env
nano .env

# Application secrets
cp backend/.env.example backend/.env
nano backend/.env
```

At minimum, set these in `backend/.env`:

| Variable | Notes |
|---|---|
| `JWT_SECRET_KEY` | Generate with `openssl rand -hex 32` |
| `JWT_ALGORITHM` | `HS256` |
| `DEBUG` | `false` in production |
| `FRONTEND_BASE_URL` | `http://<EC2_PUBLIC_IP>` (used in emails / invite links) |
| `ADMIN_EMAILS` | Comma-separated admin accounts |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | AI features |
| `RESEND_API_KEY`, `EMAIL_DELIVERY_ENABLED` | Verification / reset emails |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Voice interviews |

`DATABASE_URL` and `REDIS_URL` are **overridden automatically** by Docker Compose to point at the `postgres` and `redis` containers — leave the example values or ignore them.

### Build and start

```bash
docker compose up -d --build
```

### Create the database schema and seed content

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_database.py
```

### Open the app

```
http://<EC2_PUBLIC_IP>
```

- API docs: `http://<EC2_PUBLIC_IP>/docs`
- Health check: `http://<EC2_PUBLIC_IP>/health/ready`

---

## 2. How the deployment works

- **frontend** is built once with `VITE_API_URL=/` — every API call goes to the same origin (`/api/v1/...`).
- **frontend nginx** serves the SPA and reverse-proxies API + WebSocket routes to `backend:8000`.
- **backend** runs FastAPI with one uvicorn worker by default (`UVICORN_WORKERS` in `.env`).
- **postgres / redis** are internal-only; only port 80 is published.
- API calls are same-origin, so **no CORS setup is required**.

If you prefer a separate API host (e.g. `api.example.com`), build the frontend with that origin instead:

```bash
docker compose build --build-arg VITE_API_URL=https://api.example.com frontend
docker compose up -d frontend
```

…and add the frontend origin to `CORS_ALLOWED_ORIGINS` in `backend/.env`.

---

## 3. Useful commands

```bash
# Logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart after changing backend/.env
docker compose up -d --force-recreate backend

# Update to the latest code
git pull
docker compose up -d --build
docker compose exec backend alembic upgrade head

# Database backup
docker compose exec -T postgres pg_dump -U postgres thinkaloud_monolith > backup.sql

# Stop (data stays in named volumes)
docker compose down

# Stop and delete ALL data
docker compose down -v
```

### Optional: LiveKit voice-agent worker

If your LiveKit deployment needs the bundled agent worker:

```bash
docker compose --profile voice up -d --build
```

Check the LiveKit section of `backend/.env` first.

---

## 4. HTTPS

The included nginx container listens on plain HTTP (port 80). For production, put a TLS terminator in front — for example Caddy on the host:

```
your.domain.com {
    reverse_proxy 127.0.0.1:80
}
```

Or use an AWS Application Load Balancer with an ACM certificate and forward to port 80. After enabling HTTPS, set `FRONTEND_BASE_URL=https://your.domain.com` in `backend/.env` and restart the backend.

---

## 5. Local development (without Docker)

### Backend

```bash
cd backend
cp .env.example .env          # set DATABASE_URL / REDIS_URL to localhost
uv sync
docker compose up -d postgres redis   # uses backend/docker-compose.yml (published ports)
uv run alembic upgrade head
uv run python scripts/seed_database.py
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm install
npm run dev                   # http://localhost:5173
```

---

## 6. Required ports & firewall

| Port | Service | Exposure |
|---|---|---|
| 80 | Frontend nginx | Public |
| 443 | TLS terminator (optional) | Public |
| 8000 | FastAPI | Internal (proxied by nginx) |
| 5432 | PostgreSQL | Internal only |
| 6379 | Redis | Internal only |

---

## 7. Security notes

- **Never commit `.env` files.** They are gitignored in this repository.
- `backend/.env` holds API keys and the JWT secret — keep it readable only by the deploy user (`chmod 600 backend/.env`).
- The example files contain placeholders only.
- Postgres and Redis are not published to the host by the root `docker-compose.yml`.

---

## 8. Troubleshooting

**`docker compose up` fails on `env_file`** — create `backend/.env` (`cp backend/.env.example backend/.env`). Compose is configured to tolerate a missing file, but the app will lack secrets.

**Frontend shows the landing page but API calls fail** — check `docker compose logs -f backend`, then `http://<host>/health/ready`. Make sure the frontend image was built with `VITE_API_URL=/` (the default in Compose).

**Emails fail** — Resend rejects `example.com` addresses; use a real domain and set `EMAIL_DELIVERY_ENABLED=true` only when ready.

**`health/ready` reports `postgres: down`** — if your `backend/.env` was copied from an existing AWS deployment it may contain `RDS_HOST`/`RDS_DB_NAME`. Those take precedence over `DATABASE_URL` in the app config; the bundled Compose file blanks them so the local `postgres` container is used. Don't add them back unless you intend to use RDS.

**Out of memory during build** — use a larger instance or add swap (see above).
