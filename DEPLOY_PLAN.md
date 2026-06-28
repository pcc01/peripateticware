# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

# Peripateticware — Production Deployment Plan
> Phase 1: Ubuntu home server + Cloudflare Zero Trust tunnel
> Phase 2: Migrate to Hetzner CX41/AX41

---

## Architecture overview

```
Internet
   │
   ▼
Cloudflare (DNS + WAF + DDoS + Rate Limiting)
   │  (encrypted tunnel — no open ports on home server)
   ▼
cloudflared daemon (Ubuntu home server)
   │
   ▼
nginx (port 80, internal only)
   ├── / → frontend:3000 (Vite build served as static)
   └── /api → backend:8000 (uvicorn, no --reload)
        ├── postgres:5432
        ├── redis:6379
        └── (Ollama on host: host.docker.internal:11434)
```

---

## Pre-deploy checklist (before touching the server)

```bash
# On your dev machine — confirm all these pass before deploying

# 1. Rotate secrets (generate new values)
python3 -c "import secrets; print(secrets.token_hex(32))"  # SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(16))"  # AUDIT_HASH_SALT
python3 -c "import secrets; print(secrets.token_urlsafe(24))"  # DB_PASSWORD

# 2. Confirm no dev defaults remain
grep -E "dev-secret|change-me|example\.com|localhost" .env  # Must return nothing sensitive

# 3. Environment flags
ENVIRONMENT=production
DEBUG=False
EMAIL_DRY_RUN=false

# 4. Paddle live mode
VITE_PADDLE_ENV=production
# VITE_PADDLE_CLIENT_TOKEN → use live token (not sandbox)
# VITE_PADDLE_PRICE_* → use live price IDs from Paddle dashboard

# 5. CORS — set to your actual domain
ALLOWED_ORIGINS=https://yourapp.yourdomain.com

# 6. SMTP — real credentials, not dry-run
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=<app-password>
EMAIL_DRY_RUN=false
FRONTEND_URL=https://yourapp.yourdomain.com
```

---

## Phase 1: Ubuntu home server setup

### Step 1 — Install Docker
```bash
# On Ubuntu 22.04 LTS
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release

# Docker engine (not Docker Desktop)
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor \
  -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group (avoid sudo)
sudo usermod -aG docker $USER && newgrp docker

# Verify
docker --version && docker compose version
```

### Step 2 — Install Ollama (for AI inference)
```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull mistral
ollama pull karanchopda333/whisper:latest
sudo systemctl enable ollama  # Start on boot

# Verify Ollama is reachable from Docker containers via host.docker.internal
# Add to /etc/hosts on Ubuntu (required for host.docker.internal to resolve):
echo "$(docker inspect --format='{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' \
  $(docker run --rm -d alpine sleep 5)) host.docker.internal" | sudo tee -a /etc/hosts
```

### Step 3 — Clone and configure
```bash
git clone https://github.com/paulcerda/peripateticware.git
cd peripateticware

# Production env (do NOT copy your dev .env — type values fresh)
cp .env.example .env
nano .env  # Fill in all values; no dev defaults
```

### Step 4 — docker-compose.prod.yml (production overrides)

Create `docker-compose.prod.yml`:

```yaml
# docker-compose.prod.yml
# Run with: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

services:
  backend:
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
    # NO --reload in production
    restart: unless-stopped
    ports: []  # No external ports — nginx proxies internally
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G

  frontend:
    # Serve the Vite build via nginx — not the Vite dev server
    build:
      target: production
    restart: unless-stopped
    ports: []
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  postgres:
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data  # Named volume — persists across restarts
    ports: []  # No external postgres exposure
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 2G

  redis:
    restart: unless-stopped
    command: redis-server --appendonly yes  # AOF persistence
    volumes:
      - redis_data:/data
    ports: []
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  nginx:
    restart: unless-stopped
    ports:
      - "127.0.0.1:80:80"  # Loopback only — cloudflared connects here

volumes:
  postgres_data:
  redis_data:
  uploads_data:
```

### Step 5 — nginx production config

Update `nginx.conf`:

```nginx
# /etc/nginx/conf.d/peripateticware.conf (or in Docker nginx container)
server_tokens off;  # Hide nginx version

server {
    listen 80;
    server_name _;

    gzip on;
    gzip_types text/plain application/json application/javascript text/css image/svg+xml;
    gzip_min_length 1000;

    # Rate limit auth endpoints
    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;

    # Static frontend assets (long cache)
    location ~* \.(js|css|png|jpg|svg|woff2|ico)$ {
        root /usr/share/nginx/html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $http_cf_connecting_ip;  # Real IP from Cloudflare
        proxy_read_timeout 120s;  # AI inference can be slow
        client_max_body_size 50M;  # Standards PDF uploads
    }

    # Auth endpoints — rate limited
    location /api/v1/auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
    }

    # Paddle webhooks
    location /api/v1/webhooks/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
    }

    # Frontend SPA (all other routes → index.html)
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Phase 2: Cloudflare tunnel setup

### Step 1 — Install cloudflared
```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Step 2 — Authenticate and create tunnel
```bash
cloudflared tunnel login  # Opens browser to authorize your Cloudflare account
cloudflared tunnel create peripateticware  # Creates tunnel, saves credentials JSON
# Note the tunnel UUID from the output
```

### Step 3 — Tunnel config file
```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: /home/<your-user>/.cloudflared/<YOUR-TUNNEL-UUID>.json

ingress:
  # Main app
  - hostname: yourapp.yourdomain.com
    service: http://localhost:80

  # Optional: expose API docs only to you via Cloudflare Access
  - hostname: api.yourapp.yourdomain.com
    service: http://localhost:8000
    originRequest:
      noTLSVerify: true

  # Catch-all (required)
  - service: http_status:404
EOF
```

### Step 4 — DNS records (in Cloudflare dashboard)
```
Type: CNAME
Name: yourapp
Target: <YOUR-TUNNEL-UUID>.cfargotunnel.com
Proxy: ✅ (orange cloud — proxied)
TTL: Auto
```

### Step 5 — Run tunnel as a service
```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Verify tunnel is connected
cloudflared tunnel info peripateticware
```

### Step 6 — Cloudflare WAF rules (dashboard → Security → WAF)

```
# Rule 1: Rate limit auth endpoints
Rule name: Rate limit login/signup
Expression: (http.request.uri.path matches "^/api/v1/auth/(login|signup)")
Action: Rate limit → 10 requests per minute per IP → Block for 10 minutes

# Rule 2: Block SQL injection patterns
Rule name: SQLi protection
Expression: (cf.waf.score.sqli lt 40)
Action: Block

# Rule 3: Block credential stuffing on login
Rule name: Bot protection on login
Expression: (http.request.uri.path eq "/api/v1/auth/login" and cf.bot_management.score lt 30)
Action: Challenge (Turnstile)

# Rule 4: Allow Paddle webhook IP ranges only
# Paddle IPs: check https://developer.paddle.com/webhooks/webhook-reference#security
Rule name: Paddle webhook allowlist
Expression: (http.request.uri.path eq "/api/v1/webhooks/paddle" and not ip.src in {34.232.58.13/32})
Action: Block
```

---

## File storage for uploads (choose one)

### Option A: Persist local Docker volume (Phase 1 — simplest)

Named volume `uploads_data` in docker-compose.prod.yml already handles this.

```yaml
# In docker-compose.prod.yml
services:
  backend:
    volumes:
      - uploads_data:/app/uploads

volumes:
  uploads_data:
```

Add daily backup cron:
```bash
# Add to crontab (crontab -e)
0 2 * * * docker run --rm -v peripateticware_uploads_data:/uploads \
  -v /backups:/backup alpine tar czf /backup/uploads_$(date +\%Y\%m\%d).tar.gz /uploads
```

### Option B: Cloudflare R2 (recommended for Phase 2 / Hetzner)

Cloudflare R2 is S3-compatible, free egress, $0.015/GB storage.

```python
# backend/services/storage_service.py — replace _save_file() with:
import boto3  # boto3 works with R2

s3 = boto3.client(
    's3',
    endpoint_url=f"https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto',
)

async def save_file(file_bytes: bytes, key: str, content_type: str) -> str:
    s3.put_object(Bucket='peripateticware-uploads', Key=key,
                  Body=file_bytes, ContentType=content_type)
    return f"https://uploads.yourdomain.com/{key}"
```

Required env vars:
```
CLOUDFLARE_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=peripateticware-uploads
```

---

## Storage & Backup Setup

### Drive layout

| Device | Size | Role | Mount |
|--------|------|------|-------|
| `nvme0n1p6` | 2.5T | Ubuntu root (OS + Docker engine) | `/` |
| `nvme1n1` | 238.5G | Docker cache (Postgres, Redis, uploads) | `/mnt/cache` |
| `sda` | 5.5T | Backup drive A — restic repo A | `/mnt/backup-a` |
| `sdb` | 5.5T | Backup drive B — restic repo B | `/mnt/backup-b` |

Data flow:
- Docker volumes (Postgres, Redis, uploads) → `nvme1n1` (fast writes)
- Restic backs up `nvme1n1` → `sda` **and** `sdb` independently (two separate repos, not RAID)
- App uploads also sync to Cloudflare R2 (see File Storage section above)

---

### Step 1 — Wipe the cache drive (nvme1n1)

> ⚠️ This destroys all data on nvme1n1. Nothing to preserve per plan.

```bash
# Wipe all partition signatures and partition table
sudo wipefs -a /dev/nvme1n1
sudo sgdisk --zap-all /dev/nvme1n1

# Create a single GPT partition using the full drive
sudo parted /dev/nvme1n1 --script mklabel gpt
sudo parted /dev/nvme1n1 --script mkpart primary ext4 0% 100%

# Format
sudo mkfs.ext4 -L docker-cache /dev/nvme1n1p1

# Verify
sudo blkid /dev/nvme1n1p1
# Note the UUID — you'll need it for fstab
```

Mount it and add to fstab:
```bash
sudo mkdir -p /mnt/cache

# Get UUID
CACHE_UUID=$(sudo blkid -s UUID -o value /dev/nvme1n1p1)

# Add to fstab (noatime = less wear, nofail = boots even if drive missing)
echo "UUID=$CACHE_UUID /mnt/cache ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab

sudo mount -a
df -h /mnt/cache   # Confirm ~222G available
```

---

### Step 2 — Move Docker data root to the cache drive

> Do this before starting any containers for the first time. If Docker is already running, stop it first.

```bash
sudo systemctl stop docker

sudo mkdir -p /mnt/cache/docker

# Configure Docker to use the NVMe as its data root
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "data-root": "/mnt/cache/docker",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF

sudo systemctl start docker

# Confirm Docker is using the cache drive
docker info | grep "Docker Root Dir"
# Expected: Docker Root Dir: /mnt/cache/docker
```

All named volumes (`postgres_data`, `redis_data`, `uploads_data`) will now live under `/mnt/cache/docker/volumes/`.

---

### Step 3 — Format and mount the backup drives (sda, sdb)

> ⚠️ This destroys all data on sda and sdb.

```bash
# --- sda ---
sudo wipefs -a /dev/sda
sudo parted /dev/sda --script mklabel gpt
sudo parted /dev/sda --script mkpart primary ext4 0% 100%
sudo mkfs.ext4 -L backup-a /dev/sda1

# --- sdb ---
sudo wipefs -a /dev/sdb
sudo parted /dev/sdb --script mklabel gpt
sudo parted /dev/sdb --script mkpart primary ext4 0% 100%
sudo mkfs.ext4 -L backup-b /dev/sdb1

# Mount both
sudo mkdir -p /mnt/backup-a /mnt/backup-b

BACKUP_A_UUID=$(sudo blkid -s UUID -o value /dev/sda1)
BACKUP_B_UUID=$(sudo blkid -s UUID -o value /dev/sdb1)

echo "UUID=$BACKUP_A_UUID /mnt/backup-a ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab
echo "UUID=$BACKUP_B_UUID /mnt/backup-b ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab

sudo mount -a
df -h /mnt/backup-a /mnt/backup-b   # Both should show ~5.1T available
```

---

### Step 4 — Install restic

```bash
sudo apt install restic -y
restic version   # Confirm installed

# Optional: get the latest binary directly (Ubuntu repos can lag)
# RESTIC_VERSION=$(curl -s https://api.github.com/repos/restic/restic/releases/latest | grep tag_name | cut -d'"' -f4 | tr -d v)
# wget -q "https://github.com/restic/restic/releases/latest/download/restic_${RESTIC_VERSION}_linux_amd64.bz2" -O /tmp/restic.bz2
# bunzip2 /tmp/restic.bz2
# sudo install -m 755 /tmp/restic /usr/local/bin/restic
```

Store the restic password somewhere safe (use the same password for both repos so the script is simple):
```bash
# Generate a strong password
python3 -c "import secrets; print(secrets.token_hex(32))"

# Save it — do NOT lose this. Without it the backups are unrecoverable.
sudo mkdir -p /root/.config/restic
echo "YOUR_GENERATED_PASSWORD_HERE" | sudo tee /root/.config/restic/password
sudo chmod 600 /root/.config/restic/password
```

Initialize both repos:
```bash
sudo restic init --repo /mnt/backup-a/restic --password-file /root/.config/restic/password
sudo restic init --repo /mnt/backup-b/restic --password-file /root/.config/restic/password

# Verify
sudo restic -r /mnt/backup-a/restic --password-file /root/.config/restic/password snapshots
sudo restic -r /mnt/backup-b/restic --password-file /root/.config/restic/password snapshots
# Both should return: "no matching snapshots"
```

---

### Step 5 — Backup script

```bash
sudo tee /usr/local/bin/peripateticware-backup > /dev/null << 'SCRIPT'
#!/bin/bash
set -euo pipefail

RESTIC_PW_FILE=/root/.config/restic/password
REPO_A=/mnt/backup-a/restic
REPO_B=/mnt/backup-b/restic
DUMP_DIR=/mnt/cache/backups
LOG=/var/log/peripateticware-backup.log

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== Backup started ==="

# 1. Postgres dump (safe — consistent snapshot without stopping Postgres)
mkdir -p "$DUMP_DIR"
DUMP_FILE="$DUMP_DIR/db_$(date +%Y%m%d_%H%M%S).sql.gz"
log "Dumping Postgres..."
docker exec peripateticware-postgres pg_dump -U peripateticware_user peripateticware \
  | gzip > "$DUMP_FILE"
log "Dump written: $DUMP_FILE"

# 2. Redis: trigger a background save, wait for it to finish
log "Saving Redis..."
docker exec peripateticware-redis redis-cli BGSAVE
sleep 5   # Give Redis time to finish the save

# 3. Restic backup to drive A
log "Backing up to drive A..."
restic -r "$REPO_A" --password-file "$RESTIC_PW_FILE" backup \
  "$DUMP_DIR" \
  /mnt/cache/docker/volumes/peripateticware_uploads_data \
  --tag peripateticware \
  --exclude="*.tmp"

# 4. Restic backup to drive B (independent — not a copy of A)
log "Backing up to drive B..."
restic -r "$REPO_B" --password-file "$RESTIC_PW_FILE" backup \
  "$DUMP_DIR" \
  /mnt/cache/docker/volumes/peripateticware_uploads_data \
  --tag peripateticware \
  --exclude="*.tmp"

# 5. Prune both repos — keep 14 daily, 8 weekly, 6 monthly
log "Pruning drive A..."
restic -r "$REPO_A" --password-file "$RESTIC_PW_FILE" forget \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune

log "Pruning drive B..."
restic -r "$REPO_B" --password-file "$RESTIC_PW_FILE" forget \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune

# 6. Clean up dumps older than 2 days (restic has them, no need to keep raw files)
find "$DUMP_DIR" -name "*.sql.gz" -mtime +2 -delete

log "=== Backup complete ==="
SCRIPT

sudo chmod +x /usr/local/bin/peripateticware-backup
```

Test it manually before scheduling:
```bash
sudo /usr/local/bin/peripateticware-backup
# Then verify a snapshot landed on both drives:
sudo restic -r /mnt/backup-a/restic --password-file /root/.config/restic/password snapshots
sudo restic -r /mnt/backup-b/restic --password-file /root/.config/restic/password snapshots
```

---

### Step 6 — Schedule the backup (cron)

```bash
# Run nightly at 2:00 AM
echo "0 2 * * * root /usr/local/bin/peripateticware-backup >> /var/log/peripateticware-backup.log 2>&1" \
  | sudo tee /etc/cron.d/peripateticware-backup

sudo chmod 644 /etc/cron.d/peripateticware-backup
```

Check the log after the first scheduled run:
```bash
tail -50 /var/log/peripateticware-backup.log
```

---

### Step 7 — Recovery

**List available snapshots:**
```bash
sudo restic -r /mnt/backup-a/restic --password-file /root/.config/restic/password snapshots
```

**Restore Postgres from a dump:**
```bash
# Pick a snapshot ID from the list above, then restore the dump file
sudo restic -r /mnt/backup-a/restic --password-file /root/.config/restic/password \
  restore latest --path /mnt/cache/backups --target /tmp/restore

# Find the dump file and load it
ls /tmp/restore/mnt/cache/backups/
gunzip -c /tmp/restore/mnt/cache/backups/db_YYYYMMDD_HHMMSS.sql.gz \
  | docker exec -i peripateticware-postgres psql -U peripateticware_user -d peripateticware
```

**Restore uploads:**
```bash
sudo restic -r /mnt/backup-a/restic --password-file /root/.config/restic/password \
  restore latest \
  --path /mnt/cache/docker/volumes/peripateticware_uploads_data \
  --target /tmp/restore-uploads
# Then copy back into the Docker volume as needed
```

**If drive A fails — use drive B:**
```bash
# All the same commands, just swap REPO_A → /mnt/backup-b/restic
sudo restic -r /mnt/backup-b/restic --password-file /root/.config/restic/password snapshots
```

---

## Monitoring

### Uptime Kuma (self-hosted, free)
```bash
docker run -d --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -v uptime_kuma:/app/data \
  --name uptime-kuma louislam/uptime-kuma:1

# Add monitors:
# https://yourapp.yourdomain.com/health → HTTP 200
# https://yourapp.yourdomain.com/api/v1/auth/login → HTTP 422 (wrong creds = alive)
```

Add uptime-kuma to Cloudflare tunnel (it's just another localhost port):
```yaml
# In ~/.cloudflared/config.yml:
  - hostname: status.yourdomain.com
    service: http://localhost:3001
```

---

## Mobile app deployment

```bash
cd mobile

# Update API URL to production tunnel
echo "EXPO_PUBLIC_API_URL=https://yourapp.yourdomain.com/api/v1" > .env.production

# Build Android preview (.apk for internal testing)
eas build --platform android --profile preview

# Build Android production (.aab for Google Play)
eas build --platform android --profile production

# Build iOS (requires Apple Developer account $99/year)
eas build --platform ios --profile production

# OTA updates (JS-only changes — no app store review needed)
eas update --branch production --message "Fix: billing restriction UX"
```

---

## Go-live checklist (in order)

```
□ 1. Secrets rotated — no dev defaults in .env
□ 2. Docker Compose production stack started
     docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
□ 3. Health check passes
     curl http://localhost:8000/health
□ 4. cloudflared service running
     sudo systemctl status cloudflared
□ 5. Tunnel responds externally
     curl https://yourapp.yourdomain.com/health
□ 6. SMTP email verified (send a password reset to yourself)
□ 7. Paddle live mode verified (check webhook in Paddle dashboard)
□ 8. Smoke load test passes
     k6 run --vus 5 --duration 60s -e BASE_URL=http://localhost:8000 k6/scenarios/smoke.js
□ 9. Security headers pass
     curl -sI https://yourapp.yourdomain.com | grep -i "strict-transport\|x-frame\|content-security"
□ 10. Port scan from external IP shows all ports filtered
      nmap -Pn -p 80,443,3000,8000,5432,6379 <YOUR-HOME-PUBLIC-IP>
□ 11. WAF rules active in Cloudflare dashboard
□ 12. Android .apk installed on test device — login, create activity, submit evidence
□ 13. Uptime Kuma monitoring active
□ 14. Daily backup cron verified (trigger manually, check file appears)
□ 15. Soft launch: share URL with 5–10 trusted testers, monitor logs 30 min
```

---

## Phase 2 migration to Hetzner (when ready)

1. Provision Hetzner CX41 (4 vCPU / 8 GB RAM / 160 GB NVMe, ~€16/mo)
2. Follow Steps 1–3 above on the new server
3. Backup postgres: `docker exec peripateticware-postgres pg_dump ... | gzip > export.sql.gz`
4. Copy .env and export.sql.gz to Hetzner via `scp`
5. Restore: `gunzip -c export.sql.gz | docker exec -i postgres psql -U peripateticware_user -d peripateticware`
6. Reinstall cloudflared — same tunnel UUID, same DNS records, just new server location
7. Cloudflare automatically routes to wherever cloudflared is running
8. No DNS change needed, no downtime window
9. Increase backend workers: `uvicorn main:app --workers 4` (Hetzner has 4 vCPU)
10. Consider running Ollama in Docker on Hetzner GPU node (AX41-NVMe has options)
