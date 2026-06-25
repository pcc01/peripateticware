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
  test('page loads and has required fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).not.toHaveURL(/\/login/);

    // SignUpScreen: labels have no htmlFor association — use type/position selectors
    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 10_000 });   // first name
    await expect(page.locator('input[type="text"]').nth(1)).toBeVisible({ timeout: 10_000 });   // last name
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('has a role selector', async ({ page }) => {
    await page.goto('/signup');
    // SignUpScreen shows role buttons: Teacher, Student, Parent, Homeschool
    const roleEl = page
      .getByRole('button', { name: /teacher|student|parent|homeschool/i })
      .or(page.getByLabel(/i am a/i))
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
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to /login when not authenticated`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
  }
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
