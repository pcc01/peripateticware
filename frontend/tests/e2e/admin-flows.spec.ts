/**
 * Admin critical path tests.
 *
 * Auth: saved session from auth.setup.ts (admin role).
 * All routes require the admin role — ProtectedRoute redirects others to /.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { expectNoConsoleErrors } from './helpers/page-objects';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/admin.json') });

// ---------------------------------------------------------------------------
// 1. Dashboard
// ---------------------------------------------------------------------------
test.describe('Admin – Dashboard', () => {
  test('loads without console errors', async ({ page }) => {
    const { checkErrors } = expectNoConsoleErrors(page);

    await page.goto('/admin');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });

    await checkErrors();
  });

  test('shows sidebar navigation', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aside a').first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows Admin Dashboard heading', async ({ page }) => {
    await page.goto('/admin');
    // h1 "Admin Dashboard" is always rendered immediately — it is no longer gated
    // behind the data-loading state (fix: inline spinner below the header).
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Users
// ---------------------------------------------------------------------------
test.describe('Admin – Users', () => {
  test('page loads with Users heading', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.getByRole('heading', { name: /user management|users/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('renders user table or list', async ({ page }) => {
    await page.goto('/admin/users');
    // The page renders a search input and/or a user list
    const tableOrSearch = page
      .locator('table, [role="table"]')
      .or(page.locator('input[placeholder*="search" i]'))
      .or(page.getByPlaceholder(/search/i));
    await expect(tableOrSearch.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 3. Classes
// ---------------------------------------------------------------------------
test.describe('Admin – Classes', () => {
  test('page loads with heading visible', async ({ page }) => {
    await page.goto('/admin/classes');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 4. Analytics
// ---------------------------------------------------------------------------
test.describe('Admin – Analytics', () => {
  test('page loads with Analytics heading', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page).not.toHaveURL(/\/login/);
    // h1 "Analytics" is always rendered immediately — no longer gated behind data load.
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible({ timeout: 10_000 });
  });

  test('renders charts or section headings', async ({ page }) => {
    await page.goto('/admin/analytics');
    // h2 sections appear after the two API calls complete.
    // Wait for loading to clear, then check for section headings.
    await page.getByText(/loading/i).waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// 5. System
// ---------------------------------------------------------------------------
test.describe('Admin – System', () => {
  test('page loads and has system settings content', async ({ page }) => {
    await page.goto('/admin/system');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, form, input').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 6. Privacy config
// ---------------------------------------------------------------------------
test.describe('Admin – Privacy Config', () => {
  test('page loads and has privacy settings', async ({ page }) => {
    await page.goto('/admin/privacy');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, form, input').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 7. Audit log
// ---------------------------------------------------------------------------
test.describe('Admin – Audit Log', () => {
  test('page loads and shows log content or empty state', async ({ page }) => {
    await page.goto('/admin/logs');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, table, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 8. Standards
// ---------------------------------------------------------------------------
test.describe('Admin – Standards', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/admin/standards');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 9. AI Config
// ---------------------------------------------------------------------------
test.describe('Admin – AI Config', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/admin/ai-config');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main, form').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 10. Rubrics
// ---------------------------------------------------------------------------
test.describe('Admin – Rubrics', () => {
  test('rubrics list loads', async ({ page }) => {
    await page.goto('/admin/rubrics');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('"New Rubric" button is present', async ({ page }) => {
    await page.goto('/admin/rubrics');
    await expect(
      page.getByRole('button', { name: /new rubric/i }).or(page.getByRole('link', { name: /new rubric/i })),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('/admin/rubrics/new loads the rubric builder', async ({ page }) => {
    await page.goto('/admin/rubrics/new');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('form, input, textarea, h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('/admin/rubrics/:id (unknown id) loads the builder without crash', async ({ page }) => {
    await page.goto('/admin/rubrics/00000000-0000-0000-0000-000000000000');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
    await expect(page.locator('form, input, textarea, h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 11. Curriculum import
// ---------------------------------------------------------------------------
test.describe('Admin – Curriculum Import', () => {
  test('page loads and shows upload UI', async ({ page }) => {
    await page.goto('/admin/curriculum/import');
    await expect(page).not.toHaveURL(/\/login/);
    // CurriculumImportPage has a file upload or description text
    const uploadEl = page
      .locator('input[type="file"]')
      .or(page.getByText(/upload|import|pdf|csv/i))
      .or(page.getByRole('button', { name: /import|upload/i }));
    await expect(uploadEl.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 12. Help
// ---------------------------------------------------------------------------
test.describe('Admin – Help', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/admin/help');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 13. Settings
// ---------------------------------------------------------------------------
test.describe('Admin – Settings', () => {
  test('page loads with settings content', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.getByRole('heading', { name: /admin settings/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('has appearance and account sections', async ({ page }) => {
    await page.goto('/admin/settings');
    // AdminSettingsPage renders h2 sections: Appearance, System Management, etc.
    await expect(
      page.getByRole('heading', { level: 2, name: /appearance|system|account/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
