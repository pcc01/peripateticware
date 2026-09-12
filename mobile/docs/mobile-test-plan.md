# Mobile E2E — plan to close out testing before App Store / Play submission

Status snapshot and the concrete work left to call the new features "tested."
Companion to `PROD_E2E_GUIDE.md` (how to run the suites).

Last full run: 2026-09-11, against **prod** (`peripateticware.com`), account
`loadtest.student@thewordinbits.com`.

| Suite | Result | Notes |
|---|---|---|
| Android non-waypoint (Pixel 6 API 35 emu) | **17 / 17*** | `4-6` root-caused and fixed — see §5 |
| iOS non-waypoint (iPhone 17 Sim, macOS 26) | **17 / 17*** | all flow fixes committed (`17c5361`) — see note below |
| Wayfinding + geofence | **not run** | the actual "waypoints" review — see §3 |
| Manual on-device | **not started** | field builds: Android on Pixel 10a ✅, iOS pending signing |

\* Both platforms' recorded full-suite runs show 16/17, with `4-6-activity-flow`
as the sole failure — in both cases a **test-state artifact, not a
regression**, from an isolated confirmation run immediately before the full
suite already submitting the QA activity (`activity_submissions`/
`student_notebooks` is server-side "once submitted, stays submitted," so
ReflectPhase loads straight into "Submitted ✓" and there's no "Submit field
work" button left to tap). Each isolated run that hit a genuinely clean
session passed end-to-end. Run `scripts/reset-activity-submission-prod.sql`
(below) before the next full-suite run on either platform to get back to a
clean 17/17.

Nothing failing so far is a *confirmed* app bug. `4-6`'s two failure modes
(iOS keyboard occlusion, Android Gboard-toolbar occlusion — see §5) are both
root-caused, fixed, and verified.

---

## 1. Automated suite — remaining fixes

### Android (3 red)
| Flow | Cause | Action | Effort |
|---|---|---|---|
| `12.3-photo` / `12.4-video` | Headless emulator's software GPU never mounts `in-app-camera` | Move to `-Flows` exclusion for the emulator matrix; keep for a real-device / windowed-emulator lane. Not a bug. | 10 min |
| `4-6-activity-flow` | "Submit field work" → app leaves foreground; clean process exit, no Java crash; submit not persisted server-side; 3/3 repro on the emulator | **Blocked on the real-device check (§5).** If a real phone submits cleanly → close as emulator RAM. If it repros → open a real bug. | — |

### iOS — CLOSED, all fixes committed (`ce607fd`, `17c5361`)

All six are fixed and verified on a real iOS Simulator: `15.1` now waits on
the leaf onboarding controls (not the iOS-invisible wrapper testIDs);
`onboarding-name-input` wait 15→22s for the `9.5`/`0.1` flake; `12.2`
platform-gates the recording portion (iOS has no Simulator audio input);
`8-progress` got real testIDs on the stat tiles (`progress-stat-{key}`)
since the `<TouchableOpacity>` collapses the inner text on iOS; `4-6` calls
`hideKeyboard` before `peri-chat-send` for the Ask Peri send-tap/QuickType
issue; `9.5`'s language picker taps the Spanish row by fixed coordinate on
iOS (RN `<Modal>` renders to a separate UIWindow Maestro's iOS a11y
snapshot can't traverse). **Verified on Android:** `0.1-sanity` +
`15.1-first-launch` pass. **Verified on iOS:** full non-waypoint suite
16/17 (2026-09-11) — the one failure is the `4-6` test-state artifact
described above, not any of these six.

| Flow | Cause | Fix | Status |
|---|---|---|---|
| `15.1-first-launch` | Asserts container testID `onboarding-name` directly (only the shared `onboarding-skip` was fixed) | Same 1-line change: wait on `onboarding-name-input` | ✅ verified |
| `9.5`, `0.1-sanity` | Flaked on splash→name transition on a tired Simulator | Re-run with the retry-once logic now in `run-maestro-ios-prod.sh` | ✅ verified |
| `12.2-audio-capture` | iOS Simulator has no mic path → "Recording…" never renders | Platform-gated: `assertVisible` the record button on iOS, skip "Recording…"/stop assertions there | ✅ verified |
| `8-progress-screen` | `"ACTIVITIES"` not visible on iOS | Real `id:` selectors (`progress-stat-{key}`) instead of text | ✅ verified |
| `4-6-activity-flow` (Ask Peri) | Dies at Ask Peri send — QuickType eats the send tap | `hideKeyboard` before `peri-chat-send` | ✅ verified |
| `9.5` (language picker) | RN `<Modal transparent>` renders to a separate UIWindow — Maestro's iOS a11y snapshot never sees inside it, so `id`-based lookup of the Spanish row fails no matter the timeout | Tap by fixed screen coordinate (`point: "50%, 30%"`) on iOS only; Android keeps the original `id`-based tap (its tree IS queryable) | ✅ verified |
| `4-6-activity-flow` (Submit) | The Submit button sits directly below the reflection `TextInput`; the keyboard covers it on iOS (no `KeyboardAvoidingView`, and the multiline field has no dismiss affordance) — Maestro's tap landed on the keyboard's "i" key instead of the button. `scrollUntilVisible` didn't help: the button already reads "visible" per the a11y tree (bounds-wise) regardless of real on-screen occlusion, so no scroll ever fired. Real UX gap for students too, not just a test artifact. | Fixed at the source in `app/activity/[id].tsx`: wrapped the phase content in a `KeyboardAvoidingView`, and added an iOS `InputAccessoryView` "Done" bar on the reflection input (the standard pattern for a multiline field with no return key). The flow taps the bar's testID directly (Maestro's `hideKeyboard` still doesn't recognize a custom accessory view as a "standard dismiss action") | ✅ verified (isolated run, clean session) |

**Android → green (minus the `4-6` unknown):** ~10 min.
**iOS → done.**

---

## 2. `check` findings from the localization pass (already fixed, keep an eye on)

`localize.py check` surfaced **146 `t()` keys missing from `en.json`** — whole
screens (in-app Create Scavenger Hunt, child calendar, common buttons). Merged
in on 2026-09-09; en.json 317 → 463 keys. **Add `npm run i18n:check` to CI**
so this can't regress — a `t('new.key')` with no `en.json` entry should fail
the build.

---

## 3. Wayfinding + geofence final pass  *(owner: Paul, 2026-09-10)*

Prod already has `Campus Wayfinding Hunt` (rung B, 3 stops at the seed coords)
and `Creek Habitat Study`, both visible to `loadtest.student`. The **stock**
flows work as-is — no `flows-prod/` needed for the emulator/simulator pass.

### Android (this machine)
```powershell
cd C:\dev\peripateticware\mobile
$env:STUDENT_EMAIL='loadtest.student@thewordinbits.com'
$env:STUDENT_PASSWORD='<rotated>'
.\scripts\run-maestro-all-devices.ps1 -SkipSetup -SkipBuild -Devices API35 `
  -Flows "geofence,wayfinding" `
  -StudentEmail $env:STUDENT_EMAIL -StudentPassword $env:STUDENT_PASSWORD
```

### iOS (the Mac, once signing is sorted)
```bash
cd ~/Documents/peripateticware/mobile && source prod.env
export MAESTRO_DRIVER_STARTUP_TIMEOUT=90000
UDID=$(xcrun simctl list devices booted -j | jq -r '.devices[][0].udid')
for f in maestro/flows/geofence/10-geofence.yaml maestro/flows/wayfinding/11-wayfinding.yaml; do
  maestro --device "$UDID" test "$f" -e STUDENT_EMAIL="$STUDENT_EMAIL" -e STUDENT_PASSWORD="$STUDENT_PASSWORD"
done
```

### Between re-runs
`11-wayfinding.yaml` needs a fresh session (`startActivitySession` = "start or
resume"). Reset before each new run:
```bash
ssh "$PROD_SSH" "docker exec -i peripateticware-postgres psql -U $DB_USER -d $DB_NAME \
  -v activity='Campus Wayfinding Hunt'" < scripts/reset-wayfinding-prod.sql
```

### Pass criteria
- `10-geofence`: enter radius → no toast; leave radius → "you've left the
  activity area" toast; activity still completable.
- `11-wayfinding`: panel + map mount; `0 of 3` → `1/2/3 of 3` on each mock
  arrival; "All stops found!"; no coordinate written server-side (rung B).
- Both on Android **and** iOS.

---

## 4. Manual on-device checklist  *(field builds)*

The automated suites teleport GPS and run on a simulator; these can only be
done on a real phone against prod.

**GPS / movement**
- [ ] Walk a real 3-stop hunt (South Whidbey Community Park or any authored
      hunt): distance + bearing update smoothly, arrival fires within the
      radius, no false arrivals, "All stops found" on the last one.
- [ ] Drive in and out of a geofenced activity: the "left the area" nudge
      appears on exit and clears on return; it never blocks completing the
      activity.
- [ ] Background the app mid-hunt / lock the screen, keep walking, reopen —
      progress is intact (no crash, no reset).
- [ ] Android: leave it backgrounded 10+ min (Doze) then reopen mid-activity.

**Permissions**
- [ ] iOS: "While Using", "Allow Once", and Precise-Location-off all behave
      (hunt still works or degrades gracefully; no crash).
- [ ] Android 12+: the separate "approximate vs precise" prompt.
- [ ] Deny location entirely → the app explains and doesn't hard-fail.

**Capture** (the parts the simulator/emulator can't do)
- [ ] Photo, video, and audio capture actually record and attach; appear in
      `COLLECTED (n)`; survive an app restart; sync when back online.

**Submit** (the `4-6` unknown — do this deliberately)
- [ ] Complete an activity end to end and tap **Submit field work** on a real
      Android device against prod. Expected: "Submitted! 🎉" alert → Done →
      back on Discover, and the teacher/web side shows the submission.
      If the app closes / doesn't submit → capture `adb logcat` and file it.

**Other**
- [ ] Offline: airplane mode, open a cached activity, capture, re-connect →
      it syncs.
- [ ] Switch language in Settings → UI updates live, including the theme
      option labels (regression `9.5` guards this).
- [ ] Read-aloud (PeriSpeech) works for prompts and questions.
- [ ] Map tiles + route line render on Apple Maps (iOS) and Google (Android).
- [ ] Notification on waypoint arrival (if enabled for the activity).

---

## 5. `4-6` submit investigation

**iOS: CLOSED** — the "Submit field work" tap landing on the keyboard's "i"
key was a keyboard-occlusion bug (§1), fixed with a `KeyboardAvoidingView` +
`InputAccessoryView` "Done" bar in `app/activity/[id].tsx` and verified with
a clean end-to-end pass (Submitted! alert → Done → Discover). This was never
the same issue as the Android one below — no app leaves-foreground / process
exit was ever observed on iOS.

**Android: CLOSED** — root-caused via a full logcat capture (`adb logcat`)
spanning the actual tap. The app never crashed and never left the
foreground to the OS Settings app, despite looking exactly like that in a
screenshot: the resumed activity at the moment of failure was
`com.google.android.inputmethod.latin/…preference.SettingsActivity` —
**Gboard's own settings screen** (its keyboard-theme picker, which visually
resembles a system Settings page: "My themes" → Dynamic Color / System
Auto / Default / Default Dark). Same root cause as the iOS bug, different
collision: the Submit button sits directly below the reflection
`TextInput`, and `android:windowSoftInputMode="adjustResize"`
(`AndroidManifest.xml`) resizes the window when the keyboard opens but
doesn't guarantee the button clears Gboard's own toolbar row above the
keys — so the tap meant for "Submit field work" landed on a Gboard toolbar
icon instead, launching Gboard's settings. Same underlying gap as iOS's
`scrollUntilVisible` failure: the button registers as "visible" per the
accessibility tree without actually being clear of on-screen keyboard
chrome.

**Fix**: unlike iOS, Android's `hideKeyboard` Maestro command doesn't hit
the "no standard dismiss action" error (Android can always request a
keyboard hide at the OS level), so `maestro/flows/activity/4-6-activity-flow.yaml`
now calls it (platform-gated) before tapping Submit — no app-code change
needed for Android. **Verified**: a clean isolated run passed end-to-end
(Submitted! → Done → Discover), diagnosed and confirmed via logcat.

### Resetting the QA account's submission state

`activity_submissions` is "once submitted, stays submitted" server-side —
same class of gotcha as wayfinding's `startActivitySession` "start or
resume". After any successful `4-6` run (isolated or in the full suite),
`loadtest.student`'s `Creek Habitat Study` reflects "Submitted ✓" on next
load, so a repeat run fails at "Tap on Submit field work: element not
found" — a test-repeat artifact, not a regression (this is exactly what
happened in the 2026-09-11 full-suite run: the isolated confirmation run
right before it had already submitted the activity).

Reset before re-running `4-6` (isolated or as part of the full suite):
```bash
ssh "$PROD_SSH" "docker exec -i peripateticware-postgres \
  psql -U $DB_USER -d $DB_NAME \
  -v activity='Creek Habitat Study' \
  -v student_email='loadtest.student@thewordinbits.com'" \
  < mobile/scripts/reset-activity-submission-prod.sql
```

**Aside, found while provisioning a throwaway QA student for the Android
repro (unrelated to this bug, but will bite the next person)**: any student
account created via a classroom invite link right now can't log in at all
— see branch `fix/classroom-invite-email-index` for the root cause and
fix (unmerged as of this writing). Until that's deployed, a freshly
invite-created student needs `scripts/encrypt_existing_data.py` run once
against prod (idempotent, safe to re-run) before it can log in.

---

## 6. Pre-submission gates

Must be **green** before hitting "Submit for Review":

- [ ] Wayfinding + geofence pass on Android **and** iOS (§3)
- [x] `4-6` submit confirmed working on iOS (Simulator, §5) — Android still
      needs the real-device check (§5)
- [ ] Manual GPS/permissions/capture/offline checklist (§4) clean on one
      real Android **and** one real iOS device
- [ ] `npm run i18n:check` green in CI; `i18n:run-all` output reviewed, no
      `needs_review` in a launch language's high-traffic screens (Discover,
      the 4 activity phases, capture, settings)
- [ ] Android: a **real signing keystore** (release build currently uses the
      debug keystore — fine for sideload, **not** for Play)
- [ ] iOS: build signed by the paid team (`VBU735RFB2`) with an App Store
      provisioning profile; App Store Connect record created
- [ ] Privacy: policy page live at the URL in the store listing; App Privacy /
      Data Safety forms match `docs/store-listings.md`
- [ ] Screenshots + icons + feature graphic produced (`docs/store-listings.md §3`)

Nice-to-have (won't block):
- [x] iOS suite ≥ 16/17 — 16/17 with a known non-bug cause (see the status
      snapshot's footnote above), all six real flow fixes verified
- [ ] `12.3`/`12.4` covered on a camera-capable Android device

---

## 7. Sequencing

1. ~~**Now / today:** land the iOS flow fixes (§1) → re-run both non-waypoint suites clean.~~ **Done** — iOS 16/17 (the 1 failure is a test-state artifact, not a bug; §5). Android's `4-6` unknown is separate and still open, pending the real-device check.
2. **Tomorrow (Paul):** wayfinding + geofence pass, both platforms (§3).
3. **When iOS signing is fixed:** iOS field build → manual checklist (§4) on both real devices, including the `4-6` submit test (§5).
4. **Parallel:** finish localization review of launch-language screens; add `i18n:check` to CI; produce store assets.
5. **Gate:** §6 checklist all green → submit.
