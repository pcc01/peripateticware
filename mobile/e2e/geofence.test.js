const { loginAsStudent } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 10 "Geofence (Location-Based
// Guard)". Uses "Creek Habitat Study", one of the 3 activities seeded by
// backend/startup.py::seed_sample_activities() — location_latitude=37.8716,
// location_longitude=-122.2727, location_radius_meters=500 (hardcoded
// default in the seed INSERT).
//
// FIRST USE of device.setLocation() in this codebase's Detox suite — no
// existing location-mocking pattern was found (grepped for `setLocation`,
// expo-location mocks, and a test-mode flag; none exist). Flagging two
// caveats from Detox's own type docs for Paul to verify on-device before
// trusting this in CI:
//   1. On iOS, `device.setLocation()` depends on `fbsimctl`, which is
//      deprecated/unbundled from modern Detox installs — it may need extra
//      setup on the Mac runner (see docs/mobile/MOBILE_TEST_RUNBOOK.md) or
//      may simply fail there until that's sorted out.
//   2. On Android it should work out of the box on the emulator, but the
//      `permissions: { location: 'always' }` launch option must actually
//      grant the runtime permission for src/hooks/useGeofence.ts's
//      `Location.requestForegroundPermissionsAsync()` call to succeed — if
//      it silently stays unset, the watcher never starts and both tests
//      below will time out waiting for `geofence-toast`.
describe('Geofence (Location-Based Guard)', () => {
  const INSIDE = { latitude: 37.8716, longitude: -122.2727 };  // Creek Habitat Study center
  const OUTSIDE = { latitude: 37.95, longitude: -122.35 };     // ~10+ km away, outside the 500m radius

  beforeAll(async () => {
    await device.launchApp({
      delete: true,
      newInstance: true,
      permissions: { location: 'always' },
    });
    await device.setLocation(INSIDE.latitude, INSIDE.longitude);

    await loginAsStudent();
    await waitFor(element(by.text('Creek Habitat Study'))).toBeVisible().withTimeout(15000);
    await element(by.text('Creek Habitat Study')).tap();
    await waitFor(element(by.id('activity-screen'))).toBeVisible().withTimeout(10000);

    // Geofence watcher is only enabled during the Inquiry phase (see
    // useGeofence({ enabled: phase === 'inquiry' && ... }) in
    // app/activity/[id].tsx), so advance Brief -> Orient -> Inquiry first.
    await element(by.text("I'm ready — let's go")).tap();
    await element(by.text("I'm oriented — begin inquiry")).tap();
    // waitFor, not plain expect() — same fix and same reasoning as
    // activity-flow.test.js 4.4/4.5 (this is the identical assertion,
    // also flagged failing on API 24 in Session 18's run).
    await waitFor(element(by.text('Observe & Capture'))).toBeVisible().withTimeout(20000);
  });

  it('10.1 — no warning while inside the activity radius', async () => {
    await device.setLocation(INSIDE.latitude, INSIDE.longitude);
    await expect(element(by.id('geofence-toast'))).not.toExist();
  });

  it('10.2/10.3 — shows a non-blocking toast when the student leaves the radius', async () => {
    await device.setLocation(OUTSIDE.latitude, OUTSIDE.longitude);
    await waitFor(element(by.id('geofence-toast'))).toBeVisible().withTimeout(20000);

    // 10.3: non-blocking — the student can still proceed with the activity.
    await expect(element(by.text('Done capturing — reflect'))).toBeVisible();
  });
});
