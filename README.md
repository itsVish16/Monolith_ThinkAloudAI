# ThinkAloudAI — Unified Monolith & Production Suite

ThinkAloudAI is a high-performance technical interview and practice arena featuring an ultra low-latency conversational AI interviewer (Aarav), interactive code execution sandbox, real-time audio WebRTC streaming, and comprehensive rubric analytics.

---

## Repository Structure

```
Monolith_ThinkAloudAI/
├── backend/                  # FastAPI Monolith Application
│   ├── alembic/              # PostgreSQL schema migrations
│   ├── app/                  # Application modules (auth, interview, dsa, tracks, chat, admin)
│   │   ├── voice_agent/      # LiveKit conversational voice agent (STT, LLM, TTS)
│   │   ├── core/             # Database, Redis, security, rate limiting, telemetry
│   │   └── tasks/            # Redis background task queue
│   ├── deploy/               # Systemd services & Nginx configuration
│   ├── scripts/              # Voice worker and database seeding scripts
│   ├── tests/                # Automated pytest suite (90+ tests)
│   ├── Dockerfile            # Multi-stage production container build
│   └── pyproject.toml        # Dependencies and packaging
│
├── frontend/                 # React 19 + Vite + Tailwind CSS SPA
│   ├── src/
│   │   ├── components/       # UI components & interview workspaces
│   │   ├── pages/            # Landing, DSA, System Design, General interview arenas
│   │   └── services/         # API & WebRTC client integrations
│   └── package.json          # Frontend dependencies
│
└── deploy/                   # Automated deployment scripts
    ├── nginx.conf            # Reverse proxy & static SPA server configuration
    ├── setup_ec2.sh          # One-click Ubuntu EC2 provisioner
    ├── deploy_update.sh      # Zero-downtime continuous rollout script
    ├── thinkaloud-backend.service # Systemd service for FastAPI
    └── thinkaloud-worker.service  # Systemd service for LiveKit voice worker
```

---

## Deployment Architecture

- **Frontend**: Deployed on **Vercel** as a static Vite Single Page Application.
- **Backend**: Deployed on **AWS EC2** (FastAPI backend + LiveKit voice agent worker + Redis) connected to **Amazon RDS PostgreSQL**.

---

## 1. Frontend Deployment (Vercel)

1. Import `itsVish16/Monolith_ThinkAloudAI` in [Vercel Dashboard](https://vercel.com).
2. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variables:
   - `VITE_API_URL`: `http://<YOUR_EC2_PUBLIC_IP>` or `https://api.yourdomain.com`
   - `VITE_LIVEKIT_URL`: `wss://thinkaloudai-3166kske.livekit.cloud`
   - `VITE_ADMIN_EMAILS`: `vishalsaini160204@gmail.com,admin@thinkaloudai.tech`
4. Click **Deploy**.

---

## 2. Backend & Voice Worker Deployment (AWS EC2 + Amazon RDS)

### 1. Provision Server
SSH into your Ubuntu EC2 instance and clone this repository:

```bash
cd /home/ubuntu
git clone https://github.com/itsVish16/Monolith_ThinkAloudAI.git
cd Monolith_ThinkAloudAI

# Run automated backend provisioner (installs Redis, Nginx, Python 3.12 venv, dependencies)
sudo bash deploy/setup_ec2.sh
```

### 2. Configure Environment
Copy and edit the production environment file:

```bash
cp backend/.env.production.example backend/.env
nano backend/.env
```

Ensure your Amazon RDS PostgreSQL credentials are set:
```ini
RDS_HOST=your-rds-endpoint.xxxxxx.ap-south-1.rds.amazonaws.com
RDS_PORT=5432
RDS_DB_NAME=postgres
RDS_USERNAME=your_username
RDS_PASSWORD=your_password
RDS_SSL_MODE=prefer
REDIS_URL=redis://127.0.0.1:6379/0
```

### 3. Run Migrations & Seed Questions
```bash
cd /home/ubuntu/Monolith_ThinkAloudAI/backend
.venv/bin/alembic upgrade head
.venv/bin/python scripts/seed_database.py
```

### 4. Start Background Services
```bash
sudo systemctl enable --now thinkaloud-backend
sudo systemctl enable --now thinkaloud-worker
```

### 5. Setup SSL / HTTPS (Optional Domain)
```bash
sudo certbot --nginx -d api.yourdomain.com
```

### 6. Continuous Deployment
Whenever you push updates to GitHub, redeploy on EC2 with:
```bash
sudo bash deploy/deploy_update.sh
```

