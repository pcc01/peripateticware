# Peripateticware — Work Tracking

> Living document. Update as items are completed or reprioritised.
> Owner: Paul Christopher Cerda | Last updated: May 2026

---

## Status Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔴 | Blocking — must fix before ship |
| 🟡 | High priority |
| 🟢 | Nice to have / next sprint |
| ⬜ | Backlog |

---

## 🔴 Blocking / Stabilisation

| # | Item | Notes |
|---|------|-------|
| B-1 | ✅ Fix Docker build — EBADPLATFORM (musl vs glibc) | Changed `node:20-alpine` → `node:20-slim` in `frontend/Dockerfile`; added `frontend/.dockerignore` |
| B-2 | ✅ Fix i18n strings showing as placeholders | `landing.json` `auth.*` and `footer.*` sections populated with real English text |
| B-3 | ✅ Login page visible but non-functional (stub strings) | Fixed by B-2; auth flow (store → proxy → `/api/v1/auth/login`) is wired correctly |
| B-4 | Verify end-to-end login after Docker rebuild | Run `docker compose build --no-cache frontend && docker compose up -d`; test `teacher@example.com / SecurePassword123` |
| B-5 | ✅ Phase 5-7 table DDL added to `database/init.sql` | All 30 missing tables (student_captures, student_notebooks, classes, field_notes, peer_projects, admin_users, privacy_configurations, etc.) + 8 new enums added; file now 972 lines |

---

## 🟡 High Priority — Frontend

| # | Item | Notes |
|---|------|-------|
| F-1 | ✅ Language picker → single dropdown with native locale names | `LocaleSwitcher.tsx` rewritten; covers all 11 locales in `/public/locales/` |
| F-2 | ✅ Footer privacy links wired to real routes | Footer now uses `<Link to="/privacy">` etc.; `/terms` and `/cookies` routes registered |
| F-3 | ✅ `TermsPage.tsx` and `CookiePolicyPage.tsx` created | Both use `useTranslation('landing')` with fallback strings |
| F-4 | ✅ Landing page English copy — hero, story, team, testimonials, auth | All stub values replaced with real product copy in `public/locales/en/landing.json` |
| F-4b | ✅ All 10 non-English locales translated | Hero (student/teacher/parent), auth, story, team, testimonials written in es, fr, de, it, pt-br, zh, ja, ar, he, tu |
| F-5 | Teacher dashboard — "Create Activity" flow end-to-end | `EnhancedActivityBuilder` is scaffolded; needs API integration |
| F-6 | Student dashboard — activity list loads from API | Currently uses mock data in some views |
| F-7 | Student capture — photo upload wired to backend | `CaptureToolbar` exists; `POST /api/v1/student/captures` needs testing |
| F-8 | AudioRecorder — WebM/Opus save to backend | Component exists (`capture/AudioRecorder.tsx`); upload endpoint scaffolded |
| F-9 | Field Notes editor — full CRUD | `FieldNoteEditor.tsx` exists; Phase 7 API endpoints return `NotImplementedError` |
| F-10 | Peer Projects — student creation + teacher approval | Phase 7 endpoints scaffolded; business logic not implemented |
| F-11 | Parent dashboard — connect to real student progress API | Currently shows placeholder data |
| F-12 | Admin panel — env var editor UI | `AdminDashboard.tsx` exists; connect to `/api/v1/admin/env` endpoints |
| F-13 | Mobile — test on real device / Chrome DevTools | Viewport meta ✅; Vite bound to `0.0.0.0` ✅; test at `http://[host-ip]:3000` on device |
| F-14 | ✅ `index.html` title — changed to "Peripateticware — Learning in Motion" | Done |
| F-15 | Favicon — replace default Vite icon | `/frontend/public/vite.svg` should be replaced with Peripateticware branding |

---

## 🟡 High Priority — Backend

| # | Item | Notes |
|---|------|-------|
| BE-1 | Phase 7 endpoints — implement business logic | All routes in `routes/phase7_student_initiated.py` raise `NotImplementedError`; need SQLAlchemy queries |
| BE-2 | Privacy + Location endpoints — runtime test | `routes/privacy_locations.py` copied and imports fixed; not yet integration-tested |
| BE-3 | Admin routes — `bcrypt` / `httpx` in requirements | ✅ Already present in `requirements.txt` |
| BE-4 | Alembic migrations for Phase 5-7 tables | ORM models defined; migrations not generated. Run `alembic revision --autogenerate -m "phase5-7"` |
| BE-5 | `database/init.sql` — add Phase 5-7 table DDL | New tables not yet in the SQL seed; fresh Docker volumes won't have them |
| BE-6 | ✅ Discovery activity type added to `init.sql` enum | `'discovery'` added to `activity_type_enum` |
| BE-7 | Student capture upload endpoint — file handling | `POST /api/v1/student/captures` needs multipart form + file storage to `/app/uploads` |
| BE-8 | ASR integration (AssemblyAI) | `ASR_ENABLED=false` in compose; wire up when key available |
| BE-9 | Location enrichment service — production test | `multi_backend_location_service.py` copied; Nominatim/Wikidata calls not yet tested in Docker |
| BE-10 | Admin panel — move from in-memory sessions to DB | `routes/admin.py` uses `ADMIN_SESSIONS` dict (lost on restart); `AdminSession` ORM model exists for upgrade |
| BE-11 | Rate limiting on auth endpoints | No rate limiting currently; important before any public exposure |

---

## 🟢 Nice to Have — Infrastructure

| # | Item | Notes |
|---|------|-------|
| I-1 | ✅ Backend `.dockerignore` created | Excludes `__pycache__`, `.git`, `*.md`, venv, repomix outputs, etc. |
| I-2 | ✅ Old docker-compose files removed | `docker-compose-*_old.yml` files deleted |
| I-3 | Nginx config for production | `nginx.conf` exists at root; review for production routing |
| I-4 | Monitoring / observability stack | `monitoring/` and `observability/` directories exist but not wired into compose |
| I-5 | pgbouncer | `pgbouncer.ini` exists at root; not in compose |
| I-6 | CI/CD pipeline | No GitHub Actions workflow exists yet |
| I-7 | Secret rotation | `SECRET_KEY` and `AUDIT_HASH_SALT` are dev defaults — must be changed before any non-local deployment |

---

## 🟢 Nice to Have — Frontend Cleanup

| # | Item | Notes |
|---|------|-------|
| C-1 | ✅ Flat duplicate pages removed | `TeacherActivityListPage.tsx` deleted; `App.tsx` updated to import from `pages/teacher/ActivityListPage` |
| C-2 | ✅ Alt Crow components deleted | `CrowByAgeBand_Alt2_GeometricNative.tsx`, `CrowByAgeBand_Alt3_OrganicNative.tsx` removed |
| C-3 | ✅ `ActivityBuilder-Updated.tsx` deleted | Removed from `components/` |
| C-4 | ✅ Duplicate `useActivity.ts` deleted | Removed `components/useActivity.ts`; canonical version in `hooks/useActivity.ts` |
| C-5 | ✅ Duplicate `AppRouter.tsx` files deleted | All three copies removed (`components/`, `components/auth/`, `components/teacher/`) |
| C-6 | ✅ `RegisterPage.tsx` deleted | Confirmed no imports; removed |
| C-7 | ✅ Resolved via C-5 deletion | File was unused; deleted |
| C-8 | ✅ Resolved via C-5 deletion | File was unused; deleted |

---

---

## 📱 React Native Mobile App Integration

Mobile app initial build is at `C:\Users\pcerd\Downloads\peripateticware_complete__202605081840\Peripateticware` (separate folder — not yet in main repo).
Based on the Phase 6 Student Mobile build-out spec. Three age-band themes (Field Guide · Terrain · Atmosphere) + city skin overlay.

| # | Item | Notes |
|---|------|-------|
| M-1 | Move mobile app into monorepo | Add as `mobile/` subdirectory; update `.gitignore` and `docker-compose.yml` accordingly |
| M-2 | Shared auth — wire mobile to `/api/v1/auth/login` | Mobile needs same JWT flow as web frontend; share token storage pattern |
| M-3 | Wire `copy.ts` to i18n pipeline | `copy.ts` has all UI strings for all three age bands; align with `landing.json` key structure or keep separate namespace |
| M-4 | Wire `tokens.ts` themes | Three themes fully specified (colors, radii, shadows, font families); city skin via `setLocationSkin('city')` from activity context |
| M-5 | Connect Discovery screens to activity API | Map view + list view hit `GET /api/v1/student/activities`; brief sheet hits `GET /api/v1/student/activities/:id` |
| M-6 | Connect Capture tools to backend | Audio, video, photo, sketch → `POST /api/v1/student/captures`; offline queue via background sync |
| M-7 | Wire Phase 2 Inquiry prompts | `PromptCard` + `StepRail` need activity prompt data from API; evidence persists locally (IndexedDB) before sync |
| M-8 | Wire Socratic chat (Peri) | `ChatBubble` + `CrowAvatar` → `POST /api/v1/inference/chat`; inject current prompt + evidence as system context |
| M-9 | Wire Journal & Progress screens | `JournalEntry` + `CompetencyMeter` pull from `GET /api/v1/student/notebook` and competency endpoints |
| M-10 | Hook tab navigator from `FirstActivityScreen` | Two TODOs in `FirstActivityScreen.tsx` mark where main tab navigator connects |
| M-11 | Theme propagation QA | Verify all screens against Terrain + Atmosphere + City skin matrix |

**Key files in mobile app:**
- `copy.ts` — all UI strings (Peri speech bubbles, CTA labels, badges) for all three age bands
- `tokens.ts` — three themes fully specified; `setLocationSkin('city')` for city overlay
- `CrowAvatar` — renders correct crow for current age band (pass `band` + `theme`)
- `PeriSpeech` — wraps `CrowAvatar` with speech bubble; used on every screen

---

## ⬜ Future Phases

| # | Item |
|---|------|
| P8 | Offline sync (service worker + IndexedDB) |
| P9 | Parent portal — messaging, calendar, reports |
| P10 | Admin dashboard — user management, class management, analytics |
| P11 | Curriculum mapper — bulk import, standards alignment AI |
| P12 | Real-time session monitor (WebSocket) |
| P13 | Portfolio export (PDF/CSV) |
| P14 | Batch student import (CSV) |
| P15 | School/district multi-tenancy |
| P16 | Production deployment (nginx + SSL + CDN) |

---

## Rebuild & Login Checklist (run now)

```bash
# 1. Rebuild the frontend image with the glibc-based Node
docker compose build --no-cache frontend

# 2. Bring everything up
docker compose up -d

# 3. Watch logs
docker compose logs -f frontend
docker compose logs -f backend

# 4. Test login in browser at http://localhost:3000
#    teacher@example.com   / SecurePassword123
#    student@example.com   / SecurePassword123
#    admin@example.com     / SecurePassword123

# 5. Check backend health
curl http://localhost:8000/health
```

> **Note:** If the database volume is fresh, `init.sql` seeds the demo users automatically. If the volume already existed with the old schema and is missing Phase 5-7 tables, either drop the volume (`docker compose down -v && docker compose up -d`) or run the pending Alembic migrations.
