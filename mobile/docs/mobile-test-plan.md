# Mobile E2E — plan to close out testing before App Store / Play submission

Status snapshot and the concrete work left to call the new features "tested."
Companion to `PROD_E2E_GUIDE.md` (how to run the suites).

Last full run: 2026-09-09, against **prod** (`peripateticware.com`), account
`loadtest.student@thewordinbits.com`.

| Suite | Result | Notes |
|---|---|---|
| Android non-waypoint (Pixel 6 API 35 emu) | **16 / 19** | fixes committed on `mobile/prod-e2e-lane` |
| iOS non-waypoint (iPhone 17 Sim, macOS 26) | **11 / 17** | onboarding blocker fixed; retry-once added post-run |
| Wayfinding + geofence | **not run** | the actual "waypoints" review — see §3 |
| Manual on-device | **not started** | field builds: Android on Pixel 10a ✅, iOS pending signing |

Nothing failing so far is a *confirmed* app bug. The list is test-environment
limits + test plumbing + one unknown (`4-6` submit).

---

## 1. Automated suite — remaining fixes

### Android (3 red)
| Flow | Cause | Action | Effort |
|---|---|---|---|
| `12.3-photo` / `12.4-video` | Headless emulator's software GPU never mounts `in-app-camera` | Move to `-Flows` exclusion for the emulator matrix; keep for a real-device / windowed-emulator lane. Not a bug. | 10 min |
| `4-6-activity-flow` | "Submit field work" → app leaves foreground; clean process exit, no Java crash; submit not persisted server-side; 3/3 repro on the emulator | **Blocked on the real-device check (§5).** If a real phone submits cleanly → close as emulator RAM. If it repros → open a real bug. | — |

### iOS (6 red)
| Flow | Cause | Action | Effort |
|---|---|---|---|
| `15.1-first-launch` | Asserts container testID `onboarding-name` directly (only the shared `onboarding-skip` was fixed) | Same 1-line change: wait on `onboarding-name-input` | 5 min |
| `9.5`, `0.1-sanity` | Flaked on splash→name transition on a tired Simulator | Re-run with the retry-once logic now in `run-maestro-ios-prod.sh`; if still flaky, bump the `onboarding-name-input` wait to 20 s | 0 (verify) |
| `12.2-audio-capture` | iOS Simulator has no mic path → "Recording…" never renders | Make the flow tolerant: `assertVisible` the record button, skip the "Recording…"/stop assertions when `platform: iOS` (there's precedent for platform-gated blocks). Cover the real recording on device. | 20 min |
| `8-progress-screen` | `"ACTIVITIES"` not visible on iOS | Pull the failure screenshot; likely needs `scrollUntilVisible` or an `id:` selector instead of the text (same class as the discover-list fix) | 20 min |
| `4-6-activity-flow` | Dies at Ask Peri send — QuickType eats the send tap (flow's own comments predict it) | Dismiss QuickType explicitly before `peri-chat-send` (tap a neutral point / `hideKeyboard`), or assert the sent bubble by `id` | 20 min |

**Android → green (minus the `4-6` unknown):** ~10 min.
**iOS → ~16/17:** ~1–1.5 hr.

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

Reproduces on the headless emulator only so far. To resolve:
1. **Real-device check** (§4) — fastest signal.
2. If it repros on device: `adb logcat -b crash,main,system -v time` from
   before the "Submit field work" tap; `dumpsys activity activities | grep
   mResumedActivity` at the moment it leaves; check the prod backend for a
   5xx on `POST /api/v1/student/sessions/.../…submit…`. `submitNotebookEntry`
   in `app/activity/[id].tsx:216` is the network call in the `try`.
3. Confirm it isn't state-specific: the prod session for the test account may
   already be `in_progress` from earlier runs — reset it and retry clean.

---

## 6. Pre-submission gates

Must be **green** before hitting "Submit for Review":

- [ ] Wayfinding + geofence pass on Android **and** iOS (§3)
- [ ] `4-6` submit confirmed working on a real device (§5)
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
- [ ] iOS suite ≥ 16/17
- [ ] `12.3`/`12.4` covered on a camera-capable Android device

---

## 7. Sequencing

1. **Now / today:** land the iOS flow fixes (§1, ~1.5 hr) → re-run both non-waypoint suites clean.
2. **Tomorrow (Paul):** wayfinding + geofence pass, both platforms (§3).
3. **When iOS signing is fixed:** iOS field build → manual checklist (§4) on both real devices, including the `4-6` submit test (§5).
4. **Parallel:** finish localization review of launch-language screens; add `i18n:check` to CI; produce store assets.
5. **Gate:** §6 checklist all green → submit.
