# Peripateticware — Bug & Verification Checklist

> Work through this top to bottom. Each item has exact commands to run and what a passing result looks like.
> Updated: 2026-05-30

---

## B-4 — End-to-end login verification

**What to check:** After any Docker rebuild, confirm all four roles can log in and land on the right dashboard.

```bash
# 1. Rebuild and start (only needed if you changed Dockerfile or dependencies)
cd /path/to/peripateticware
docker compose build --no-cache frontend
docker compose up -d

# 2. Watch logs until stable (Ctrl-C when you see "ready")
docker compose logs -f frontend backend

# 3. Check backend health
curl http://localhost:8000/health
# Expected: {"status": "ok", ...}
```

Then open `http://localhost:3000` in a browser and test each login:

| Email | Password | Expected landing page |
|-------|----------|-----------------------|
| `teacher@example.com` | `SecurePassword123` | `/teacher/activities` |
| `student@example.com` | `SecurePassword123` | `/student` (dashboard) |
| `parent@example.com` | `SecurePassword123` | `/parent` |
| `homeschool@example.com` | `SecurePassword123` | `/homeschool` |
| `admin@example.com` | `SecurePassword123` | `/admin` |

**Pass:** Each lands on the correct page and loads data (no blank screen, no 500).  
**Fail signals:** Redirect loop → ProtectedRoute role mismatch. 500 on data load → check `docker compose logs backend`.

---

## BE-9 — Location enrichment (Nominatim / Wikidata) in Docker

**What to check:** The location service should return enriched place data when an activity has coordinates.

```bash
# Get a valid JWT first (swap credentials if needed)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@example.com","password":"SecurePassword123"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

# Hit the location enrichment endpoint with a real coordinate (Austin TX)
curl -s http://localhost:8000/api/v1/location/enrich \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 30.2672, "longitude": -97.7431}' | python3 -m json.tool
```

**Pass:** Returns a JSON object with `place_name`, `region`, and optionally `wikidata_description`.  
**Fail:** `{"detail": "..."}` or empty response → check `docker compose logs backend` for Nominatim timeout. Nominatim requires outbound internet from the container; if behind a firewall add the domain to the allowlist.

---

## F-13 — Mobile viewport on real device

**What to check:** The web frontend renders correctly on a phone browser.

1. Find your machine's local IP: `ip route get 1 | awk '{print $7}'` (Linux) or `ipconfig` (Windows).
2. On your phone (same WiFi), open `http://[your-ip]:3000`.
3. Log in as `student@example.com / SecurePassword123`.

**Pass:** Login form is legible, no horizontal scroll, tap targets feel right.  
**Fail:** If port 3000 is unreachable, check Vite is binding to `0.0.0.0`:

```bash
docker compose exec frontend grep -r "host" /app/vite.config.ts
# Should show: host: '0.0.0.0'  or server: { host: true }
```

---

## I-3 — Nginx production config

**What to verify:** `nginx.conf` at root routes `/ → frontend:3000` and `/api/ → backend:8000` correctly.

```bash
# Dry-run nginx config check inside the container (if nginx is in compose)
docker compose exec nginx nginx -t
# Expected: "syntax is ok" and "test is successful"

# Or check the file directly
cat nginx/nginx.conf | grep -A5 "location /api"
# Should proxy_pass to the backend service
```

If nginx is not yet in `docker-compose.yml`, see `I-3` in work_tracking.md — it needs to be added.

---

## I-4 — Monitoring / Observability stack

**Status:** Not yet wired into compose. `monitoring/` and `observability/` directories exist.

**When ready to wire:** Add the Prometheus + Grafana services from `monitoring/docker-compose.monitoring.yml` (or equivalent) to the main `docker-compose.yml`, then:

```bash
docker compose up -d prometheus grafana
open http://localhost:3001  # Grafana default
```

Not blocking anything — skip until pre-production.

---

## I-5 — pgbouncer connection pooling

**Status:** `pgbouncer.ini` exists but the service is not in compose.

**When ready:** Add to `docker-compose.yml`:

```yaml
pgbouncer:
  image: pgbouncer/pgbouncer:latest
  environment:
    - DATABASES_HOST=db
    - DATABASES_PORT=5432
    - DATABASES_DBNAME=peripateticware
    - DATABASES_USER=${DB_USER}
    - DATABASES_PASSWORD=${DB_PASSWORD}
  ports:
    - "6432:5432"
```

Then point `DATABASE_URL` in backend env to `postgresql+asyncpg://user:pass@pgbouncer:5432/peripateticware`.

---

## I-6 — CI/CD pipeline

**Status:** No GitHub Actions workflow exists.

**Minimum viable workflow to create:** `.github/workflows/ci.yml` with:
- Trigger: `push` to `main` and `pull_request`
- Jobs: `backend-test` (pytest), `frontend-lint` (eslint + tsc --noEmit), `docker-build` (build images, no push)

---

## BUG-2 — Expo Go timeout (see also EXPO_TESTING_GUIDE.md)

The bundle is too large for Expo Go's transfer window over typical home WiFi.  
**Solution:** Use an EAS development build instead. See `EXPO_TESTING_GUIDE.md` in this directory.
