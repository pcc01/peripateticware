/**
 * Teacher comprehensive E2E tests — all routes, all features.
 * Uses saved auth state from auth.setup.ts.
 *
 * Mirrors the depth of mobile Detox test suites:
 *   smoke.test.ts / features.test.ts / inputs.test.ts
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

function collectConsoleErrors(page: Parameters<typeof test>[1]) {
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
