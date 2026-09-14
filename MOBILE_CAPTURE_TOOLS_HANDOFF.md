# Mobile Capture Tools — Handoff (2026-09-13)

Handoff doc for a new agent picking up two pieces of work from today's
session without re-deriving context:

1. **On-device audio transcription** — implemented today, one real bug
   found on-device and fixed, **but the fix has not yet been verified on a
   real device** (see "Critical: verify first" below). Read this section
   fully before touching `CaptureSheet.tsx`'s audio path again.
2. **A new "Draw" capture tool** — not started, scoping + a recommended
   plan below. The user's own words: "some activities want you to draw. We
   need either a new icon for drawing or the pencil icon should allow both
   typing and drawing."

Companion docs already in the repo, don't re-read unless you need the
detail: `AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md` (the original task
brief this session executed — Task A + Task B both now done, see below),
`mobile/docs/ON_DEVICE_ASR_TEST_PLAN.md` (manual test plan for part 1).

---

# 1. On-device audio transcription

## What's done (today)

- Removed the server-side ASR pipeline entirely (`services/asr_service.py`
  deleted). It never worked correctly anyway — Ollama has no real audio API,
  and the code was silently fabricating transcripts — and its OpenAI/Claude
  cloud-fallback tiers were sending student audio to a third party. See
  `AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md` for the full history.
- Transcription now happens **entirely on-device**: `mobile/src/components/CaptureSheet.tsx`
  runs `expo-speech-recognition` (`requiresOnDeviceRecognition: true`,
  hard-coded, not a tunable default — see the comment right above that
  option in the code for why) as a second session in parallel with
  `expo-av`'s recording. The client submits the resulting transcript text
  directly with the upload (`transcript` form field on
  `POST .../captures/upload`); the backend trusts it as-is
  (`transcript_status='completed'`/`'unavailable'`, no server-side ASR
  step, no fallback of any kind).
- `TranscriptStatus` enum (`backend/models/database.py`) tracks
  completed/unavailable (plus legacy pending/failed/disabled values kept
  only so old rows still deserialize — no new code produces them).
- Android: Settings → "Offline Transcription" panel
  (`mobile/src/components/OfflineTranscriptionSettings.tsx`) lets a student
  explicitly download the on-device speech model for their language ahead
  of time (needs connectivity; this app is offline-first in the field, so
  the download itself can't happen there). iOS has no equivalent — its
  on-device model downloads transparently, no public API to control it.
- `src/lib/asrDiagnostics.ts` + Settings → "ASR Diagnostics" panel: one row
  per recording (battery before/after, recognition latency, recording
  duration vs. actual, `mediaServicesDidReset` on iOS) to answer "did this
  cost anything" concretely rather than by feel. **Always visible for
  now** (app isn't shipping yet) — remove or gate before it does, see that
  file's header comment.
- Transcript + audio playback now display together in the UI everywhere,
  not just right after capturing:
  - `CapturePreviewModal.tsx` (opens right after recording) already showed
    both; unchanged.
  - `app/(tabs)/journal.tsx` (the portfolio list, for *older* captures)
    previously showed transcript text only, with no way to play the audio
    at all — capture rows are now tappable and open the same
    `CapturePreviewModal`, which now falls back to streaming the file from
    the server (`getMediaStreamUrl()` in `src/api/captures.ts`, mirroring
    the web app's existing `useSignedCaptureUrl` pattern against
    `POST .../captures/{id}/media-token` + `GET .../stream?mt=`) when
    there's no local file anymore.

## Critical: verify the recording-hang fix before anything else

**A real device test today found recording itself breaking**: the first
recording didn't save, and every attempt after that hung indefinitely
("spinning with no popup"). Root cause, confirmed by re-reading the code
(not yet re-confirmed on-device with the fix applied):

`stopRecording()` was calling `recording.stopAndUnloadAsync()` (finalize
the expo-av recording) **before** stopping the speech recognizer. Both
are separate sessions holding the microphone at once (this library has no
way to transcribe an already-recorded file, only a live mic stream, so
that's unavoidable) — with the recognizer still active, `expo-av` couldn't
get exclusive access to finalize the recording, and the call hung forever.
Because the hang happened before the function's `finally` block, React
state never reset either, so the mic stayed locked for every later
attempt too — matches "records once, then every attempt after hangs"
exactly.

Fix applied (uncommitted, in `mobile/src/components/CaptureSheet.tsx`):
1. Reordered `stopRecording()` — recognizer stops first, recording second.
2. `Audio.Recording.createAsync()` and `recording.stopAndUnloadAsync()`
   both now go through a new `withTimeout()` helper (8s) so a future hang
   for any reason surfaces as a retryable "Recording failed" instead of
   wedging the UI forever.
3. `startRecording()` now defensively calls
   `ExpoSpeechRecognitionModule.abort()` before creating a new recording,
   in case a previous session's recognizer is still lingering.

**This fix has never been built or run on a device.** The Android build
meant to carry it (`eas build --platform android --profile preview`)
failed locally before reaching EAS's servers — `expo-updates`' own CLI
step (`runtimeversion:resolve`) crashed with a Windows-specific exit code
(`3221225794`), for reasons unrelated to this fix; nothing was consuming
build minutes when it was cancelled, but no working build has been
produced since the fix was written. **First thing to do**: get past that
build failure (may be a stale Windows crash from resource contention —
retry first; if it persists, `npx expo-updates runtimeversion:resolve
--platform android --workflow generic` run directly will show the real
error), get a fresh Android build out, and re-run the exact repro (record
twice in a row) before assuming this is fixed.

## Also not yet done from the original Task A/B scope

- **iOS**: no build has been produced at all yet (Android-only so far).
  iOS Simulator has no microphone (existing, pre-dates this session — see
  `mobile/docs/mobile-test-plan.md`'s `12.2-audio-capture` note) — real
  device only, and it needs its own signing/build setup.
- The manual test plan (`mobile/docs/ON_DEVICE_ASR_TEST_PLAN.md`) has not
  been run at all yet — do this once the hang fix is confirmed, not before
  (no point measuring battery/quality cost on a build that can't reliably
  finish a recording).

## Files touched (for a `git diff` orientation)

Backend: `models/database.py`, `routes/student.py`, `startup.py`,
`database/init.sql`, `.env.example`, new
`alembic/versions/20260913_capture_transcript_status.py`, new
`tests/test_capture_transcript_fields.py`. `services/asr_service.py`
deleted.

Mobile: `app.json` (new plugin + permission strings), `package.json`
(added `expo-speech-recognition`, `expo-battery`, `expo-device`),
`src/components/CaptureSheet.tsx`, `src/components/CapturePreviewModal.tsx`,
`src/api/captures.ts`, `src/db/database.ts`, `src/db/offlineQueue.ts`,
`src/i18n/locales.ts` + `locales/en.json`, `app/(tabs)/journal.tsx`,
`app/(tabs)/settings.tsx`; new `src/components/OfflineTranscriptionSettings.tsx`,
`src/components/AsrDiagnosticsPanel.tsx`, `src/lib/asrDiagnostics.ts`,
`src/lib/transcriptDisplay.ts`, `mobile/docs/ON_DEVICE_ASR_TEST_PLAN.md`.

None of this is committed yet.

---

# 2. New feature: a "Draw" capture tool

## Where this came from

The capture tool (`CaptureSheet.tsx`'s mode picker) has four modes today:
Photo (📷), Voice (🎤), Note (✏️), Video (🎥). The user calls the Note tool
"the pencil app" informally, after its ✏️ icon — but Note is **plain text
only** (`TextInput` → uploaded as a `.txt` file, `capture_type: 'text'`).
There is no drawing/sketching capability anywhere in the mobile app today.
The user's ask: "some activities want you to draw" — a teacher-configured
requirement, not just a nice-to-have — so students need a way to submit a
freehand drawing as evidence.

## Key finding: the backend is already ready for this

`backend/models/database.py`'s `CaptureType` enum already has a `SKETCH`
member (`sketch`), **distinct from `TEXT`**, and has had it since before
today's session — it's just never been built in any client. Confirmed by
reading `upload_capture()` (`backend/routes/student.py`): it accepts any
valid `CaptureType` with **no type-specific validation or processing at
all** — a photo, a sketch, anything gets written to disk identically, no
backend changes needed for the core upload path. Activities also already
have a `capture_requirements` JSONB field (`backend/models/database.py`,
`activities` table) for a teacher to specify what evidence a step needs —
consistent with drawing being its own distinct required-evidence type,
not a variant of "note."

**This means the entire scope of this feature is mobile-only.**

## Recommendation: a separate "Draw" mode, not a merged pencil tool

The user offered both options; here's the case for the separate mode:

- The backend already models `sketch` and `text` as distinct types — a
  merged tool would need to decide what capture_type to send, or invent a
  way to send both, adding backend scope back in for no real benefit.
- Typing (keyboard) and freehand drawing (a full-screen touch canvas) are
  different interaction modes with real UX tension in the same view —
  keyboard occlusion issues have already bitten this app once elsewhere
  (see `mobile/docs/mobile-test-plan.md` §1's `4-6-activity-flow` fix, a
  `KeyboardAvoidingView`/`InputAccessoryView` fix for exactly this class of
  problem). A combined view either needs a mode-switch inside the tool
  anyway (at which point it's not really "one tool") or has to solve
  keyboard-vs-canvas conflicts from scratch.
- "Some activities want you to draw" reads as a teacher explicitly
  requiring a sketch for a given step — a separate, first-class mode makes
  that requirement legible (a distinct icon a student recognizes as "this
  step wants a drawing"), the same way Photo/Voice/Video already are.

**Recommended**: add a fifth mode, e.g. `{ mode: 'sketch', emoji: '🎨' (or
'✍️'), label: 'Draw' }`, alongside the existing four — leave Note (✏️) as
pure text, unchanged. If the user still prefers the merged approach after
weighing this, it's a bigger job (effectively building a rich-text-plus-canvas
editor) — flag that explicitly before starting rather than discovering it
mid-build.

## Recommended technical approach

**No new heavy dependency needed.** `mobile/package.json` already has
`react-native-svg` (15.12.1), `react-native-gesture-handler` (~2.28.0),
and `react-native-reanimated` (~4.1.1) — the standard, lightweight recipe
for a freehand drawing canvas without pulling in `react-native-skia`:

1. A `Gesture.Pan()` (gesture-handler) tracks touch points during a
   stroke; each stroke becomes an SVG path string (`M x y L x y L x y…`).
2. Render accumulated strokes with `react-native-svg`'s `<Svg><Path/></Svg>`.
3. Minimal toolset for v1: pen (one color/width is fine to start),
   undo-last-stroke, clear-all.
4. **Export**: save the finished drawing as the raw SVG XML string itself
   (mime `image/svg+xml`) rather than rasterizing to PNG — `react-native-svg`
   already renders SVG XML back via its `SvgXml` component (no new
   dependency needed for display either), and browsers render `.svg` in a
   plain `<img>` natively, so the web teacher-review views
   (`frontend/src/components/teacher/FieldNoteReview.tsx` and others that
   render captures) need no changes. Confirmed no existing export/PDF
   pipeline touches `StudentCapture` today (grepped `backend/services/` —
   zero hits), so there's nothing currently depending on captures being
   raster images. If a rasterized PNG turns out to be needed later (e.g.
   a future print/PDF export), `react-native-view-shot` is the standard
   fallback — not needed for v1.

## What else needs updating (display-side gaps, regardless of approach)

- `CapturePreviewModal.tsx` has no render branch for `capture_type ===
  'sketch'` today — falls through to showing nothing but the header.
  Needs an `SvgXml`-based branch alongside the existing photo/video/audio/
  note branches.
- `app/(tabs)/journal.tsx`'s `CAPTURE_TYPE_EMOJI` map has no `sketch` entry
  — falls back to the generic 📎 icon. Add one (reuse whatever emoji the
  new mode picker uses, for consistency).
- New i18n keys needed in `mobile/src/i18n/locales/en.json`:
  `capture.mode.sketch` (mode-picker label) plus whatever canvas-toolbar
  copy the UI ends up needing (clear/undo confirmation, etc.) — follow the
  existing `capture.mode.*` key pattern.

## Suggested build order

1. Confirm the mode choice (separate "Draw" vs. merged) with the user if
   still undecided — the rest of this plan assumes separate.
2. Build the canvas component in isolation (a new
   `mobile/src/components/SketchCanvas.tsx`, mirroring how `InAppCamera.tsx`
   is its own self-contained component `CaptureSheet.tsx` already composes
   in for the photo/video modes) before wiring it into the mode picker.
3. Wire into `CaptureSheet.tsx`: new `MODES` entry, new render branch
   (parallel to the existing `mode === 'audio'` branch), submit via the
   same `upload()` path already used by every other mode
   (`upload({ uri, name: 'sketch.svg', type: 'image/svg+xml' }, 'sketch')`
   — note `upload()`'s existing signature already takes an arbitrary
   `{uri, name, type}` file object, so this should need no changes there).
4. Add the two display-side fixes above.
5. No backend changes anticipated — confirm nothing surprises during
   testing (MIME-type assumptions, disk-write path, etc.), but the code
   read-through today found no blocker.
