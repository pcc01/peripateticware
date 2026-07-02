# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

# Peripateticware — Small Deployment Checklist
> Scope: get the app running on your Linux server, exposed to a specific list of people (you + testers) through a Cloudflare Tunnel with `peripateticware.com`, encrypted backups of the database on the backup HDD, and the admin/API-docs surface locked down to you only.
> Paddle is explicitly **not** set up in this pass (see "Deferred" at the end).
> Every `□` is one action. Work top to bottom — later steps assume earlier ones are done.

---

## 0. What changed in the code before you deploy (already applied)

While preparing this checklist a security audit of the backend turned up several issues serious enough to fix directly rather than just document — this app will hold real student data (GDPR/FERPA/COPPA scope) the moment it's reachable from the internet. These edits are already made in your working copy:

| File | Fix | Why |
|---|---|---|
| `backend/routes/auth.py` | `POST /auth/signup` now only accepts `role` = `TEACHER`, `PARENT`, or `HOMESCHOOL`. Previously it accepted **any** string, including `"ADMIN"` — anyone could self-register as an org admin. | This is the exact "someone changes their own permissions to admin" hole you asked about. |
| `backend/main.py` | Demo/test seed accounts (`admin@example.com` / `SecurePass123!`, `admin@test.local` / `Test1234!`, etc. — several are role `ADMIN`) now only seed when `ENVIRONMENT=development`. Previously they were recreated on **every restart**, in every environment. | This is a standing backdoor admin login. It must never exist once the box is on the internet. |
| `backend/startup.py` | `check_config_warnings()` now hard-fails startup in production if `SECRET_KEY`, `AUDIT_HASH_SALT`, or `FIELD_ENCRYPTION_KEY` are left at dev defaults/blank (previously just logged a warning). | A default `SECRET_KEY` means anyone can forge a valid JWT, including one claiming to be an admin. A blank `FIELD_ENCRYPTION_KEY` means PII is stored in plaintext. |
| `backend/routes/sessions.py` | `GET/PATCH /sessions/{id}`, `GET /sessions/{id}/evidence`, `GET /sessions/{id}/inquiry-log` now require login (previously **fully unauthenticated** — anyone could pull any student's session data by guessing a UUID, no token needed). | Direct FERPA/COPPA exposure once public. |

**⚠️ One thing I could not safely fix — please look at this yourself:** `backend/startup.py` was already truncated in your last commit, independent of anything above (confirmed against `git show HEAD`). The function `start_background_tasks()` cuts off mid-statement; its docstring promises a "budget monitor" scheduled job that isn't in the file at all. I closed the syntax so the app can boot (marked `TODO(paul): RECOVERY MARKER` in the file, right after the AI-batch scheduler block) and added the missing `scheduler.start()` call so the two job groups that *do* exist (retention cleanup, AI batch) actually run — but the budget-monitor block itself is gone and I did not invent it. Diff `backend/startup.py` against your last known-good copy (the actual file on the Linux box, IDE local history, or an earlier backup) and restore that block before you rely on scheduled jobs in production.

**Also:** your local git index (`.git/index`) got corrupted during this session (a lock file `.git/index.lock` is stuck and won't delete — likely another program on this machine, e.g. VS Code, GitHub Desktop, or a sync client, holding a handle on the `.git` folder). Before committing:
```
□ Close any app that might have the repo open (editors, git GUIs, sync tools)
□ Delete C:\dev\peripateticware\.git\index.lock by hand in Windows Explorer / PowerShell
□ Run: git status   (if it still says "index file corrupt", run: git reset — this only
  rebuilds the index from HEAD, it does not touch your working files)
□ Review the diff (git diff) and commit the fixes above
```

**Findings from the same audit that still need your judgment call before go-live** (not auto-fixed — each needs a product decision or more testing than is safe to rush):

- `routes/sessions.py` access check is now "owner, or any TEACHER/PARENT/HOMESCHOOL account" — not yet scoped to *the specific* teacher's classroom or *the specific* parent's linked child. Any logged-in teacher/parent can currently read any student's session. Needs a join against `classroom_students` / `parent_child_links` (pattern already used elsewhere, e.g. `routes/parent.py`'s `get_child_activities`).
- `routes/parent.py` `GET /children/{child_id}/progress` and `POST /messages/{message_id}/reply` don't verify the caller is linked to that child / part of that conversation — same class of IDOR.
- `routes/phase7_student_initiated.py` file upload builds the path from the raw filename with no traversal/extension/size checks.
- `routes/inference.py` `/multimodal-process` has no auth requirement — anonymous callers can trigger paid LLM inference.
- `CORS_ORIGINS` in `.env` currently includes `"*"` alongside `allow_credentials=True` — Section 1 below fixes this for prod, but double-check nothing re-adds `"*"`.
- `/auth/refresh` has no rotation or revocation — a stolen token can be refreshed indefinitely; `/logout` doesn't invalidate anything server-side.
- Password-reset/verification tokens (`SignedURL`) aren't single-use — a leaked reset link is repeatable until it expires.

None of these block getting the app up behind Cloudflare Access for a small trusted tester list, but treat them as a short follow-up backlog, not indefinite deferrals — several are direct FERPA/COPPA exposure once more than a handful of people have accounts.

---

## 1. Secrets & environment (on the Linux server, in the repo's `.env`)

```
□ Generate fresh values — do not reuse dev secrets:
    python3 -c "import secrets; print(secrets.token_hex(32))"   # SECRET_KEY
    python3 -c "import secrets; print(secrets.token_hex(16))"   # AUDIT_HASH_SALT
    python3 -c "import secrets; print(secrets.token_urlsafe(24))"  # DB_PASSWORD
    python3 -c "import secrets; print(secrets.token_hex(32))"   # PLATFORM_API_SECRET
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # FIELD_ENCRYPTION_KEY

□ Set in .env:
    ENVIRONMENT=production
    DEBUG=False
    SECRET_KEY=<generated>
    AUDIT_HASH_SALT=<generated>
    FIELD_ENCRYPTION_KEY=<generated>
    PLATFORM_API_SECRET=<generated>          # second factor for /platform/* — do not leave blank
    DB_PASSWORD=<generated>
    DATABASE_URL=postgresql+asyncpg://peripateticware_user:<same DB_PASSWORD>@postgres:5432/peripateticware
    CORS_ORIGINS=["https://peripateticware.com"]     # remove "*" — this is a real hole otherwise
    EMAIL_DRY_RUN=false

□ Confirm no dev leftovers remain:
    grep -E "dev-secret|change-me|change-in-production|example\.com" .env
    # every line that matches must be a value you explicitly set above, not a default

□ Leave Paddle vars as-is / blank (PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_ENV=sandbox) —
  not part of this pass. Billing stays disabled until you decide to wire it up.
```

If `FIELD_ENCRYPTION_KEY` was blank in an existing dev database and you're carrying data forward, run `backend/scripts/encrypt_existing_data.py` with the new key **before** exposing the box — otherwise the check in `startup.py` will refuse to boot in production (by design, see Section 0).

---

## 2. Storage layout & encrypted backups

Your current layout: 256GB NVMe = Docker data-root + restic's local cache. Two HDDs from the old RAID: one reserved for a future LAN mirror of the internal server (not this pass), the other used now as the restic backup target.

```
□ Identify your actual devices — do not guess:
    lsblk -o NAME,SIZE,MODEL,MOUNTPOINT
```
Below, `nvme1n1` = cache drive, `sdb` = the backup HDD you're using now. Swap in your real device names.

### 2.1 — Cache drive (Docker data-root + restic cache)
```
□ sudo mkdir -p /mnt/cache
□ (format/mount only if not already done — skip if this drive is already in service)
□ sudo mkdir -p /mnt/cache/docker /mnt/cache/restic-cache /mnt/cache/backups

□ sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "data-root": "/mnt/cache/docker",
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
EOF
□ sudo systemctl restart docker
□ docker info | grep "Docker Root Dir"   # expect: /mnt/cache/docker
```

### 2.2 — Backup HDD, LUKS-encrypted at rest (GDPR/FERPA/COPPA: student data must be encrypted at rest, not just in the restic archive)

restic already encrypts everything it writes (AES-256), so this is defense-in-depth: even before restic's own encryption, the raw disk is unreadable if the drive is removed or stolen.

```
□ sudo apt install -y cryptsetup

⚠️ Destroys all data on the target drive.
□ sudo cryptsetup luksFormat /dev/sdb1
    # You'll be asked for a passphrase. Generate + store one, don't type from memory:
    python3 -c "import secrets; print(secrets.token_urlsafe(32))"

□ sudo cryptsetup luksOpen /dev/sdb1 backup-hdd
□ sudo mkfs.ext4 -L backup-hdd /dev/mapper/backup-hdd
□ sudo mkdir -p /mnt/backup
□ sudo mount /dev/mapper/backup-hdd /mnt/backup

□ Back up the LUKS header separately — if it's damaged, the entire encrypted
  drive is unrecoverable even with the right passphrase:
    sudo cryptsetup luksHeaderBackup /dev/sdb1 --header-backup-file /root/luks-backup-hdd-header.img
    # copy this file + the passphrase to a password manager / separate physical location, NOT onto the same drive

□ Auto-unlock at boot via a keyfile on the OS root drive (protects against the
  HDD being physically removed/stolen; does not protect against a compromised
  running host — acceptable tradeoff for a single physical box):
    sudo dd if=/dev/urandom of=/root/backup-hdd.key bs=512 count=4
    sudo chmod 400 /root/backup-hdd.key
    sudo cryptsetup luksAddKey /dev/sdb1 /root/backup-hdd.key
    BACKUP_UUID=$(sudo blkid -s UUID -o value /dev/sdb1)
    echo "backup-hdd UUID=$BACKUP_UUID /root/backup-hdd.key luks" | sudo tee -a /etc/crypttab
    echo "/dev/mapper/backup-hdd /mnt/backup ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab
    sudo mount -a

□ df -h /mnt/backup   # confirm mounted with expected free space
```

### 2.3 — restic (encrypted backup repo on top of the already-encrypted disk)
```
□ sudo apt install -y restic
□ python3 -c "import secrets; print(secrets.token_hex(32))"   # restic repo password
□ sudo mkdir -p /root/.config/restic
□ echo "YOUR_GENERATED_PASSWORD" | sudo tee /root/.config/restic/password
□ sudo chmod 600 /root/.config/restic/password
□ export RESTIC_CACHE_DIR=/mnt/cache/restic-cache   # add to the backup script + your shell profile
□ sudo restic init --repo /mnt/backup/restic --password-file /root/.config/restic/password
□ sudo restic -r /mnt/backup/restic --password-file /root/.config/restic/password snapshots
    # expect: "no matching snapshots"
```

### 2.4 — Backup script: DB + everything needed to restore the app
```
□ sudo tee /usr/local/bin/peripateticware-backup > /dev/null << 'SCRIPT'
#!/bin/bash
set -euo pipefail

RESTIC_PW_FILE=/root/.config/restic/password
REPO=/mnt/backup/restic
DUMP_DIR=/mnt/cache/backups
LOG=/var/log/peripateticware-backup.log
export RESTIC_CACHE_DIR=/mnt/cache/restic-cache

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
log "=== Backup started ==="

# 1. Postgres dump — consistent snapshot, DB stays up
mkdir -p "$DUMP_DIR"
DUMP_FILE="$DUMP_DIR/db_$(date +%Y%m%d_%H%M%S).sql.gz"
docker exec peripateticware-postgres pg_dump -U peripateticware_user peripateticware | gzip > "$DUMP_FILE"
log "DB dump written: $DUMP_FILE"

# 2. Everything else needed to stand the app back up on a fresh box
RESTORE_BUNDLE="$DUMP_DIR/restore-bundle_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESTORE_BUNDLE"
cp /home/*/peripateticware/.env "$RESTORE_BUNDLE/env.backup" 2>/dev/null || true
cp -r /home/*/peripateticware/docker-compose*.yml "$RESTORE_BUNDLE/" 2>/dev/null || true
cp -r ~/.cloudflared "$RESTORE_BUNDLE/cloudflared" 2>/dev/null || true
cp /root/luks-backup-hdd-header.img "$RESTORE_BUNDLE/" 2>/dev/null || true

# 3. Uploads volume (adjust the volume name if yours differs — check: docker volume ls)
log "Backing up to encrypted repo..."
restic -r "$REPO" --password-file "$RESTIC_PW_FILE" backup \
  "$DUMP_DIR" \
  /mnt/cache/docker/volumes/peripateticware_uploads_data \
  --tag peripateticware \
  --exclude="*.tmp"

# 4. Prune — keep 14 daily, 8 weekly, 6 monthly
restic -r "$REPO" --password-file "$RESTIC_PW_FILE" forget \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune

# 5. Clean up local dump copies older than 2 days (restic already has them)
find "$DUMP_DIR" -maxdepth 1 -name "db_*.sql.gz" -mtime +2 -delete
find "$DUMP_DIR" -maxdepth 1 -name "restore-bundle_*" -mtime +2 -exec rm -rf {} +

log "=== Backup complete ==="
SCRIPT
□ sudo chmod +x /usr/local/bin/peripateticware-backup
```

Fix the `/home/*/peripateticware/` glob in the script to your actual repo path before running.

```
□ Test manually: sudo /usr/local/bin/peripateticware-backup
□ Verify: sudo restic -r /mnt/backup/restic --password-file /root/.config/restic/password snapshots
□ Schedule nightly at 2 AM:
    echo "0 2 * * * root /usr/local/bin/peripateticware-backup >> /var/log/peripateticware-backup.log 2>&1" \
      | sudo tee /etc/cron.d/peripateticware-backup
    sudo chmod 644 /etc/cron.d/peripateticware-backup
```

**Restore drill — do this now, not during an actual emergency:**
```
□ sudo restic -r /mnt/backup/restic --password-file /root/.config/restic/password restore latest --target /tmp/restore-test
□ gunzip -c /tmp/restore-test/mnt/cache/backups/db_*.sql.gz | head -c 500   # sanity check it's real SQL
□ rm -rf /tmp/restore-test
```

**Known gap (you already flagged this):** only one HDD is in service right now — no second independent copy. If that drive fails between backups, you lose everything since the last successful run elsewhere. When you set up the LAN mirror on the second drive, wire it into the same script as a second `restic -r $REPO_B ... backup` call (same pattern as the original two-repo design) so you're not down to a single point of failure indefinitely.

---

## 3. Docker deploy

```
□ cd ~/peripateticware   # or wherever you cloned it on the Linux box
□ git pull   # picks up the security fixes from Section 0, once committed

□ Bind app ports to loopback only in docker-compose.prod.yml — right now
  backend (8000), frontend (3000), and postgres (5432) publish to ALL
  interfaces, meaning anyone on your LAN (or anyone who reaches your public
  IP directly) can hit them without going through Cloudflare at all. Add:

    services:
      backend:
        ports:
          - "127.0.0.1:8000:8000"
      frontend:
        ports:
          - "127.0.0.1:3000:3000"
      postgres:
        ports: []   # not needed on the host at all — only other containers talk to it
      redis:
        ports: []

□ docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
□ docker compose ps   # all services healthy
□ curl http://127.0.0.1:8000/health
□ docker compose logs backend --tail=50   # confirm no "Refusing to start in production..." error
    # if you see that error, one of the secrets in Section 1 is still a dev default — fix .env and restart
```

---

## 4. Cloudflare Tunnel + Access (restricted to you + your tester list)

Domain is already on Cloudflare — this section is just the tunnel and access policy.

### 4.1 — Install and create the tunnel
```
□ wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
□ sudo dpkg -i cloudflared-linux-amd64.deb
□ cloudflared tunnel login          # opens a browser, pick peripateticware.com
□ cloudflared tunnel create peripateticware
    # note the tunnel UUID from the output
```

### 4.2 — Tunnel config — path-based routing under one hostname (avoids CORS entirely), plus a separate admin-only hostname
```
□ mkdir -p ~/.cloudflared
□ cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: /home/<your-user>/.cloudflared/<YOUR-TUNNEL-UUID>.json

ingress:
  # API calls — same hostname as the frontend, so no CORS is needed at all
  - hostname: peripateticware.com
    path: ^/api/.*
    service: http://127.0.0.1:8000

  - hostname: peripateticware.com
    path: ^/health$
    service: http://127.0.0.1:8000

  # Everything else on the main hostname → frontend.
  # /docs, /redoc, /openapi.json, /platform/* are deliberately NOT routed
  # here — they simply don't exist on this hostname.
  - hostname: peripateticware.com
    service: http://127.0.0.1:3000

  # Admin-only surface: full backend (docs + platform admin routes included).
  # Gated by a separate, stricter Cloudflare Access policy in 4.4.
  - hostname: admin.peripateticware.com
    service: http://127.0.0.1:8000

  - service: http_status:404
EOF
```

### 4.3 — DNS (Cloudflare dashboard → DNS)
```
□ CNAME peripateticware.com       → <TUNNEL-UUID>.cfargotunnel.com   (proxied ✅)
□ CNAME admin.peripateticware.com → <TUNNEL-UUID>.cfargotunnel.com   (proxied ✅)
□ SSL/TLS mode → Full (strict)
```

### 4.4 — Cloudflare Access (Zero Trust dashboard → Access → Applications)

If this is your first Access app, Zero Trust will ask you to pick a team domain (e.g. `yourteam.cloudflareaccess.com`) — one-time setup, free tier covers up to 50 users.

```
□ Add application → Self-hosted
    Name: Peripateticware
    Domain: peripateticware.com  (matches the whole hostname, no path restriction)
    Session duration: 24h (or your preference)

□ Policy: "Allowed users"
    Action: Allow
    Include → Emails: admin@thewordinbits.com, <tester1@...>, <tester2@...>
    (fill in the actual tester emails)
    Authentication: One-time PIN (email code) is enabled by default — this is
    the "password" experience: each allowed email gets a 6-digit code sent to
    them on login, no separate password to manage or leak.

□ Add a second application → Self-hosted
    Name: Peripateticware Admin
    Domain: admin.peripateticware.com
    Policy: Include → Emails: admin@thewordinbits.com   (you only — not the tester list)
```

### 4.5 — Run as a service
```
□ sudo cloudflared service install
□ sudo systemctl enable --now cloudflared
□ cloudflared tunnel info peripateticware
□ curl -I https://peripateticware.com/health        # should return 200, and prompt Access login in a browser
□ curl -I https://admin.peripateticware.com/docs     # same — Access login, restricted to you
```

### 4.6 — Cloudflare WAF / rate limiting (Security → WAF, dashboard)

The app's own per-route rate limiting is currently a no-op (flagged in Section 0's audit list) — do this at the edge instead, it doesn't depend on the app being fixed first:

```
□ Rule: Rate limit login/signup
    Expression: (http.request.uri.path matches "^/api/v1/auth/(login|signup)")
    Action: Rate limit → 10 requests/minute per IP → Block 10 min

□ Rule: SQLi/XSS managed protection
    Expression: (cf.waf.score.sqli lt 40) or (cf.waf.score.xss lt 40)
    Action: Block

□ Rule: Bot challenge on login
    Expression: (http.request.uri.path eq "/api/v1/auth/login" and cf.bot_management.score lt 30)
    Action: Managed Challenge
```

---

## 5. Go-live verification

```
□ Secrets rotated, no dev defaults (Section 1)
□ Backend boots without the "Refusing to start in production" error
□ curl https://peripateticware.com/health → 200 (after Access login)
□ curl https://peripateticware.com/docs → NOT reachable on the main hostname (expect 404/frontend 404 page)
□ curl https://admin.peripateticware.com/docs → reachable, but ONLY after Access login as admin@thewordinbits.com
□ Try a non-admin tester email against admin.peripateticware.com → must be denied by Access
□ Confirm the signup fix: POST /api/v1/auth/signup with {"role":"ADMIN", ...} → 400 Invalid role
□ Confirm demo accounts are gone: try logging in as admin@example.com / SecurePass123! → must fail
□ Port scan from outside your network confirms nothing but Cloudflare's edge reaches you:
    nmap -Pn -p 80,443,3000,8000,5432,6379 <your-home-public-IP>   # all should show filtered/closed
□ Nightly backup cron verified — trigger manually, confirm a new restic snapshot lands
□ Restore drill completed (Section 2.4)
□ Security headers present: curl -sI https://peripateticware.com | grep -i "strict-transport\|x-frame\|content-security"
□ Share the URL with your tester list, watch logs for the first 30 minutes:
    docker compose logs -f backend
```

---

## Deferred (explicitly out of scope for this pass)

- **Paddle / billing** — left disabled, sandbox mode, no live keys. Revisit when you're ready to charge.
- **Second HDD / LAN mirror of the internal server** — mount point and restic second-repo pattern are ready to extend once you set this up; not wired in yet.
- **The remaining audit findings in Section 0** (parent/session IDOR precision, upload path validation, unauthenticated inference endpoint, refresh-token rotation, single-use reset tokens) — real, but each needs a deliberate code change and testing, not a rushed patch during an infra deploy. Worth a dedicated follow-up session.
- **Production frontend build** — the frontend container currently runs the Vite *dev* server even under `docker-compose.prod.yml` (no production build stage exists in `frontend/Dockerfile`). It works, but isn't optimized or hardened the way a static production build would be. Not blocking, worth fixing later.
