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

// iOS-only, New-Architecture-only hang: a real CI run's own Detox log showed
// `ws-client:APP_STATUS The app is busy ... 2 work items pending on the
// dispatch queue` repeating continuously from right after app launch all
// the way to this function's own 180s deadline, even though the SAME
// moment's view-hierarchy dump proved the onboarding splash screen had
// already fully rendered ("Get started", "PERIPATETICWARE" text all
// present). Every single iOS Detox test failed this same way, always at
// this function's own wait, regardless of which screen/feature the test
// was actually about — consistent with Detox's native sync layer never
// reaching "idle" on this platform+architecture combination, so it never
// even attempts the underlying by.id() query, independent of whether that
// query would itself succeed. This matches a known, open, unresolved
// upstream Detox/React-Native-New-Architecture issue (app.json has
// newArchEnabled: true) — wix/Detox#4506 reports the identical "freezes at
// startup... only with the new architecture enabled" symptom on iOS, no
// fix landed as of writing. Android (old architecture's bridge-based
// idling resources) and Maestro (a different, non-Detox sync mechanism)
// are both unaffected, which is why this is scoped to iOS only here.
// device.disableSynchronization() is Detox's own documented escape hatch
// for exactly this class of problem — it skips the "wait for the app to go
// idle" step before each action/expectation — and was the obvious thing to
// try. CONFIRMED NOT TO WORK: a real CI run with this in place still hit
// the identical 30s login-screen timeout, at the identical place (stack
// trace showed withSyncDisabledOnIOS had already run, i.e.
// disableSynchronization() really was called first). So whatever's
// actually blocking isn't gated by this toggle — matches another comment
// on the same upstream issue: "--debug-synchronization has nothing to say,
// Detox seems to block internally before reaching the app code" even with
// sync disabled. Left in place anyway (harmless no-op on the actual
// blocker, and still correct/necessary IF that blocker is ever fixed
// upstream) rather than ripped out. The real next step is the device log
// now captured by mobile-e2e.yml's "Run Detox tests" step
// (artifacts/ios_device.log, mirroring Android's logcat capture) — this
// repo never had iOS console/NSLog output from a CI run before, so the
// next failure should show what's actually still running on the main
// queue (candidates nobody's ruled in or out yet: react-native-reanimated,
// present in this app though not imported near onboarding/login;
// expo-updates' background update-check retrying forever with no update
// server reachable in CI; something else entirely).
// Reentrancy guard: completeOnboardingIfPresent() wraps itself with this (so
// auth.test.js/starter.test.js, which call it directly rather than through
// loginAsStudent(), still get the fix), and loginAsStudent() ALSO wraps its
// own, larger span that calls completeOnboardingIfPresent() internally. Only
// the outermost call actually toggles synchronization — a naive nested
// disable/enable would have the inner call's `finally` re-enable sync (and
// start waiting for idle) before the outer span's remaining steps run.
let syncDisableDepth = 0;

async function withSyncDisabledOnIOS(fn) {
  const isIOS = device.getPlatform() === 'ios';
  if (!isIOS) return fn();
  if (syncDisableDepth === 0) await device.disableSynchronization();
  syncDisableDepth++;
  try {
    return await fn();
  } finally {
    syncDisableDepth--;
    if (syncDisableDepth === 0) {
      // device.enableSynchronization()'s own docs warn this resolves only
      // once the app goes idle, and could hang "forever" if called
      // somewhere that never settles. Best-effort here: if the app
      // genuinely never idles on this architecture, this fails the current
      // test via jest's own testTimeout rather than silently leaving sync
      // off for every test after it, which would be a worse,
      // harder-to-diagnose failure mode.
      await device.enableSynchronization();
    }
  }
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
  // See withSyncDisabledOnIOS's own comment above: this whole function is
  // where the iOS New-Architecture "busy forever" hang was actually
  // observed in CI. No-op on Android. Reentrant-safe against
  // loginAsStudent() also wrapping its own, larger span that calls this.
  await withSyncDisabledOnIOS(() => completeOnboardingIfPresentImpl());
}

async function completeOnboardingIfPresentImpl() {
  // 180s, not a quick probe: cold app launch on GitHub-hosted CI runners
  // has been measured up to ~100s to first paint under real CI load
  // (Font.loadAsync's ~5s escape-hatch timeout plus RootLayout/AuthGuard's
  // AsyncStorage checks plus general CI resource headroom, all slower here
  // than on a local dev machine, and apparently load-dependent — 45s
  // wasn't enough, then 75s wasn't either). This used to be tuned tight
  // against jest.config.js's testTimeout; that's backwards — testTimeout
  // (see its own comment) is now sized to leave slack *after* this, not
  // the other way around.
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
    first = await waitForFirstVisible(['onboarding-splash', 'login-screen'], 180000);
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
  // See withSyncDisabledOnIOS's own comment: this whole span, from right
  // after launch through the post-login redirect, is where a real iOS CI
  // run got stuck "busy" forever on this architecture. No-op on Android.
  await withSyncDisabledOnIOS(async () => {
    await completeOnboardingIfPresent();
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(30000);
    await element(by.id('email-input')).typeText(STUDENT_EMAIL);
    await element(by.id('password-input')).typeText(STUDENT_PASSWORD);
    await element(by.text('Sign in')).tap();
    await waitFor(element(by.id('discover-screen'))).toBeVisible().withTimeout(30000);
  });
}

module.exports = { loginAsStudent, completeOnboardingIfPresent, STUDENT_EMAIL, STUDENT_PASSWORD };
