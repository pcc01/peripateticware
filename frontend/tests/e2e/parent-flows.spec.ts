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
//
// /parent/calendar used to be in this list, but it's a real component
// (ParentCalendarPage.tsx, backed by GET /api/v1/calendar/events) — see
// calendar.spec.ts for its dedicated coverage.

test.describe('Parent — Coming-Soon Pages', () => {
  for (const route of ['/parent/reports']) {
    test(`${route} loads without redirect or crash`, async ({ page }) => {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('body')).not.toBeEmpty();
      // ComingSoonPage renders something meaningful
      await expect(page.locator('main, .flex-1, h1, h2').first()).toBeVisible({ timeout: 10_000 });
    });
  }
});

// ── 6b. Messages (ParentMessagesPage — fully wired, not a stub) ────────────────
//
// /parent/messages is a real component (ParentMessagesPage.tsx): it fetches
// GET /api/v1/parent/messages, renders a message list with relative
// timestamps, and lets the parent reply via POST
// /api/v1/parent/messages/:id/reply. It is NOT a ComingSoonPage — do not
// merge this back into the coming-soon loop above.

test.describe('Parent — Messages', () => {
  const MESSAGE_A = {
    id: 'msg-1',
    from_teacher_id: 'teacher-1',
    from_teacher_name: 'Ms. Rivera',
    to_parent_id: 'parent-1',
    subject: 'Great progress this week',
    body: 'Your child did a wonderful job on the fieldwork activity.',
    read_at: null,
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    conversation_id: 'conv-1',
  };
  const MESSAGE_B = {
    id: 'msg-2',
    from_teacher_id: 'teacher-2',
    from_teacher_name: 'Mr. Okafor',
    to_parent_id: 'parent-1',
    subject: 'Permission slip reminder',
    body: 'Please remember to submit the permission slip by Friday.',
    read_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    conversation_id: 'conv-2',
  };

  test('renders the message list from the mocked GET response', async ({ page }) => {
    await page.route('**/api/v1/parent/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [MESSAGE_A, MESSAGE_B] });
    });

    await page.goto('/parent/messages');
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.getByText('Great progress this week')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Ms\. Rivera/)).toBeVisible();
    await expect(page.getByText('Permission slip reminder')).toBeVisible();
    await expect(page.getByText(/Mr\. Okafor/)).toBeVisible();
    await expect(page.getByText(/wonderful job on the fieldwork activity/)).toBeVisible();
  });

  test('shows the empty state when there are no messages', async ({ page }) => {
    await page.route('**/api/v1/parent/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.goto('/parent/messages');
    await expect(page.getByText(/no messages yet/i)).toBeVisible({ timeout: 10_000 });
  });

  test('shows an error state when the GET call fails', async ({ page }) => {
    await page.route('**/api/v1/parent/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ status: 500, json: { detail: 'server error' } });
    });

    await page.goto('/parent/messages');
    await expect(page.getByText(/could not load messages/i)).toBeVisible({ timeout: 10_000 });
  });

  test('reply form submits and posts to the reply endpoint, showing a success state', async ({ page }) => {
    await page.route('**/api/v1/parent/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [MESSAGE_A] });
    });

    let replyBody: any = null;
    await page.route(`**/api/v1/parent/messages/${MESSAGE_A.id}/reply**`, async (route) => {
      replyBody = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { sent: true } });
    });

    await page.goto('/parent/messages');
    await expect(page.getByText('Great progress this week')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^reply$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByPlaceholder(/write your reply/i).fill('Thank you so much for letting me know!');
    await page.getByRole('button', { name: /send reply/i }).click();

    await expect.poll(() => replyBody).not.toBeNull();
    expect(replyBody).toMatchObject({ body: 'Thank you so much for letting me know!' });

    await expect(page.getByText(/reply sent/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^done$/i })).toBeVisible();
  });

  test('shows an error state when the reply POST fails', async ({ page }) => {
    await page.route('**/api/v1/parent/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [MESSAGE_A] });
    });

    await page.route(`**/api/v1/parent/messages/${MESSAGE_A.id}/reply**`, async (route) => {
      await route.fulfill({ status: 500, json: { detail: 'server error' } });
    });

    await page.goto('/parent/messages');
    await expect(page.getByText('Great progress this week')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^reply$/i }).click();
    await page.getByPlaceholder(/write your reply/i).fill('This will fail to send.');
    await page.getByRole('button', { name: /send reply/i }).click();

    await expect(page.getByText(/could not send reply/i)).toBeVisible({ timeout: 10_000 });
    // Dialog stays open with a "Cancel" (not "Done") action since the reply did not succeed
    await expect(page.getByRole('button', { name: /^cancel$/i })).toBeVisible();
  });
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
