# Peripateticware — E2E Test Suite

**Last updated:** June 2026  
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

| File | Tests | Covers |
|------|------:|--------|
| `teacher-flows.spec.ts` | 49 | Dashboard, activities, rubrics, standards, shared library, classrooms, sidebar nav |
| `targeted-flows.spec.ts` | 38 | Shared library empty/error state, rubric builder CRUD, standards import, privacy JSON |
| `student-flows.spec.ts` | 36 | Dashboard, field notes, inquiry, progress, submissions |
| `platform-flows.spec.ts` | 22 | Platform admin: users, orgs, analytics, system settings |
| `parent-flows.spec.ts` | 20 | Dashboard, progress, link-child, notifications, sidebar nav |
| `admin-flows.spec.ts` | 20 | Admin dashboard, standards, user management, privacy config |
| `homeschool-flows.spec.ts` | 18 | Dashboard, portfolio, rubrics, curriculum |
| `auth-flows.spec.ts` | 10 | Login/signup/forgot-password UI, guards, post-login redirect, logout |
| `public-pages.spec.ts` | 4 | Landing, privacy, terms, cookies, footer links |
| `smoke.spec.ts` | 1 | Always-passes canary |
| **Total** | **218** | |

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
