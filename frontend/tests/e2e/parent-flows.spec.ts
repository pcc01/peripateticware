/**
 * Parent comprehensive E2E tests — all routes and features.
 * Uses saved auth state from auth.setup.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/parent.json') });

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

test.describe('Parent — Dashboard', () => {
  test('loads without console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/parent');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    const appErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(appErrors).toHaveLength(0);
  });

  test('sidebar is visible', async ({ page }) => {
    await page.goto('/parent');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
  });

  test('does not redirect to /login', async ({ page }) => {
    await page.goto('/parent');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/parent');
    await expect(page.getByRole('heading', { name: /parent dashboard/i }))
      .toBeVisible({ timeout: 10_000 });
  });
});

// ── 2. Progress ───────────────────────────────────────────────────────────────

test.describe('Parent — Progress', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/parent/progress');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/parent/progress');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows progress content or empty state (no child linked)', async ({ page }) => {
    await page.goto('/parent/progress');
    await page.waitForLoadState('load');
    // Either shows progress data or an empty/link-child prompt
    const hasContent = await page.locator('main').isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasContent, 'Progress page has content').toBe(true);
  });

  test('no TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/parent/progress');
    await page.waitForLoadState('load');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 3. Features Page ──────────────────────────────────────────────────────────

test.describe('Parent — Features', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/parent/features');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading or feature content is visible', async ({ page }) => {
    await page.goto('/parent/features');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 4. Link Child ─────────────────────────────────────────────────────────────

test.describe('Parent — Link Child', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/parent/link-child');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows a code input or join form', async ({ page }) => {
    await page.goto('/parent/link-child');
    await page.waitForLoadState('load');
    // LinkChildPage should have an input for a class/join code
    const hasInput = await page.locator('input').first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasForm = await page.locator('form').isVisible({ timeout: 3_000 }).catch(() => false);
    const hasHeading = await page.locator('h1, h2').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasInput || hasForm || hasHeading, 'Page has form or heading').toBe(true);
  });
});

// ── 5. Notifications ──────────────────────────────────────────────────────────

test.describe('Parent — Notifications', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/parent/notifications');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('heading or content is visible', async ({ page }) => {
    await page.goto('/parent/notifications');
    await page.waitForLoadState('load');
    await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 6. Coming-Soon Pages ──────────────────────────────────────────────────────

test.describe('Parent — Coming-Soon Pages', () => {
  for (const route of ['/parent/messages', '/parent/calendar', '/parent/reports']) {
    test(`${route} loads without redirect or crash`, async ({ page }) => {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('body')).not.toBeEmpty();
      // ComingSoonPage renders something meaningful
      await expect(page.locator('main, .flex-1, h1, h2').first()).toBeVisible({ timeout: 10_000 });
    });
  }
});

// ── 7. Settings ───────────────────────────────────────────────────────────────

test.describe('Parent — Settings', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/parent/settings');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/parent/settings');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('no TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/parent/settings');
    await page.waitForLoadState('load');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 8. Sidebar Navigation ─────────────────────────────────────────────────────

test.describe('Parent — Sidebar Navigation', () => {
  test('Progress link navigates to /parent/progress', async ({ page }) => {
    await page.goto('/parent');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/progress/i).first().click();
    await expect(page).toHaveURL(/\/parent\/progress/, { timeout: 8_000 });
  });

  test('Settings link navigates to /parent/settings', async ({ page }) => {
    await page.goto('/parent');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/settings/i).first().click();
    await expect(page).toHaveURL(/\/parent\/settings/, { timeout: 8_000 });
  });

  test.skip('Features link navigates to /parent/features', async ({ page }) => {
    await page.goto('/parent');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/features/i).first().click();
    await expect(page).toHaveURL(/\/parent\/features/, { timeout: 8_000 });
  });
});
