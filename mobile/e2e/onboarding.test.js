// e2e/onboarding.test.js
// First real Detox coverage of the onboarding tour (app/(onboarding)/*).
// See mobile/FEATURE_PLAN.md section 3.4 and maestro/flows/onboarding/
// 15.1-first-launch.yaml (mirrors this test). Previously unreachable on a
// normal cold start; now wired into AuthGuard (app/_layout.tsx).
describe('Onboarding tour', () => {
  it('15.1 — walks the full tour and lands on the real login screen', async () => {
    // clearState is required here specifically, not just convention — a
    // stale `@ppw_has_onboarded` flag from a prior test would skip
    // straight past the splash screen this test needs to see.
    await device.launchApp({ delete: true, newInstance: true });

    // 45s — see the matching comment in e2e/helpers.js's
    // completeOnboardingIfPresent(). This exact wait (15000ms) was observed
    // timing out in CI even though it's the very first screen after launch
    // with no network dependency of its own — cold launch on the CI
    // runner is measurably slower than 15s.
    await waitFor(element(by.id('onboarding-splash'))).toBeVisible().withTimeout(45000);
    await element(by.id('onboarding-splash-cta')).tap();

    await waitFor(element(by.id('onboarding-name'))).toBeVisible().withTimeout(10000);
    await element(by.id('onboarding-name-input')).typeText('Detox Tester');
    await element(by.id('onboarding-name-cta')).tap();

    await waitFor(element(by.id('onboarding-location'))).toBeVisible().withTimeout(10000);
    await element(by.id('onboarding-location-skip')).tap();

    await waitFor(element(by.id('onboarding-first-activity'))).toBeVisible().withTimeout(10000);
    await element(by.id('onboarding-first-activity-open')).tap();

    // Tour-then-login: lands on the real login screen, not /(tabs) —
    // onboarding never creates an account.
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(10000);
  });

  it('15.2 — does not show onboarding again after it has been completed once', async () => {
    await device.launchApp({ delete: true, newInstance: true });
    await waitFor(element(by.id('onboarding-splash'))).toBeVisible().withTimeout(45000);
    await element(by.id('onboarding-splash-cta')).tap();
    await waitFor(element(by.id('onboarding-name'))).toBeVisible().withTimeout(10000);
    await element(by.id('onboarding-name-input')).typeText('Detox Tester');
    await element(by.id('onboarding-name-cta')).tap();
    await waitFor(element(by.id('onboarding-location'))).toBeVisible().withTimeout(10000);
    await element(by.id('onboarding-location-skip')).tap();
    await waitFor(element(by.id('onboarding-first-activity'))).toBeVisible().withTimeout(10000);
    await element(by.id('onboarding-first-activity-open')).tap();
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(10000);

    // Relaunch without deleting state — the onboarded flag persists even
    // though there's no logged-in session, so this should go straight to
    // /login, not back through onboarding. Still a fresh process
    // (newInstance: true), so subject to the same cold-launch cost as
    // above — same 45s allowance.
    await device.launchApp({ newInstance: true, delete: false });
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(45000);
  });
});
