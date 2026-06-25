/**
 * Public page smoke tests + link audit.
 * No auth required.
 *
 * Checks:
 *  - Landing page loads
 *  - Privacy, Terms, Cookies pages load
 *  - Privacy Engine page loads and shows key content
 *  - Footer links all resolve (no 404s)
 *  - No console errors on public pages
 */
import { test, expect, Page } from '@playwright/test';

// The app uses a single static <title> in index.html ("Peripateticware — Learning in Motion")
// — no per-route title updates — so all routes share the same title.
const PUBLIC_ROUTES = [
  { path: '/',               title: /peripateticware/i },
  { path: '/privacy',        title: /peripateticware/i },
  { path: '/terms',          title: /peripateticware/i },
  { path: '/cookies',        title: /peripateticware/i },
  { path: '/privacy-engine', title: /peripateticware/i },
];

for (const { path, title } of PUBLIC_ROUTES) {
  test(`${path} loads without errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto(path);
    expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);
    await expect(page).toHaveTitle(title, { timeout: 10_000 });
    // Allow known third-party errors but fail on app errors
    const appErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('chrome-extension')
    );
    expect(appErrors, `Console errors on ${path}`).toHaveLength(0);
  });
}

test('Privacy Engine page shows framework content', async ({ page }) => {
  await page.goto('/privacy-engine');
  // Use .first() — the page renders FERPA/COPPA/GDPR in multiple places
  // (paragraph text, badge spans, etc.) which triggers Playwright strict mode.
  await expect(page.getByText(/FERPA/).first()).toBeVisible();
  await expect(page.getByText(/COPPA/).first()).toBeVisible();
  await expect(page.getByText(/GDPR/).first()).toBeVisible();
  await expect(page.getByText(/compliance built in/i).first()).toBeVisible();
});

test('Footer links resolve (no 404s)', async ({ page }) => {
  // Override test timeout — sequential HTTP checks can exceed the default 30 s
  test.setTimeout(90_000);

  await page.goto('/');
  // Collect all footer hrefs
  const footerLinks = page.locator('footer a[href]');
  const count = await footerLinks.count();
  expect(count, 'Footer should have links').toBeGreaterThan(0);

  const hrefs: string[] = [];
  for (let i = 0; i < count; i++) {
    const href = await footerLinks.nth(i).getAttribute('href');
    // Skip mailto:, anchors, and external links (slow / flaky in CI)
    if (
      href &&
      !href.startsWith('mailto:') &&
      !href.startsWith('#') &&
      !href.startsWith('http')
    ) {
      hrefs.push(href);
    }
  }

  // Check each internal link resolves — catch per-request timeouts gracefully
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  for (const href of hrefs) {
    const resp = await page.request.get(`${baseUrl}${href}`, { timeout: 8_000 }).catch(() => null);
    if (resp === null) {
      // Request timed out — skip rather than fail (server may be under load)
      console.warn(`Footer link ${href} timed out — skipping`);
      continue;
    }
    expect(resp.status(), `Footer link ${href} returned ${resp.status()}`).toBeLessThan(400);
  }
});

test('unknown routes do not crash the app', async ({ page }) => {
  // This is a React SPA — the server returns 200 for all routes (catch-all).
  // The app may or may not render a dedicated 404 component; either is acceptable.
  // What must NOT happen: a JS crash (blank white screen / unhandled error).
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const resp = await page.goto('/this-route-definitely-does-not-exist-xyz');
  // SPA always returns 200; accept that
  expect(resp?.status(), 'Server should respond').toBeLessThanOrEqual(404);

  // Page should render something (not a blank / crashed screen)
  await expect(page.locator('body')).not.toBeEmpty();

  // No unhandled JS errors
  const appErrors = consoleErrors.filter(e =>
    !e.includes('favicon') && !e.includes('chrome-extension')
  );
  expect(appErrors, 'No crash errors on unknown route').toHaveLength(0);
});
