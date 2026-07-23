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
 * Resolves with whichever of `ids` becomes visible first, within `timeout`
 * overall. Polls each id in turn with a short per-attempt timeout rather
 * than firing one `waitFor` per id concurrently — Detox only tolerates one
 * in-flight expectation/action at a time and throws "Detox has detected
 * multiple interactions taking place simultaneously" if two `waitFor(...)
 * .toBeVisible()` calls are ever pending at once (confirmed in CI: it broke
 * every remaining test in the run, not just this one, once that error hit).
 * Rejects only if none of `ids` show up before the overall deadline.
 */
async function waitForFirstVisible(ids, timeout) {
  const deadline = Date.now() + timeout;
  const pollTimeout = 2000; // granularity for switching between candidates, not a real per-id budget
  do {
    for (const id of ids) {
      try {
        await waitFor(element(by.id(id))).toBeVisible().withTimeout(pollTimeout);
        return id;
      } catch {
        // Not this one yet — try the next candidate.
      }
    }
  } while (Date.now() < deadline);
  throw new Error(`None of [${ids.join(', ')}] became visible within ${timeout}ms`);
}

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
  // 75s, not a quick probe: cold app launch on GitHub-hosted CI runners
  // (Android emulators especially) has measured 50s+ to first paint
  // (Font.loadAsync's ~5s escape-hatch timeout plus RootLayout/AuthGuard's
  // AsyncStorage checks plus general CI resource headroom, all slower here
  // than on a local dev machine).
  //
  // This used to be a plain `waitFor(onboarding-splash).withTimeout(45000)`
  // wrapped in try/catch-and-return-on-timeout, on the theory that a
  // timeout meant "already past onboarding". That's a race, not a check:
  // a slow-but-still-coming cold launch also times out, and the catch
  // swallowed that identically to "not on this screen", silently returning
  // and leaving every caller's own login-screen wait to fail instead (that
  // was the actual failure signature in CI — a login-screen timeout, not
  // an onboarding-splash one, because this bailed first).
  // waitForFirstVisible() polls for both possible outcomes instead of
  // guessing off one fixed deadline, whichever is real wins as soon as it
  // appears — but only ever one at a time, per its own comment: Detox
  // rejects a *concurrent* waitFor of both ids outright.
  let first;
  try {
    first = await waitForFirstVisible(['onboarding-splash', 'login-screen'], 75000);
  } catch {
    return; // Neither appeared — let the caller's own login-screen wait surface the real error.
  }
  if (first === 'login-screen') return; // Already onboarded — nothing to do.
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
