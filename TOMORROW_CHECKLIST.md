# Peripateticware — Tomorrow's Session Checklist
Prioritized punch list. Work top to bottom.

---

## BLOCK 1 — Design Decisions (do first, everything else depends on these)
_Open the HTML design files in browser before starting code._

- [ ] **1.1 Crow style** — Pick one: Geometric (`CrowByAgeBand_Alt2`), Organic (`CrowByAgeBand_Alt3`), or Original (`CrowByAgeBand`)
- [ ] **1.2 Crow placement** — Confirm which screens: loading spinner? empty states? onboarding? mobile splash?
- [ ] **1.3 Skin names** — Name the 3 color palettes (e.g. Forest / Ocean / Dusk)
- [ ] **1.4 Skin picker location** — Settings page only, or also offered at first login?
- [ ] **1.5 Skin default per role** — Does teacher get one default, student another?
- [ ] **1.6 Mobile strategy** — Web-responsive only for now, OR start React Native path? (Recommendation: web-responsive first, RN later)
- [ ] **1.7 Nav pattern confirmed** — Teacher=sidebar, Student=bottom tabs, Parent=top nav, Admin=sidebar
- [ ] **1.8 Landing page** — Retain as-is, just add crow to hero? Or any other changes?

---

## BLOCK 2 — Localization / i18n

**Situation:** 11 languages × 1,262 keys in `frontend/dist/locales/` — translations ARE real
(verified Spanish, Arabic, etc. have actual translated text). BUT:
- `dist/locales/` is not served by Vite dev server — files need to be in `public/locales/`
- User has CORRECTED locale files at `C:\Users\pcerd\Desktop\CheckwCoWork\Locales` that
  supersede the dist versions (some dist entries may still have key-names as values)
- Need to bring desktop locales into the project before copying to public/

**Step 0 — Get correct locale files into project (do this before anything else in this block):**
- [ ] **2.0** Copy `C:\Users\pcerd\Desktop\CheckwCoWork\Locales\` into
  `frontend/public/locales/` — these replace the dist versions entirely
  ```
  # From PowerShell in project root:
  Copy-Item -Recurse "C:\Users\pcerd\Desktop\CheckwCoWork\Locales\*" "frontend\public\locales\" -Force
  ```

**Audit + fix:**
- [ ] **2.1** Spot-check 3 languages in `public/locales/` — confirm values are real text not key names
  - Look for entries like `"login_btn": "auth.login_btn"` (bad) vs `"login_btn": "Sign In"` (good)
- [ ] **2.2** Verify i18next config fetches `/locales/{{lng}}/{{ns}}.json` — check `i18n.ts` or `i18next` init config in frontend
- [ ] **2.3** Fix `SignUpScreen.tsx` — remove `landing:` namespace prefix from `t()` calls (keys exist, path is wrong)
- [ ] **2.4** Check ALL other components that use `t('landing:...')` — search for `landing:` prefix across `src/` and strip the namespace prefix
- [ ] **2.5** Add all 11 language files — confirm `he` (Hebrew) and `ar` (Arabic) have RTL direction attribute set in HTML when those locales are active
- [ ] **2.6** Smoke-test: no missing-key warnings in console on login, signup, landing, and teacher dashboard
- [ ] **2.7** Test locale switcher (`LocaleSwitcher.tsx`) cycles through all 11 languages correctly

---

## BLOCK 3 — Auth / Sign-Up (broken flow)

- [ ] **3.1** `backend/routes/auth.py` — Make `username` optional in `SignupRequest`; auto-generate from email prefix if absent
- [ ] **3.2** `frontend/src/stores/auth.ts` `signup()` — Confirm payload matches backend (email, password, password_confirm, role; no `username` required)
- [ ] **3.3** End-to-end test: sign up new user → auto-login → land on correct dashboard per role
- [ ] **3.4** Test all 4 roles can log in (teacher, student, parent, admin)

---

## BLOCK 4 — Teacher Store (stubs → real API calls)
_All in `frontend/src/stores/teacher.ts`_

- [ ] **4.1** Add `authHeader()` helper (Bearer token from localStorage)
- [ ] **4.2** `fetchActivities()` — real GET `/api/v1/activities` with auth header + query params
- [ ] **4.3** `fetchActivity()` / `getActivity()` — real GET `/api/v1/activities/:id` with auth header
- [ ] **4.4** `createActivity()` — real POST `/api/v1/activities` with auth header + body
- [ ] **4.5** `updateActivity()` — real PUT `/api/v1/activities/:id` with auth header + body
- [ ] **4.6** `saveActivity()` (line 265) — add auth header (fetch call exists but no token)
- [ ] **4.7** `fetchProjects()` / `fetchProject()` — wire to real `/api/v1/projects` endpoints
- [ ] **4.8** Remove hardcoded `teacher_id: 'current_teacher_id'` — backend derives from JWT
- [ ] **4.9** Test: teacher can create activity, see it in list, edit it, delete it

---

## BLOCK 5 — Register Missing Backend Routers
_All in `backend/main.py` — add inside the try block_

- [ ] **5.1** `inference.py` → `prefix="/api/v1/inference"` (AI activity generation — NOT registered at all)
- [ ] **5.2** `curriculum.py` → check prefix, register (curriculum mapping)
- [ ] **5.3** `linking.py` → check prefix, register (activity ↔ curriculum linking)
- [ ] **5.4** `notifications.py` → check prefix, register
- [ ] **5.5** `email.py` → check prefix, register
- [ ] **5.6** `reset.py` → check prefix, register (password reset)
- [ ] **5.7** Test: `GET /api/v1/inference/health` returns 200

---

## BLOCK 6 — AI Activity Generation (teacher flow)

- [ ] **6.1** `backend/routes/inference.py` — Add cache lookup BEFORE any Ollama/Claude call
  - Cache key: `hash(location_name_normalized, subject, grade_level, bloom_level)`
  - Check `cached_locations` table first → return instantly if hit
  - Write result to cache after any successful AI generation
- [ ] **6.2** `frontend/src/components/teacher/OllamaLessonSuggestions.tsx` — Verify calls `/api/v1/inference/inquiry` with Bearer token
- [ ] **6.3** `frontend/src/components/teacher/EnhancedActivityBuilder.tsx` — Same check
- [ ] **6.4** Test with Ollama running on host: generate activity suggestions for a location
- [ ] **6.5** Test cache: second request for same location returns immediately

---

## BLOCK 7 — Skin System

- [ ] **7.1** Add 3 CSS skin classes to `frontend/src/index.css` (custom properties per skin)
- [ ] **7.2** Add skin toggle to `TeacherSettingsPage.tsx` and `StudentSettingsPage.tsx`
- [ ] **7.3** Persist skin choice in localStorage (`ppw_skin`)
- [ ] **7.4** Apply skin class to `<body>` or root div on load
- [ ] **7.5** (Optional) Save skin preference to user profile in DB

---

## BLOCK 8 — Crow Integration

- [ ] **8.1** Add chosen crow variant to loading spinner (`LoadingSpinner.tsx`)
- [ ] **8.2** Add crow to empty-state screens (no activities yet, etc.)
- [ ] **8.3** Add crow to landing page hero (if decided in Block 1)
- [ ] **8.4** Add crow to mobile splash / onboarding (if web-responsive mobile screens get built)

---

## BLOCK 9 — Missing / Broken Pages (wire to real data)

- [ ] **9.1** `StudentDashboard` — fetch assigned activities from `/api/v1/student/activities`
- [ ] **9.2** `StudentActivityDetailPage` — fetch single activity + student progress
- [ ] **9.3** `SessionPage` — capture flow, connect to session endpoints
- [ ] **9.4** `TeacherSubmissionsPage` — fetch student submissions from backend
- [ ] **9.5** `ParentDashboard` — fetch child progress from `/api/v1/parent/*`
- [ ] **9.6** `ParentProgressPage` — real data
- [ ] **9.7** `TeacherDashboard` — summary stats (activity count, student count, recent activity)

---

## BLOCK 10 — Routing Cleanup

- [ ] **10.1** Audit `ProtectedRoute` — confirm role comparison is case-insensitive (backend returns uppercase, store lowercases it)
- [ ] **10.2** After login redirect — teacher → `/teacher/activities`, student → `/student/dashboard`, parent → `/parent`, admin → `/admin`
- [ ] **10.3** Confirm `/teacher/activities/new` renders `ActivityManager` in create mode (not edit)
- [ ] **10.4** Confirm `/teacher/activities/:id` renders `ActivityManager` in edit mode with pre-filled data
- [ ] **10.5** Audit all `ComingSoonPage` routes — decide which get real pages this session vs. stay stubbed

---

## BLOCK 11 — Socratic Questions SQLite DB (mobile / offline AI)

- [ ] **11.1** Design schema: `questions(id, subject, grade_band, bloom_level, observation_type, question_text, follow_up)`
- [ ] **11.2** Seed with ~200 starter questions across subjects (science, math, history, art, language)
- [ ] **11.3** Add API endpoint: `GET /api/v1/socratic-questions?subject=&grade=&bloom=` (serves seed DB download + filtered queries)
- [ ] **11.4** Mobile: download SQLite file on first launch, query locally thereafter
- [ ] **11.5** Connect to student capture flow — surface relevant question when student adds evidence

---

## BLOCK 12 — Known Bugs (from earlier sessions)

- [ ] **12.1** `ClassSettings.class_obj` relationship — **ALREADY FIXED** ✅ (verify backend restart picked it up)
- [ ] **12.2** Vite proxy `VITE_PROXY_TARGET` — **ALREADY FIXED** ✅ (verify after `docker-compose restart frontend`)
- [ ] **12.3** `seed_test_users.py` bcrypt — **ALREADY FIXED** ✅
- [ ] **12.4** `gen_hash.py` BOM + passlib — **ALREADY FIXED** ✅
- [ ] **12.5** Check backend logs for any other mapper/SQLAlchemy errors on startup
- [ ] **12.6** Confirm `/api/v1/auth/health` returns 200 before starting UI work

---

## BLOCK 13 — Polish & Smoke Tests (end of session)

- [ ] **13.1** Full login flow: all 4 roles, correct dashboard per role
- [ ] **13.2** Teacher: create activity → appears in list → edit → save → delete
- [ ] **13.3** Teacher: AI generate suggestions for a location → cache it → re-request → instant return
- [ ] **13.4** Student: see assigned activities → open one → begin session
- [ ] **13.5** Skin picker: switch skins → persists on reload
- [ ] **13.6** Crow: appears in correct locations with chosen style
- [ ] **13.7** Sign up: new user → correct role dashboard → can log out → log back in
- [ ] **13.8** No missing-key i18n warnings in console
- [ ] **13.9** No SQLAlchemy errors in backend logs during normal use

---

## BLOCK 13b — ASR / Whisper (OpenAI's Whisper model — confirmed correct)

**Clarification:** Yes — both code paths use OpenAI's Whisper model (https://openai.com/index/whisper/).
This is the open-source speech recognition model released by OpenAI, NOT a paid API.
- **Path 1 — Local/free:** Whisper model loaded inside Ollama on your host machine. No API key needed.
  `ollama pull whisper` → runs fully on-device, private, no cost per call.
- **Path 2 — Cloud fallback:** OpenAI's hosted `whisper-1` API endpoint (requires `OPENAI_API_KEY`,
  costs ~$0.006/min). Only used if Ollama is unavailable.
Both are the same model. Default is local via Ollama. ✅
_Architecture is substantially built. Service class, fallback chain, background task, and
frontend components ALL exist. Primary gap: it's disabled (`ASR_ENABLED=false`) and the
inference router (which handles audio) isn't registered yet (covered in Block 5.1)._

**What's already built ✅:**
- `backend/services/asr_service.py` — Whisper-on-Ollama → OpenAI → Claude fallback chain
- `backend/services/audio_service.py` — raw bytes → transcription wrapper
- `backend/routes/student.py` — background ASR task fires after audio capture upload
- `backend/routes/inference.py` — `/multimodal-process` handles audio input type
- `frontend/src/components/student/AudioRecorder.tsx` + `AudioCapture.tsx` — UI exists
- DB columns: `transcript`, `transcript_confidence`, `transcript_language` on captures

**What needs to be done:**

- [ ] **13b.1** Enable ASR: change `ASR_ENABLED=false` → `ASR_ENABLED=true` in `.env`
  - Also confirm `OLLAMA_MODEL_AUDIO=whisper` is set (already in `config.py`)
  - Whisper must be pulled in Ollama: `ollama pull whisper` on the host
- [ ] **13b.2** Register inference router in `main.py` (Block 5.1) — required for audio endpoint
- [ ] **13b.3** Verify `OLLAMA_HOST` is set in `asr_service.py` — currently checks `settings.OLLAMA_HOST`
  but the `.env` uses `OLLAMA_BASE_URL` not `OLLAMA_HOST`; update `asr_service.py` to use
  `settings.OLLAMA_BASE_URL` (already set to `http://host.docker.internal:11434`)
- [ ] **13b.4** `frontend/src/components/student/AudioRecorder.tsx` — confirm it POSTs to
  `/api/v1/student/captures` with `content_type=audio` and correct auth header
- [ ] **13b.5** `frontend/src/components/student/AudioCapture.tsx` — confirm it handles
  `transcription` field in the response and displays it to student after upload
- [ ] **13b.6** Add polling endpoint or WebSocket notification so student sees
  "Transcribing…" → actual text when background ASR completes
  (capture record has transcript field — poll `GET /api/v1/student/captures/:id` until populated)
- [ ] **13b.7** Test end-to-end: record audio in student session → upload → background task runs
  → transcript appears in capture record → student can see and edit it
- [ ] **13b.8** Graceful degradation: if Whisper/Ollama unavailable, audio still saves;
  transcript shows "Transcription unavailable" — not an error state
- [ ] **13b.9** Privacy note: confirm audio files stored locally on server, NOT sent to cloud
  unless `OPENAI_API_KEY` is set (this is a selling point — document it)

---

## BLOCK 13c — Student-Initiated Activities / Scavenger Hunt (Phase 7)
_Backend is comprehensive — full field notes, self-projects, peer projects, teacher approval
all implemented in `phase7_student_initiated.py`. Frontend components exist but are
disconnected from routing and some are stubs. The scavenger hunt / discovery flow
(location-triggered, clue progression) is the missing UI layer on top of this._

**What's built ✅:**
- Backend: all CRUD for field notes, self-projects, peer projects, teacher approval/rejection
- Backend: `ClassSettings` controls (peer projects on/off, approval mode, field notes on/off)
- Frontend: `FieldNoteEditor.tsx`, `SelfProjectView.tsx`, `FieldNoteReview.tsx` (teacher)
- Frontend: `phase7Api.ts` uses `apiClient` correctly with auth headers ✅
- Frontend: `types/phase7.ts` fully typed

**What needs to be done:**

### Routing — connect Phase 7 screens to App.tsx
- [ ] **13c.1** Add student routes to `App.tsx`:
  - `/student/field-notes` → new `FieldNotesListPage`
  - `/student/field-notes/:id` → `FieldNoteEditor` (edit mode)
  - `/student/self-projects` → new `SelfProjectsListPage`
  - `/student/self-projects/:id` → `SelfProjectView`
  - `/student/peer-projects` → new `PeerProjectsListPage`
  - `/student/peer-projects/:id` → new `PeerProjectDetailPage`
- [ ] **13c.2** Add teacher routes:
  - `/teacher/field-note-review` → `FieldNoteReview` (teacher approval queue)
  - `/teacher/peer-project-review` → `TeacherApprovalDashboard` (already exists as component)

### Missing pages (build these)
- [ ] **13c.3** `FieldNotesListPage` — student's list of field notes, grouped by self-project; "New Field Note" button
- [ ] **13c.4** `SelfProjectsListPage` — student's personal projects (scavenger hunt containers); shows completion progress
- [ ] **13c.5** `PeerProjectsListPage` — two tabs: "My Projects" (authored) + "Available to Respond" (from classmates)
- [ ] **13c.6** `PeerProjectDetailPage` — view a peer project, add captures as response, submit response

### Scavenger Hunt / Discovery flow (the core student experience)
- [ ] **13c.7** `StudentDashboard` — add "Explore" section showing nearby location-based activities (from teacher-created activities) and any active peer projects from classmates
- [ ] **13c.8** Location-triggered activity start — when student opens activity detail, check GPS proximity to activity location; show "You're here! Start capturing" vs "Navigate to [location]"
- [ ] **13c.9** Capture flow in scavenger hunt context: phase progression — Orient → Observe → Capture → Reflect — each phase has a Socratic prompt (from SQLite DB per Block 11)
- [ ] **13c.10** "Submit for Teacher Promotion" flow — student submits field note for inclusion in class activity; teacher sees it in approval queue

### Fix stubs
- [ ] **13c.11** `StudentProjectCreation.tsx` — currently an empty shell; wire to `phase7Api.createSelfProject()` + auth
- [ ] **13c.12** Fix `CaptureRef.transcript` type in `types/phase7.ts` — currently hardcoded as `null`; update to `string | null` now that ASR is being enabled (Block 13b)
- [ ] **13c.13** `FieldNoteEditor.tsx` — already calls `fieldNoteApi` correctly ✅; verify GPS auto-fill works; test save/share/submit flow

### Teacher controls
- [ ] **13c.14** `TeacherApprovalDashboard.tsx` — connect to `GET /api/v1/teacher/peer-projects` and `GET /api/v1/teacher/field-notes`; add approve/reject buttons calling the correct endpoints
- [ ] **13c.15** Add Phase 7 section to `TeacherDashboard` — counts of pending approvals (field notes + peer projects), link to review queues
- [ ] **13c.16** `ClassSettings` UI — teacher can toggle peer projects on/off and field notes on/off per class (add to `TeacherSettingsPage` or class management)

---

## BLOCK 13d — Teacher Rubrics
_DB table `assessment_rubrics` exists. `AssessmentRubric` model exists. Activities have
`rubric_id` FK. But there are ZERO backend routes for rubric CRUD and no frontend UI.
This is a complete build from scratch on top of existing DB schema._

**What's built ✅:**
- `assessment_rubrics` table: `id`, `teacher_id`, `title`, `description`, `criteria` (JSONB), `max_score`
- `activities.rubric_id` FK → `assessment_rubrics.id`
- `AssessmentRubric` ORM model in `backend/models/assessment.py`

**What needs to be built:**

### Backend routes — `backend/routes/rubrics.py` (new file)
- [ ] **13d.1** `POST /api/v1/rubrics` — create rubric (teacher only)
  - Body: `{ title, description, criteria: [{name, description, levels: [{score, label, description}]}], max_score }`
- [ ] **13d.2** `GET /api/v1/rubrics` — list teacher's rubrics
- [ ] **13d.3** `GET /api/v1/rubrics/:id` — get single rubric with full criteria
- [ ] **13d.4** `PUT /api/v1/rubrics/:id` — update rubric
- [ ] **13d.5** `DELETE /api/v1/rubrics/:id` — delete rubric (only if not attached to published activities)
- [ ] **13d.6** `POST /api/v1/activities/:id/rubric` — attach rubric to activity
- [ ] **13d.7** Register in `main.py`

### Frontend — Rubric Builder
- [ ] **13d.8** `frontend/src/components/teacher/RubricBuilder.tsx` (new)
  - Dynamic criteria rows — add/remove criteria
  - Each criterion: name, description, N performance levels (score + label + description)
  - Max score auto-calculated from levels
  - Preview panel showing what student will see
- [ ] **13d.9** `frontend/src/pages/teacher/RubricsPage.tsx` (new) — list + create/edit rubrics
- [ ] **13d.10** Route `/teacher/rubrics` + `/teacher/rubrics/new` + `/teacher/rubrics/:id` in `App.tsx`
- [ ] **13d.11** `ActivityManager.tsx` — add "Attach Rubric" dropdown (list teacher's rubrics) in the activity form
- [ ] **13d.12** `ActivityPreview.tsx` — show rubric criteria when a rubric is attached (so teacher can see what student will be graded on)

### Student-facing
- [ ] **13d.13** `SessionPage.tsx` — show rubric criteria to student BEFORE they start capturing (so they know what's expected)
- [ ] **13d.14** After session: student can self-assess against rubric before submitting

### Teacher scoring
- [ ] **13d.15** `TeacherSubmissionsPage.tsx` — when viewing a student submission, show rubric scoring interface: click on level per criterion → auto-calculate total score
- [ ] **13d.16** Save rubric scores to DB: `POST /api/v1/sessions/:id/rubric-score` with `{ criteria_scores: {...}, total_score, feedback }`

---

## BLOCK 13e — Student View in Teacher Activity Creation
_`ActivityPreview.tsx` shows the teacher's view of an activity. Need a dedicated
"Preview as Student" mode showing exactly what a student would see on their phone._

- [ ] **13e.1** Add "Preview as Student" button to `ActivityManager.tsx` form header
  - Opens modal or navigates to `/teacher/activities/:id/student-preview`
- [ ] **13e.2** `StudentActivityPreview` component — renders activity as student would see it:
  - Activity title, description, location (map pin)
  - Phase progression: Orient → Observe → Capture → Reflect
  - Learning objectives displayed as student-friendly prompts ("What will you discover?")
  - Rubric criteria shown (if rubric attached): "You'll be assessed on..."
  - Capture toolbar preview (photo/audio/text/sketch buttons — non-functional in preview)
  - Socratic prompts sample from question DB for this activity's subject/grade/bloom level
- [ ] **13e.3** Mobile preview frame — wrap the student view in a phone-shaped frame so teacher can see exactly how it looks on a student's device
- [ ] **13e.4** Add route `/teacher/activities/:id/student-preview` to `App.tsx`

---

## BLOCK 14 — Privacy Engine Completion
_This is a major differentiator. Backend service + DB + seed data + admin UI all exist.
Gaps are: DB migration not verified run, consent UI missing, parent rights flow missing,
age gate missing at signup, retention job missing, and several wiring issues._

### 14a — Foundation (verify it actually works end-to-end)
- [ ] **14a.1** Run Alembic migration if not already done — verify `compliance_rules`, `rule_audit_log`, `consent_records` tables exist in DB
  ```
  docker exec peripateticware-backend alembic upgrade head
  docker exec peripateticware-postgres psql -U peripateticware_user -d peripateticware -c "\dt compliance*"
  ```
- [ ] **14a.2** Run seed script to populate jurisdiction rules (FERPA, COPPA, GDPR, CCPA, LGPD, PIPEDA)
  ```
  docker exec peripateticware-backend python /app/migrations/002_seed_privacy_rules.py
  ```
- [ ] **14a.3** Test `GET /api/v1/privacy/status` returns active rule count > 0
- [ ] **14a.4** Test `GET /api/v1/privacy/jurisdictions` returns seeded rules
- [ ] **14a.5** Fix `API_BASE` in `AdminPrivacyConfigPage.tsx` — currently uses `VITE_API_URL` which includes `/api/v1` but calls are also appending `/api/v1` → double prefix bug
- [ ] **14a.6** Delete `privacy_engine.txt` from project root — prototype replaced by `backend/services/privacy_engine.py`

### 14b — Age Gate + COPPA Compliance (legally required for K-12)
- [ ] **14b.1** Add `date_of_birth` or `age` field to signup form for student role — or at minimum a "confirm you are 13+" checkbox
- [ ] **14b.2** Backend: if student age < 13, set `requires_parental_consent = True` on user record and block login until parent consent granted
- [ ] **14b.3** Add `age_group` column to `users` table (under_13 / under_16 / under_18 / adult) — Alembic migration
- [ ] **14b.4** Privacy engine already has `AgeGroup` enum — wire it to user creation in `auth.py` signup handler
- [ ] **14b.5** Block under-13 accounts from data-collecting features (location, audio capture) until parental consent recorded in `consent_records`

### 14c — Parental Consent Flow (COPPA requirement)
- [ ] **14c.1** New page: `frontend/src/pages/ParentConsentPage.tsx`
  - Parent receives email with consent link (token-based)
  - Page shows: what data is collected, why, retention period, how to withdraw
  - "I consent" → POST `/api/v1/privacy/consent` → creates `consent_records` row
  - "I do not consent" → student account remains restricted
- [ ] **14c.2** Backend: `POST /api/v1/privacy/consent` endpoint — creates/updates `consent_records`
- [ ] **14c.3** Backend: `GET /api/v1/privacy/consent/:student_hash` — returns current consent status (for parent portal)
- [ ] **14c.4** Backend: existing `DELETE /api/v1/privacy/consent/:student_hash` already exists for withdrawal ✅ — verify it works
- [ ] **14c.5** Add route `/parent-consent/:token` to `App.tsx` (public route, no auth required)
- [ ] **14c.6** Parent dashboard: show consent status for each child with "Manage" button → Customer Portal equivalent for privacy

### 14d — Student Data Rights (FERPA / GDPR / CCPA)
- [ ] **14d.1** `GET /api/v1/privacy/my-data` — student can download all their data as JSON (FERPA right to access, GDPR portability)
- [ ] **14d.2** `DELETE /api/v1/privacy/my-data` — student (or parent) can request full deletion (GDPR right to erasure, CCPA)
  - Anonymize rather than hard-delete learning records (preserve aggregate stats)
  - Purge: PII fields, location history, captured evidence, audio/video
- [ ] **14d.3** Frontend: "My Data" section in student settings page — download + delete request buttons
- [ ] **14d.4** Frontend: "My Child's Data" section in parent settings — same controls on behalf of child
- [ ] **14d.5** Audit log entry for every data access, export, and deletion request (already logged via `log_access` in some routes — verify consistent coverage)

### 14e — Privacy Check Integration (activity creation flow)
- [ ] **14e.1** `activities.py` `create_activity` — call `privacy_locations.check_activity_compliance` before saving; block or warn if location is in a restricted jurisdiction
- [ ] **14e.2** `activities.py` `publish_activity` — run full compliance check at publish time, not just create time; return clear error if fails
- [ ] **14e.3** `ActivityManager.tsx` — show privacy compliance status badge on the activity form
  - Green "Compliant" / Yellow "Review needed" / Red "Blocked"
  - Call `POST /api/v1/privacy/check` when teacher fills in location + grade level
- [ ] **14e.4** Student capture flow (`SessionPage.tsx`) — call `checkDataCompliance()` before audio/video capture; respect `students_can_create_field_notes` from `ClassSettings`

### 14f — Data Retention Enforcement
- [ ] **14f.1** Create `backend/tasks/retention_cleanup.py` — scheduled job (runs daily via cron or at-startup schedule)
  - Query `compliance_rules` for retention policies per data category
  - Delete or anonymize records past their retention window
  - Log every deletion to `rule_audit_log`
- [ ] **14f.2** Add retention cleanup to docker-compose as a scheduled service or wire to existing batch processing pipeline
- [ ] **14f.3** Student evidence (photos, audio, video) — delete from file storage when retention expires, not just DB record

### 14g — Privacy Transparency (user-facing)
- [ ] **14g.1** Privacy status widget on landing page footer — "Your data is protected under: FERPA, COPPA" (auto-populated from active jurisdictions)
- [ ] **14g.2** Cookie consent banner — minimal, CCPA/GDPR compliant — appears on first visit, stored in localStorage
  - Only functional cookies (auth token) — no tracking cookies to consent to
  - Simple "This site uses cookies for login only. Got it." is sufficient
- [ ] **14g.3** `PrivacyPage.tsx` (already exists) — populate with real content from active jurisdiction rules pulled from `/api/v1/privacy/status`; make it dynamic not static text
- [ ] **14g.4** Data collection disclosure shown to students on first session login: what is captured, where it goes, who can see it

### 14h — Admin Privacy Dashboard (complete what's started)
- [ ] **14h.1** `AdminPrivacyConfigPage.tsx` — fix API_BASE double-prefix bug (14a.5)
- [ ] **14h.2** Add jurisdiction rule diff viewer — show what changed between versions (already have `version_history` in the schema)
- [ ] **14h.3** `AdminAuditLogPage.tsx` — add filter by student hash, by data type, by compliance status; already has date filter ✅
- [ ] **14h.4** Admin dashboard privacy widget: live counts of active consents, pending consent requests, recent audit entries
- [ ] **14h.5** Alert system: flag audit entries with `compliance_status = 'VIOLATION'` → show badge in admin nav

### 14i — Marketing / Differentiator Surfaces
- [ ] **14i.1** "Privacy First" section on landing page — call out FERPA/COPPA/GDPR compliance explicitly
- [ ] **14i.2** Trust badge component — reusable, shows active frameworks as icons/chips (FERPA ✓, COPPA ✓, etc.)
- [ ] **14i.3** Privacy comparison page or section — "What we collect vs. what we don't" — students can see their own data footprint
- [ ] **14i.4** Include privacy engine as a selling point on pricing page (premium tier = multi-jurisdiction support)

---

## BLOCK 15 — Stripe Payments (US only, initial launch)

**Decisions needed first:**
- [ ] **14.0** Confirm pricing model — which of these? (pick before writing any code)
  - Per-teacher subscription (e.g. $X/month per teacher seat)
  - Per-school/district subscription (flat fee, unlimited teachers)
  - Freemium (free tier with limits, paid for AI features / storage)
  - One-time purchase per academic year

**Stripe account setup (pre-code):**
- [ ] **14.1** Create Stripe account at stripe.com → get Test API keys (Publishable + Secret)
- [ ] **14.2** Create Product(s) + Price(s) in Stripe Dashboard (match chosen pricing model)
- [ ] **14.3** Add to `.env`: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] **14.4** Add Stripe keys to `docker-compose.yml` backend environment block

**Backend — `backend/routes/payments.py` (new file):**
- [ ] **14.5** `POST /api/v1/payments/create-checkout-session` — creates Stripe Checkout session, returns URL
- [ ] **14.6** `POST /api/v1/payments/webhook` — receives Stripe events (checkout.session.completed, subscription events)
  - On `checkout.session.completed`: mark user/org as paid, set subscription tier in DB
  - On `customer.subscription.deleted`: downgrade to free tier
- [ ] **14.7** `GET /api/v1/payments/subscription-status` — returns current user's tier (free/paid/trial)
- [ ] **14.8** `POST /api/v1/payments/customer-portal` — creates Stripe Customer Portal session (self-serve cancel/upgrade)
- [ ] **14.9** Register router in `backend/main.py`

**Database:**
- [ ] **14.10** Add to `users` table (or separate `subscriptions` table):
  - `stripe_customer_id` (VARCHAR)
  - `subscription_tier` (free / pro / school — matches Stripe product)
  - `subscription_status` (active / past_due / canceled / trialing)
  - `subscription_expires_at` (DateTime, nullable)
- [ ] **14.11** Create Alembic migration for new columns

**Frontend:**
- [ ] **14.12** `frontend/src/services/payments.ts` — `createCheckoutSession()`, `getSubscriptionStatus()`, `openCustomerPortal()`
- [ ] **14.13** Pricing/upgrade page — `frontend/src/pages/PricingPage.tsx`
  - Show plan tiers, features per tier, CTA button → triggers Stripe Checkout
  - Add route `/pricing` (public) in `App.tsx`
- [ ] **14.14** Add upgrade prompt in settings pages when user hits a paid-tier feature
- [ ] **14.15** Gate AI activity generation behind paid tier (free tier gets X uses/month or no AI)
- [ ] **14.16** Add Stripe Publishable Key to `.env`: `VITE_STRIPE_PUBLISHABLE_KEY`
- [ ] **14.17** Install `@stripe/stripe-js` in frontend: `npm install @stripe/stripe-js`

**Backend dependency:**
- [ ] **14.18** Install `stripe` in backend container: add `stripe` to `backend/requirements.txt`

**Testing (use Stripe test mode):**
- [ ] **14.19** Test checkout flow with Stripe test card `4242 4242 4242 4242`
- [ ] **14.20** Test webhook locally using Stripe CLI: `stripe listen --forward-to localhost:8000/api/v1/payments/webhook`
- [ ] **14.21** Test subscription cancellation → user downgraded to free tier
- [ ] **14.22** Test customer portal (self-serve billing management)

**US-only compliance notes:**
- Stripe handles all PCI compliance — no card data touches your server ✅
- USD pricing only for now — set `currency: "usd"` in all Stripe API calls
- FERPA note: Stripe receives only billing contact info, not student data ✅
- Add brief privacy policy mention that billing is handled by Stripe

---

## Priority Order If Time Runs Short

Must do (foundation): Blocks 1, 2, 3, 4, 5
Core features: Blocks 6, 7, 9, 10, 13b, 13c (routing + pages), 13d (rubrics backend + builder)
High value differentiators: Blocks 13e (student preview), 14a+14b (privacy foundation), 14g+14i (privacy marketing)
Multi-session features: Blocks 11 (Socratic DB), 13c.7–13c.9 (scavenger hunt flow), 14c (consent UI), 14f (retention job), 15 (Stripe)
Polish: Blocks 8, 12, 13, 14h

---

## Quick Reference — Key Files

| What | File |
|------|------|
| Backend router registration | `backend/main.py` |
| Auth routes | `backend/routes/auth.py` |
| AI inference | `backend/routes/inference.py` |
| Teacher Zustand store | `frontend/src/stores/teacher.ts` |
| Auth Zustand store | `frontend/src/stores/auth.ts` |
| Vite proxy | `frontend/vite.config.ts` |
| App routes | `frontend/src/App.tsx` |
| ORM models | `backend/models/database.py` |
| i18n translations | `frontend/dist/locales/en/landing.json` |
| CSS / design tokens | `frontend/src/index.css` |
| Sign up screen | `frontend/src/components/auth/SignUpScreen.tsx` |
| Crow components | `frontend/src/components/Crow*.tsx` |
| Privacy engine service | `backend/services/privacy_engine.py` |
| Privacy routes | `backend/routes/privacy.py` + `privacy_locations.py` |
| Compliance models | `backend/models/compliance.py` |
| Privacy seed | `backend/migrations/002_seed_privacy_rules.py` |
| Privacy migration | `backend/alembic/versions/20260527_privacy_engine_tables.py` |
| Privacy utils (frontend) | `frontend/src/utils/privacy.ts` |
| Admin privacy UI | `frontend/src/pages/AdminPrivacyConfigPage.tsx` |
| Admin audit log UI | `frontend/src/pages/AdminAuditLogPage.tsx` |
| Payments routes | `backend/routes/payments.py` (new) |
| Payments frontend | `frontend/src/services/payments.ts` (new) |
| Pricing page | `frontend/src/pages/PricingPage.tsx` (new) |
