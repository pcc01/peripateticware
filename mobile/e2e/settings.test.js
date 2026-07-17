const { loginAsStudent, STUDENT_EMAIL } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 9 "Settings Screen", items
// 9.1/9.2/9.3/9.4.
//
// 9.3 (change language) was previously SKIPPED with a comment claiming
// "there is no language picker in app/(tabs)/settings.tsx" — that's no
// longer true. settings.tsx now has a real LANGUAGE section
// (SUPPORTED_LOCALES chips, see src/i18n/locales.ts) wired to
// handleSelectLocale(), which persists to AsyncStorage under
// LANGUAGE_STORAGE_KEY ('@ppw_language') AND calls
// i18nInstance.changeLanguage() so the switch takes effect immediately.
//
// IMPORTANT CAVEAT confirmed by reading every locale file
// (src/i18n/locales/{en,es,fr,ar,ja,ko,pt-BR}.json): all 7 locale JSON
// files are byte-for-byte identical to en.json — every translation is an
// untranslated English stub (verified by flattening and diffing all keys;
// 0 differences across all 76 keys in every locale). This is true for
// every key in the bundle, not just this screen's. That means there is
// currently NO visible string anywhere in the app that actually changes
// when the locale switches — the task of finding "a settings-screen key
// that differs across locales" turned up nothing to assert on, because
// translation content itself doesn't exist yet (a product/content gap,
// not a wiring bug — the plumbing above is real and correct). Rather than
// fabricate an assertion against text that doesn't actually change, this
// test instead verifies the parts that ARE real and independently
// verifiable: (a) selecting a chip updates the picker's own selected
// state (accessibilityState + the same visible checkmark pattern the
// Theme picker above already uses), and (b) the selection persists to
// AsyncStorage and survives a full app relaunch (same pattern as
// onboarding.test.js 15.2's AsyncStorage-persisted-flag check).
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

  it('9.3 — selecting a language chip updates the picker\'s selected state', async () => {
    // Default locale is DEFAULT_LOCALE ('en' — see src/i18n/locales.ts),
    // so on this freshly-launched-and-deleted device (beforeEach above)
    // the "English" row should already carry the checkmark before any
    // interaction.
    await expect(
      element(by.text('✓').withAncestor(by.label('English language')))
    ).toBeVisible();

    await element(by.label('Español language')).tap();

    // Selection moved: checkmark now renders under Español's row, not
    // English's. Scoped with withAncestor() (rather than a bare
    // by.text('✓'), which would also match the Theme picker's own
    // checkmark above and be ambiguous) so this only looks inside the
    // Español chip's own TouchableOpacity subtree.
    await expect(
      element(by.text('✓').withAncestor(by.label('Español language')))
    ).toBeVisible();
    await expect(
      element(by.text('✓').withAncestor(by.label('English language')))
    ).not.toExist();

    // Screen survives the re-render — same "doesn't crash" bar as 9.2's
    // theme-switch assertion above.
    await expect(element(by.id('settings-screen'))).toBeVisible();
  });

  it('9.3b — language selection persists across app relaunch', async () => {
    await element(by.label('Español language')).tap();
    await expect(
      element(by.text('✓').withAncestor(by.label('Español language')))
    ).toBeVisible();

    // Relaunch without deleting state. AuthContext persists the session
    // token via AsyncStorage too (src/stores/AuthContext.tsx), so this
    // lands back on the tabs directly rather than the login screen —
    // unlike onboarding.test.js's 15.2 case, which never logs in.
    await device.launchApp({ newInstance: true, delete: false });
    await waitFor(element(by.id('discover-screen'))).toBeVisible().withTimeout(15000);
    await element(by.id('tab-settings')).tap();
    await waitFor(element(by.id('settings-screen'))).toBeVisible().withTimeout(10000);

    // '@ppw_language' survived the relaunch and settings.tsx's useEffect
    // read it back out of AsyncStorage on mount (see handleSelectLocale's
    // sibling effect in settings.tsx) — Español should still be checked
    // without the user reselecting it.
    await expect(
      element(by.text('✓').withAncestor(by.label('Español language')))
    ).toBeVisible();
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
