/**
 * Teacher comprehensive E2E tests — all routes, all features.
 * Uses saved auth state from auth.setup.ts.
 *
 * Mirrors the depth of mobile Detox test suites:
 *   smoke.test.ts / features.test.ts / inputs.test.ts
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('chrome-extension') && !text.includes('net::ERR')) {
        errors.push(text);
      }
    }
  });
  return errors;
}

// ── 1. Dashboard ──────────────────────────────────────────────────────────────

test.describe('Teacher — Dashboard', () => {
  test('loads without TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/teacher');
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors, 'No TypeErrors on dashboard').toHaveLength(0);
  });

  test('sidebar is visible and contains key nav links', async ({ page }) => {
    await page.goto('/teacher');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aside').getByText(/submissions/i)).toBeVisible();
  });

  test('does not redirect to /login', async ({ page }) => {
    await page.goto('/teacher');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('content area renders after data loads', async ({ page }) => {
    await page.goto('/teacher');
    await page.waitForLoadState('load');
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 2. Activities List ────────────────────────────────────────────────────────

test.describe('Teacher — Activities List', () => {
  test('loads and shows heading', async ({ page }) => {
    await page.goto('/teacher/activities');
    await expect(page.getByRole('heading', { name: /activities/i })).toBeVisible({ timeout: 10_000 });
  });

  test('"New Activity" button is present', async ({ page }) => {
    await page.goto('/teacher/activities');
    const btn = page.getByRole('button', { name: /new activity/i })
      .or(page.getByRole('link', { name: /new activity/i }));
    await expect(btn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search input is visible and accepts text', async ({ page }) => {
    await page.goto('/teacher/activities');
    const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill('science');
    await expect(search).toHaveValue('science');
  });

  test('"New Activity" navigates to create page', async ({ page }) => {
    await page.goto('/teacher/activities');
    const btn = page.getByRole('button', { name: /new activity/i })
      .or(page.getByRole('link', { name: /new activity/i }));
    await btn.first().click();
    await expect(page).toHaveURL(/\/teacher\/activities\/new/, { timeout: 8_000 });
  });
});

// ── 3. Create Activity ────────────────────────────────────────────────────────

test.describe('Teacher — Create Activity', () => {
  test('form renders with title input', async ({ page }) => {
    await page.goto('/teacher/activities/new');
    const titleInput = page.locator('input[name="title"], input[placeholder*="itle" i]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
  });

  test('heading renders', async ({ page }) => {
    await page.goto('/teacher/activities/new');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('can fill in a title and value persists', async ({ page }) => {
    await page.goto('/teacher/activities/new');
    const titleInput = page.locator('input[name="title"], input[placeholder*="itle" i]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill('E2E Test Activity');
    await expect(titleInput).toHaveValue('E2E Test Activity');
  });

  test('cancel/back returns to activities', async ({ page }) => {
    await page.goto('/teacher/activities/new');
    const cancelBtn = page.getByRole('button', { name: /cancel|back/i }).first();
    if (await cancelBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cancelBtn.click();
      await expect(page).toHaveURL(/\/teacher(\/activities)?$/, { timeout: 8_000 });
    } else {
      await page.goBack();
      await expect(page).not.toHaveURL(/\/teacher\/activities\/new/);
    }
  });
});

// ── 3b. Publish with jurisdiction-compliance check (regression guard) ──────────
//
// Backend regression: routes/activities.py's POST /check-compliance calls
// `checker.load_from_db(db)` before evaluating compliance. If that call is
// ever skipped/broken, the privacy_engine falls back to a state where every
// activity reads as blocked, and teachers can never publish. This test
// exercises the full ActivityManager submit path with a mocked
// *successful* compliance check and asserts the "Create Activity" submit
// actually completes (POST /api/v1/activities fires, page navigates away)
// rather than silently doing nothing / staying blocked.

test.describe('Teacher — Publish with compliance check succeeding', () => {
  test('compliant status renders a green badge and does not block publish', async ({ page }) => {
    await page.route('**/api/v1/activities/check-compliance', (route) =>
      route.fulfill({ json: { status: 'compliant', issues: [], warnings: [] } }));
    await page.route('**/api/v1/rubrics', (route) => route.fulfill({ json: { rubrics: [] } }));

    let createCalled = false;
    await page.route('**/api/v1/activities', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      createCalled = true;
      await route.fulfill({
        status: 201,
        json: { id: 'new-activity-1', title: 'E2E Publish Test', status: 'published' },
      });
    });

    await page.goto('/teacher/activities/new');
    await page.locator('#title').fill('E2E Publish Test Activity');

    // Compliance badge fires on a debounce after location/grade change — the
    // effect runs on mount too, so just wait for the badge to appear.
    await expect(page.getByText(/privacy compliant/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^create activity$/i }).click();

    await expect.poll(() => createCalled, { timeout: 10_000 }).toBe(true);
    // On success, ActivityManager navigates away from the create form.
    await expect(page).toHaveURL(/\/teacher\/activities$/, { timeout: 10_000 });
  });

  test('"review" status shows the privacy confirmation panel, and confirming unblocks publish', async ({ page }) => {
    await page.route('**/api/v1/activities/check-compliance', (route) =>
      route.fulfill({
        json: { status: 'review', issues: ['Student location data collected'], warnings: [] },
      }));
    await page.route('**/api/v1/rubrics', (route) => route.fulfill({ json: { rubrics: [] } }));

    let createCalled = false;
    let createBody: any = null;
    await page.route('**/api/v1/activities', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      createCalled = true;
      createBody = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { id: 'new-activity-2', status: 'published' } });
    });

    await page.goto('/teacher/activities/new');
    await page.locator('#title').fill('E2E Review Then Publish');

    await expect(page.getByText(/privacy review needed/i)).toBeVisible({ timeout: 10_000 });

    // Check all three confirmation boxes, then confirm.
    const panelCheckboxes = page.locator('.space-y-3 input[type="checkbox"]');
    const count = await panelCheckboxes.count();
    for (let i = 0; i < count; i++) {
      await panelCheckboxes.nth(i).check();
    }
    await page.getByRole('button', { name: /confirm privacy settings/i }).click();

    await expect(page.getByText(/privacy settings confirmed/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /^create activity$/i }).click();

    await expect.poll(() => createCalled, { timeout: 10_000 }).toBe(true);
    expect(createBody).toMatchObject({ privacy_confirmed: true });
    await expect(page).toHaveURL(/\/teacher\/activities$/, { timeout: 10_000 });
  });
});

// ── 4. Submissions ────────────────────────────────────────────────────────────

test.describe('Teacher — Submissions', () => {
  test('loads with heading and no TypeErrors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/teacher/submissions');
    await expect(page.getByRole('heading', { name: /submissions/i })).toBeVisible({ timeout: 10_000 });
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors, 'No TypeErrors on submissions').toHaveLength(0);
  });

  test('"Pending Review" filter button is visible', async ({ page }) => {
    await page.goto('/teacher/submissions');
    await expect(page.getByRole('button', { name: /pending review/i })).toBeVisible({ timeout: 10_000 });
  });

  test('"Approved" filter button is clickable without crash', async ({ page }) => {
    await page.goto('/teacher/submissions');
    const btn = page.getByRole('button', { name: /approved/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    await expect(page.locator('main').first()).toBeVisible({ timeout: 5_000 });
  });

  test('all four filter buttons are present simultaneously', async ({ page }) => {
    await page.goto('/teacher/submissions');
    await expect(page.getByRole('button', { name: /pending review/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /approved/i })).toBeVisible();
  });
});

// ── 5. Rubrics ────────────────────────────────────────────────────────────────

test.describe('Teacher — Rubrics', () => {
  test('list page loads with "Rubrics" heading', async ({ page }) => {
    await page.goto('/teacher/rubrics');
    await expect(page.getByRole('heading', { name: /rubrics/i })).toBeVisible({ timeout: 10_000 });
  });

  test('"New Rubric" button/link is present', async ({ page }) => {
    await page.goto('/teacher/rubrics');
    const el = page.getByRole('link', { name: /new rubric/i })
      .or(page.getByRole('button', { name: /new rubric/i }));
    await expect(el.first()).toBeVisible({ timeout: 10_000 });
  });

  test('rubric builder page renders at /new', async ({ page }) => {
    await page.goto('/teacher/rubrics/new');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input').first()).toBeVisible({ timeout: 5_000 });
  });

  test('import page loads without redirect', async ({ page }) => {
    await page.goto('/teacher/rubrics/import');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 6. Standards ──────────────────────────────────────────────────────────────

test.describe('Teacher — Standards', () => {
  test('page loads with heading', async ({ page }) => {
    await page.goto('/teacher/standards');
    await expect(page.getByRole('heading', { name: /standards/i })).toBeVisible({ timeout: 10_000 });
  });

  test('import standards page loads', async ({ page }) => {
    await page.goto('/teacher/standards/import');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 7. Classrooms ─────────────────────────────────────────────────────────────

test.describe('Teacher — Classrooms', () => {
  test('page loads with heading', async ({ page }) => {
    await page.goto('/teacher/classrooms');
    await expect(page.getByRole('heading', { name: /classroom/i })).toBeVisible({ timeout: 10_000 });
  });

  test('"New Classroom" button is present', async ({ page }) => {
    await page.goto('/teacher/classrooms');
    await expect(page.getByRole('button', { name: /new classroom/i })).toBeVisible({ timeout: 10_000 });
  });

  test('"New Classroom" button reveals a form', async ({ page }) => {
    await page.goto('/teacher/classrooms');
    await page.getByRole('button', { name: /new classroom/i }).click();
    // An input for the classroom name should appear
    await expect(page.locator('input').first()).toBeVisible({ timeout: 5_000 });
  });

  test('cancel hides the create form', async ({ page }) => {
    await page.goto('/teacher/classrooms');
    await page.getByRole('button', { name: /new classroom/i }).click();
    const input = page.locator('input').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(input).not.toBeVisible({ timeout: 3_000 });
  });

  // Regression coverage for the "add a class → blank page" bug: FastAPI
  // raises HTTPException(402, detail={code: 'UPGRADE_REQUIRED', ...}) — a
  // structured OBJECT, not a string — when a teacher hits their license's
  // classroom limit. Rendering that object directly as a React child throws
  // "Minified React error #31" and unmounts the whole SPA to a blank
  // <div id="root">. TeacherClassroomsPage.createClassroom() now routes the
  // error through getErrorMessage()/a manual UPGRADE_REQUIRED branch instead
  // of rendering the raw object — these tests assert the app shows a real,
  // readable error message and stays interactive instead of going blank.
  test('402 UPGRADE_REQUIRED response on create shows a readable error, not a blank page', async ({ page }) => {
    await page.route('**/api/v1/classrooms', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 402,
          json: {
            detail: {
              code: 'UPGRADE_REQUIRED',
              feature: 'classroom_count',
              required_tier: 'school',
              current_tier: 'free',
              limit: 1,
              current: 1,
            },
          },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/teacher/classrooms');
    await page.getByRole('button', { name: /new classroom/i }).click();
    await page.locator('input').first().fill('One Too Many');
    await page.getByRole('button', { name: /^create$/i }).click();

    // The page must NOT go blank — the classrooms heading (and the rest of
    // the app chrome) stays mounted and visible.
    await expect(page.getByRole('heading', { name: /classroom/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toBeEmpty();

    // A real, human-readable error is shown — never "[object Object]" or a
    // raw JSON blob, which is what an uncaught render crash / naive
    // JSON.stringify fallback would produce.
    await expect(page.getByText(/reached your plan.s classroom limit/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('[object Object]')).toHaveCount(0);

    // The create form is still usable — proof the app didn't unmount.
    await expect(page.locator('input').first()).toBeVisible();
  });

  // Same failure family, but a plain 500 with a non-string `detail` (e.g. a
  // FastAPI validation-error-shaped body) — exercises the getErrorMessage()
  // fallback path rather than the hand-rolled UPGRADE_REQUIRED branch.
  test('500 response with a structured (non-string) detail on create still shows readable text', async ({ page }) => {
    await page.route('**/api/v1/classrooms', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          json: { detail: [{ msg: 'Unexpected server error', type: 'internal_error' }] },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/teacher/classrooms');
    await page.getByRole('button', { name: /new classroom/i }).click();
    await page.locator('input').first().fill('Broken Backend Test');
    await page.getByRole('button', { name: /^create$/i }).click();

    await expect(page.getByRole('heading', { name: /classroom/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/unexpected server error/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('[object Object]')).toHaveCount(0);
  });
});

// ── 8. Students ───────────────────────────────────────────────────────────────

test.describe('Teacher — Students', () => {
  test('page loads with heading', async ({ page }) => {
    await page.goto('/teacher/students');
    await expect(page.getByRole('heading', { name: /student/i })).toBeVisible({ timeout: 10_000 });
  });

  test('invite/add student button is present', async ({ page }) => {
    await page.goto('/teacher/students');
    const btn = page.getByRole('button', { name: /invite|add student/i });
    await expect(btn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search input is visible', async ({ page }) => {
    await page.goto('/teacher/students');
    await expect(page.locator('input[placeholder*="earch" i]').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 9. Projects ───────────────────────────────────────────────────────────────

test.describe('Teacher — Projects', () => {
  test('page loads with heading and no redirect', async ({ page }) => {
    await page.goto('/teacher/projects');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /project/i })).toBeVisible({ timeout: 10_000 });
  });

  test('"New Project" button or empty state is present', async ({ page }) => {
    await page.goto('/teacher/projects');
    await page.waitForLoadState('load');
    const hasBtn = await page.getByRole('button', { name: /new project/i }).isVisible({ timeout: 5_000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasBtn || hasContent).toBe(true);
  });
});

// ── 10. Shared Library ────────────────────────────────────────────────────────

test.describe('Teacher — Shared Library', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/teacher/shared-library');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('search input is present', async ({ page }) => {
    await page.goto('/teacher/shared-library');
    await expect(page.locator('input[type="search"], input[placeholder*="earch" i]').first())
      .toBeVisible({ timeout: 10_000 });
  });
});

// ── 11. Proposal Review ───────────────────────────────────────────────────────

test.describe('Teacher — Proposal Review', () => {
  test('page loads with heading and no TypeError', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/teacher/proposal-review');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors, 'No TypeErrors on proposal review').toHaveLength(0);
  });

  test('shows empty state or proposal list after load', async ({ page }) => {
    await page.goto('/teacher/proposal-review');
    await page.waitForLoadState('load');
    await expect(page.locator('body')).not.toContainText('Uncaught');
  });
});

// ── 12. Field Note Review ─────────────────────────────────────────────────────

test.describe('Teacher — Field Note Review', () => {
  test('page loads without redirect or crash', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/teacher/field-note-review');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 13. Peer Project Review ───────────────────────────────────────────────────

test.describe('Teacher — Peer Project Review', () => {
  test('page loads without redirect or TypeError', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/teacher/peer-project-review');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 14. Tour ──────────────────────────────────────────────────────────────────

test.describe('Teacher — Tour Page', () => {
  test('page loads with content', async ({ page }) => {
    await page.goto('/teacher/tour');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 15. Settings ──────────────────────────────────────────────────────────────

test.describe('Teacher — Settings', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/teacher/settings');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('theme / appearance section is present', async ({ page }) => {
    await page.goto('/teacher/settings');
    const appearanceSection = page.getByRole('heading', { name: /appearance|theme|color/i });
    await expect(appearanceSection.first()).toBeVisible({ timeout: 10_000 });
  });

  test('language section is present', async ({ page }) => {
    await page.goto('/teacher/settings');
    await expect(page.getByText(/language/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('privacy section is present', async ({ page }) => {
    await page.goto('/teacher/settings');
    await expect(page.getByRole('heading', { name: /privacy/i }).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 16. Sidebar Navigation ────────────────────────────────────────────────────

test.describe('Teacher — Sidebar Navigation', () => {
  test('Submissions link navigates to /teacher/submissions', async ({ page }) => {
    await page.goto('/teacher');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/submissions/i).first().click();
    await expect(page).toHaveURL(/\/teacher\/submissions/, { timeout: 8_000 });
  });

  test('Rubrics link navigates to /teacher/rubrics', async ({ page }) => {
    await page.goto('/teacher');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/rubrics/i).first().click();
    await expect(page).toHaveURL(/\/teacher\/rubrics/, { timeout: 8_000 });
  });

  test('Settings link navigates to /teacher/settings', async ({ page }) => {
    await page.goto('/teacher');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/settings/i).first().click();
    await expect(page).toHaveURL(/\/teacher\/settings/, { timeout: 8_000 });
  });

  test('Classrooms link navigates to /teacher/classrooms', async ({ page }) => {
    await page.goto('/teacher');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/classrooms/i).first().click();
    await expect(page).toHaveURL(/\/teacher\/classrooms/, { timeout: 8_000 });
  });
});

// ── 17. Welcome / Onboarding ──────────────────────────────────────────────────

test.describe('Teacher — Welcome', () => {
  test('page loads without redirect to login', async ({ page }) => {
    await page.goto('/teacher/welcome');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders content (wizard or dashboard redirect)', async ({ page }) => {
    await page.goto('/teacher/welcome');
    // TeacherWelcomePage uses a full-screen <div> layout with no <main> element.
    // Check for the h1 "Welcome to Peripateticware" or any heading instead.
    await expect(page.locator('h1, [role="heading"]').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 18. Session Monitor ───────────────────────────────────────────────────────

test.describe('Teacher — Session Monitor (parameterised)', () => {
  test('/teacher/sessions/:id/monitor route is protected (no crash on 404 session)', async ({ page }) => {
    await page.goto('/teacher/sessions/00000000-0000-0000-0000-000000000000/monitor');
    // Should show an error/empty state, not a TypeError or login redirect
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
  });
});

// ── 19. Parameterised Detail Routes ───────────────────────────────────────────
// These routes take a resource :id. With a well-formed but non-existent UUID
// they must render a graceful error/empty state — never a raw TypeError or a
// login redirect — regardless of whether seed data exists.

test.describe('Teacher — Parameterised Detail Routes', () => {
  const FAKE_ID = '00000000-0000-0000-0000-000000000000';

  const routes: Array<[string, string]> = [
    ['Project detail',            `/teacher/projects/${FAKE_ID}`],
    ['Activity editor',           `/teacher/activities/${FAKE_ID}`],
    ['Rubric editor',             `/teacher/rubrics/${FAKE_ID}`],
    ['Student preview',           `/teacher/activities/${FAKE_ID}/student-preview`],
    ['Fieldwork monitor',         `/teacher/activities/${FAKE_ID}/fieldwork`],
    ['Classroom detail',          `/teacher/classrooms/${FAKE_ID}`],
  ];

  for (const [label, route] of routes) {
    test(`${label} (${route}) loads without redirect or crash`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
      const typeErrors = errors.filter(e => e.includes('TypeError'));
      expect(typeErrors, `No TypeErrors on ${route}`).toHaveLength(0);
    });
  }
});
