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

    // No waitFor on capture-saved-confirmation here — CaptureSheet's
    // upload() shows it via setJustSaved(...) then hides it again via a
    // bare setTimeout(..., 900) (see the component). Detox's own Android
    // idling resource tracks that pending timer as "busy" and doesn't hand
    // control back from the preceding .tap() until it fires — so by the
    // time this line would run, the confirmation has already shown AND
    // been dismissed. No timeout value fixes this (confirmed: a real CI
    // run still failed with 15000ms, the same as 5000ms) since the element
    // is already unmounted before the wait starts. The close + end-state
    // checks below are the only observable part of this flow.
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

    // No waitFor on capture-saved-confirmation — see 12.1's matching
    // comment above; Detox's timer-tracking idling resource means this
    // element is already gone again by the time any wait on it would
    // start, independent of stopRecording()'s own ~9.5s worst-case latency
    // before upload() runs. not.toBeVisible() below already accounts for
    // that latency with its own 15s budget.
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
    // CaptureSheet.tsx renders InAppCamera as a CHILD that opens its OWN,
    // separate <Modal> (InAppCamera.tsx:123) whenever mode is 'photo' or
    // 'video' — a Modal nested inside CaptureSheet's own outer <Modal>.
    // Because `mode` is already set to 'photo' before CaptureSheet's modal
    // ever paints its first frame (the useEffect syncing it to initialMode
    // runs on the same `visible` transition), both modals open in the same
    // instant for this mode: in-app-camera's full-screen native window
    // immediately covers capture-sheet's own view, so it never clears
    // Espresso's 75%-visible-area bar. toExist() (not toBeVisible()) is the
    // correct check here — the root view is legitimately present, just
    // intentionally obscured by the camera UI on top of it. 20s, not 10s —
    // a real CI run on a 2-core software-rendered (swiftshader) emulator
    // timed out at 10s here despite a failure screenshot taken moments
    // later showing the camera preview and shutter button fully rendered:
    // this Modal's mount is just slow under CI load, not broken.
    await waitFor(element(by.id('capture-sheet'))).toExist().withTimeout(20000);
    await waitFor(element(by.id('in-app-camera'))).toBeVisible().withTimeout(10000);

    // camera-shutter only renders once InAppCamera's onCameraReady fires
    // (the `!ready` gate in InAppCamera.tsx swaps a "Starting camera…"
    // placeholder — testID camera-loading — for the real shutter button).
    // waitFor here is what makes this reliable instead of racing native
    // camera init, same reasoning 12.3-photo-capture.yaml's own comment
    // gives for its tapOn.
    await waitFor(element(by.id('camera-shutter'))).toBeVisible().withTimeout(15000);
    await element(by.id('camera-shutter')).tap();

    // No waitFor on capture-saved-confirmation — see 12.1's matching
    // comment above.
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
    // Same nested-Modal reasoning as 12.3 above — video mode also opens
    // InAppCamera's own full-screen Modal in the same instant as
    // CaptureSheet's, so capture-sheet is only ever toExist(), not
    // toBeVisible(), while in-app-camera is up. 20s, not 10s — see 12.3's
    // matching comment on the same toExist() wait.
    await waitFor(element(by.id('capture-sheet'))).toExist().withTimeout(20000);
    await waitFor(element(by.id('in-app-camera'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('camera-record'))).toBeVisible().withTimeout(15000);

    await element(by.id('camera-record')).tap();
    // InAppCamera's own recording-status text (camera-record-status) —
    // distinct testID from CaptureSheet's audio-mode capture-record-status
    // text; both exist because video recording happens inside InAppCamera
    // itself, not CaptureSheet's own audio recorder.
    await waitFor(element(by.id('camera-record-status'))).toBeVisible().withTimeout(5000);
    await element(by.id('camera-record')).tap();

    // No waitFor on capture-saved-confirmation — see 12.1's matching
    // comment above.
    await waitFor(element(by.id('capture-sheet'))).not.toBeVisible().withTimeout(20000);
    await expect(element(by.id('activity-screen'))).toBeVisible();
  });
});
