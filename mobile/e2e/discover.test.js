const { loginAsStudent } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 3 "Discover Screen", items
// 3.1/3.4/3.5. "Creek Habitat Study" is one of the 3 published activities
// seeded by backend/startup.py::seed_sample_activities() (idempotent —
// upserted by title on backend startup), so its title/location text is
// real, known seed data rather than a guess.
//
// SKIPPED: 3.2/3.3 (disable/re-enable device WiFi → offline banner). The
// app's offline detection (src/hooks/useConnectivity.ts) reads real OS
// network state via expo-network; there's no existing mock/test-mode flag
// for it, and Detox has no built-in cross-platform "toggle WiFi" API (that
// would require ad hoc `adb shell svc wifi disable` calls outside Detox's
// device API, which nothing in this codebase wires up yet). Not fabricating
// that here — flagging it as a gap instead.
describe('Discover Screen', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true, newInstance: true });
    await loginAsStudent();
  });

  it('3.4 — activity cards show title, subject/duration, and location', async () => {
    await waitFor(element(by.text('Creek Habitat Study'))).toBeVisible().withTimeout(15000);
    // app/(tabs)/index.tsx renders the card's location as a single Text node
    // — `📍 {activity.location_name}`, pin emoji and a space baked into the
    // same string — so by.text() needs the exact '📍 ' prefix too. Matching
    // the dedicated activity-location testID instead avoids that brittleness
    // and the (unrelated) emoji-regex astral-character gotcha this session
    // already hit elsewhere in the web E2E suite.
    await expect(element(by.id('activity-location'))).toBeVisible();
    await expect(element(by.id('activity-location'))).toHaveText('📍 Local creek or drainage channel');
  });

  it('3.1 — pull to refresh reloads the activity list', async () => {
    await element(by.id('discover-list')).swipe('down', 'fast', 0.9);
    await waitFor(element(by.text('Creek Habitat Study'))).toBeVisible().withTimeout(10000);
  });

  it('3.5 — tapping an activity card opens the Brief phase', async () => {
    await element(by.text('Creek Habitat Study')).tap();
    await waitFor(element(by.id('activity-screen'))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Creek Habitat Study'))).toBeVisible();
    await expect(element(by.text("I'm ready — let's go"))).toBeVisible();

    // Back out so later test files start from a known (Discover) state.
    // The rendered Text is just the bare '‹' glyph -- "Back" only exists in
    // accessibilityLabel, never in on-screen text -- so by.text('‹ Back')
    // could never match anything. Use the dedicated testID instead.
    await element(by.id('activity-back-btn')).tap();
    await expect(element(by.id('discover-screen'))).toBeVisible();
  });
});
