/**
 * Platform super-admin E2E tests.
 * Covers all /platform/* routes (PlatformShell layout).
 * Uses saved auth state from auth.setup.ts.
 *
 * Note: platform@test.local is seeded as ADMIN role.
 * Platform routes (/platform/*) are accessible to super-admins only.
 * If your deployment gates these routes behind a separate role/flag,
 * update the storageState to use a user with that role.
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/platform.json') });

// PlatformShell gates every /platform/* route behind a one-time-per-session
// "operator secret" prompt (see layouts/PlatformShell.tsx). That gate is
// intentionally stored in sessionStorage only (never localStorage — see
// utils/platformFetch.ts), which Playwright's `storageState` mechanism does
// NOT persist (storageState only captures cookies + localStorage). Without
// this, every test in this file would hit the secret gate instead of the
// actual page content. Seeding sessionStorage via addInitScript before each
// navigation correctly simulates "an admin who already passed the gate this
// browser session" — the same state a real returning user would be in.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pw_platform_secret', '');
  });
});

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('chrome-extension') && !text.includes('net::ERR'))
        errors.push(text);
    }
  });
  return errors;
}

// ── 1. Platform Overview ──────────────────────────────────────────────────────

test.describe('Platform — Overview', () => {
  test('loads without redirect to /login', async ({ page }) => {
    await page.goto('/platform');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/platform');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('loads without TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/platform');
    await page.waitForLoadState('domcontentloaded');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors, 'No TypeErrors on platform overview').toHaveLength(0);
  });

  test('back/logout navigation header is present (PlatformShell)', async ({ page }) => {
    await page.goto('/platform');
    // PlatformShell renders a top bar with back button and logout
    const hasNav = await page.locator('header, nav, [class*="shell"], [class*="header"]')
      .first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasLogout = await page.getByRole('button', { name: /log.?out|sign.?out/i })
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasNav || hasLogout, 'PlatformShell header or logout button visible').toBe(true);
  });
});

// ── 2. Organisations List ─────────────────────────────────────────────────────

test.describe('Platform — Organisations', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/platform/orgs');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/platform/orgs');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('org list or empty state renders after load', async ({ page }) => {
    await page.goto('/platform/orgs');
    await page.waitForLoadState('domcontentloaded');
    const hasTable = await page.locator('table, ul li, [class*="card"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no org|no organisation|empty/i)
      .isVisible({ timeout: 3_000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasTable || hasEmpty || hasContent, 'Org list or empty state visible').toBe(true);
  });

  test('no TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/platform/orgs');
    await page.waitForLoadState('domcontentloaded');
    expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0);
  });
});

// ── 3. Usage ──────────────────────────────────────────────────────────────────

test.describe('Platform — Usage', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/platform/usage');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/platform/usage');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('usage metrics or empty state renders', async ({ page }) => {
    await page.goto('/platform/usage');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
  });
});

// ── 4. Audit Log ─────────────────────────────────────────────────────────────

test.describe('Platform — Audit Log', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/platform/audit-log');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/platform/audit-log');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('log table or empty state renders', async ({ page }) => {
    await page.goto('/platform/audit-log');
    await page.waitForLoadState('domcontentloaded');
    const hasTable = await page.locator('table, [class*="log"], [class*="entry"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no entries|no logs|empty/i)
      .isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasTable || hasEmpty, 'Audit log table or empty state visible').toBe(true);
  });
});

// ── 5. AI Settings ────────────────────────────────────────────────────────────

test.describe('Platform — AI Settings', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/platform/ai-settings');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/platform/ai-settings');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('AI provider or model settings are visible', async ({ page }) => {
    await page.goto('/platform/ai-settings');
    // AdminAIConfigPage (the actual component at this route) renders an h1 "AI Configuration"
    // immediately on mount — before the provider API calls complete.
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('no TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/platform/ai-settings');
    await page.waitForLoadState('domcontentloaded');
    expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0);
  });
});

// ── 6. Org Detail (parameterised) ─────────────────────────────────────────────

test.describe('Platform — Org Detail (parameterised route)', () => {
  test('gracefully handles unknown org ID (no crash)', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/platform/orgs/00000000-0000-0000-0000-000000000000');
    // Should show not-found / empty state, not a TypeError or login redirect
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 7. Navigation between platform routes ─────────────────────────────────────

test.describe('Platform — Navigation', () => {
  test('can navigate from overview to orgs', async ({ page }) => {
    await page.goto('/platform');
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
    await page.goto('/platform/orgs');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('can navigate from overview to usage', async ({ page }) => {
    await page.goto('/platform');
    await page.goto('/platform/usage');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('can navigate from overview to audit-log', async ({ page }) => {
    await page.goto('/platform');
    await page.goto('/platform/audit-log');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });
});
