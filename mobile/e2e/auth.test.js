const { loginAsStudent, completeOnboardingIfPresent } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 1 "App Launch & Auth", items 1.4-1.7.
//
// Items 1.1/1.2 (onboarding splash → name → location → first-activity) are
// now covered by maestro/flows/onboarding/15.1-first-launch.yaml instead of
// here: AuthGuard (app/_layout.tsx) now routes an unauthenticated + never-
// onboarded launch into (onboarding) rather than straight to /login — see
// mobile/FEATURE_PLAN.md section 3.4. `beforeEach` here uses `delete: true`
// (fresh install), so every test below now lands on the onboarding splash
// first, not /login — `completeOnboardingIfPresent()` (./helpers.js) taps
// through the tour once per test to reach the login screen (Detox has no
// way to pre-seed the app's AsyncStorage flag before launch).
describe('App Launch & Auth', () => {
  beforeEach(async () => {
    // Fresh install each test so login/logout state doesn't leak between cases.
    await device.launchApp({ delete: true, newInstance: true });
  });

  it('1.4 — shows a "Login failed" alert on wrong credentials and stays on login', async () => {
    await completeOnboardingIfPresent();
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(15000);
    await element(by.id('email-input')).typeText('wrong-user@nowhere.test');
    await element(by.id('password-input')).typeText('DefinitelyWrong1');
    await element(by.text('Sign in')).tap();

    await waitFor(element(by.text('Login failed'))).toBeVisible().withTimeout(10000);
    await element(by.text('OK')).tap();
    await expect(element(by.id('login-screen'))).toBeVisible();
  });

  it('1.5 — logs in as a student and lands on the Discover tab', async () => {
    await loginAsStudent();
    await expect(element(by.id('discover-screen'))).toBeVisible();
  });

  it('1.6 — stays logged in after backgrounding and reopening the app', async () => {
    await loginAsStudent();
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    await expect(element(by.id('discover-screen'))).toBeVisible();
  });

  // Speaker/read-aloud button on PeriSpeech (src/components/PeriSpeech.tsx) —
  // see mobile/FEATURE_PLAN.md section 3.2/3.3. Tested on the login screen
  // since PeriSpeech renders there pre-auth. Detox can't assert audio
  // actually played on-device — this only confirms the button exists, is
  // tappable, and its visible state (icon) flips between speak/playing.
  it('1.7 — PeriSpeech speaker button toggles between read-aloud states', async () => {
    await completeOnboardingIfPresent();
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(15000);
    await expect(element(by.id('peri-speech-speaker'))).toBeVisible();
    await element(by.id('peri-speech-speaker')).tap();
    await expect(element(by.text('⏸'))).toBeVisible();
    await element(by.id('peri-speech-speaker')).tap();
    await expect(element(by.text('🔊'))).toBeVisible();
  });
});
