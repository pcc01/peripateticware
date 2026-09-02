# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# 🌍 Peripateticware: Location-Based Learning Platform

**From Vision (2007) to Reality (2026)**

> "Peripateticware is a name I've coined to identify products designed for mobile devices. It points to the term that is used to identify Aristotle's method of teaching as he walked with his students in the Lyceum."
>
> — Original Vision, February 2007

---

## 📜 The Vision: Why Build This?

### The Problem (2007)
Students learn in isolated classrooms disconnected from the real world. Education is confined to textbooks and desktops, missing the rich context that physical locations provide. We ask students to memorize facts instead of explore places.

### The Solution
**Peripateticware**: Mobile education software that leverages location and mobility as core design features. Students learn by exploring their physical environment with guided, AI-enhanced lessons rooted in real places.

### The Moment of Inspiration
In February 2007, the insight was clear:
> "Rather than mandating instructional design and leading students kicking and screaming their way to knowledge, these products could prompt students to follow their passions and learn along the way. What if educational products allowed students to explore ideas? What if a math product presented a discussion of an arch when a student stood inside a cathedral?"

### The Promise (Then and Now)
- **Individualized Learning:** Students follow their passions, not mandated curricula
- **Location Awareness:** Activities triggered by physical location (GPS)
- **Contextual Richness:** Real places provide authentic learning context
- **Kinesthetic Education:** Learning through movement and exploration
- **Accessibility:** Works on any mobile device
- **Teacher Empowerment:** Teachers (not corporations) control the content

### The Unresolved Challenge
In 2007, one problem remained unsolved:
> "Assessment is clearly the most difficult part of 'unleashed education'."

**In 2026, we've solved it with AI:**
- AI-generated rubrics aligned with Bloom's taxonomy
- Portfolio evidence tracking built-in
- Competency-based assessment
- Meaningful, holistic evaluation

---

## ✨ What's Built (June 2026)

This is a full-stack, production-grade application with a web frontend, REST API backend, and React Native mobile app.

### Backend — FastAPI + PostgreSQL
- **Authentication:** JWT-based login/signup, email verification, password reset, role-based access
- **Two-Factor Authentication (TOTP):** Opt-in for any account, specifically recommended for Teacher/Admin given their student-PII access — QR-code setup (any authenticator app), one-time backup codes, and a short-lived `mfa_pending` token (rejected everywhere except the second-factor exchange) so the second factor genuinely can't be bypassed even with a captured token
- **Rate Limiting:** `slowapi`, Redis-backed so limits hold correctly across all of gunicorn's worker processes (not per-process counters that don't see each other) — auth, password reset, and AI endpoints throttled
- **Roles:** Teacher, Student, Parent, Admin, Homeschool, Platform (super-admin)
- **Activity Engine:** Full CRUD for location-based learning activities with Bloom's taxonomy levels
- **Student Features:** Field notes, self-initiated projects, peer projects, reverse scavenger hunt proposals
- **AI Integration:** Provider-agnostic — Ollama (local, default), Anthropic Claude API, or OpenAI/OpenAI-compatible (Azure OpenAI, vLLM, LiteLLM, etc.), selectable globally or per-agent; embeddings additionally support Voyage AI (Anthropic's recommended embeddings partner, with asymmetric query/document embeddings); Whisper for audio transcription (ASR); standards parsing
- **GraphRAG Retrieval:** Two-stage retrieval over the standards graph — pgvector semantic search (embeddings) finds seed matches, then graph expansion (`standards_items.parent_id` hierarchy, `standards_associations` typed cross-edges, `content_alignments`) pulls in ancestors, cross-jurisdiction equivalents, prerequisites, and already-aligned content. Powers standards, rubrics, and homeschool state requirements search; every result is tagged with *why* it's relevant (direct match vs. structural context), not just a similarity score. CASE-standard ingest (`scripts/ingest_case_standards.py`) and teacher/homeschool PDF uploads both feed the same graph (`services/standards_graph_fold.py`)
- **Grounded LLM Classification:** Retrieval and reasoning are deliberately separate stages. GraphRAG retrieval (above) only *finds* candidate standards — it's `agents/standards_mapping_agent.py` that *judges* them: an LLM classifies which retrieved candidates actually apply to a given student submission, returning a decision (applies/partially/no), a rationale, and a confidence score per standard. The output is then hard-filtered against the exact candidate set retrieval returned, so the LLM can never claim a standard it wasn't actually shown — a real code-level hallucination guardrail, not just a prompt instruction
- **Global Privacy & Compliance Engine:** Not just the 9 named laws enforced out of the box (FERPA, COPPA, GDPR, CCPA, LGPD, PIPEDA, POPIA, LPDC, AEPD) — the resolver covers **235 countries/territories**: 183 with a confirmed real privacy law (resolved via hand-maintained crawler adapters or the catalog) and 52 confirmed-no-law countries mapped to a GDPR baseline (`scripts/seed_no_legislation_countries_to_gdpr.py`), sourced from an IAPP directory snapshot. Any country with no existing match is handled by an AI discovery pipeline (`services/privacy_discovery_service.py`) that synthesizes a jurisdiction entry on demand — with a country-consistency guard that rejects (rather than stores) and flags to an admin any result that drifts onto the wrong country, so a bad AI answer never silently becomes live compliance policy. DSR portal (access, download, deletion, correction, opt-out); consent management; soft-delete with scheduled purge
- **Field-Level Encryption:** Fernet symmetric encryption + HMAC blind index on student PII (email, full name, GPS coordinates, notification payloads); backfill script included
- **Breach Notification:** GDPR Art. 33/34 workflow — `BreachIncident` model, 7 admin endpoints, DPA notification, hourly overdue-incident checker
- **Email Service:** SMTP-backed transactional email (verification, password reset, parent consent)
- **Standards & Rubrics:** Upload PDFs/CSVs; AI extracts criteria; coverage reporting (unions manual mappings and AI-suggested graph alignments); GraphRAG semantic + structural search
- **Export Service:** Portfolio PDF and activity log CSV generation; Cloudflare R2 storage with local fallback
- **Subscription Tiers:** Starter, School, Homeschool Family tiers enforced via 402 gates; Paddle billing integration; `UpgradeCTA` modal wired globally
- **Admin Panel:** User management, fine-grained RBAC, audit logs, env editor, privacy config, AI rate-limit enforcement
- **Homeschool Persona:** Multi-child management, state reporting standards, coverage dashboards, ExtractionWizard for requirements
- **Built to Extend, Not Fork:** New AI providers plug in by pointing `*_BASE_URL` at any OpenAI-wire-compatible endpoint — no code changes. New privacy jurisdictions land as a JSON config file (`backend/config/jurisdictions/`) or are synthesized automatically by the discovery pipeline above — no code changes. New standards frameworks feed the same graph as CASE via `scripts/ingest_case_standards.py` — no schema changes. Extensibility here means a config file or an adapter, not a fork.

### Frontend — React + TypeScript + Vite
- **Five Role Dashboards:** Teacher, Student, Parent, Admin, Homeschool — each with sidebar nav, stat cards, and role-specific tools
- **Platform Admin (Commercial License Only):** Multi-tenant org management, per-org AI config, usage dashboards, audit log, AI settings — gated behind the Platform role; only available to licensed operators
- **Activity Manager:** Full create/edit/publish flow with map-based location picker; hero image and attachment upload via R2
- **Field Notes & Projects:** Student-initiated field note editor, self-project view, peer project collaboration
- **Proposals (Reverse Scavenger Hunt):** Students propose activities; teachers review and approve
- **Standards Library:** Upload, review, and map curriculum standards (CCSS, NGSS, TEKS, state reporting)
- **Homeschool Tools:** Child management, requirements setup via ExtractionWizard, coverage dashboard, portfolio export
- **Student Journal:** Chronological timeline of field notes grouped by month
- **Parent Dashboard:** Child progress, link-child flow, messages, notifications, weekly/monthly reports, calendar
- **Privacy Pages:** Cookie consent banner, Do Not Sell page, DSR portal, privacy confirmation flow
- **Auth Flows:** Signup → email verification → login; forgot/reset password
- **Internationalization:** 13 locales (en, es, fr, fr-CA, de, it, pt-BR, zh, ja, ko, ar, he, tr) spanning 5 writing systems (Latin, CJK/Han, Hangul, Arabic, Hebrew), with RTL support for Arabic and Hebrew
- **Design System:** Three visual themes (Field Guide, Terrain, Atmosphere); WCAG 2.1 AA accessible

### Mobile — React Native (Expo SDK 54)
- Located in `mobile/` — built and field-tested
- **Full Activity Flow:** Discovery map → Brief → Orient → Inquiry → Reflect (Expo Router file-based screens)
- **Capture Tools:** Photo (expo-image-picker), audio (expo-av) with ASR transcript polling, text note
- **Peri AI Chat:** Socratic inquiry chat with the crow mascot, wired to `/api/v1/inference/chat`
- **Offline-First:** SQLite local cache for questions and activities; capture/note queue; auto-sync on reconnect
- **Journal & Progress:** API-wired journal and competency/badge progress screens
- **Geofence Guard:** Haversine-based proximity check; non-blocking toast when student leaves activity radius
- **Teacher Monitoring:** Session events (phase transitions, captures, geofence exits) posted to backend
- **Age-Band Adaptive Copy:** Three age bands (K–2, 3–6, 7–12) with distinct Peri speech and vocabulary
- **Three Visual Themes:** Field Guide (r:12px), Terrain (4px), Atmosphere (20px); city skin overlay

---

## 🔧 GraphRAG Retrieval — Status & Recent Work (Aug 17, 2026)

The GraphRAG pipeline described above is live in both environments; this is a running log of what's
been fixed and what's still open, kept close to the code rather than buried in a separate tracker.
Full detail: `PRD-graphrag-migration-2026-08-16.md`.

**Done, this week** — found comparing local vs. prod retrieval on identical queries, root-caused, fixed, and verified on both databases:
- **Retired-content leak fixed.** A framework literally titled `[RETIRED] Language Arts: Henry Teaching & Learning Standards` was surfacing as top-5 results. `is_retired` was set at ingest but never checked anywhere in retrieval — fixed in the seed query, the graph-expansion (ancestor/association) queries, and cascaded properly at ingest time going forward (`scripts/ingest_case_standards.py`). One-time cleanup (`scripts/retire_items_from_retired_frameworks.py`) retired 16,614 items across 18 frameworks on both databases — deliberately *not* the much larger `adoption_status='Deprecated'` bucket (89,928 items), since that value turned out to be agency-inconsistent (GCPS uses it on its entire *current* catalog) and unsafe to act on alone.
- **Retrieval latency fixed.** Two full-table-scan queries, found by splitting `retrieval_time_ms` into `embed_ms`/`db_ms`/`expand_ms` and EXPLAIN-ANALYZing prod: no index on `standards_items.is_retired` (the retirement fix's own `NOT EXISTS` check was Seq Scanning ~561k rows every call) and no index on `standards_associations.destination_item_id` (Seq Scanning 669,858 rows every call for graph expansion). Both indexed. Prod's per-query latency: **623–690ms → 114–233ms**, faster than the pre-fix baseline, not just back to it.
- **Quality-parity methodology built.** Local (Ollama) and prod (Voyage) embed with different models on different score scales, so raw relevance scores were never comparable. Built a keyword-derived ground truth (independent of either model) and measured precision/recall instead: **local 0.267/0.033, prod 0.313/0.029 avg** — statistically comparable. The apparent "prod is worse" read from raw scores alone was not supported once measured properly.

**In progress — hybrid (vector + lexical) retrieval:**
Investigating the two lowest-scoring eval categories surfaced one real, narrow gap: for *"figurative
language in poetry analysis"*, prod's pure vector search returns items about "poetic technique" (rhyme,
stanza) instead of the literal concept the query asked about, because nothing in Stage 1 has a
lexical-match signal — if a phrase match isn't among the embedding model's nearest neighbors, it's
just gone, and that's provider-dependent (Ollama happened to surface one hit here; Voyage surfaced
zero). Scoped fix, not yet built: add a Postgres full-text (GIN) index over `rag_documents.content`,
run it as a second Stage-1 candidate channel alongside the existing pgvector search, and merge the two
ranked lists via Reciprocal Rank Fusion (RRF) rather than trying to normalize two incompatible score
scales. Touches `routes/inference.py`'s seed query for every `rag-retrieve` call, so it ships behind
thorough local + prod verification before merge, same as the fixes above.

---

## 🔒 Security, Performance & Accessibility Hardening (Aug–Sep 2026)

A home-server security/responsiveness audit and its follow-through, kept close to the code the same way the GraphRAG log above is.

**Security — fixed:**
- **Rate limiting was silently non-functional.** `slowapi`'s middleware was never registered (`SlowAPIMiddleware` missing from `main.py`), so every `@limiter.limit()` decorator was a no-op regardless of config. Fixed, and made correct across gunicorn's multiple workers via a shared Redis `storage_uri` (`core/http_rate_limiter.py`) instead of in-process counters that don't see each other. **Follow-up (Sep 2026 load test):** the per-route `@limiter.limit()` decorators now work (verified: `/auth/login` 429s on the 6th hit), but slowapi's *global* `default_limits` via `SlowAPIMiddleware` still silently don't enforce — 112k requests from one IP in a load test drew zero 429s. Replaced with a small pure-ASGI `GlobalRateLimitMiddleware` (Redis sliding window, `GLOBAL_HTTP_RATE_LIMIT` req/min per IP, `/health`+`/metrics` exempt, streaming-safe) that actually does.
- **Redis had no authentication.** Added `requirepass`, gated by `REDIS_PASSWORD`.
- **Privacy/consent enforcement was bypassed on 7 write paths.** Extended the one working call site's pattern (`services/privacy_engine.py::enforce_or_raise()`/`audit_submission()`) to all of them.
- **The PII-encryption backfill script was non-idempotent** — re-running it would have double-encrypted already-correct rows. Added `is_encrypted()` detection to `core/encryption.py`.
- **Docker's entire data volume (Postgres, Redis, uploads) was unencrypted at rest.** Migrated it to LUKS in place — staged the ~16GB off, wiped and re-encrypted the drive, restored it — mirroring the existing backup-drive encryption pattern (keyfile + crypttab); folded the new header/keyfile into the existing Restic backup bundle; reboot-tested and restore-drill-tested afterward.
- **Dependency CVE sweep** (`pip-audit` / `npm audit`, run against real installed versions inside Docker, not just `requirements.txt`/`package.json`): backend went from 146 known vulnerabilities to 2 — both deliberately deferred with documented reasoning (`pytest`, dev-only tooling never shipped; `ecdsa`, no published fix but unreachable since this app is HS256-only). Frontend: `form-data` and `react-router-dom` (v6→v7, migrated — see below) both cleared; `i18next-http-backend`/`vite` remain flagged pending a dedicated major-version migration (real breaking changes across the whole build toolchain, not a quick patch).
- **`react-router-dom` migrated v6.28 → v7.18.3** to clear its 2 CVEs (open redirect, SSR-hydration constructor injection). Low actual migration risk — the app only ever used react-router's stable "declarative mode" API, none of v7's framework-mode surface — verified with a real browser smoke test (navigation, back-links, dynamic-param routes), not just a green build.
- **Opt-in TOTP two-factor authentication**, addressing the last item from the original audit (no MFA on Teacher/Admin accounts, which hold student PII access). QR-code setup, one-time backup codes, and a short-lived `mfa_pending` token that's explicitly rejected everywhere except the second-factor exchange endpoint (`core/dependencies.py`'s token-type check) — verified this actually blocks a captured pending token from working as a real session, not just that the happy path works. Caught two real bugs building it: `GET /me` had its own token check entirely independent of the shared dependency (didn't even check revocation) and would have accepted an mfa_pending token; backup-code single-use enforcement didn't persist (mutating a JSONB list's nested dicts in place doesn't register as a SQLAlchemy change) so every backup code was silently infinitely reusable until fixed. A third, unrelated to security: the live login form doesn't call the props its wrapper passes it — it manages its own submission via a Zustand store — so the actual fix had to go where the real code path is, not where it looked like it should go.
- Fixed a real duplicate-route registration bug (`routes/phase7_student_initiated.py`, surfaced by a newer FastAPI's stricter duplicate-operation-ID check) and a PEP 563 (`from __future__ import annotations`) + `slowapi` interaction that had silently broken `/openapi.json` for the whole app.
- Fixed a stale regression test (`test_fieldwork_locations.py`) that had kept asserting a bug (`text("NULL").label(...)` raising `NotImplementedError`) was still present after the underlying code had already been fixed elsewhere — it was silently failing on every run. Replaced with a real success-path assertion.

**Responsiveness — fixed:**
- Frontend main bundle: **1.65 MB → ~400 KB**, via `React.lazy`-based code-splitting across ~114 route imports.
- Postgres tuned for the actual host (`shared_buffers`, `effective_cache_size`, `maintenance_work_mem`), plus indexes added on hot foreign keys that were missing them.
- Teacher/homeschool dashboards cache their query results (30s TTL).
- Anthropic prompt caching (`cache_control: ephemeral`) on repeated system prompts.
- "Suggest Activities" now streams (SSE) instead of blocking for the full generation; its location-context lookup was found duplicating an *existing* DB-backed cache (`routes/privacy_locations.py::enrich_location()`) rather than reusing it — fixed to delegate instead of maintaining a second cache.
- Scanned-PDF OCR pages now render/transcribe concurrently (`asyncio.gather` + a semaphore) instead of serially.

**Accessibility — in progress:**
- `eslint-plugin-jsx-a11y` now runs as part of lint — surfaced a **123-item backlog** (mostly `onClick` elements with no keyboard equivalent) beyond what manual review had found; tracked as warnings for ongoing triage, not bulk-fixed yet.
- Fixed: the 3 modals that couldn't be dismissed via keyboard (new `useEscapeKey` hook), missing `aria-labelledby` on 2 of them, `loading="lazy"` on blog/content images.

**Load test (Sep 2026) — `k6/` suite, `k6/RESULTS.md`, `k6/FINDINGS.md`:**
Ran against production — primary run on the prod host against loopback `127.0.0.1:8000` to bypass the Cloudflare tunnel, plus a bounded run through `peripateticware.com` to measure the tunnel's cost.
- **Capacity:** ~208 concurrent users, 15 min, 112k requests — **p95 10 ms, zero 5xx**, backend at ~78% of 4 cores, Postgres 43/100 connections. Nowhere near the ceiling at 200 concurrent; the real knee is far higher and wasn't reached.
- **Where user latency goes:** the app answers in 5–12 ms; a real visitor to `peripateticware.com` sees +165 ms (warm connection) to +350–580 ms (cold). `cloudflared`→edge RTT is only 3–14 ms, so that overhead is Cloudflare's edge proxy + routing to the Seattle colo the tunnel is pinned to — not the app, not the tunnel hop. Mitigations (Argo Smart Routing, edge-caching the static frontend + public GETs, trimming CF features on `/api/*`) in `k6/RESULTS.md`.
- **Six bugs found, fixed, deployed and verified on prod** (commits `c85e1d0`/`c24b9f0`):
  - `POST /classrooms/{id}/invites` 500'd on every call — `_invite_expires()` returned a timezone-aware datetime for `classroom_invitations.expires_at`, which is `TIMESTAMP` (no tz); asyncpg rejects the bind. Classroom invites were fully broken in production.
  - `GET /student/portfolio` + `/student/competencies` 500'd on every call — `student_competencies` and `student_notebooks` had drifted from their ORM models. `CREATE TABLE IF NOT EXISTS` in `startup.py` never reconciles an *existing* table, so columns added to the models later (`description`, `where_notes`, …) never landed on older databases. Added `ALTER TABLE … ADD COLUMN IF NOT EXISTS` reconcile blocks; `database/init.sql` updated to match.
  - `POST /auth/signup` blocked for >120 s on a synchronous SMTP send (one bad send tied up a gunicorn worker for the full timeout) — moved the verification email to `BackgroundTasks`.
  - Verification emails were never delivered — prod runs `smtp.resend.com:465` (implicit TLS / SMTPS) but `_send()` passed `start_tls=True` (STARTTLS), which hangs mid-handshake. Pick the TLS mode from the port + add a 15 s timeout (`services/email_service.py`, regression test in `tests/test_email_tls_mode.py`); prod `SMTP_PORT` also moved to `:587`.
  - Global rate limiting still didn't enforce even with `SlowAPIMiddleware` registered — see the rate-limiting bullet above; added `GlobalRateLimitMiddleware`.
  - `ENVIRONMENT=development` was set in the prod `.env` (the compose override forced `production` anyway, so cosmetic) — corrected on the host.

---

## 🚀 Quick Start (Docker)

### Prerequisites
- Docker Desktop
- Git
- An AI provider: Ollama running on the host (`ollama serve`, default) — or skip it and configure a Claude/OpenAI API key instead (a Voyage AI key too, if using Claude for generation — see [AI Configuration](#-ai-configuration))

### 1. Clone
```bash
git clone https://github.com/paulcerda/peripateticware.git
cd peripateticware
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — at minimum set SMTP_* vars if you want email,
# or leave EMAIL_DRY_RUN=true to skip sending.
```

### 3. Start
```bash
docker compose up -d
```

### 4. Access
| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| API health | http://localhost:8000/health |

### 5. Demo accounts
| Role | Email | Password |
|------|-------|----------|
| Teacher | teacher@example.com | SecurePassword123 |
| Student | student@example.com | SecurePassword123 |
| Parent | parent@example.com | SecurePassword123 |
| Homeschool | homeschool@example.com | SecurePassword123 |
| Admin | admin@example.com | SecurePassword123 |

> **Note:** If the database volume is fresh, `database/init.sql` seeds these accounts automatically. If the volume already existed with an older schema, run `docker compose down -v && docker compose up -d` to rebuild it.

---

## 🛠️ Development

### Rebuild after code changes
```bash
# Backend only (Python — no rebuild needed; bind-mounted)
docker compose restart backend

# Frontend only (Vite hot-reloads; only needed after package.json changes)
docker compose restart frontend

# Both
docker compose restart backend frontend

# Full rebuild (after Dockerfile changes)
docker compose build --no-cache backend frontend
docker compose up -d
```

### View logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f        # all services
```

### Database
```bash
# Connect to Postgres inside container
docker compose exec postgres psql -U peripateticware_user -d peripateticware

# Fresh database (wipes all data)
docker compose down -v
docker compose up -d
```

### Clear Python bytecode cache (if backend shows stale errors)
```bash
docker compose exec backend find /app -name "*.pyc" -delete
docker compose restart backend
```

---

## 📱 Mobile Development

The mobile app lives in `mobile/` and uses Expo SDK 54.

### Install dependencies
```bash
cd mobile
npm install
```

### Configure API endpoint
```bash
# mobile/.env
API_BASE_URL=http://<your-host-ip>:8000
```

### Run with Expo Go
```bash
npx expo start
```

> **Note:** Expo Go may time out on large bundles over LAN. For a reliable test build use EAS:

### Build with EAS (recommended for device testing)
```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # produces .apk
eas build --platform ios --profile preview        # requires Apple Developer account
```

---

## 🧱 Architecture

```
peripateticware/
├── backend/                 # FastAPI application
│   ├── main.py              # App entry point, router registration, lifespan
│   ├── startup.py           # DB init, RAG table creation, APScheduler setup
│   ├── routes/              # All API route modules
│   ├── models/              # SQLAlchemy ORM models (30+ tables, RagDocument, BreachIncident, etc.)
│   ├── services/            # Business logic (email, ASR, export, encryption, consent, etc.)
│   ├── core/                # Auth, database, security, dependencies, rate limiting, RBAC
│   ├── scripts/             # encrypt_existing_data.py and other ops scripts
│   └── templates/email/     # HTML email templates
├── frontend/                # React + TypeScript + Vite
│   └── src/
│       ├── pages/           # Route-level pages by role (teacher, student, parent, admin, homeschool, platform)
│       ├── components/      # Shared and role-specific components
│       ├── layouts/         # DashboardShell + role layouts
│       ├── stores/          # Zustand state stores
│       ├── services/        # API service modules
│       └── types/           # TypeScript interfaces
├── mobile/                  # React Native (Expo SDK 54) — built and field-tested
│   ├── app/                 # Expo Router file-based screens (tabs, onboarding, activity, login)
│   ├── src/
│   │   ├── components/      # CaptureSheet, PeriChatSheet, CrowAvatar, MapIllustration, etc.
│   │   ├── api/             # API client and service modules
│   │   ├── db/              # SQLite offline cache
│   │   ├── bands/           # Age-band adaptive copy (copy.ts) and tokens
│   │   ├── stores/          # State stores
│   │   └── theme/           # Visual theme tokens
│   └── e2e/                 # End-to-end tests
├── database/
│   └── init.sql             # Full schema (30+ tables) + seed data
├── backend/alembic/         # Database migrations
└── docker-compose.yml       # All services
```

### Tech stack
| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy (async), PostgreSQL + pgvector, Redis, Alembic, APScheduler |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, react-router-dom v7 |
| Mobile | React Native, Expo SDK 54, Expo Router, SQLite, expo-av, expo-location |
| AI | Provider-agnostic: Ollama (local LLM + Whisper ASR + embeddings), Anthropic Claude API, or OpenAI/OpenAI-compatible — global or per-agent; embeddings also support Voyage AI |
| Storage | Cloudflare R2 (boto3 S3-compatible); local `/app/uploads` fallback |
| Payments | Paddle billing; tiered subscription enforcement via structured 402 responses |
| Infrastructure | Docker Compose, Nginx, pgbouncer (config ready), LUKS full-disk encryption on the Docker data volume, Prometheus metrics (`/metrics`, multiprocess-aware under gunicorn) |

---

## 🤖 AI Configuration

Every AI call — text generation, vision (scanned-PDF OCR), and embeddings — routes through a shared provider abstraction (`backend/agents/provider.py`, `backend/services/embedding_service.py`). No component hard-requires Ollama; a deployment can run entirely against a hosted or self-hosted API instead. `LLM_PROVIDER` sets the default; `EMBEDDING_PROVIDER` (blank = inherits `LLM_PROVIDER`) sets embeddings separately since Anthropic has no embeddings endpoint of its own. Per-agent overrides (`AGENT_<NAME>_PROVIDER`) take precedence over the global default.

### Ollama (local — default)
```bash
# On host machine
ollama pull mistral                          # text inference
ollama pull karanchopda333/whisper:latest    # audio transcription
ollama pull qwen3-embedding:0.6b             # embeddings for the standards GraphRAG pipeline
ollama serve
```

```env
# .env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL_TEXT=mistral
OLLAMA_MODEL_VISION=llava
ASR_ENABLED=true
OLLAMA_MODEL_AUDIO=karanchopda333/whisper:latest

EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b   # truncated to 384 dims via Ollama's `dimensions` param (Matryoshka)
```

### Claude API (cloud)
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLAUDE_MODEL=claude-sonnet-4-20250514
# Anthropic has no embeddings endpoint — set EMBEDDING_PROVIDER=voyage
# (Anthropic's own recommended embeddings partner, see below) or =openai.
```

### OpenAI / OpenAI-compatible (cloud or self-hosted)
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxx
OPENAI_MODEL=gpt-4o-mini
# Points at real OpenAI by default — override to target Azure OpenAI, vLLM,
# LiteLLM proxy, LM Studio, or any other OpenAI-wire-compatible server.
OPENAI_BASE_URL=https://api.openai.com/v1

EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small   # dimensions truncated to 384 to match the vector(384) columns
```

### Voyage AI (embeddings only, cloud)
Anthropic's own recommended embeddings partner — pairs naturally with `LLM_PROVIDER=claude`, since Claude has no embeddings endpoint of its own. Supports `input_type=query`/`document` asymmetric embeddings (tuned separately for search queries vs. indexed content), which neither Ollama nor OpenAI's API offers — a real retrieval-quality edge for the standards GraphRAG pipeline specifically.
```env
EMBEDDING_PROVIDER=voyage
VOYAGE_API_KEY=pa-xxxxx
EMBEDDING_MODEL=voyage-4
# Voyage's output_dimension is a fixed enum (256/512/1024/2048) rather than
# the arbitrary truncation Ollama/OpenAI support — 384 isn't one of them.
VECTOR_DIMENSION=512
```
Changing `VECTOR_DIMENSION` resizes `rag_documents.embedding` on the next `alembic upgrade` (existing embeddings at the old dimension are cleared, not converted) — re-run `scripts/backfill_standards_embeddings.py` afterward.

### Switch providers
```bash
# Edit .env, then:
docker compose restart backend
```

---

## 📧 Email Configuration

The backend uses `aiosmtplib` for transactional email. Set `EMAIL_DRY_RUN=true` (default) to print emails to logs instead of sending.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password    # Gmail: use an App Password, not account password
SMTP_USE_TLS=true
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Peripateticware
EMAIL_DRY_RUN=false
FRONTEND_URL=http://localhost:3000
```

> After changing `.env`, always run `docker compose up -d --force-recreate backend` — `restart` does not re-read env vars.

---

## ☁️ Cloudflare R2 Storage (optional)

Student captures (photos, audio, attachments) and exported portfolios are stored in Cloudflare R2. The backend falls back to local `/app/uploads` when R2 env vars are absent.

```env
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-key-id
R2_SECRET_ACCESS_KEY=your-secret
R2_BUCKET_NAME=peripateticware-uploads
R2_PUBLIC_BASE_URL=https://your-public-r2-domain.com
```

---

## 🔐 Security Notes (Pre-Deploy Checklist)

Before any non-local deployment:

- [ ] Rotate `SECRET_KEY` and `AUDIT_HASH_SALT` from dev defaults in `.env`
- [ ] Generate and set `FIELD_ENCRYPTION_KEY` (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- [ ] Run `python scripts/encrypt_existing_data.py` to backfill PII encryption on any existing rows
- [ ] Set `EMAIL_DRY_RUN=false` and configure real SMTP
- [ ] Set `DEBUG=False` and `ENVIRONMENT=production`
- [ ] Review `nginx.conf` for production routing and SSL
- [ ] Enable HTTPS (Let's Encrypt or institutional cert)
- [ ] Replace placeholder DPA contact addresses in `backend/routes/breach.py` with real DPA emails
- [ ] Run `docker compose down -v && docker compose up -d` on a fresh volume for production DB

---

## 📜 Licensing

Peripateticware is **source-available** under the **Business Source License 1.1 (BSL 1.1)**.

| Who | Terms |
|-----|-------|
| Individual educators | Free forever — use in your own classroom, modify as needed |
| Non-commercial projects | Free forever — research, prototyping, personal use |
| School districts / CMOs / multi-site operators (>5 classrooms) | Commercial license required — contact Paul Christopher Cerda |
| SaaS / resale | Not permitted under BSL 1.1 |

On **May 1, 2030**, the license automatically converts to **Apache 2.0** (fully open-source).

**Contact:** admin@thewordinbits.com

---

## 📚 Additional Documentation

| File | Contents |
|------|---------|
| `work_tracking.md` | Full feature status, bug list, remaining build items |
| `BUG_CHECKLIST.md` | Active bug tracking |
| `FIXPLAN.md` | Prioritized fix queue |
| `docs/guides/USER_GUIDE.md` | End-user guide |
| `docs/diagrams/ARCHITECTURE.md` | System architecture diagrams |
| `docs/accessibility/wcag-aa-audit.md` | WCAG 2.1 AA audit: violations found/fixed, aria-attribute coverage, axe-core CI setup |
| `backend/docs/` | Phase build summaries and specs |
| `LOAD_TEST_PLAN.md` | Original k6 load-test design |
| `k6/` | Runnable k6 suite (`README.md`), results (`RESULTS.md`), and bug tracker (`FINDINGS.md`) from the Sep 2026 prod load test |
| `FAQ.md` | Frequently asked questions |

---

## 📞 Contact & Contributions

**Paul Christopher Cerda**
Email: admin@thewordinbits.com

Bug reports: open an issue in the repository with a description, reproduction steps, and expected vs. actual behavior.

Contributions: fork → feature branch → pull request → sign the CLA.

---

## 📜 The 20-Year Journey

**February 2007:** Vision conceived.
A teacher walks with students through the city, the museum, the park. Learning isn't confined to classrooms. Education happens everywhere.

**2007–2025:** The world catches up.
Mobile devices become ubiquitous. Machine learning becomes practical. Cloud computing becomes affordable. API ecosystems emerge.

**2026:** Vision realized.
Peripateticware launches. Teachers create location-based activities. Students explore with guidance. AI generates contextually-rich lessons. The assessment problem — unsolved in 2007 — is solved with AI rubrics, portfolio evidence, and competency tracking.

> "Peripateticware will open new opportunities for learning and engaging students."
>
> — The Original Vision, Now Fulfilled

---

**Build Date:** June 2026 (GraphRAG migration: August 2026 — see `PRD-graphrag-migration-2026-08-16.md`; security/performance/accessibility hardening: Aug–Sep 2026 — see above)
**Status:** Production-ready core — web app stable, mobile built and field-tested, GraphRAG pipeline live
**License:** Business Source License 1.1 → Apache 2.0 (May 2030)

**Welcome to the future of location-based learning. 🌍📚**

---

## 🔗 Publishing to GitHub

If this is your first time pushing this project to GitHub, follow these steps exactly.

### First-time setup

```bash
# 1. Navigate to the project root
cd "C:\Users\pcerd\Downloads\peripateticware_complete__202605081840\peripateticware_complete_202605081840"

# 2. Initialize git (skip if already initialized)
git init

# 3. Set your identity (first time only)
git config user.name "Paul Christopher Cerda"
git config user.email "admin@thewordinbits.com"

# 4. Add a .gitignore if not already present
#    (node_modules, __pycache__, .env, uploads, media, etc.)
#    A .gitignore is already in the repo — verify before committing.

# 5. Stage everything
git add .

# 6. Initial commit
git commit -m "Initial commit: Peripateticware full-stack platform (May 2026)"

# 7. Create the repo on GitHub first (https://github.com/new)
#    Name it: peripateticware
#    Visibility: Private (recommended until ready for public)
#    Do NOT initialize with README, .gitignore, or license — you already have them.

# 8. Add the remote
git remote add origin https://github.com/paulcerda/peripateticware.git

# 9. Push
git branch -M main
git push -u origin main
```

### Subsequent pushes (normal workflow)

```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "Fix: resolve homeschool.py truncation and layout sync issues"

# Push to GitHub
git push
```

### Pushing a specific set of files

```bash
# Stage only specific files
git add backend/routes/homeschool.py frontend/src/layouts/ParentLayout.tsx

# Commit
git commit -m "Fix: homeschool coverage return dict and ParentLayout duplicate"

# Push
git push
```

### Branch workflow (for larger features)

```bash
# Create a new feature branch
git checkout -b feature/mobile-testing

# ... make changes ...

git add .
git commit -m "Add EAS build config and mobile .env documentation"

# Push the branch
git push -u origin feature/mobile-testing

# When ready to merge, open a pull request on GitHub
# or merge locally:
git checkout main
git merge feature/mobile-testing
git push
```

### Tagging a release

```bash
git tag -a v0.1.0-beta -m "Beta release: core web app stable, mobile testing in progress"
git push origin v0.1.0-beta
```

### Check status at any time

```bash
git status          # what's changed
git log --oneline   # recent commits
git remote -v       # confirm remote URL
```
