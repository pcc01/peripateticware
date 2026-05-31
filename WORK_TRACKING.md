# Peripateticware — Work Tracking

> Living document. Update as items are completed or reprioritised.
> Owner: Paul Christopher Cerda | Last updated: May 2026 (session 2026-05-30)

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
| F-5 | ✅ Teacher dashboard — Activity Builder wired to API | `EnhancedActivityBuilder` now calls `POST /api/v1/activities`; bloom level + type mapping added; publish flow wired |
| F-6 | ✅ Student dashboard wired to API | Added `GET /api/v1/student/dashboard`, `/progress`, `/projects` endpoints; parent router fixed to `/api/v1/parent` prefix |
| F-7 | ✅ Student capture — photo upload wired to backend | `useCaptureStore.createCapture()` stub replaced with real multipart POST to `/api/v1/student/captures/upload` with Bearer auth |
| F-8 | ✅ AudioRecorder — WebM/Opus save to backend | Token key fixed (`auth_token`); `TranscriptBlock` component added — polls `GET /captures/:id` every 2s until ASR transcript appears |
| F-9 | ✅ Field Notes editor — backend CRUD complete | Phase 7 endpoints implemented: create, list, get, update, delete, share, unshare, submit, teacher approve/reject |
| F-10 | ✅ Peer Projects — backend CRUD complete | Full flow: create, submit, approve/reject, respond, complete, example captures; class settings endpoint |
| F-11 | ✅ Parent dashboard wired to API | Added `GET /api/v1/parent/dashboard` endpoint; parent router prefix fixed |
| F-12 | ✅ Admin env editor wired | `AdminSettingsPage.tsx` now loads env categories, allows editing/saving per-key via `/api/v1/admin/env`; admin panel login flow added |
| F-13 | Mobile — test on real device / Chrome DevTools | Viewport meta ✅; Vite bound to `0.0.0.0` ✅; test at `http://[host-ip]:3000` on device |
| F-14 | ✅ `index.html` title — changed to "Peripateticware — Learning in Motion" | Done |
| F-15 | ✅ Favicon — crow silhouette SVG | `favicon.svg` created (dark green background, white crow, amber beak); `index.html` updated |

---

## 🟡 High Priority — Backend

| # | Item | Notes |
|---|------|-------|
| BE-1 | ✅ Phase 7 endpoints — business logic implemented | All 30+ routes in `routes/phase7_student_initiated.py` now have full SQLAlchemy async queries: field notes CRUD + share/submit/approve/reject, self-projects CRUD, peer projects CRUD + submit/respond/complete/approve/reject, class settings get/update |
| BE-2 | ✅ Privacy + Location endpoints — runtime test | `/api/v1/privacy/status` returns 6 active rules (FERPA, COPPA, GDPR, CCPA, LGPD, PIPEDA); seed script fixed (UUID5, naive datetime) |
| BE-3 | Admin routes — `bcrypt` / `httpx` in requirements | ✅ Already present in `requirements.txt` |
| BE-4 | ✅ Alembic migrations | env.py fixed (import path + sync driver + env DATABASE_URL); stamped head — DB already fully built by init.sql + startup migrations |
| BE-5 | ✅ `database/init.sql` — all Phase 5-7 tables added | 30 tables + 8 enums; file now 972 lines |
| BE-6 | ✅ Discovery activity type added to `init.sql` enum | `'discovery'` added to `activity_type_enum` |
| BE-7 | ✅ Student capture upload endpoint | `POST /api/v1/student/captures/upload` — multipart, stores to `/app/uploads/captures/{user_id}/`, triggers background ASR task on audio |
| BE-8 | ✅ ASR integration (Whisper/Ollama) | `ASR_ENABLED=true`; `OLLAMA_MODEL_AUDIO=karanchopda333/whisper:latest` (already pulled); `asr_service.py` reads `OLLAMA_BASE_URL`; initializes lazily on first audio capture upload |
| BE-9 | Location enrichment service — production test | `multi_backend_location_service.py` wired; Nominatim/Wikidata untested in Docker |
| BE-10 | ✅ Admin sessions moved to DB | `ADMIN_SESSIONS` dict replaced with `AdminSession` table writes; token stored as SHA-256 hash; DEMO_ADMIN fallback for first boot |
| BE-11 | ✅ Rate limiting on auth endpoints | `slowapi` integrated in `auth.py`; login limited to 5/min, signup to 10/min; gracefully disabled if package unavailable |

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

**Decision: React Native only** — required for reliable camera, microphone, GPS, and ASR in the field.

Mobile app initial build: `C:\Users\pcerd\Downloads\peripateticware_complete__202605081840\Peripateticware` (separate folder — not yet in monorepo).
Design spec: Phase 6 Student Mobile Build-out + PPW Mobile Dashboards (uploaded May 2026).

### Key files in mobile app (do not rename)
| File | Purpose |
|------|---------|
| `copy.ts` | All UI strings for all three age bands — Peri speech bubbles, CTAs, badges, placeholders. First stop for any copy edit. Vocabulary guide baked in (Explore not Discover, etc.) |
| `tokens.ts` | Three themes: Field Guide (radius 12px), Terrain (4px), Atmosphere (20px). City skin overlay via `setLocationSkin('city')` from activity context |
| `CrowAvatar` | Renders correct crow for current age band — pass `band` + `theme` |
| `PeriSpeech` | Wraps CrowAvatar with speech bubble — used on every screen for Peri's lines |
| `FirstActivityScreen.tsx` | Two TODO comments mark where main tab navigator hooks up |

### Screens specced in Phase 6 (not yet wired)
- **Discovery**: Map view (default outdoors) + List view toggle; activity brief bottom sheet (88px peek / 50% half / 90% full); `ActivityRow`, `BriefSheet`, `SegmentedToggle`
- **Engagement Phase 1 — Orient**: Arrival check, learning targets, sticky phase header, geofence guard toast
- **Engagement Phase 2 — Inquiry**: Multi-step prompts + capture, `PromptCard` + `StepRail`, evidence persists locally (IndexedDB/AsyncStorage) before sync, "Ask Peri" opens Socratic chat sheet
- **Engagement Phase 3 — Reflect**: Journal prompt, competency check (`bloom: apply|analyze|evaluate`), voice-dictate option, submit → teacher feedback queue
- **Capture — Video**: 60s max (30s K–6), tap-to-focus, pinch-zoom 1–3×, trim sheet, `video/webm;codecs=vp9` + `mp4` fallback
- **Capture — Audio**: Already built (`AudioRecorder` + `Waveform`); ASR transcript polling in place
- **Capture — Drawing/Sketch**: `SketchCanvas` + `ToolPalette`, full-bleed surface, prompt overlay
- **Journal**: Chronological + by-activity views; `JournalEntry` + `EvidenceTile`
- **Progress**: `CompetencyMeter` + `BadgeChip` + streak; pulls from `/api/v1/student/notebook` + competency endpoints
- **Peri AI Chat**: `ChatBubble` + `CrowAvatar` bottom sheet; prefilled with current prompt + evidence context

### Integration tasks

| # | Item | Notes |
|---|------|-------|
| M-1 | ✅ Move mobile app into monorepo | Copied to `mobile/` subdirectory |
| M-2 | ✅ Shared auth | `src/api/client.ts` (AsyncStorage token), `src/api/auth.ts`, `src/stores/AuthContext.tsx`, `app/login.tsx`, auth guard in root `_layout.tsx` |
| M-3 | ✅ copy.ts — keep separate | Age-band adaptive copy stays in `src/bands/copy.ts`; too different from web landing.json to merge |
| M-4 | ✅ City skin wiring | `setLocationSkin('city')` fires in `app/activity/[id].tsx` when activity location_name contains urban keywords |
| M-5 | ✅ Discovery + activity engagement | `app/(tabs)/index.tsx` pulls live activities; `app/activity/[id].tsx` — full Brief→Orient→Inquiry→Reflect flow with Aristotelian questions |
| M-6 | ✅ Capture tools | `src/components/CaptureSheet.tsx` — photo (expo-image-picker), audio (expo-av), text note; all upload to `/api/v1/student/captures/upload` |
| M-7 | ✅ Inquiry prompts | `fetchQuestion()` wired into InquiryPhase; follow-up shown; `CaptureSheet` opens from inquiry for evidence |
| M-8 | ✅ Peri AI chat | `src/components/PeriChatSheet.tsx` — full chat UI with history, "Ask Peri" button in InquiryPhase, wired to `/api/v1/inference/chat` |
| M-9 | ✅ Journal & Progress screens | `journal.tsx` + `progress.tsx` wired to API; `settings.tsx` has theme picker + band picker + logout |
| M-10 | ✅ FirstActivityScreen wired | `sampleActivity` replaced with real `fetchActivities()` call; both CTAs route to `/(tabs)` |
| M-11 | ✅ Offline-first | SQLite DB (`src/db/`): questions cached locally, activities cached, capture queue, note queue. Auto-sync on reconnect via `useConnectivity`. Discover shows offline banner. Questions prefer local SQLite, fall back to API |
| M-12 | Theme QA | Verify all screens × Terrain + Atmosphere + City skin matrix |
| M-13 | ✅ Geofence guard | `useGeofence` hook (haversine, expo-location); non-blocking dismissible toast fires when student leaves radius during Inquiry phase; throttled to once per 30s |
| M-14 | ✅ Teacher monitoring events | `POST /api/v1/sessions/:id/events` added to backend; `src/api/sessionEvents.ts` fires phase_started/completed, capture_added, geofence_exit, session_submitted at each transition (best-effort, never blocks student) |

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
| P17 | Periodic purge of test account data — scheduled job (weekly or monthly) deletes sessions, captures, notes, and activities created by seed/test users (`student@example.com`, `teacher@example.com`, etc.) to prevent DB bloat. Should be configurable (enable/disable, target accounts, retention window) and log what was deleted for audit purposes. |

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

---

## 🐛 Active Bug List

| # | Bug | Status | Notes |
|---|-----|--------|-------|
| BUG-1 | All four role dashboards returning 500 | ✅ Fixed | `activity_status`/`activity_type` pg enums missing from old DB volume; startup migration now creates types + ALTERs columns to VARCHAR |
| BUG-2 | Expo Go timeout — mobile app never renders | 🟡 Blocked | All code issues resolved: truncated `_layout.tsx` completed, 6 missing packages installed, wrong SDK versions corrected (`expo-av`, `expo-sqlite`, `expo-location` etc. updated to SDK 54 versions), `react-native-get-random-values` polyfill installed, `newArchEnabled` / `reactCompiler` flags verified. Remaining issue: Metro bundle transfer timeout in Expo Go — likely bundle size vs. network speed on this machine. **Recommendation: use `npx eas build --profile development --platform android` for a proper dev build that bypasses Expo Go entirely.** |
| BUG-3 | Homeschool login redirected to /student | ✅ Fixed | Login + signup handlers had no `homeschool` case; added to role-to-path ternary in both. Role type union updated. |
| BUG-4 | Homeschool routes unreachable (ProtectedRoute rejected homeschool role) | ✅ Fixed | `ProtectedRoute` now accepts `requiredRole` as `string \| string[]`; uses `.includes()` check. |
| BUG-5 | `homeschool_children` table missing from `init.sql` | ✅ Fixed | Table DDL added to `init.sql`; Alembic migration `20260530_homeschool_children_table.py` created. |
| BUG-6 | No demo homeschool account | ✅ Fixed | `homeschool@example.com` (Sarah Rivera) seeded with two children (Emma gr.4, Lucas gr.7) in `init.sql`. |
| BUG-7 | `TeacherApprovalDashboard` was an empty stub referencing dead store | ✅ Fixed | Replaced with real component delegating to `PeerProjectReview`. |
| BUG-8 | `FieldNoteReview` / `PeerProjectReview` passed `classId=""` → filtered to empty string | ✅ Fixed | Both `|| undefined` guards added; API omits param when no class selected, showing all. |

---

## ✅ Completed This Session (2026-05-30)

| Item | What was built |
|------|---------------|
| Reverse Scavenger Hunt — backend | `routes/proposals.py` — full CRUD for students + approve/reject for teachers; registered in `main.py` |
| Reverse Scavenger Hunt — DB | `student_proposals` table in `init.sql` + migration `20260530_student_proposals.py`; `is_student_proposed` + `proposed_by_student_id` columns on `activities` |
| Reverse Scavenger Hunt — frontend | `ProposalsListPage.tsx`, `ProposalFormPage.tsx` (student); `TeacherProposalReviewPage.tsx` (teacher); routes + nav wired |
| Reverse Scavenger Hunt — seed data | 4 sample proposals for `student@example.com` in all states (approved, pending, draft, rejected with feedback) |
| Homeschool fixes (BUG-3 through BUG-8) | See bug list above |
| Homeschool rich seed data | 6 activities (Science, Geography, Social Studies, Earth Science, Math gr 4+7); Texas state reporting standards set (7 criteria); 12 activity→standards mappings; 8 learning sessions for Emma + Lucas |
| `standards_sets` + `activity_standards_map` tables | Added to `init.sql` (were only in main.py startup DDL); migration `20260530_seed_homeschool_demo_data.py` |
| Coverage Report page rebuilt | Full per-criterion breakdown with progress bar, % covered, activity drill-down, met/partial/not-met status; backend `/coverage` endpoint replaced with full query |
| Standards type taxonomy | `state_standards` / `state_reporting` / `rubric` / `custom`; `valid_until`, `source_checksum`, `processing_status`, `last_processed_at` added to schema; migration `20260530_standards_sets_expiry_and_cache.py` |
| State reporting sets seeded | 15 states (TX→PA, full regulation spectrum) as `is_global=TRUE` admin-owned sets; migration `20260530_seed_state_reporting_sets.py`; init.sql updated for 10 key states |
| State standards sets seeded | CCSS ELA, CCSS Math, NGSS, TEKS Science, TEKS Math — global; migration `20260530_seed_state_standards_sets.py` |
| HomeschoolRequirementsPage rebuilt | State picker (persisted to localStorage), auto-loads matching global set, separate sections for academic standards vs reporting requirements |
| Admin routes — ALL MISSING | Zero `/admin/*` routes were registered in App.tsx (file truncated). Added all admin routes + homeschool routes + parent routes + student journal route + `NotFoundPage` catch-all. File now complete. |
| Admin Standards Library page | `AdminStandardsPage.tsx` — lists all global state_standards and state_reporting sets, search, expire toggle, extend validity, delete |
| CurriculumImportPage fixed | Type changed from `curriculum` to `state_standards`; redirects to `/admin/standards` after import |
| AdminLayout nav updated | Added "Standards Library" → `/admin/standards` |
| Student Journal page | `StudentJournalPage.tsx` — chronological timeline of field notes grouped by month, filter tabs, status badges, location + capture count |
| Student Journal nav wired | Nav link fixed from `/student` (dashboard placeholder) to `/student/journal`; route registered |
| BUG-3 | Mobile student device view in teacher activity creation | ⬜ Unverified | Not yet tested |
| BUG-4 | Student activity detail page blank on open | ✅ Fixed | Backend now returns `phases`, `teacher`, `location`, `due_date` shaped for frontend |
| BUG-5 | Parent dashboard 422 on `/parent/children` | ✅ Fixed | Endpoint required `parent_id` query param; changed to use Bearer token via `current_user` |
| BUG-6 | ✅ SQL injection in `parent.py` | ✅ Fixed | Already replaced with parameterised SQLAlchemy ORM query before this session. Verified no raw f-string SQL remains. |
| BUG-7 | ✅ Parent fake auth endpoints | ✅ Fixed | `/parent/auth/register` and `/parent/auth/login` fake routes removed in a prior session. Confirmed only real `/api/v1/auth` flow remains. |
| UI-7 | ✅ All unsafe `new Date(x).toLocaleDateString()` across 12+ files | ✅ Fixed | Created `src/utils/date.ts` with `fmtDate`/`fmtDateTime`/`fmtTime` null-safe helpers. Replaced all unguarded date calls across teacher, student, parent, admin pages and components. |
| UI-8 | ✅ Parent dashboard shows "Link Your Child" form inline on main dashboard | ✅ Fixed | Moved form to dedicated `/parent/link-child` route (`LinkChildPage.tsx`). Dashboard now shows empty state explaining what appears after linking, with CTA button. Added "Link Child" to parent sidebar nav. |
| UI-1 | ✅ Student activity cards show "Due: Invalid Date" | ✅ Fixed | `due_date` missing from `/student/dashboard` response; `new Date(undefined)` rendered as "Invalid Date". Added `due_date` to backend response; guarded null in frontend. |
| UI-2 | ✅ Teacher dashboard stat cards empty (Total Students, Classes, etc.) | ✅ Fixed | Backend returned `student_count`/`class_count`/`published_activities` but frontend expected `total_students`/`total_classes`/`active_activities`. Renamed fields in backend response. |
| UI-3 | ✅ Admin dashboard labels concatenated with values ("Teachers0", "Uptime0%") | ✅ Fixed | `.statItem` CSS class was missing from `AdminDashboard.module.css`. Added with `display: flex; justify-content: space-between`. |
| UI-4 | ✅ Admin dashboard top stat cards blank (Total Users, Activities, Sessions) | ✅ Fixed | Backend returned `total_users`/`total_activities`/`total_sessions` but `AdminDashboardData` type expects `users_count`/`activities_count`/`sessions_count`. Renamed + added `analytics` object. |
| UI-5 | ✅ Dashboard content crowded left, not centred | ✅ Fixed | DashboardShell `maxWidth` reduced from 1200→900px; removed competing `padding`/`min-height` from all four dashboard `.container` CSS classes. |
| UI-6 | ✅ Cookie consent "Got it" button spans full screen width | ✅ Fixed | Replaced Tailwind utility classes (unreliable without JIT compile) with explicit inline styles. Button now fixed-width beside notice text. |

---

## 🔐 Security Backlog

| # | Item | Priority | Notes |
|---|------|----------|-------|
| SEC-1 | Signed / expiring URLs | 🟡 Pre-ship | Append HMAC timestamp to password reset, email verification, parent consent, and file export links. Links should expire after a configurable window (e.g. 1h for resets, 24h for consent). Prevents replay attacks on sensitive one-time links. |
| SEC-2 | Fix SQL injection in `parent.py` `get_child_progress` | 🔴 Blocking | See BUG-6 above |
| SEC-3 | Fix fake parent auth | 🔴 Blocking | See BUG-7 above — route parents through main JWT auth |
| SEC-4 | Rotate dev secrets before any external deploy | 🔴 Pre-deploy | `SECRET_KEY` and `AUDIT_HASH_SALT` are dev defaults in `.env` |
| SEC-5 | Rate limiting on all auth endpoints | ✅ Done | `slowapi` on login (5/min) + signup (10/min) |

---

## 🏗️ Remaining Build Components

### Web — Teacher
| # | Item | Status | Notes |
|---|------|--------|-------|
| T-1 | Activity creation UX overhaul | ⬜ Not started | Dense form needs section headings, collapsible groups, inline pop-up explanations per field |
| T-2 | Lat/Long auto-update | ⬜ Not started | When teacher sets location name OR coordinates, the other field should auto-populate |
| T-3 | AI suggestion button | ⬜ Not started | "Get a suggestion" uses subject/location/lesson goals to AI-autofill fields via `/api/v1/inference` |
| T-4 | Student activity creation — scope & build | ⬜ Not started | Need to define what student-created activity looks like vs teacher-created |
| T-5 | Teacher student management page | ⬜ ComingSoon | `/teacher/students` is a placeholder |
| T-6 | TeacherSettingsPage | ⬜ Stub | Page exists (241 lines) but settings don't save — no backend wiring confirmed |

### Web — Student
| # | Item | Status | Notes |
|---|------|--------|-------|
| S-1 | Student activity creation flow | ⬜ Not started | Scope not finalised |
| S-2 | Student dashboard widget QA | 🟡 Needs test | Wired to API; verify all data populates correctly with real activities |
| S-3 | StudentSettingsPage | ⬜ Stub | Page exists but settings likely don't persist |
| S-4 | Student activity detail — phases content | 🟡 Partial | Phases now render but content is derived from description/objectives; richer per-phase content model TBD |

### Web — Parent
| # | Item | Status | Notes |
|---|------|--------|-------|
| PA-1 | Child linking flow | ⬜ Not started | `/parent/children/link` endpoint exists; frontend form not built; dashboard shows empty list |
| PA-2 | Parent progress view | ⬜ Blocked | `/parent/progress` page exists; blocked by PA-1 (no linked children) |
| PA-3 | Messages | ⬜ ComingSoon | `/parent/messages` — backend returns `[]`, frontend is placeholder |
| PA-4 | Calendar | ⬜ ComingSoon | Placeholder |
| PA-5 | Reports | ⬜ ComingSoon | Placeholder |
| PA-6 | Notifications | ⬜ ComingSoon | Backend returns `[]` |
| PA-7 | ParentSettingsPage | ⬜ Stub | Page exists but settings don't persist |
| PA-8 | Parent auth consolidation | 🔴 Security | `parent.py` has its own `/parent/auth/register` + `/parent/auth/login` with fake bcrypt/JWT — must be removed; parents register/login via main `/api/v1/auth` |

### Web — Admin
| # | Item | Status | Notes |
|---|------|--------|-------|
| A-1 | User management page | ⬜ ComingSoon | `/admin/users` — backend list endpoint exists, frontend is placeholder |
| A-2 | Class management page | ⬜ ComingSoon | `/admin/classes` — placeholder |
| A-3 | Analytics page | ⬜ ComingSoon | `/admin/analytics` — placeholder |
| A-4 | System settings page | ⬜ ComingSoon | `/admin/system` — placeholder |

### Shared Infrastructure — Parsing, Standards, Rubrics & Export

> **Architectural note:** These four capabilities are the foundation for homeschool reporting, teacher rubrics, curriculum standards, and data portability. Build each as a standalone service; all personas consume them.

#### What's already in requirements.txt (no new packages needed)
- `reportlab==4.0.9` — PDF generation ✅
- `pypdf==3.17.1` — text-based PDF reading ✅
- `Pillow==10.1.0` + `opencv-python-headless` — image pre-processing for OCR ✅
- `ollama==0.6.2` — can drive vision-capable models for OCR instead of Tesseract ✅
- Python stdlib `csv` + `io` — adequate for simple CSV parsing ✅

#### What needs to be added
- **OCR**: Two options — (a) `pytesseract` + `tesseract-ocr` as a Docker system package (reliable, offline, well-understood), or (b) use Ollama with a vision-capable model (e.g. `llava` or `minicpm-v`) — avoids a system dependency but requires the model to be pulled. **Recommendation: Ollama vision as primary, Tesseract as fallback.** Decision needed before SH-P2.
- **`pandas`** + **`openpyxl`** — for structured CSV/Excel parsing beyond stdlib. Add to `requirements.txt` when SH-P3 is built.

#### Parsing Services
| # | Item | Status | Notes |
|---|------|--------|-------|
| SH-P1 | ✅ `services/document_parser.py` — text + scanned PDF | ✅ Done | Implemented in `document_parser.py` |
| SH-P2 | ✅ Standards parser via Ollama LLM | ✅ Done | `standards_parser.py` — extracts criteria JSON from document text |
| SH-P3 | ✅ CSV/PDF upload endpoint | ✅ Done | `POST /api/v1/standards/upload` |
| SH-P1-old | `services/pdf_parser.py` — text PDF | ✅ Covered above | Use `pypdf` to extract text from digital PDFs (standards docs, rubrics, curriculum maps). Returns structured text blocks with page numbers |
| SH-P2 | `services/pdf_parser.py` — scanned PDF / OCR | ⬜ Not started | Detect if PDF is image-based; if so, render pages with `Pillow`, run OCR via Ollama vision model (primary) or `pytesseract` (fallback). Decision needed: which OCR path to commit to |
| SH-P3 | `services/csv_parser.py` | ⬜ Not started | Parse CSV/Excel uploads into normalised row dicts. Handle common issues: BOM, mixed encodings, merged header rows, empty rows. Add `pandas` + `openpyxl` to requirements when built |
| SH-P4 | `services/standards_parser.py` | ⬜ Not started | Takes output of SH-P1/P2/P3 + calls Ollama LLM to extract structured criteria: `{id, name, description, category, required, weight}`. Returns JSON for human review before saving. Used for rubrics, curriculum standards, and state reporting requirements identically |

#### Standards & Rubrics Engine
| # | Item | Status | Notes |
|---|------|--------|-------|
| SH-1 | Standards/Criteria data model | ⬜ Not started | `standards_sets` table: id, name, type (`rubric\|curriculum\|state_reporting`), owner_id, criteria JSONB. One model, three use cases |
| SH-2 | Standards upload endpoint | ⬜ Not started | `POST /api/v1/standards/upload` — accepts PDF or CSV, runs SH-P1/P2/P3 + SH-P4, returns parsed criteria for review. Role-gated: teachers for rubrics, admins for curriculum, homeschool parents for state requirements |
| SH-3 | Standards review + save | ⬜ Not started | UI step after upload: user reviews/edits extracted criteria before saving. Backend `POST /api/v1/standards` to persist approved set |
| SH-4 | Activity → standards mapping | ⬜ Not started | `activity_standards_map` table. Manual tagging UI + AI-suggest endpoint that recommends which criteria an activity covers based on its objectives and description |
| SH-5 | Standards coverage report endpoint | ⬜ Not started | `GET /api/v1/standards/{set_id}/coverage?student_id=&date_from=&date_to=` — returns coverage matrix: criteria met, evidence count, gaps |

#### Export Service
| # | Item | Status | Notes |
|---|------|--------|-------|
| SH-6 | `services/export_service.py` — PDF | ⬜ Not started | `reportlab` is already in requirements. Templates: activity log (teacher offline), student progress report (parent/admin), homeschool portfolio (homeschool parent). Template selection driven by `export_type` param |
| SH-7 | `services/export_service.py` — CSV | ⬜ Not started | Flat exports: activity log, session log, standards coverage, student roster. All roles. Stdlib `csv` sufficient |
| SH-8 | Export endpoints | ⬜ Not started | `POST /api/v1/export/{type}` with query params for scope (student, class, date range, standards set). Returns file download. Async — queue job for large exports |
| SH-9 | Frontend export UI | ⬜ Not started | Shared `<ExportButton>` component with format picker (PDF/CSV) and scope options. Used on teacher dashboard, parent dashboard, homeschool dashboard, admin panel |

#### Standards Library (pre-loaded)
| # | Item | Status | Notes |
|---|------|--------|-------|
| SH-10 | State requirements library | ⬜ Backlog | Pre-loaded profiles for TX, CA, FL, NY, PA homeschool requirements. Seeded via `init.sql` or migration. Phase 2 |
| SH-11 | Curriculum standards library | ⬜ Backlog | Common Core ELA/Math, NGSS, C3 Social Studies as starting sets. Phase 2 |

---

### Web — New Persona: Homeschool
> **Design note:** Homeschool parent = teacher + parent in one account. Owns their children's accounts directly (no link-code flow). Activity visibility scoped to family by default (`owner_scope: 'class' | 'family'` field on Activity). State reporting is a configuration of the shared Standards system above, not a separate build.
>
> **Build order:** Role plumbing → Dashboard → Child management → Export (depends on SH-5/SH-6) → Standards/reporting (depends on SH-1 through SH-4).

#### Role & Auth
| # | Item | Status | Notes |
|---|------|--------|-------|
| H-1 | ✅ `HOMESCHOOL` in `UserRole` enum + DB + TypeScript types | ✅ Done | Added to `models/user.py`, `types/index.ts`, signup schema |
| H-2 | ✅ Auth guards accept HOMESCHOOL | ✅ Done | `_require_teacher` in `activities.py` + `get_current_teacher` in `dependencies.py` |
| H-3 | ✅ Signup + login routing | ✅ Done | Added to `ROLE_OPTIONS` in SignUpScreen with description; login navigates to `/homeschool` |
| H-4 | `Activity.owner_scope` field | ⬜ Deferred | Backend accepts homeschool activities via existing teacher endpoints; scope field is low priority |
| H-5 | ⬜ Homeschool landing tab | ⬜ Not started | |
| H-6 | ⬜ Onboarding wizard | ⬜ Not started | |
| H-7 | ✅ Homeschool dashboard | ✅ Done | Stat cards, quick action grid, wired to `/api/v1/homeschool/dashboard` |
| H-8 | ✅ Multi-child management | ✅ Done | `HomeschoolChildrenPage` — create child accounts directly, grade level, age band |
| H-9 | ✅ Activity creation | ✅ Done | Reuses `ActivityManager` + `ActivityListPage` at `/homeschool/activities` |
| H-10 | ✅ State requirements setup | ✅ Done | `HomeschoolRequirementsPage` — uses `ExtractionWizard` with type `state_reporting` |
| H-11 | ✅ Standards coverage dashboard | ✅ Done | `HomeschoolCoveragePage` — shows requirements sets, links to coverage (SH-5 needed for full detail) |
| H-12 | ✅ Portfolio PDF export | ✅ Done | `HomeschoolExportPage` — UI complete, queues export; full PDF generation pending SH-6 |
| H-13 | ✅ Activity log CSV export | ✅ Done | Part of export page; pending SH-7 for actual file generation | `models/user.py`, `init.sql`, `types/index.ts`, `stores/auth.ts` — all one-line additions |
| H-2 | Auth guards accept HOMESCHOOL | ⬜ Not started | `_require_teacher()` in `dependencies.py`; `_require_teacher()` in `activities.py`; `phase7_student_initiated.py` teacher review guards |
| H-3 | Signup flow — Homeschool option | ⬜ Not started | Add to `SignUpScreen.tsx` role picker with description. Post-login navigate to `/homeschool` in `App.tsx` and `services/auth.ts` |
| H-4 | `Activity.owner_scope` field | ⬜ Not started | Add `owner_scope VARCHAR(20) DEFAULT 'class'` to Activity model + startup migration. Homeschool activities default to `'family'`; affects list/visibility queries |

#### Landing & Onboarding
| # | Item | Status | Notes |
|---|------|--------|-------|
| H-5 | Homeschool landing tab | ⬜ Not started | New tab after Parent on landing page. Key messages: create activities for your kids, track progress against learning goals, generate state-ready reports |
| H-6 | Onboarding wizard | ⬜ Not started | First-login: add children (create child accounts owned by this parent), set grade levels, optionally select state for pre-loaded reporting requirements |

#### Dashboard & Activity Management
| # | Item | Status | Notes |
|---|------|--------|-------|
| H-7 | Homeschool dashboard | ⬜ Not started | Combined view: activity list (reuse teacher list) + each child's recent sessions (reuse parent child-progress) + reporting widget. New page at `/homeschool` |
| H-8 | Multi-child management | ⬜ Not started | Homeschool parent owns child accounts directly — no link codes. UI to create child accounts, set grade/age band, switch between children |
| H-9 | Activity creation | ⬜ Not started | Full `ActivityManager` access via HOMESCHOOL role guard. Activities default to `owner_scope: 'family'` |

#### Reporting (depends on SH-1 through SH-6)
| # | Item | Status | Notes |
|---|------|--------|-------|
| H-10 | State requirements setup | ⬜ Not started | UI to select state from library (SH-7) or upload custom requirements (SH-2). Stored as a standards set scoped to this homeschool account |
| H-11 | Standards coverage dashboard widget | ⬜ Not started | "X of 180 days logged", subject gaps, missing evidence types. Pulls from SH-4 coverage report endpoint |
| H-12 | Portfolio PDF export | ⬜ Not started | Download: cover page, child info, activity log, evidence thumbnails, standards coverage summary. Uses SH-5 ExportService with homeschool template |
| H-13 | Activity log CSV export | ⬜ Not started | Simple flat export for states that want a spreadsheet. Uses SH-6 ExportService |

### Mobile (React Native / Expo)
| # | Item | Status | Notes |
|---|------|--------|-------|
| MOB-1 | Debug Expo Go timeout | 🔴 Blocking | App never renders. Suspects: `API_BASE_URL` in `mobile/.env` pointing to localhost instead of host IP; Metro bundler not binding to `0.0.0.0`; device can't reach backend on LAN. First priority. |
| MOB-2 | Theme QA | ⬜ Blocked | All screens × Terrain + Atmosphere + City skin — blocked by MOB-1 |
| MOB-3 | Video capture screen | ⬜ Not started | Specced but not built |
| MOB-4 | Drawing/Sketch capture screen | ⬜ Not started | Specced but not built |
| MOB-5 | Teacher mobile dashboard | ⬜ Not started | Monitor sessions, review submissions on mobile |
| MOB-6 | Parent mobile dashboard | ⬜ Not started | |

### Mobile — Build & Distribution Environment
> Goal: produce testable builds for iOS (TestFlight) and Android (internal track) without needing a Mac for every build. EAS Build (Expo Application Services) runs builds in the cloud and is the standard approach for Expo projects.

| # | Item | Status | Notes |
|---|------|--------|-------|
| MOB-B1 | EAS CLI setup | ⬜ Not started | `npm install -g eas-cli` + `eas login`. Requires an Expo account. Run once per dev machine. |
| MOB-B2 | `eas.json` build profiles | ⬜ Not started | Add `eas.json` to `mobile/` with three profiles: `development` (Expo Go compatible), `preview` (internal `.apk`/`.ipa` for testers), `production` (store-ready). |
| MOB-B3 | Android build + internal track | ⬜ Not started | `eas build --platform android --profile preview` → produces `.apk`. Distribute via Google Play internal testing track or direct APK link. No Mac needed. |
| MOB-B4 | iOS build + TestFlight | ⬜ Not started | `eas build --platform ios --profile preview` → produces `.ipa`. Requires Apple Developer account ($99/yr) and provisioning profile managed by EAS. Distribute via TestFlight. |
| MOB-B5 | OTA updates (Expo Updates) | ⬜ Not started | `eas update` pushes JS bundle updates to installed apps without going through the store — good for fast iteration on non-native changes. Configure `expo-updates` in `app.json`. |
| MOB-B6 | Environment config per build profile | ⬜ Not started | `API_BASE_URL` must be different for development (LAN IP), preview (staging server), and production. Use EAS environment variables or `app.config.js` with profile-aware logic. |
| MOB-B7 | CI/CD for mobile builds | ⬜ Backlog | GitHub Actions workflow triggering `eas build` on push to `main`. Can share the same Actions setup as the web CI/CD (I-6). |

### Aristotelian Questions Expansion
> **Current state:** Exactly 26 questions hardcoded as Python tuples in `backend/routes/questions.py`. Mobile downloads them as a SQLite file and caches locally. No localization, no easy way to add questions without touching Python code.
>
> **Target:** 100+ questions across subjects and grade bands, stored in a structured JSON file (one file per locale), loaded by the backend at startup and served to mobile. Adding new questions or translations = editing JSON, no code changes.

| # | Item | Status | Notes |
|---|------|--------|-------|
| AQ-1 | Extract questions to `backend/data/questions/en.json` | ⬜ Not started | Move the 26 existing tuples to structured JSON: `{id, subject, grade_band, bloom_level, observation_type, question_text, follow_up}`. Backend loads this file at startup instead of the hardcoded list. |
| AQ-2 | Write 100+ questions across subjects | ⬜ Not started | Target: science (25), maths (15), history/social studies (15), geography/environment (15), language arts (10), art/design (10), general observation (15). Cover k-2, 3-5, 6-8, 9-12 bands and all Bloom levels. |
| AQ-3 | Localization structure | ⬜ Not started | `backend/data/questions/{locale}.json` — same structure, translated strings, same `id` values so mobile can match. Start with `en.json`, then `es.json`, `fr.json`. Backend serves locale based on `Accept-Language` header or explicit `?locale=` param. |
| AQ-4 | Admin UI to add/edit questions | ⬜ Not started | Simple CRUD page in admin panel at `/admin/questions`. Shows the question list, allows add/edit/delete with locale picker. Writes to the JSON file (or DB — decision needed). |
| AQ-5 | Mobile — sync locale-aware questions | ⬜ Not started | `syncQuestionsFromServer()` in `mobile/src/db/questions.ts` already handles sync; update to pass device locale so server returns the right language set. |

---

### Backend Stubs (return empty / TODO comments)
| # | Item | Notes |
|---|------|-------|
| BE-S1 | `parent.py` — `/children/{id}/activities` | Returns `[]` |
| BE-S2 | `parent.py` — `/messages` | Returns `[]` |
| BE-S3 | `parent.py` — `/notifications` | Returns `[]` |
| BE-S4 | `privacy_locations.py` — location enrichment endpoints | Multiple TODO comments; Nominatim/Wikidata not wired |
| BE-S5 | `privacy_locations.py` — regulation approval flow | TODO — not implemented |

---

## ✉️ Auth & Email System

> **Current state:** Login and signup work. Password reset endpoint exists and now generates real signed tokens (60-min expiry). BUT no emails are ever sent — `email_service.py` only prints to console. `aiosmtplib` is in requirements but unwired. Signup creates the account but sends no confirmation. Email verification flow doesn't exist at all.

### Email Infrastructure
| # | Item | Status | Notes |
|---|------|--------|-------|
| AU-1 | ✅ Wire `email_service.py` to `aiosmtplib` | ✅ Verified working | SMTP send wired and verified end-to-end. |
| AU-2–3 | ✅ HTML email templates + env vars | ✅ Done | Templates for verification, reset, welcome, parent consent in `backend/templates/email/`. `SMTP_*` vars in `.env`. |
| AU-4–8 | ✅ Signup → email verification flow | ✅ Done | Signup sets `is_active=False`, generates 24h token, calls `send_verification_email`. Frontend: `VerifyEmailPendingPage` with resend button. Seed users pre-verified. |
| AU-9–12 | ✅ Password reset flow | ✅ Done | `ForgotPasswordPage` → backend generates 60min token → `send_password_reset_email`. `ResetPasswordPage` validates token on load, enforces strength rules, submits. Login screen shows `?verified=1` success banner. `VerifyEmailPage` (new) actually calls backend before redirecting. |
| AU-2 | HTML email templates | ⬜ Not started | Build minimal HTML templates for: welcome/confirmation, password reset, parent consent request, activity feedback notification. Store in `backend/templates/email/` |
| AU-3 | Email service env vars in `.env` / docker-compose | ⬜ Not started | Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `FRONTEND_URL` to `.env.example` and `docker-compose.yml` |

### Signup & Email Verification Flow
| # | Item | Status | Notes |
|---|------|--------|-------|
| AU-4 | Send confirmation email on signup | ⬜ Not started | After `POST /api/v1/auth/signup`, generate a `SignedURL` with `purpose="email_verification"` (24h TTL), email the link. Mark `user.is_active = False` until verified. |
| AU-5 | `GET /api/v1/auth/verify-email?token=` endpoint | ⬜ Not started | Validates the signed token, sets `user.is_active = True`, redirects to login with success message. |
| AU-6 | Frontend — email verification pending screen | ⬜ Not started | After signup, show "Check your email" screen. Include "Resend confirmation" button. |
| AU-7 | Resend verification endpoint | ⬜ Not started | `POST /api/v1/auth/resend-verification` — rate-limited (1 per 2 min), generates new token, sends new email. |
| AU-8 | Admin bypass for seed/test accounts | ⬜ Not started | Seed users (`student@example.com` etc.) should be pre-verified in `init.sql` (`is_active = TRUE`) so dev/test isn't blocked by email. |

### Password Reset Flow
| # | Item | Status | Notes |
|---|------|--------|-------|
| AU-9 | Wire email send into `POST /api/v1/public/password/forgot` | ⬜ Not started | Token generation is done (SignedURL). Just need to call `email_service.send_reset_email(user.email, token)`. Blocked on AU-1. |
| AU-10 | Frontend — forgot password page | ⬜ Not started | Accessible from login screen. Form takes email, calls `/forgot`, shows "check your inbox" confirmation. |
| AU-11 | Frontend — reset password page | ⬜ Not started | Route `/reset-password?token=`. Calls `GET /reset/{token}` to validate on load (show error if expired). On submit calls `POST /reset`. |
| AU-12 | Invalidate old reset tokens after use | ⬜ Not started | SignedURL tokens expire by time but aren't single-use. For extra security: store a `password_changed_at` timestamp and reject tokens issued before it. |

### Session & Security Hardening
| # | Item | Status | Notes |
|---|------|--------|-------|
| AU-13 | Logout invalidates token server-side | ⬜ Not started | Currently logout just clears localStorage. Add a token blocklist in Redis (already in stack) — store JTI (JWT ID) of revoked tokens with TTL = token expiry. |
| AU-14 | Refresh token rotation | ⬜ Not started | `/api/v1/auth/refresh` exists in stores but backend may not be issuing refresh tokens. Verify + implement rotation (new refresh token on each use, old one invalidated). |
| AU-15 | "Remember me" on login | ⬜ Not started | Short-lived token (1h) by default; long-lived (30d) if "remember me" checked. Frontend already has the checkbox space. |

---

## 🗺️ Navigation & Layout System

> **Current state:** `TeacherLayout.tsx` exists with a sidebar but has only 2 nav items and is NOT used by `TeacherDashboard.tsx` — the dashboard has inline ad-hoc buttons. `Navigation.tsx` is a 3-line stub. No layouts exist for Student, Parent, or Admin. Each dashboard handles its own navigation inconsistently, and there's no visual grouping of tools by purpose.

### Foundation
| # | Item | Status | Notes |
|---|------|--------|-------|
| NAV-1 | `DashboardShell` layout component | ⬜ Not started | Shared wrapper: role-coloured sidebar (collapsible on mobile), top bar with user avatar + role badge + logout, main content area. All role dashboards use this shell — role-specific nav items passed as props. |
| NAV-2 | Role colour system | ⬜ Not started | Consistent colour coding across all dashboards: Teacher = forest green (existing), Student = sky blue, Parent = warm amber, Admin = slate. Encoded in Tailwind config / CSS variables. |
| NAV-3 | Active route highlighting | ⬜ Not started | `NavItem` component highlights current route. Uses `useLocation()` to match path. |
| NAV-4 | Mobile nav (hamburger / bottom bar) | ⬜ Not started | On narrow viewports, sidebar collapses to a bottom tab bar (4–5 items) or hamburger menu. |

### Teacher Navigation
> Grouped by workflow stage so teachers understand what each section is *for*, not just what it's called.

| # | Item | Status | Notes |
|---|------|--------|-------|
| NAV-T1 | Teacher sidebar — full nav | ⬜ Not started | Groups: **Create** (New Activity, Activity Library, Rubrics), **Run** (Active Sessions, Monitor, Tour), **Review** (Submissions, Field Note Review, Peer Project Review), **Students** (Student List, Classes), **Settings**. Replace the 2-item `TeacherLayout` sidebar. |
| NAV-T2 | Wire all teacher routes into sidebar | ⬜ Not started | All existing routes (`/teacher/activities`, `/teacher/submissions`, `/teacher/field-note-review`, `/teacher/peer-project-review`, `/teacher/rubrics`, `/teacher/students`, `/teacher/settings`) must appear in nav. |
| NAV-T3 | Teacher dashboard home redesign | ⬜ Not started | Landing card grid: "Create Activity" (big CTA), "Review Submissions" (badge count), "Monitor Sessions" (live count), "Students" — visual entry points, not just a data table. |

### Student Navigation
> Grouped to help students understand the difference between *doing* an activity vs *creating* one vs *reviewing* work.

| # | Item | Status | Notes |
|---|------|--------|-------|
| NAV-S1 | Student sidebar / bottom nav | ⬜ Not started | Groups: **Explore** (Find Activities, Map View), **My Work** (Active Session, Journal, Field Notes), **Create** (Propose Activity, Self Projects, Peer Projects), **Progress** (Competencies, Badges, Portfolio). |
| NAV-S2 | Student dashboard home redesign | ⬜ Not started | Peri (crow) welcome card at top, then: "Continue Activity" (if active session), "Explore Activities" CTA, "My Journal" shortcut, progress ring. |
| NAV-S3 | Differentiate "Complete Activity" vs "Create Activity" | ⬜ Not started | Visually distinct entry points — e.g. "Explore & Do" (teacher-assigned, blue) vs "Create Your Own" (student-initiated, green). Currently all mixed together. |

### Parent Navigation
> Focused on visibility and reporting, not creation.

| # | Item | Status | Notes |
|---|------|--------|-------|
| NAV-P1 | Parent sidebar | ⬜ Not started | Groups: **My Children** (per-child switcher + progress), **Activity Feed** (recent completions), **Reports** (download portfolio, weekly digest), **Messages**, **Settings**. |
| NAV-P2 | Per-child switcher | ⬜ Not started | Top of sidebar shows child avatar + name with dropdown if multiple children. All views filtered to selected child. |
| NAV-P3 | Parent dashboard home redesign | ⬜ Not started | Child card(s) with progress ring, recent activity strip, "Download Report" CTA, teacher message preview. |

### Admin Navigation
| # | Item | Status | Notes |
|---|------|--------|-------|
| NAV-A1 | Admin sidebar | ⬜ Not started | Groups: **Overview** (Dashboard), **Users** (manage, roles, bulk import), **Classes**, **Content** (activity library, standards), **Privacy** (compliance, audit log), **System** (settings, env editor, health). |
| NAV-A2 | Admin dashboard redesign | ⬜ Not started | Key metrics cards: total users by role, active sessions today, activities published, recent audit events. |

### Onboarding & Empty States
| # | Item | Status | Notes |
|---|------|--------|-------|
| NAV-O1 | First-login onboarding flow per role | ⬜ Not started | After email verification, show a 3-step guided tour of the key tools for that role. Skippable. Uses a modal overlay on the dashboard. |
| NAV-O2 | Empty state screens | ⬜ Not started | When a section has no data yet (no activities, no students, no children linked), show a helpful illustration + CTA rather than a blank page or loading spinner. |

---

## 🐛 Known Issues — Active

| # | Issue | Notes |
|---|-------|-------|
| KI-1 | Dashboard main content crowded left, not centred | `DashboardShell` wraps content in a centred div but dashboard pages use their own CSS modules with `max-width` on `.container` — the two compete. Fix: remove `max-width`/`margin` from individual dashboard CSS modules and let `DashboardShell` own the centring. |
| KI-2 | Email not sending despite SMTP config | Root cause: `docker compose restart` does **not** re-read `.env` — env vars are baked at `up` time. Fix: run `docker compose up -d --force-recreate backend` after changing `.env`. Also verify `EMAIL_DRY_RUN=false` is set and the Gmail App Password is correct (not the account password). |

---

## 🧪 Testing & Quality

### Unit & Integration Tests
| # | Item | Status | Notes |
|---|------|--------|-------|
| TEST-1 | Backend test suite — auth routes | ⬜ Not started | pytest + pytest-asyncio. Cover: login, signup, token refresh, verify-email, forgot/reset password. Use test DB (SQLite in-memory or Postgres test schema). |
| TEST-2 | Backend test suite — dashboard endpoints | ⬜ Not started | All four role dashboards: assert 200, correct shape, correct data for seeded users. |
| TEST-3 | Backend test suite — standards & export | ⬜ Not started | Upload parse (mock Ollama), save set, coverage report, PDF/CSV generation. |
| TEST-4 | Backend test suite — security | ⬜ Not started | SQL injection attempts, JWT tampering, signed URL replay, role escalation attempts (student calling teacher endpoints). |
| TEST-5 | Backend test suite — email service | ⬜ Not started | Mock aiosmtplib, assert correct recipients/subjects, dry-run mode behaviour. |
| TEST-6 | Frontend unit tests — auth flows | ⬜ Not started | Vitest + React Testing Library. Cover: login form, signup role selection, forgot password, verify pending screen. |
| TEST-7 | Frontend unit tests — dashboard components | ⬜ Not started | DashboardShell renders correct nav groups per role, active route highlighting, collapse behaviour. |
| TEST-8 | Frontend integration tests — full auth flow | ⬜ Not started | Playwright or Cypress E2E: signup → verify email → login → dashboard → logout. |
| TEST-9 | Mobile unit tests | ⬜ Not started | Jest + React Native Testing Library. Cover: auth store, offline question cache, capture upload queue. |

### Load Testing
| # | Item | Status | Notes |
|---|------|--------|-------|
| LOAD-1 | API load test — auth endpoints | ⬜ Not started | Use `k6` or `locust`. Simulate 100 concurrent logins, measure p95 latency. Rate limiter (5/min) should throttle and return 429 cleanly. |
| LOAD-2 | API load test — dashboard endpoints | ⬜ Not started | 50 concurrent teacher/student dashboard loads. Identify slow queries (add DB indexes if needed). |
| LOAD-3 | API load test — file upload (captures) | ⬜ Not started | Simulate 20 concurrent audio/photo uploads. Verify upload dir, ASR queue doesn't block. |
| LOAD-4 | Export load test | ⬜ Not started | 10 concurrent PDF portfolio generations via reportlab — CPU-bound, may need async worker pool. |

### Penetration Testing
| # | Item | Status | Notes |
|---|------|--------|-------|
| PEN-1 | Authentication — brute force & enumeration | ⬜ Not started | Verify rate limiting on login/signup actually blocks. Test user enumeration via forgot-password timing. Confirm `is_active=false` blocks JWT access. |
| PEN-2 | Authorisation — IDOR & role escalation | ⬜ Not started | Student accessing teacher endpoints, parent accessing another parent's child data, unsigned JWT accepted. |
| PEN-3 | Input validation — injection & XSS | ⬜ Not started | SQL injection (remaining raw queries), XSS via activity title/description fields rendered in frontend, SSRF via location URLs. |
| PEN-4 | File upload security | ⬜ Not started | Upload non-image as image, oversized file, path traversal in filename, zip bomb via CSV. |
| PEN-5 | Signed URL security | ⬜ Not started | Replay expired token, tamper payload, use password-reset token for email-verification endpoint. |
| PEN-6 | COPPA / privacy compliance check | ⬜ Not started | Verify under-13 accounts cannot be created without parental consent flow, verify audit log captures all student data access. |

---

## 🔧 Infrastructure / Pre-ship Checklist

| # | Item | Priority |
|---|------|----------|
| I-3 | Review nginx.conf for production routing | Before any external deploy |
| I-4 | Wire monitoring/observability into compose | Nice to have |
| I-5 | Wire pgbouncer into compose | Nice to have |
| I-6 | GitHub Actions CI/CD pipeline | Before team/public access |
| I-7 | Rotate `SECRET_KEY` and `AUDIT_HASH_SALT` from dev defaults | **Must do before any non-local deploy** |
| I-8 | Periodic purge of test account data (P17) | Backlog |
| I-9 | Location enrichment (Nominatim/Wikidata) — test in Docker | Untested |
                                                           