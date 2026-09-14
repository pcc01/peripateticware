# On-Device Speech Recognition — Manual Test Plan

Companion to `mobile-test-plan.md` (the Maestro E2E suite) and
`AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md` (why this feature exists at all —
the removed server-side/cloud ASR pipeline, the privacy motivation).

This is **manual, real-device testing**, not automatable via Maestro: the
whole point is checking whether `expo-speech-recognition` running alongside
`expo-av`'s recording costs anything in battery, recording quality, or
speed — none of which a scripted UI-tap suite can observe. **iOS Simulator
has no microphone input at all** (already true of the existing
`12.2-audio-capture` Maestro flow, which platform-gates around it) — every
test below needs a **real phone**, both platforms.

## Status

Not started. Android preview build available now
(`eas build --profile preview`, internal APK — link shared separately);
iOS needs its own build once you have a device/signing set up for it.

## What's actually being checked

Two independent questions, from the 2026-09-13 discussion:

1. **Does it work?** Recording still produces a usable audio file every
   time, transcription happens when the on-device recognizer is available,
   and everything degrades to "recording only, no transcript" cleanly when
   it isn't (unsupported locale, permission denied, no offline model,
   recognizer error) — never degrades the recording itself.
2. **Does it cost anything?** (the harder question, and the reason
   `src/lib/asrDiagnostics.ts` / the Settings → "ASR Diagnostics" panel
   exist) — battery, CPU/heat, or audible recording-quality interference
   from running two microphone consumers (the recording + the recognizer)
   at once for the same several minutes.

Every test case below that produces a recording should be done with the
**Settings → ASR Diagnostics** panel checked afterward, and the whole
session's diagnostics exported (Share diagnostics (JSON)) and handed back
for review rather than eyeballed on-device.

## Device matrix

| Platform | Device | OS version | Notes |
|---|---|---|---|
| Android | Pixel 10a (existing manual-test device per `mobile-test-plan.md`) | latest available | Primary Android device |
| Android | a second OEM if available (Samsung/Xiaomi/etc.) | — | OEM audio-session/battery-management behavior varies a lot; a single-device pass doesn't rule out OEM-specific issues |
| iOS | whichever real iPhone is available | iOS 17+ preferred | **Must be a physical device** — Simulator has no mic |

If only one device per platform is available for this pass, that's fine —
just record the exact model/OS version with the exported diagnostics so a
later OEM-specific bug report has something to compare against.

## Setup

1. Install the build (Android: open the `eas build` link on the device and
   install the APK; iOS: whatever distribution method the build uses).
2. Sign in, open an activity, and get to the audio capture tool
   (mic-emoji "Voice" mode in the capture sheet).
3. Settings → Language: leave at the device default for the first pass,
   then repeat key cases in a second language later (see §6).
4. Android only — Settings → "Offline Transcription": confirm it shows
   "Ready for {{language}}" before testing recognition; if not, tap
   "Enable offline transcription…" first (needs wifi) and wait for it to
   confirm, per that panel's own flow.

---

## 1. Permissions

- [ ] **Fresh install, first recording**: tapping the record button prompts
  for microphone permission (and, on iOS, a separate speech-recognition
  permission prompt) before anything starts. Denying either: recording
  either doesn't start (mic denied) or starts but produces no transcript
  (speech recognition denied) — confirm which, it should be the mic gate
  that's user-facing (existing `capture.micPermission` alert) and the
  speech-recognition denial should degrade silently to no transcript.
- [ ] **Permanently denied + re-enable via Settings**: existing
  "blocked" alert path (Open Settings button) still works; after
  re-enabling in OS Settings and returning to the app, recording works
  again.

## 2. Core functionality

- [ ] Record a short (~10s), clearly-spoken phrase. Stop. Transcript
  appears in the post-capture review screen and matches what was said
  (reasonable STT accuracy, not exact-perfect).
- [ ] Record again but say nothing (silence) for the same duration. Should
  produce a saved recording with no transcript (or an empty one), not an
  error.
- [ ] Record for close to the max allowed duration (`AUDIO_MAX_DURATION_SECONDS`,
  currently 300s / 5 min) in one take. Recording completes, uploads, and
  (if recognition stayed alive that whole time) produces a transcript
  covering the whole recording, not just the first `continuous` segment.
- [ ] Journal / portfolio list (the other place a transcript renders,
  `app/(tabs)/journal.tsx`) shows the same transcript text as the
  post-capture review screen — no drift between the two display paths
  (they now share `src/lib/transcriptDisplay.ts`).

## 3. Graceful degradation (recording must never be the casualty)

- [ ] **Airplane mode, on-device recognition still works**: with
  `requiresOnDeviceRecognition: true`, recognition should keep working with
  no network at all (this is the actual proof it's genuinely on-device, not
  silently falling back to a cloud recognizer for the still-installed
  language). If a locale's model *isn't* installed and airplane mode is on,
  recognition should fail cleanly (no transcript) — not hang.
- [ ] **Unsupported / not-yet-installed locale** (Android): switch app
  language to one whose offline model hasn't been downloaded (Settings →
  Offline Transcription shows "Enable…", not "Ready for…"). Record — audio
  saves fine, transcript is absent, `transcript_status` ends up
  `unavailable` (check via the capture's post-review text: "Transcript
  unavailable", not stuck on "pending").
- [ ] **Speech-recognition permission denied**: recording still saves
  normally with no transcript.
- [ ] Confirm none of the above ever produces a *corrupted or missing
  audio file* — only ever "audio, no transcript."

## 4. Recording-quality / interference (the actual "cost" question)

This is the one that can't be checked by eye reliably — use it alongside
diagnostics review, not instead of it.

- [ ] Record the same scripted phrase twice: once as normal (recognition
  running), and once with airplane mode + an already-uninstalled/unsupported
  locale forced (recognition never actually starts — see §3). Play both
  recordings back. Listen for any audible difference — dropouts, volume
  changes, distortion — in the recognition-active take.
- [ ] Across every recording made in this whole test pass, check the ASR
  Diagnostics summary for:
  - **"Recording interrupted (iOS)" > 0** → a real signal
    (`mediaServicesDidReset`) that the audio session was disrupted during a
    recognition-active recording. Any non-zero count here needs
    investigation, not just noting.
  - **"Possibly truncated" > 0** → a recording's actual duration
    (`recording_actual_duration_ms`) came in under 90% of what the on-screen
    timer showed. Cross-reference which specific row via the exported JSON
    (`recording_expected_duration_s` vs `recording_actual_duration_ms`).
- [ ] Interruption scenarios, each performed **mid-recording** with
  recognition active: incoming phone call, switching to another app and
  back, locking the screen, a timer/alarm firing. After each: does the
  recording still save (even if truncated at the interruption point, that's
  expected — the failure mode to catch is losing the file entirely or the
  app crashing)? Does `mediaServicesDidReset` show `true` for that row
  (iOS)?

## 5. Battery / performance

- [ ] Do 5 back-to-back ~4-minute recordings (recognition active,
  supported locale) in one sitting. Check the diagnostics summary's "Avg.
  battery drop" and "Avg. start latency" afterward.
- [ ] For comparison, do 5 more ~4-minute recordings with recognition
  forced off (airplane mode + unsupported locale, as in §3) — same device,
  similar starting battery level, back-to-back with the first set. Compare
  the two sets' battery drop (export both sessions' diagnostics separately,
  or note the row count boundary between them in one export).
- [ ] Note whether the device feels warm/hot after the recognition-active
  set in a way it didn't after the control set — a subjective check, but
  worth recording anecdotally alongside the numbers.
- [ ] **Pass bar** (proposed, confirm/adjust once real numbers are in
  hand): recognition-active battery drop should not be dramatically higher
  than the control set for the same total recording time — "dramatically"
  meaning something a normal day of app use would actually notice, not any
  nonzero difference. There's no pre-agreed hard percentage yet; use this
  first data set to set one.

## 6. Locale coverage

Repeat a short record-and-check (§2's first case) for at least 3-4 of the
13 supported languages, prioritizing ones your student population actually
uses. For each:
- [ ] Switch app language (Settings → Language).
- [ ] Android: use Settings → Offline Transcription to download that
  locale's model if not already installed.
- [ ] Record a phrase in that language. Transcript should be in the right
  language and roughly accurate (STT quality varies a lot by
  locale — note obviously-bad ones, not typos).
- [ ] Note any locale where the offline model download itself fails or the
  device reports no on-device support at all (`getSupportedLocales()`
  returning it in `locales` but never installable, or not in `locales` at
  all) — that locale effectively has no on-device transcription on this
  device/OS version, a real coverage gap worth tracking per-locale rather
  than assuming uniform support.

## 7. Wrap-up

- [ ] Settings → ASR Diagnostics → **Share diagnostics (JSON)** at the end
  of the full pass (or after each major section, if that's easier to keep
  organized) and hand the export back for review.
- [ ] Note device model/OS version and which sections were actually run —
  the exported rows carry device/OS/locale per-row already, but the
  human-readable context (which scenario each burst of rows corresponds
  to, any subjective "it felt warm" notes) doesn't.
