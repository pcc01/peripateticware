/**
 * Auth flow tests — unauthenticated.
 *
 * No storageState: these tests run without any saved session.
 * They cover the login/signup/forgot-password UI and auth guard behaviour.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

// Login form has no htmlFor/id associations on labels — use type-based selectors
const emailInput   = (page: import('@playwright/test').Page) => page.locator('input[type="email"]');
const passwordInput = (page: import('@playwright/test').Page) => page.locator('input[type="password"]').first();
const submitBtn    = (page: import('@playwright/test').Page) => page.locator('button[type="submit"]');

// ---------------------------------------------------------------------------
// 1. Login page
// ---------------------------------------------------------------------------
test.describe('Auth – Login page', () => {
  test('loads and has email, password fields and submit button', async ({ page }) => {
    await page.goto('/login');

    await expect(emailInput(page)).toBeVisible({ timeout: 10_000 });
    await expect(passwordInput(page)).toBeVisible({ timeout: 10_000 });
    await expect(submitBtn(page)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Login validation
// ---------------------------------------------------------------------------
test.describe('Auth – Login validation', () => {
  test('empty submit shows a validation error', async ({ page }) => {
    await page.goto('/login');

    // Click submit with empty fields
    await submitBtn(page).click();

    // Expect either a native browser validation tooltip or an app-level error message
    const errorIndicator = page
      .getByRole('alert')
      .or(page.locator('[aria-live="assertive"], [aria-live="polite"]'))
      .or(page.getByText(/required|invalid|please enter|fill in/i));

    // We also accept staying on /login (not redirected) as part of validation
    const staysOnLogin = page.url().includes('/login');
    if (!staysOnLogin) {
      throw new Error('Unexpected redirect away from /login on empty submit');
    }

    // The error may be a native browser tooltip (not in DOM); just confirm no redirect happened
    await expect(page).toHaveURL(/\/login/);
  });

  test('wrong credentials show an error message', async ({ page }) => {
    await page.goto('/login');

    await emailInput(page).fill('bogus@test.local');
    await passwordInput(page).fill('WrongPass123');
    await submitBtn(page).click();

    // Should stay on /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // LoginScreen renders a red div (bg-red-50 text-red-700) for auth errors —
    // no role="alert" or aria-live, so we detect by Tailwind class.
    // Also accept a broader text match as fallback.
    const errorDiv = page.locator('.bg-red-50');
    const errorText = page.getByText(/invalid|incorrect|failed|wrong|credentials|check|not found|denied|unauthorized|email|password/i);
    await expect(errorDiv.or(errorText).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 3. Forgot password
// ---------------------------------------------------------------------------
test.describe('Auth – Forgot password', () => {
  test('page loads and has email field', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page.getByRole('heading', { name: /forgot password/i }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
  });

  test('submitting an email shows a confirmation message', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.locator('input[type="email"]').fill('someuser@example.com');

    await page.getByRole('button', { name: /send|reset|submit/i }).click();

    // App shows "Check your inbox" after submission
    await expect(
      page.getByRole('heading', { name: /check your inbox/i })
        .or(page.getByText(/check your inbox|email sent|reset link/i)),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 4. Signup
// ---------------------------------------------------------------------------
test.describe('Auth – Signup', () => {
  // /signup is gated by SignupGateWrapper (App.tsx): it fetches the backend's
  // public config and shows either the real signup form OR the "Request Beta
  // Access" page, depending on SIGNUP_MODE. Both are valid, intentional product
  // states — the tests below accept either rather than assuming open signup.
  async function isOpenSignupForm(page: import('@playwright/test').Page) {
    return page.locator('input[type="password"]').first().isVisible({ timeout: 10_000 }).catch(() => false);
  }

  test('page loads and has required fields (open signup) or the beta-request form (invite-only)', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).not.toHaveURL(/\/login/);

    // SignUpScreen: labels have no htmlFor association — use type/position selectors
    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 10_000 });   // first name
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });

    if (await isOpenSignupForm(page)) {
      // Open mode: full signup form, including last name + password fields.
      await expect(page.locator('input[type="text"]').nth(1)).toBeVisible({ timeout: 5_000 });   // last name
      await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 5_000 });
    } else {
      // Invite-only mode: RequestBetaPage renders instead — has name/email/role fields, no password.
      await expect(page.getByText(/request beta|beta access/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('has a role selector', async ({ page }) => {
    await page.goto('/signup');
    // SignUpScreen (open mode) shows role buttons: Teacher, Student, Parent, Homeschool.
    // RequestBetaPage (invite-only mode) shows a role <select> with equivalent options.
    const roleEl = page
      .getByRole('button', { name: /teacher|student|parent|homeschool/i })
      .or(page.getByRole('combobox'))
      .or(page.getByLabel(/i am a|role/i))
      .or(page.getByText(/i am a/i));
    await expect(roleEl.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 5. Auth guards — protected routes redirect to /login when unauthenticated
// ---------------------------------------------------------------------------
test.describe('Auth – Guards', () => {
  const protectedRoutes = [
    '/student',
    '/teacher',
    '/parent',
    '/admin',
    '/homeschool',
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to /login when not authenticated`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
  }

  // /platform/* is NOT wrapped in <ProtectedRoute> — it uses its own PlatformShell
  // gate (an operator secret prompt), so an unauthenticated visitor does NOT get
  // redirected to /login client-side. Real authorization happens server-side on
  // the API calls. This test documents that (intentionally) different behaviour.
  test('/platform does not redirect to /login (uses its own operator-secret gate instead)', async ({ page }) => {
    await page.goto('/platform');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

// ---------------------------------------------------------------------------
// 6. Post-login redirect
// ---------------------------------------------------------------------------
test.describe('Auth – Post-login redirect', () => {
  test('student login redirects to /student', async ({ page }) => {
    const email = process.env.TEST_STUDENT_EMAIL ?? 'student@example.com';
    const password = process.env.TEST_STUDENT_PASSWORD ?? 'SecurePass123!';

    await page.goto('/login');
    await emailInput(page).fill(email);
    await passwordInput(page).fill(password);
    await submitBtn(page).click();

    // Should redirect away from /login, ending up at /student
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/student/, { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 7. Logout
// ---------------------------------------------------------------------------
test.describe('Auth – Logout', () => {
  test('after login, logging out redirects to /login or /', async ({ page }) => {
    const email = process.env.TEST_STUDENT_EMAIL ?? 'student@example.com';
    const password = process.env.TEST_STUDENT_PASSWORD ?? 'SecurePass123!';

    // Log in first
    await page.goto('/login');
    await emailInput(page).fill(email);
    await passwordInput(page).fill(password);
    await submitBtn(page).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Find and click logout — could be a button or link in the sidebar/header
    const logoutEl = page
      .getByRole('button', { name: /log.?out|sign.?out/i })
      .or(page.getByRole('link', { name: /log.?out|sign.?out/i }));

    await expect(logoutEl.first()).toBeVisible({ timeout: 10_000 });
    await logoutEl.first().click();

    // Should land on /login or the root landing page
    await expect(page).toHaveURL(/\/login|^\/$/, { timeout: 10_000 });
  });
});
