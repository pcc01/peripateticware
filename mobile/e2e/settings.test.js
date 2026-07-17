const { loginAsStudent, STUDENT_EMAIL } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 9 "Settings Screen", items
// 9.1/9.2/9.4.
//
// SKIPPED: 9.3 (change language -> UI text updates to selected locale).
// There is no language picker in app/(tabs)/settings.tsx as currently
// written — it only has Account info, a Theme picker (3 themes), and Sign
// Out. (work_tracking.md BUG-32/34 mentions a language picker keyed off
// AsyncStorage `@ppw_language` from an earlier pass, but the settings.tsx
// in this working tree does not have one — not fabricating a test against
// a control that isn't in the current source. See mobile/FEATURE_PLAN.md
// section 3.1 for the scoped rebuild plan.)
//
// The age-band picker (K-6/7-12/College) that used to also live on this
// screen was removed — see mobile/FEATURE_PLAN.md section 1.
describe('Settings Screen', () => {
  beforeEach(async () => {
    await device.launchApp({ delete: true, newInstance: true });
    await loginAsStudent();
    await element(by.id('tab-settings')).tap();
    await waitFor(element(by.id('settings-screen'))).toBeVisible().withTimeout(10000);
  });

  it('9.1 — shows account email and the theme picker', async () => {
    await expect(element(by.text(STUDENT_EMAIL))).toBeVisible();
    await expect(element(by.text('Field Guide'))).toBeVisible();
    await expect(element(by.text('Terrain'))).toBeVisible();
    await expect(element(by.text('Atmosphere'))).toBeVisible();
  });

  it('9.2 — changing theme selection does not crash and re-renders the picker', async () => {
    // Detox has no built-in way to assert an exact background-color change
    // without snapshot testing, which this suite doesn't have set up yet.
    // This asserts the selection is interactive and the screen survives the
    // re-render (theme.bg/accent propagate through React context to every
    // tab) rather than asserting the specific resulting color.
    await element(by.text('Terrain')).tap();
    await expect(element(by.id('settings-screen'))).toBeVisible();
    await element(by.text('Atmosphere')).tap();
    await expect(element(by.id('settings-screen'))).toBeVisible();
  });

  it('9.4 — Sign Out clears the session and returns to the login screen', async () => {
    await element(by.text('Sign out')).tap();
    // Alert.alert('Sign out', 'Are you sure?', [Cancel, Sign out]) — a native
    // OS confirm dialog, not a custom in-app component. First use of a
    // native-Alert button interaction in this test suite; the `atIndex(1)`
    // assumes the destructive "Sign out" action is the 2nd Alert button in
    // render/tree order on both platforms. Flagging this for Paul to verify
    // on-device (Android AlertDialog vs iOS UIAlertController can differ).
    //
    // Session 18's full-matrix run found this failing specifically on
    // API 30/24 ("Element not found: Text matching regex: Sign out"),
    // passing on API 35/33. One concrete, fixable thing found on review:
    // this wait was only 5000ms — conspicuously shorter than every other
    // timeout in this suite (10-20s) — while every other one already
    // assumed native dialogs could take longer to render/animate on
    // slower devices. Bumped to 15000ms. This alone may not be the full
    // story if the real cause is button-order/render-tree differences
    // across Android versions rather than pure timing (the comment above
    // already flags that as unverified) — still needs a real run on those
    // devices to confirm.
    await waitFor(element(by.text('Sign out')).atIndex(1)).toBeVisible().withTimeout(15000);
    await element(by.text('Sign out')).atIndex(1).tap();

    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(10000);
  });
});
