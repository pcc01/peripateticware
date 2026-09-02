# Load Test — Findings / Bug Tracker

Bugs and oddities found while building and running the load test against
production (`peripateticware.com`) and the loopback backend on the prod host.

Status key: 🔴 open · 🟡 needs decision · ✅ fixed

## Fix status — DEPLOYED to prod 2026-09-02 (commit c24b9f0)

| # | Bug | Fix | Prod verification |
|---|---|---|---|
| 1 | Classroom invite 500 (tz-aware datetime) | `_invite_expires()` → naive UTC (`backend/routes/classrooms.py`) | ✅ `POST /classrooms/{id}/invites` → **201** on prod |
| 2 | Verification email undelivered / SMTP hang | port 465 → implicit TLS (`use_tls`) not STARTTLS, + 15s timeout (`backend/services/email_service.py`); test `backend/tests/test_email_tls_mode.py` (3/3). **Also set prod `SMTP_PORT=587`.** | ⏳ signup no longer hangs (see #3); confirm actual delivery via `docker logs peripateticware-backend --since 10m \| grep -i "email sent\|email send failed"` |
| 3 | `POST /auth/signup` blocks on SMTP | verification email moved to `BackgroundTasks` (`backend/routes/auth.py`) | ✅ signup → **201 in 0.34s** on prod (was >120s) |
| 4 | `ENVIRONMENT=development` in prod `.env` | set `ENVIRONMENT=production` in prod `.env` (compose already overrode it) | ✅ set + backend recreated |
| 5 | `/student/portfolio` + `/student/competencies` 500 | startup.py reconcile: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `student_competencies` **and** `student_notebooks` (both drifted from their ORM models); `database/init.sql` updated | ✅ both → **200** on prod (reconcile ran on the prod DB at boot) |
| 6 | Global rate limit never enforces | new pure-ASGI `GlobalRateLimitMiddleware` (Redis sliding window, 600/min per IP, `GLOBAL_HTTP_RATE_LIMIT` env, health/metrics exempt) in `backend/core/http_rate_limiter.py` + wired in `main.py` | ✅ 660 rapid reqs → **67× 429** at ~600 on prod; `/health/` stays 200 |

**New drift found while fixing #5:** `student_notebooks` had the same model-vs-DB
mismatch (`where_notes/why_notes/how_notes/learning_insights/next_steps/rubric_scores/is_submitted/submitted_at`
missing) — on prod it happened to have those columns, on the local DB it did
not. Both are now reconciled by the same startup.py block. Root pattern:
`CREATE TABLE IF NOT EXISTS` in `startup.py` never reconciles an already-existing
table, so any model column added later silently never lands on older databases.
Worth an audit pass over the other `CREATE TABLE IF NOT EXISTS` blocks.

---

---

## 🔴 1. Classroom invite creation 500s on prod — students cannot be invited

- **Endpoint:** `POST /api/v1/classrooms/{id}/invites`
- **Symptom:** every call returns `500 Internal Server Error`.
- **Root cause:** `_invite_expires()` (`backend/routes/classrooms.py:64`) returns a
  timezone-**aware** datetime (`datetime.now(timezone.utc) + timedelta(days=14)`),
  but `classroom_invitations.expires_at` is `TIMESTAMP WITHOUT TIME ZONE`. asyncpg
  refuses to encode it:
  `asyncpg.exceptions.DataError: invalid input for query argument $7 … can't subtract offset-naive and offset-aware datetimes`
- **Impact:** the entire classroom-invite / student-onboarding flow is broken in
  production. No teacher can add a student to a classroom via the normal UI path.
- **Fix options:** store naive UTC in the insert (`_invite_expires().replace(tzinfo=None)`),
  or migrate the column to `TIMESTAMPTZ` and make the whole module tz-aware
  consistently. Check `bulk_invite_csv` (`:521`) and `_now()` comparisons in
  `preview_invite` / `accept_invite` for the same naive/aware split.
- **Found:** 2026-09-02, during load-test account provisioning.

---

## 🔴 2. Signup verification email never delivered on prod

- **Symptom:** `POST /api/v1/auth/signup` on prod creates the user with
  `is_active=false` (correct for `ENVIRONMENT=production`), but the verification
  email that is the *only* way to activate never arrived
  (`loadtest.teacher@ / loadtest.homeschool@thewordinbits.com`). Had to activate
  the rows manually with a direct SQL `UPDATE users SET is_active=true`.
- **Impact:** if this is not specific to the `loadtest.*` mailboxes, **no new
  user can complete signup on production** — they sign up, get "check your email",
  and can never log in. Password reset likely uses the same pipeline and would be
  equally dead.
- **To check:** SMTP config actually working (`EMAIL_FROM=noreply@peripateticware.com`,
  real SMTP creds present and valid), delivery vs. spam-folder vs. hard bounce,
  whether `send_verification_email` exceptions are being swallowed
  (`backend/routes/auth.py` wraps it in `try/except … logger.warning`).
- **Found:** 2026-09-02.

---

## 🔴 3. `POST /api/v1/auth/signup` blocks on synchronous SMTP send

- **Symptom:** one signup call took **> 120 s** (client timed out); the account +
  org were still committed. The request thread is blocked on the SMTP send inside
  the request/response cycle, apparently waiting on a long connect/read timeout to
  the mail server.
- **Impact:** under any real signup traffic this ties up a gunicorn worker for the
  full SMTP timeout per request — trivial to exhaust all 8 workers. Also a bad UX
  (multi-minute spinner on "Sign up").
- **Fix:** move `send_verification_email` to a background task
  (`fastapi.BackgroundTasks` / the existing APScheduler) and/or set an aggressive
  SMTP timeout. Related to #2.
- **Found:** 2026-09-02.

---

## 🟡 4. `ENVIRONMENT` inconsistent between `.env` and running container

- Prod `.env` has `ENVIRONMENT=development`; `docker-compose.prod.yml` overrides it
  to `production` (which is what actually runs). Harmless today because compose
  wins, but the `.env` value is misleading for anyone debugging on the box, and a
  future change to how env precedence works could silently flip prod into dev mode
  (debug error pages, auto-activated signups, etc.).
- **Fix:** set `ENVIRONMENT=production` in the prod `.env` too, so the two agree.
- **Found:** 2026-09-02.

---

## 🔴 5. `GET /api/v1/student/portfolio` and `/api/v1/student/competencies` 500 — schema drift

- **Symptom:** both endpoints return `500` on **every** call (prod, edge + loopback).
- **Root cause:** `asyncpg.exceptions.UndefinedColumnError: column
  student_competencies.description does not exist`. The query in
  `backend/routes/student.py:560` (`get_portfolio`, and the competencies list
  query) selects `student_competencies.description`, but the prod
  `student_competencies` table has no such column — a migration that adds it was
  never applied to prod, or the column was added to the query/model without a
  migration.
- **Impact:** the student portfolio page and competency/badge progress are fully
  broken in production for every student.
- **Fix:** reconcile the `student_competencies` schema — add the missing column
  via Alembic (and backfill), or drop `description` from the query if it's
  genuinely not meant to exist. Check `backend/models/` vs. a
  `\d student_competencies` on prod for the full drift.
- **Found:** 2026-09-02, smoke test (46/46 calls to these two endpoints 500'd).
- **Workaround for the load test:** both endpoints removed from `scenarios/student.js`.

---

## Load-test run findings

### Smoke test — 2026-09-02, loopback (5 VUs / 60s, 325 requests)

- **Rate limiting: 0× 429** despite ~325 req/min sustained — above the configured
  `default_limits=["200/minute"]`. On loopback there's no `CF-Connecting-IP` /
  `X-Forwarded-For`, so either the limiter keys to something that isn't
  throttling, or the middleware/Redis storage isn't enforcing. **Implication:**
  the capacity run may not need the limit raised at all — confirm at 80+ VUs.
- **Latency:** p95 24 ms, p99 ~n/a — loopback backend is very fast for the
  healthy endpoints.
- **Healthy (200):** `/health/`, `blog/posts`, `pages/home/blocks`, `geo/hint`,
  `activities`, `activities/teacher/dashboard`, `classrooms`, `standards`,
  `student/notebook`, `homeschool/children`, `homeschool/coverage`.
- **Broken:** `student/portfolio`, `student/competencies` (see #5).

### Capacity run — 2026-09-02, loopback (15 min, peak 209 VUs, 112,269 requests)

Scenarios: 20 unauth + 80 teacher + 100 student + 20 homeschool VUs.

- **The loopback backend is nowhere near stressed at ~200 concurrent users.**
  - `http_req_duration`: avg 6.4 ms, med 6.0 ms, **p95 10.3 ms**, p99 ~30 ms, max 195 ms.
  - Per scenario p95: unauth 8.9 ms, teachers 10.6 ms, students 10.3 ms, homeschool 10.4 ms
    (thresholds were 1000 / 2000 / 1500 / 3000 ms — passed by ~100–300×).
  - Throughput: 124 req/s sustained, 41.7 iterations/s.
  - **`server_error_5xx`: 0.** No backend errors under load.
  - Resources mid-run: backend CPU ~78 % of 4 cores, memory flat < 1 GB / 6 GB;
    Postgres CPU < 5 %, 43 / 100 connections; Redis negligible.
  - Verdict: the app + host have large headroom well beyond 200 concurrent. The
    real ceiling is far higher; a future run should push VUs 3–5× and/or add
    write + AI load to actually find it.

- **`http_req_failed` 15.4 % — but NOT the server's fault.** Zero 5xx, zero 429.
  Every failure was a `403` from the student scenario calling `GET /api/v1/activities`
  (a teacher-only route). Test-scenario bug, now fixed → `GET /api/v1/student/activities`.
  Re-run for a clean <2 % failure number.

## 🟡 6. Global rate limiting never triggered — verify it actually enforces

- Sent **112,269 requests from a single source in 15 min (124 req/s sustained)**
  and got **zero 429s**. `backend/core/http_rate_limiter.py` sets
  `default_limits=["200/minute"]` per client IP; nothing throttled.
- On the loopback path there's no `CF-Connecting-IP` / `X-Forwarded-For`, so
  `_client_ip()` falls back to the socket peer (`127.0.0.1`) — that should still
  be one bucket at 200/min. Either the limiter isn't enforcing, the storage
  backend (Redis) isn't wired for the default limit, or the middleware order lets
  it through. The README's own history notes slowapi middleware was previously
  missing entirely — worth confirming the fix still holds.
- **Not a load-test blocker** (it's why the capacity run needed no limit change),
  but it means the abuse protection on `peripateticware.com` may currently be a
  no-op for a single aggressive IP. Re-test through the edge (`CF-Connecting-IP`
  present) and with a real per-route limit (`/auth/login` 5/min) to see whether
  *any* limit is active in prod.
- **Found:** 2026-09-02, capacity run.

### Edge-overhead — 2026-09-02 (Cloudflare + cloudflared tunnel cost)

**Warm connection (k6, 15 VU / 3 min, connection reuse — approximates a browser):**

| | loopback `127.0.0.1:8000` | public `peripateticware.com` | overhead |
|---|---|---|---|
| median | 11.9 ms | 177.6 ms | **+166 ms** |
| p95 | 61.3 ms | 518.4 ms | **+457 ms** |
| requests completed in 3 min | 123,202 | 11,280 | ~11× fewer |

**Cold connection (serial curl, fresh TLS per request — worst case / first paint):**

| endpoint | loopback | edge | overhead |
|---|---|---|---|
| `/health/` | 4 ms | 579 ms | +575 ms |
| `/api/v1/blog/posts` | 7 ms | 527 ms | +520 ms |
| `/api/v1/geo/hint` | 3 ms | 478 ms | +475 ms |
| `/api/v1/pages/home/blocks` | 5 ms | 442 ms | +437 ms |
| `/api/v1/activities` | 7 ms | 402 ms | +395 ms |
| `/api/v1/standards` | 6 ms | 361 ms | +355 ms |
| `/api/v1/activities/teacher/dashboard` | 5 ms | 433 ms | +428 ms |

Takeaways:
- The app itself is ~5–12 ms per request. **Effectively all latency a real user
  sees on `peripateticware.com` is the Cloudflare edge + tunnel hop, not the app.**
- Warm (keep-alive) requests pay ~**165 ms** of that; the first request on a cold
  connection pays **350–580 ms** (TLS + tunnel setup). Tail latency through the
  tunnel is high and variable (p95 +457 ms; earlier isolated `/health/` probes
  ranged 130–580 ms across the session).
- No `4xx`/`5xx`/`429` on either path during these runs — **and still zero 429s
  through the public edge at ~62 req/s from one IP**, reinforcing #6 (rate
  limiting is not enforcing in prod).
- Options if the tunnel latency matters: Cloudflare Argo Smart Routing, a
  `cloudflared` replica closer to the edge, or moving off the tunnel to a real
  origin + Cloudflare proxy. Worth its own investigation.
