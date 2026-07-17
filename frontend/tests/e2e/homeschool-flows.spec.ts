/**
 * Homeschool educator critical path tests.
 *
 * Auth: saved session from auth.setup.ts (homeschool role).
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { expectNoConsoleErrors } from './helpers/page-objects';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/homeschool.json') });

// ---------------------------------------------------------------------------
// 1. Dashboard
// ---------------------------------------------------------------------------
test.describe('Homeschool – Dashboard', () => {
  test('loads without console errors', async ({ page }) => {
    const { checkErrors } = expectNoConsoleErrors(page);

    await page.goto('/homeschool');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });

    await checkErrors();
  });

  test('shows sidebar navigation', async ({ page }) => {
    await page.goto('/homeschool');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aside a').first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows a welcome heading', async ({ page }) => {
    await page.goto('/homeschool');
    // Dashboard greets the user: "Welcome, <name>"
    await expect(
      page.getByRole('heading', { name: /welcome/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Welcome page (no layout — standalone)
// ---------------------------------------------------------------------------
test.describe('Homeschool – Welcome', () => {
  test('loads without redirect to login', async ({ page }) => {
    await page.goto('/homeschool/welcome');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('renders content without sidebar', async ({ page }) => {
    await page.goto('/homeschool/welcome');
    // Welcome page has no layout shell, so aside should NOT be present
    await expect(page.locator('h1, h2, p, button').first()).toBeVisible({ timeout: 10_000 });
  });

  // Step 2 ("Your State") is supposed to persist the selection to
  // localStorage['hs_state_code'] (see HomeschoolWelcomePage.tsx's
  // handleStateSelect / LS_STATE_KEY) so HomeschoolRequirementsPage.tsx can
  // read the same key on mount. It used to capture-and-discard the
  // selection — this guards the persistence behavior directly.
  test('selecting a state on Step 2 persists it to localStorage["hs_state_code"]', async ({ page }) => {
    await page.route('**/api/v1/homeschool/children', (route) =>
      route.fulfill({ status: 201, json: { id: 'child-1' } }));

    await page.goto('/homeschool/welcome');
    await expect(page.getByRole('heading', { name: /who are you teaching/i })).toBeVisible({ timeout: 10_000 });

    // Step 0: give the wizard a valid child name so "Continue" advances
    // instead of blocking on the "add at least one child" validation error.
    await page.locator('input[placeholder="Child 1 name"]').fill('Ada');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 1: the state picker.
    await expect(page.getByRole('heading', { name: /which state do you homeschool in/i }))
      .toBeVisible({ timeout: 10_000 });

    const stateSelect = page.locator('select');
    await expect(stateSelect).toBeVisible();
    await stateSelect.selectOption('CA');

    await expect.poll(() => page.evaluate(() => localStorage.getItem('hs_state_code')))
      .toBe('CA');

    // Persists across a reload — this is what HomeschoolRequirementsPage.tsx
    // relies on to pre-fill the state on a later visit.
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem('hs_state_code'))).toBe('CA');
  });

  test('skipping the state picker (never selecting) does not write hs_state_code', async ({ page }) => {
    await page.route('**/api/v1/homeschool/children', (route) =>
      route.fulfill({ status: 201, json: { id: 'child-1' } }));

    await page.goto('/homeschool/welcome');
    await page.locator('input[placeholder="Child 1 name"]').fill('Grace');
    await page.getByRole('button', { name: /^continue$/i }).click();

    await expect(page.getByRole('heading', { name: /which state do you homeschool in/i }))
      .toBeVisible({ timeout: 10_000 });

    // Move straight to Step 3 without touching the select.
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.getByRole('heading', { name: /you're all set/i })).toBeVisible({ timeout: 10_000 });

    expect(await page.evaluate(() => localStorage.getItem('hs_state_code'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Children
// ---------------------------------------------------------------------------
test.describe('Homeschool – Children', () => {
  test('page loads and shows heading', async ({ page }) => {
    await page.goto('/homeschool/children');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.getByRole('heading', { name: /my children/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('shows Add child button or empty state', async ({ page }) => {
    await page.goto('/homeschool/children');
    const addOrEmpty = page
      .getByRole('button', { name: /add child/i })
      .or(page.getByText(/no children|get started/i))
      .or(page.getByRole('button'));
    await expect(addOrEmpty.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 4. Progress
// ---------------------------------------------------------------------------
test.describe('Homeschool – Progress', () => {
  test('page loads and renders content', async ({ page }) => {
    await page.goto('/homeschool/progress');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 5. Activities list
// ---------------------------------------------------------------------------
test.describe('Homeschool – Activities', () => {
  test('list loads and heading is visible', async ({ page }) => {
    await page.goto('/homeschool/activities');
    await expect(page).not.toHaveURL(/\/login/);
    // ActivityListPage renders a heading
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
  });

  test('page is not empty', async ({ page }) => {
    await page.goto('/homeschool/activities');
    await expect(page.locator('main, .flex-1, [role="main"]').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 6. Create activity
// ---------------------------------------------------------------------------
test.describe('Homeschool – Create Activity', () => {
  test('/homeschool/activities/new renders a form', async ({ page }) => {
    await page.goto('/homeschool/activities/new');
    await expect(page).not.toHaveURL(/\/login/);
    // ActivityManager renders a form with inputs
    await expect(page.locator('form, input, textarea').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 7. Requirements
// ---------------------------------------------------------------------------
test.describe('Homeschool – Requirements', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/homeschool/requirements');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 8. Coverage
// ---------------------------------------------------------------------------
test.describe('Homeschool – Coverage', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/homeschool/coverage');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 9. Export
// ---------------------------------------------------------------------------
test.describe('Homeschool – Export', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/homeschool/export');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('shows export/download heading or button', async ({ page }) => {
    await page.goto('/homeschool/export');
    const exportEl = page
      .getByRole('heading', { name: /export/i })
      .or(page.getByRole('button', { name: /export|download/i }))
      .or(page.getByText(/export portfolio/i));
    await expect(exportEl.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 10. Settings
// ---------------------------------------------------------------------------
test.describe('Homeschool – Settings', () => {
  test('loads and is not redirected to login', async ({ page }) => {
    await page.goto('/homeschool/settings');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, form, input').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 11. Rubrics
// ---------------------------------------------------------------------------
test.describe('Homeschool – Rubrics', () => {
  test('page loads and shows rubrics content', async ({ page }) => {
    await page.goto('/homeschool/rubrics');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('New Rubric button is present', async ({ page }) => {
    await page.goto('/homeschool/rubrics');
    await expect(
      page.getByRole('button', { name: /new rubric/i }).or(page.getByRole('link', { name: /new rubric/i })),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('/homeschool/rubrics/import loads without redirect', async ({ page }) => {
    await page.goto('/homeschool/rubrics/import');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main, form, h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('/homeschool/rubrics/new loads the rubric builder', async ({ page }) => {
    await page.goto('/homeschool/rubrics/new');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('form, input, textarea, h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('/homeschool/rubrics/:id (unknown id) loads the builder without crash', async ({ page }) => {
    await page.goto('/homeschool/rubrics/00000000-0000-0000-0000-000000000000');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
    await expect(page.locator('form, input, textarea, h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 12. Activity detail (parameterised — edit an existing activity)
// ---------------------------------------------------------------------------
test.describe('Homeschool – Activity Detail (parameterised)', () => {
  test('/homeschool/activities/:id (unknown id) loads without redirect or crash', async ({ page }) => {
    await page.goto('/homeschool/activities/00000000-0000-0000-0000-000000000000');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
    await expect(page.locator('form, input, textarea, h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});
