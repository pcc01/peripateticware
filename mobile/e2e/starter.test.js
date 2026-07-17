const { completeOnboardingIfPresent } = require('./helpers');

describe('Sanity', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should show the login screen', async () => {
    // Unauthenticated + already-onboarded launch lands on login (login.tsx
    // root SafeAreaView carries testID="login-screen"). On a genuinely
    // fresh device (no persisted `@ppw_has_onboarded` flag — see
    // mobile/FEATURE_PLAN.md section 3.4) it would land on the onboarding
    // tour instead; completeOnboardingIfPresent() is a no-op if that's not
    // the case, so this assertion holds regardless of run order or whether
    // this is truly the first launch ever.
    await completeOnboardingIfPresent();
    await waitFor(element(by.id('login-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
