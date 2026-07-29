const { loginAsStudent } = require('./helpers');

// New Detox coverage porting maestro/flows/capture/12.1-note-capture.yaml
// through 12.4-video-capture.yaml (note/audio/photo/video capture via the
// in-app CaptureSheet + InAppCamera, reached from the Inquiry phase's
// capture row in app/activity/[id].tsx) into this suite. Before this file,
// mobile/e2e had ZERO references to camera/InAppCamera/CaptureSheet
// (confirmed via grep across e2e/*.test.js) even though this is real,
// currently-wired functionality — activity-flow.test.js's Inquiry-phase
// test only asserts the capture row and Ask Peri button exist, it never
// taps a capture-btn-* or opens the sheet.
//
// Each mode below does its own device.launchApp({ delete: true, ... })
// with the specific OS permission(s) that mode needs, mirroring each
// Maestro flow's own per-file `launchApp: { permissions: ... }` block —
// Detox (like Maestro) only grants permissions at launch time, so sharing
// one launch across modes would either over-grant (masking a real
// missing-permission bug in a mode that shouldn't need it) or under-grant
// (leaving a later mode stuck behind a native permission dialog that eats
// every subsequent tap). See CaptureSheet.tsx / InAppCamera.tsx for the
// testIDs referenced below (grepped directly from both files) and
// geofence.test.js's own header for the `location: 'always'` requirement
// — Inquiry phase always starts useGeofence's
// `Location.requestForegroundPermissionsAsync()` regardless of which
// capture mode a given test is about, per that file's already-documented
// finding that `'always'` (not `'inuse'`) is what actually satisfies it
// here; reused verbatim rather than re-guessing.
describe('In-app capture (CaptureSheet / InAppCamera)', () => {
  const openInquiryPhase = async () => {
    await loginAsStudent();
    await waitFor(element(by.text('Creek Habitat Study'))).toBeVisible().withTimeout(15000);
    await element(by.text('Creek Habitat Study')).tap();
    await waitFor(element(by.id('activity-screen'))).toBeVisible().withTimeout(10000);
    await element(by.text("I'm ready — let's go")).tap();
    await element(by.text("I'm oriented — begin inquiry")).tap();
    // waitFor, not plain expect() — same fix/reasoning as
    // activity-flow.test.js 4.4/4.5 and geofence.test.js's beforeAll
    // (Inquiry's heavier render can lag on slower devices).
    await waitFor(element(by.text('Observe & Capture'))).toBeVisible().withTimeout(20000);
  };

  it('12.1 — note capture: type text, save, sheet closes back to the activity', async () => {
    await device.launchApp({
      delete: true,
      newInstance: true,
      permissions: { location: 'always' },
    });
    await openInquiryPhase();

    await element(by.id('capture-btn-note')).tap();
    await waitFor(element(by.id('capture-sheet'))).toBeVisible().withTimeout(10000);
    await element(by.id('capture-note-input')).typeText('Found three different leaf shapes near the water.');
    await element(by.id('capture-note-save')).tap();

    // CaptureSheet's upload() always saves to the device first (queueCapture
    // — see src/db/offlineQueue.ts) regardless of connectivity, so this
    // confirmation shows immediately, then the sheet auto-closes ~900ms
    // later. Mirrors 12.1-note-capture.yaml's own comment making the same
    // call.
    await waitFor(element(by.id('capture-saved-confirmation'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('capture-sheet'))).not.toBeVisible().withTimeout(10000);
    await expect(element(by.id('activity-screen'))).toBeVisible();
  });

  it('12.2 — audio capture: record briefly, stop, sheet closes back to the activity', async () => {
    await device.launchApp({
      delete: true,
      newInstance: true,
      permissions: { location: 'always', microphone: 'YES' },
    });
    await openInquiryPhase();

    await element(by.id('capture-btn-audio')).tap();
    await waitFor(element(by.id('capture-sheet'))).toBeVisible().withTimeout(10000);

    await element(by.id('capture-record-btn')).tap();
    // CaptureSheet's own recording-status text — asserts recording
    // actually started rather than just tapping and hoping.
    await waitFor(element(by.id('capture-record-status'))).toBeVisible().withTimeout(5000);
    // Same button toggles start/stop (`recording ? stopRecording :
    // startRecording` in CaptureSheet.tsx) — tap again to stop after a
    // brief recording.
    await element(by.id('capture-record-btn')).tap();

    await waitFor(element(by.id('capture-saved-confirmation'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('capture-sheet'))).not.toBeVisible().withTimeout(15000);
    await expect(element(by.id('activity-screen'))).toBeVisible();
  });

  it('12.3 — photo capture: in-app camera shutter, sheet closes back to the activity', async () => {
    await device.launchApp({
      delete: true,
      newInstance: true,
      permissions: { location: 'always', camera: 'YES' },
    });
    await openInquiryPhase();

    await element(by.id('capture-btn-photo')).tap();
    await waitFor(element(by.id('capture-sheet'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('in-app-camera'))).toBeVisible().withTimeout(10000);

    // camera-shutter only renders once InAppCamera's onCameraReady fires
    // (the `!ready` gate in InAppCamera.tsx swaps a "Starting camera…"
    // placeholder — testID camera-loading — for the real shutter button).
    // waitFor here is what makes this reliable instead of racing native
    // camera init, same reasoning 12.3-photo-capture.yaml's own comment
    // gives for its tapOn.
    await waitFor(element(by.id('camera-shutter'))).toBeVisible().withTimeout(15000);
    await element(by.id('camera-shutter')).tap();

    await waitFor(element(by.id('capture-saved-confirmation'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('capture-sheet'))).not.toBeVisible().withTimeout(15000);
    await expect(element(by.id('activity-screen'))).toBeVisible();
  });

  it('12.4 — video capture: in-app camera record, stop, sheet closes back to the activity', async () => {
    await device.launchApp({
      delete: true,
      newInstance: true,
      permissions: { location: 'always', camera: 'YES', microphone: 'YES' },
    });
    await openInquiryPhase();

    await element(by.id('capture-btn-video')).tap();
    await waitFor(element(by.id('capture-sheet'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('in-app-camera'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('camera-record'))).toBeVisible().withTimeout(15000);

    await element(by.id('camera-record')).tap();
    // InAppCamera's own recording-status text (camera-record-status) —
    // distinct testID from CaptureSheet's audio-mode capture-record-status
    // text; both exist because video recording happens inside InAppCamera
    // itself, not CaptureSheet's own audio recorder.
    await waitFor(element(by.id('camera-record-status'))).toBeVisible().withTimeout(5000);
    await element(by.id('camera-record')).tap();

    await waitFor(element(by.id('capture-saved-confirmation'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('capture-sheet'))).not.toBeVisible().withTimeout(20000);
    await expect(element(by.id('activity-screen'))).toBeVisible();
  });
});
