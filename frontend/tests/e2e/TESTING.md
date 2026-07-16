# Peripateticware — E2E Test Suite

**Last updated:** July 2026  
**Runner:** Playwright · Chromium only  
**Base URL:** `http://localhost:3000` (Docker stack)

---

## Quick Start

```powershell
# 1. Start the stack (from repo root)
docker compose up -d

# 2. Run all tests
cd frontend
npx playwright test --project=chromium

# 3. Run a single spec
npx playwright test tests/e2e/targeted-flows.spec.ts --project=chromium

# 4. Open the HTML report
npx playwright show-report
```

---

## Test Accounts

All seeded in `backend/main.py` startup. Password for every account: **`SecurePass123!`**

| Role | Email |
|------|-------|
| Teacher | `teacher@example.com` |
| Student | `student@example.com` |
| Parent | `parent@example.com` |
| Admin | `admin@example.com` |
| Homeschool | `homeschool@example.com` |
| Platform admin | `admin@example.com` (same user, ADMIN role) |

Override any account via environment variables:
```
TEST_TEACHER_EMAIL / TEST_TEACHER_PASSWORD
TEST_STUDENT_EMAIL / TEST_STUDENT_PASSWORD
TEST_PARENT_EMAIL  / TEST_PARENT_PASSWORD
TEST_ADMIN_EMAIL   / TEST_ADMIN_PASSWORD
TEST_HOMESCHOOL_EMAIL / TEST_HOMESCHOOL_PASSWORD
TEST_PLATFORM_EMAIL   / TEST_PLATFORM_PASSWORD
```

Auth state is saved to `tests/e2e/.auth/*.json` by `auth.setup.ts` and reused
by all spec files — no test re-logs in through the UI.

---

## Spec Files

| File | Covers |
|------|--------|
| `teacher-flows.spec.ts` | Dashboard, activities, rubrics, standards, shared library, classrooms, sidebar nav, **and parameterised detail routes** (project/:id, activity/:id, rubric/:id, student-preview, fieldwork, classroom/:id) |
| `targeted-flows.spec.ts` | Shared library empty/error state, rubric builder CRUD, standards import, privacy JSON |
| `student-flows.spec.ts` | Dashboard, field notes, inquiry, progress, submissions, **and parameterised detail routes** (field-notes/:id, self-projects/:id, peer-projects/:id, proposals/:id, reflection/:id, activities/:id, session/:id) |
| `platform-flows.spec.ts` | Platform admin: overview, orgs (incl. org detail), usage, audit log, AI settings, navigation |
| `parent-flows.spec.ts` | Dashboard, progress, features, link-child, notifications, coming-soon pages (messages/calendar/reports), settings, sidebar nav |
| `admin-flows.spec.ts` | Admin dashboard, users, classes, analytics, system, privacy, logs, standards, AI config, rubrics (list/new/**:id**), curriculum import, help, settings |
| `homeschool-flows.spec.ts` | Dashboard, welcome, children, progress, activities (list/new/**:id**), requirements, coverage, export, settings, rubrics (list/**import/new/:id**) |
| `auth-flows.spec.ts` | Login/signup/forgot-password UI, guards (student/teacher/parent/admin/**homeschool**), **platform gate behaviour**, post-login redirect, logout |
| `public-pages.spec.ts` | Landing, privacy, terms, cookies, privacy-engine, **about/origin, do-not-sell, licensing, request-beta, maintenance, verify-email-pending, reset-password, verify-email, privacy-confirmed, parent-consent/:token**, footer links, unknown-route handling |
| `accessibility.spec.ts` | WCAG 2.1 A/AA (axe-core) on public pages: landing, login, signup, privacy, terms, do-not-sell, privacy-engine |
| `smoke.spec.ts` | Always-passes canary |

Bold text above marks coverage added in the July 2026 pass to close gaps between
the route table in `App.tsx` and the spec files (see "Recently Added Coverage" below).

---

## Recently Added Coverage (July 2026)

A route-by-route audit of `src/App.tsx` against the spec files turned up ~30 routes
with no test coverage. All are now covered:

- **Public pages** — `/about/origin`, `/do-not-sell` (incl. the CCPA opt-out form
  submit), `/licensing`, `/request-beta`, `/maintenance`, `/verify-email-pending`
  were added to `public-pages.spec.ts`. Token-driven pages (`/reset-password`,
  `/verify-email`, `/privacy-confirmed`, `/parent-consent/:token`, including the
  GPS-consent query-param mode) got their own `describe` blocks asserting a
  graceful state with no token / a bogus token, since seeding a real signed token
  isn't practical in E2E.
- **Auth guards** — `/homeschool` was added to the redirect-to-`/login` guard loop
  in `auth-flows.spec.ts`. `/platform` was *not* added to that loop — it uses its
  own `PlatformShell` operator-secret gate rather than `<ProtectedRoute>`, so a
  new test documents that (intentionally) different behaviour instead.
- **Parameterised detail routes** — every route that takes a `:id` and previously
  had zero coverage now has a "loads without redirect or crash" test using a
  well-formed but non-existent UUID, matching the existing pattern used by
  `platform-flows.spec.ts` (org detail) and `teacher-flows.spec.ts` (session
  monitor):
  - Teacher: `/teacher/projects/:id`, `/teacher/activities/:id`,
    `/teacher/rubrics/:id`, `/teacher/activities/:id/student-preview`,
    `/teacher/activities/:id/fieldwork`, `/teacher/classrooms/:id`
  - Student: `/student/field-notes/:id`, `/student/self-projects/:id`,
    `/student/peer-projects/:id`, `/student/proposals/:id`,
    `/student/reflection/:id`, `/student/activities/:id`, `/session/:id`
  - Admin: `/admin/rubrics/:id`
  - Homeschool: `/homeschool/activities/:id`, `/homeschool/rubrics/:id`
- **Homeschool rubrics** — `/homeschool/rubrics/import` and
  `/homeschool/rubrics/new` had routes but no tests; added to
  `homeschool-flows.spec.ts`.

These are "does it render without crashing" tests, not full CRUD flows — creating
real fixture data for each detail route is out of scope for this pass and is
still tracked under "What to Test Next" below.

---

## Known Issues Documented in Tests

### App bugs (tests pass but document the problem)

- **`targeted-flows.spec.ts` line 235** — `RubricsPage` has `<Link to="/teacher/rubrics/new">` but
  that route uses `requiredRole="teacher"`, so a **HOMESCHOOL user is redirected to `/`** on click.
  Fix: either add `/homeschool/rubrics/new` route or change the link to be role-aware.

### Permanently skipped tests (real gaps in test data)

- **`student-flows.spec.ts`** — Three activity-detail tests are skipped: `'No activities in DB'`.
  They need at least one seeded activity assigned to the student account.

- **`parent-flows.spec.ts`** — `'Features link navigates to /parent/features'` is skipped.
  The `ParentLayout` sidebar has no "Features" nav item even though the route exists.

### Design decisions

- **`public-pages.spec.ts`** — Title assertions use `/peripateticware/i` for all routes.
  The SPA has a single static `<title>` in `index.html`; there is no per-route document title.

---

## Configuration

**`playwright.config.ts`** key settings:

```ts
baseURL:       'http://localhost:3000'   // Docker frontend
retries:       0 (local), 2 (CI)
fullyParallel: true
workers:       6 (local default)
projects:      setup → chromium
```

Firefox and mobile-Safari are commented out. Install browsers and uncomment
the projects array to enable them:
```
npx playwright install firefox webkit
```

**`tests/e2e/tsconfig.json`** uses `"module": "CommonJS"` and `"moduleResolution": "node"`
to avoid conflicts with Vite's ESM bundler settings. All spec files also include the ESM
`__dirname` shim:
```ts
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
```

---

## What to Test Next (Next Thread)

These areas have zero or incomplete coverage and are the most likely places
for deeper regressions to hide.

### Priority 1 — Full CRUD flows (data-round-trip tests)

Currently tests only verify that pages *load*. Need tests that:

1. **Rubric full lifecycle** — Create → verify in list → edit title → delete → verify gone.
   The API is ready (`POST/PUT/DELETE /api/v1/rubrics`); just needs test data cleanup.

2. **Activity creation + sharing** — Teacher creates activity → publishes to shared library
   (`share_scope: 'org'`) → verifies it appears under `/teacher/shared-library`.
   This would also un-skip the student activity-detail tests if a seeded activity exists.

3. **Standards set lifecycle** — Upload a small CSV via `ExtractionWizard` → verify set appears
   in `/teacher/standards` list → delete it.

4. **Parent child-linking** — Parent uses a join code to link to the seeded student →
   verifies student name appears in `/parent` dashboard. Currently no test covers this flow at all.

### Priority 2 — Submission pipeline

The teacher-judgment core of the app has no E2E coverage:

1. Student submits field notes on an activity.
2. Teacher sees the submission appear in `/teacher/submissions` or activity detail.
3. Teacher attaches a rubric and scores it.
4. Student sees the scored result.

Requires: at least one seeded activity assigned to the student account (fixes the skipped tests too).

### Priority 3 — Privacy catalog (new backend, no frontend yet)

Backend routes exist with no frontend page:
- `POST /api/v1/privacy/jurisdictions/onboard` — country auto-crawl trigger
- `/api/v1/privacy-catalog/*` — catalog-level regulation layer (assign/unassign)

When the frontend pages are built, add tests in `admin-flows.spec.ts` or a new
`privacy-catalog.spec.ts`.

### Priority 4 — AI / Ollama integration

- `InquiryInterface` in student flows uses Ollama. Tests currently avoid `networkidle`
  (replaced with `load`) because Ollama keeps connections open. Need:
  - A test that verifies the AI response panel renders when Ollama *is* available.
  - A test that verifies graceful fallback (error message, not crash) when Ollama is *down*.

### Priority 5 — Accessibility & cross-browser

- Run `@axe-core/playwright` on the main dashboards — the login form labels have no
  `htmlFor`/`id` associations (already broke two selector categories in this session).
- Re-enable Firefox project once `npx playwright install firefox` is run on the machine.

### Priority 6 — Admin user management

`admin-flows.spec.ts` covers page loads but not:
- Creating a new user via admin panel.
- Changing a user's role.
- Deactivating / reactivating a user.
- Verifying the changed user's session is invalidated.
