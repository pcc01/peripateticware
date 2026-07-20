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
 * On a fresh install (`launchApp({ delete: true })`), AuthGuard
 * (app/_layout.tsx) now lands an unauthenticated device on the onboarding
 * tour instead of straight to /login — see mobile/FEATURE_PLAN.md section
 * 3.4. Detox can't pre-seed the app's AsyncStorage `@ppw_has_onboarded`
 * flag before launch, so tests that need the login screen tap through the
 * tour once instead. This is a no-op (returns immediately) if the device
 * has already onboarded — e.g. `newInstance: false` relaunches, or a
 * second call within the same test.
 */
async function completeOnboardingIfPresent() {
  try {
    // 45s, not a quick probe: cold app launch on GitHub-hosted macOS CI
    // runners has measured >15s to first paint (Font.loadAsync's ~5s
    // escape-hatch timeout plus RootLayout/AuthGuard's AsyncStorage checks
    // plus general CI resource headroom, all slower here than on a local
    // dev Mac) — onboarding.test.js's direct 15000ms waits for this same
    // testID were still timing out. A short probe here doesn't "fail fast
    // when already onboarded" so much as false-negative on a fresh install
    // that just hasn't finished its cold launch yet, which then cascades
    // into every caller's login-screen wait failing too (that's the actual
    // failure signature seen in CI: helpers.js's login-screen wait timing
    // out, not this one, because this one gave up first and silently
    // returned).
    await waitFor(element(by.id('onboarding-splash'))).toBeVisible().withTimeout(45000);
  } catch {
    return; // Not on the splash screen — already past onboarding (or never delete:true'd).
  }
  await element(by.id('onboarding-splash-cta')).tap();
  await waitFor(element(by.id('onboarding-name'))).toBeVisible().withTimeout(10000);
  await element(by.id('onboarding-name-input')).typeText('Detox Tester');
  await element(by.id('onboarding-name-cta')).tap();
  await waitFor(element(by.id('onboarding-location'))).toBeVisible().withTimeout(10000);
  // Skip rather than Allow — avoids a real OS location permission dialog
  // blocking the test run (see maestro/flows/capture/12.1-note-capture.yaml's
  // comment on why that dialog is worth avoiding when it isn't the point of
  // the test).
  await element(by.id('onboarding-location-skip')).tap();
  await waitFor(element(by.id('onboarding-first-activity'))).toBeVisible().withTimeout(10000);
  await element(by.id('onboarding-first-activity-open')).tap();
  await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(10000);
}

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
  await completeOnboardingIfPresent();
  await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(30000);
  await element(by.id('email-input')).typeText(STUDENT_EMAIL);
  await element(by.id('password-input')).typeText(STUDENT_PASSWORD);
  await element(by.text('Sign in')).tap();
  await waitFor(element(by.id('discover-screen'))).toBeVisible().withTimeout(30000);
}

module.exports = { loginAsStudent, completeOnboardingIfPresent, STUDENT_EMAIL, STUDENT_PASSWORD };
