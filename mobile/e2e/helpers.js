// e2e/helpers.js
// Shared Detox helpers for the new test files added alongside starter.test.js.
// `element`/`by`/`waitFor`/`device` are Detox globals injected by
// detox/runners/jest/testEnvironment — they only exist once a test file is
// running, so these helpers must be called from inside `it`/`beforeAll`/etc,
// never at module-load time.

// Seeded by backend/startup.py::seed_test_accounts() (student@test.local /
// Test1234! by default — see mobile/.env.test, copied from .env.test.example).
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD;

/**
 * Logs in as the seeded Detox test student from the login screen and waits
 * for the post-login redirect to the Discover tab (see app/_layout.tsx
 * AuthGuard, which replaces the route to /(tabs) once `user` is set).
 */
async function loginAsStudent() {
  if (!STUDENT_EMAIL || !STUDENT_PASSWORD) {
    throw new Error(
      'TEST_STUDENT_EMAIL / TEST_STUDENT_PASSWORD are not set. Copy ' +
      'mobile/.env.test.example to mobile/.env.test and fill in real values ' +
      '(see mobile/.env.test.example and backend/startup.py::seed_test_accounts).'
    );
  }
  await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(15000);
  await element(by.id('email-input')).typeText(STUDENT_EMAIL);
  await element(by.id('password-input')).typeText(STUDENT_PASSWORD);
  await element(by.text('Sign in')).tap();
  await waitFor(element(by.id('discover-screen'))).toBeVisible().withTimeout(15000);
}

module.exports = { loginAsStudent, STUDENT_EMAIL, STUDENT_PASSWORD };
