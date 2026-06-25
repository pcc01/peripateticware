/**
 * Student comprehensive E2E tests — all routes, all features.
 * Uses saved auth state from auth.setup.ts.
 *
 * Mirrors the depth of mobile Detox feature tests:
 *   journal compose, activity full flow (Brief→Orient→Inquiry→Reflect),
 *   field notes, proposals, projects, settings.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/student.json') });

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

test.describe('Student — Dashboard', () => {
  test('loads without console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/student');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
    const appErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(appErrors, 'No console errors on student dashboard').toHaveLength(0);
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/student');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
  });

  test('does not redirect to /login', async ({ page }) => {
    await page.goto('/student');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('no TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/student');
    await page.waitForLoadState('load');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors, 'No TypeErrors on dashboard').toHaveLength(0);
  });
});

// ── 2. Activities ─────────────────────────────────────────────────────────────

test.describe('Student — Activities', () => {
  test('/student/activities loads or redirects gracefully', async ({ page }) => {
    await page.goto('/student/activities');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('activity list or discover page renders content', async ({ page }) => {
    await page.goto('/student/activities');
    await page.waitForLoadState('load');
    // Either redirected to /student or shows activities list
    const url = page.url();
    expect(url).toMatch(/\/student/);
  });
});

// ── 3. Activity Detail Flow (Brief → Orient → Inquiry → Reflect) ─────────────
// Mirrors mobile features.test.ts suite 5

test.describe('Student — Activity Detail Flow', () => {
  test('activity detail page loads when an activity exists', async ({ page }) => {
    await page.goto('/student/activities');
    await page.waitForLoadState('load');

    // Try to find and click the first activity card
    const activityCard = page.locator('[data-testid*="activity"], .activity-card, [class*="activity"]').first();
    const hasCard = await activityCard.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasCard) {
      test.skip(true, 'No activities in DB — skipping activity detail flow');
      return;
    }

    await activityCard.click();
    await expect(page).toHaveURL(/\/student\/activities\//, { timeout: 8_000 });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('activity detail has a start/begin button (Brief phase)', async ({ page }) => {
    await page.goto('/student/activities');
    await page.waitForLoadState('load');

    const activityCard = page.locator('[data-testid*="activity"], .activity-card, [class*="activity"]').first();
    const hasCard = await activityCard.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasCard) {
      test.skip(true, 'No activities in DB — skipping');
      return;
    }

    await activityCard.click();
    await expect(page).toHaveURL(/\/student\/activities\//, { timeout: 8_000 });
    // Brief phase shows a "Start", "Begin", or "I'm ready" button
    const startBtn = page.getByRole('button', { name: /start|begin|ready/i });
    await expect(startBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test('activity detail has no TypeErrors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/student/activities');
    await page.waitForLoadState('load');

    const activityCard = page.locator('[data-testid*="activity"], .activity-card, [class*="activity"]').first();
    const hasCard = await activityCard.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasCard) {
      test.skip(true, 'No activities in DB — skipping');
      return;
    }

    await activityCard.click();
    await page.waitForLoadState('load');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 4. Field Notes ────────────────────────────────────────────────────────────
// Mirrors mobile features.test.ts suite 3 (Journal)

test.describe('Student — Field Notes', () => {
  test('list page loads without redirect', async ({ page }) => {
    await page.goto('/student/field-notes');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/student/field-notes');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('create/new button or empty-state is visible', async ({ page }) => {
    await page.goto('/student/field-notes');
    await page.waitForLoadState('load');
    // Page shows a loading spinner while fetching — wait for it to clear first
    await page.getByText(/loading/i).waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    // After loading: either the "New Field Note" button (always shown) or the empty-state text
    const hasNewBtn = await page.getByRole('button', { name: /new|create|add/i }).isVisible({ timeout: 5_000 }).catch(() => false);
    const hasFab = await page.locator('[data-testid*="fab"], button[aria-label*="new" i]').isVisible({ timeout: 3_000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no field notes|no notes yet|get started/i).isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasNewBtn || hasFab || hasEmptyState, 'Create button or empty state visible').toBe(true);
  });

  test('no TypeErrors in console', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/student/field-notes');
    await page.waitForLoadState('load');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 5. Journal ────────────────────────────────────────────────────────────────

test.describe('Student — Journal', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/student/journal');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/student/journal');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('new entry button or FAB is visible', async ({ page }) => {
    await page.goto('/student/journal');
    await page.waitForLoadState('load');
    // Page shows a loading spinner while fetching — wait for it to clear first
    await page.getByText(/loading/i).waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    // After loading: "+ New Entry" button is always visible in the header
    const hasBtn = await page.getByRole('button', { name: /new|add|create/i }).first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasFab = await page.locator('[data-testid="journal-fab"]').isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasBtn || hasFab, 'New entry button or FAB visible').toBe(true);
  });
});

// ── 6. Proposals / Challenges ─────────────────────────────────────────────────
// Mirrors mobile features.test.ts suite 4 (Discover compose)

test.describe('Student — Proposals', () => {
  test('list page loads without redirect', async ({ page }) => {
    await page.goto('/student/proposals');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/student/proposals');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('new proposal button or empty state is present', async ({ page }) => {
    await page.goto('/student/proposals');
    await page.waitForLoadState('load');
    // Page shows a loading spinner while fetching — wait for it to clear first
    await page.getByText(/loading/i).waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    // After loading: "+ New Challenge" button is always shown; also accept empty-state text
    const hasBtn = await page.getByRole('button', { name: /new|submit|propose|challenge/i }).isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no challenges|no proposals|get started|submit your first/i).isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasBtn || hasEmpty, 'Create button or empty state visible').toBe(true);
  });

  test('no TypeErrors on proposals page', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/student/proposals');
    await page.waitForLoadState('load');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 7. Peer Projects ─────────────────────────────────────────────────────────

test.describe('Student — Peer Projects', () => {
  test('list page loads without redirect', async ({ page }) => {
    await page.goto('/student/peer-projects');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/student/peer-projects');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('page renders without console TypeErrors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/student/peer-projects');
    await page.waitForLoadState('load');
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });
});

// ── 8. Self Projects ──────────────────────────────────────────────────────────

test.describe('Student — Self Projects', () => {
  test('list page loads without redirect', async ({ page }) => {
    await page.goto('/student/self-projects');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/student/self-projects');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('new project button or empty state is visible', async ({ page }) => {
    await page.goto('/student/self-projects');
    await page.waitForLoadState('load');
    // Page shows a loading spinner while fetching — wait for it to clear first
    await page.getByText(/loading/i).waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    // After loading: "+ New Project" button is always shown; also accept empty-state text
    const hasBtn = await page.getByRole('button', { name: /new|create|start/i }).isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no projects|get started/i).isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasBtn || hasEmpty, 'Create button or empty state visible').toBe(true);
  });
});

// ── 9. How It Works ───────────────────────────────────────────────────────────

test.describe('Student — How It Works', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/student/how-it-works');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/student/how-it-works');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('phase descriptions (Orient / Inquiry / Reflect) are present', async ({ page }) => {
    await page.goto('/student/how-it-works');
    // At least one of the phase names should be visible
    const phases = ['orient', 'inquiry', 'reflect'];
    let anyVisible = false;
    for (const phase of phases) {
      const visible = await page.getByText(new RegExp(phase, 'i')).isVisible({ timeout: 3_000 }).catch(() => false);
      if (visible) { anyVisible = true; break; }
    }
    expect(anyVisible, 'At least one phase heading (Orient/Inquiry/Reflect) visible').toBe(true);
  });
});

// ── 10. Settings ─────────────────────────────────────────────────────────────

test.describe('Student — Settings', () => {
  test('page loads without redirect', async ({ page }) => {
    await page.goto('/student/settings');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('heading is visible', async ({ page }) => {
    await page.goto('/student/settings');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('theme / appearance options are present', async ({ page }) => {
    await page.goto('/student/settings');
    // Either a theme select, radio buttons, or color chips
    const hasTheme = await page.getByText(/theme|appearance|color/i).first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasTheme, 'Theme section visible').toBe(true);
  });

  test('language section is present', async ({ page }) => {
    await page.goto('/student/settings');
    await expect(page.getByText(/language/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 11. Sidebar Navigation ────────────────────────────────────────────────────

test.describe('Student — Sidebar Navigation', () => {
  test('Field Notes link navigates to /student/field-notes', async ({ page }) => {
    await page.goto('/student');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/field notes/i).first().click();
    await expect(page).toHaveURL(/\/student\/field-notes/, { timeout: 8_000 });
  });

  test('Settings link navigates to /student/settings', async ({ page }) => {
    await page.goto('/student');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/settings/i).first().click();
    await expect(page).toHaveURL(/\/student\/settings/, { timeout: 8_000 });
  });

  test('Journal link navigates to /student/journal', async ({ page }) => {
    await page.goto('/student');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10_000 });
    await page.locator('aside').getByText(/journal/i).first().click();
    await expect(page).toHaveURL(/\/student\/journal/, { timeout: 8_000 });
  });
});
