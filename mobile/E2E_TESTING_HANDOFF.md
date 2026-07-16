# E2E Testing Handoff — Peripateticware Mobile (Android/Windows)

Written 2026-07-14 for continuation in a new chat thread. Read this whole file
before doing anything — it captures several real bugs found and fixed today,
plus exact next steps.

## Big picture

Original goal: get the Android E2E suite passing on this Windows machine, then
extend to iOS. Detox turned out to have an unresolved, deeply-diagnosed 45s
`ActivityTestRule.launchActivity()` failure — abandoned in favor of **Maestro**
(`mobile-dev-inc/Maestro`), which doesn't depend on that native instrumentation
path. Flows converted from `e2e/settings.test.js` live in `mobile/maestro/flows/`.

While debugging Maestro failures, we discovered the app had **real product
bugs** that were the actual root cause all along — not test-tooling flakiness.
Those are fixed now (see below). We were in the middle of re-verifying when
this thread ended (Docker Desktop crashed, then the emulator got closed).

## Root causes found and fixed today

1. **Splash screen never dismissed — app never fully booted, on ANY launch,
   automated or manual.** This was the real cause of the original Detox 45s
   timeout AND every Maestro ANR/timeout seen today.
   - File: `mobile/app/_layout.tsx`
   - Bug: `<Stack onLayout={onLayout} ...>` — `Stack` from `expo-router` is a
     navigator config component, not a `View`; it silently drops unknown
     props. `onLayout` never fired, so `SplashScreen.hideAsync()` (which lived
     inside that callback) was dead code.
   - Fix applied: removed `onLayout` from `<Stack>`, replaced with a
     `useEffect(() => { if (appReady) SplashScreen.hideAsync()... }, [appReady])`
     that fires directly off the `appReady` state instead of a layout event.
   - **Verified fixed** — confirmed via manual screenshot that the app now
     renders past the splash screen.

2. **Backend rejected `@test.local` login emails with 422.**
   - File: `backend/routes/auth.py`, local `LoginRequest` class (~line 76)
   - Bug: `email: Optional[EmailStr] = None` — Pydantic's `email-validator`
     rejects RFC 6761 special-use domains (`.local`, `.test`, `.example`,
     `.invalid`) by design. The E2E seed accounts
     (`backend/startup.py::seed_test_accounts()`) are deliberately
     `@test.local`.
   - Fix applied: changed to `email: Optional[str] = None` for **login only**
     (left `SignupRequest`/`RegisterRequest`'s `EmailStr` untouched — strict
     validation still applies at account creation). Rationale documented
     inline in the code: login is just a DB lookup, a non-matching string
     fails with 401 anyway, so there's no security reason to 422 on format.
   - **Verified fixed** — backend logs showed `✅ Login successful:
     student@test.local (STUDENT)` and `200 OK` on `/api/v1/auth/login`.
   - This is a live-reloading `uvicorn --reload` container (see
     `backend/Dockerfile` CMD, `./backend:/app` volume mount in
     `docker-compose.yml`) — no rebuild needed, just wait ~2s after editing.

3. **`DMSans_600SemiBold.ttf` doesn't exist in the installed
   `@expo-google-fonts/dm-sans` package** (it only ships 400/500/700 weights).
   `Font.loadAsync` was rejecting on every launch, which is non-fatal by
   itself (caught, logged as `console.warn`) — BUT every `console.warn` in a
   React Native dev build triggers a persistent **LogBox banner** ("Open
   debugger to view warnings") that visually overlaps the bottom of the
   screen, including the tab bar. This was **silently swallowing taps** aimed
   at `tab-settings` etc. — Maestro reported the tap as "completed" (it found
   and tapped the element's coordinates) but the banner intercepted the touch.
   - File: `mobile/app/_layout.tsx`, `Font.loadAsync({...})` call
   - Fix applied: removed the `DMSans_600SemiBold` require line entirely
     (confirmed via `grep` it's not referenced anywhere as a `fontFamily` in
     `src/theme/tokens.ts` — it was genuinely dead weight).
   - **Verified fixed** for this specific warning — the "Cannot find module"
     error is gone from Metro output as of the last successful `expo
     run:android`.

## ⚠️ Known remaining issue — NOT yet fixed

**A NEW unrelated warning appeared after fixing #3**:
```
Method downloadAsync imported from "expo-file-system" is deprecated... 
⊘ Questions sync failed (will use cached or API fallback)
```
This will almost certainly trigger the same LogBox banner and could keep
blocking taps the same way #3 did. Two options, not yet decided/implemented:
- (a) Fix the specific deprecated API call (migrate off `downloadAsync` to
  the new `File`/`Directory` classes from `expo-file-system` — SDK 54
  guidance: https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/), or
- (b) Suppress the LogBox banner overlay for dev/test builds generally
  (e.g. `LogBox.ignoreAllLogs(true)` in `_layout.tsx`, possibly gated behind
  `__DEV__`/an E2E env flag) so future unrelated warnings can't keep blocking
  automated (or manual) taps. This was proposed to the user but **not yet
  approved or implemented** — ask before doing this, since it also affects
  the human developer's normal dev-mode warning visibility.

Recommend starting the new thread by finding the `downloadAsync` call (search
`grep -rn "downloadAsync" mobile/src mobile/app`) and deciding which fix to
apply before re-running tests.

## Current environment state (as of thread end — may have changed)

- **Docker Desktop had crashed** (`npipe:////./pipe/dockerDesktopLinuxEngine`
  connection error on all `docker compose` commands). User was told to
  restart Docker Desktop the application (not just retry CLI), and if stuck,
  try `wsl --shutdown` then relaunch. **Not yet confirmed back up.**
- **The Android emulator had also stopped running** (likely a side effect of
  the Docker/WSL restart). User was told to run:
  ```powershell
  emulator -list-avds
  emulator -avd Nexus_5X_API_24    # or whatever -list-avds shows
  adb devices                       # wait until it shows "device" not blank/offline
  ```
  **Not yet confirmed back up.**

**First thing to do in the new thread: confirm both Docker Desktop
(`docker info` succeeds) and the emulator (`adb devices` shows a `device`
line) are healthy before touching anything else.**

## Once environment is healthy — resume here

1. Bring the backend up if not already: `docker compose up -d` from
   `C:\dev\peripateticware` (repo root, not `mobile/`).
2. Confirm backend health: `docker compose logs backend --tail 15` — look for
   `Application startup complete.`
3. Decide + implement the fix for the `downloadAsync` deprecation warning
   (see "Known remaining issue" above).
4. Rebuild/reinstall so Metro picks up any further JS changes:
   ```powershell
   cd C:\dev\peripateticware\mobile
   npx expo run:android
   ```
5. Rerun the target flow:
   ```powershell
   maestro test maestro/flows/settings/9.1-account-pickers.yaml -e STUDENT_EMAIL=student@test.local -e STUDENT_PASSWORD=Test1234!
   ```
6. If it fails again, pull debug artifacts the same way as before:
   ```powershell
   Copy-Item "C:\Users\pcerd\.maestro\tests\<latest-timestamp-folder>\*" "C:\dev\peripateticware\mobile\maestro-debug\" -Recurse -Force
   ```
   Then read the `screenshot-❌-*.png` and `commands-(*).json` files directly
   — this was far more effective than guessing from terminal output alone
   all session.
7. Once `9.1-account-pickers.yaml` passes cleanly, run the other two
   converted flows in the same directory (`9.2-theme-change.yaml`,
   `9.4-sign-out.yaml`), then proceed to converting the rest of the original
   Detox suite (`e2e/*.test.js`) to Maestro flows — there were ~32 tests
   total in the prior working state referenced earlier in this project.
8. iOS: Maestro flows still need to be written/verified for iOS simulators.
   User has an Intel 2017 Mac on Ventura with Xcode capped at 15.2, so only
   iOS 17/16 simulators run locally — iOS 18/26 need CI.

## Test credentials (verified correct — do not re-guess)

From `backend/startup.py::seed_test_accounts()` (the E2E/Detox seed set,
**distinct** from `seed_demo_users()`'s different, non-`@test.local`
accounts/password — these two seed functions were a major source of
confusion earlier in this project, always check `startup.py` source directly
rather than guessing):

- `student@test.local` / `Test1234!`
- `teacher@test.local` / `Test1234!`
- (4 more `@test.local` accounts exist per that function — check source if
  needed for other roles)

Also stored in `mobile/.env.test` (`TEST_STUDENT_EMAIL`,
`TEST_STUDENT_PASSWORD`, etc.) and wired into
`mobile/package.json`'s `test:maestro:settings` script.

## Useful housekeeping added today

- `mobile/scripts/cleanup-metro.ps1` (new) + `npm run test:metro:cleanup` —
  kills stray processes on Metro ports 8081/8082/8083 and clears stale `adb
  reverse` mappings. Run this if a Maestro/Detox run hangs on app launch, or
  before starting a fresh `expo run:android` if a previous one didn't shut
  down cleanly (this bit us today — a stale second Metro instance on 8081 was
  serving an old bundle, masking a JS fix for a while).
- `mobile/scripts/cleanup-android-emulators.ps1` (pre-existing) +
  `npm run test:android:cleanup` — kills emulators + Gradle daemon.

## Debugging technique that worked well (reuse this)

When a Maestro flow fails, don't guess from the terminal output alone —
Maestro auto-saves rich debug artifacts to
`C:\Users\pcerd\.maestro\tests\<timestamp>\`, but that path isn't in a
mounted/readable location for the file tools. Copy it to a
readable/mounted path first:
```powershell
Copy-Item "C:\Users\pcerd\.maestro\tests\<latest>\*" "C:\dev\peripateticware\mobile\maestro-debug\" -Recurse -Force
```
Then read `screenshot-❌-*.png` (Read tool supports images directly — this is
how we found the ANR dialog, the home-screen-instead-of-app screenshot, and
the LogBox banner covering the tab bar) and `commands-(*).json` (full
step-by-step JSON with exact failure point, stack traces, and
`sequenceNumber` to correlate against the flow YAML).

For app-level hangs (not just Maestro-reported failures), pulling a live
screenshot manually was decisive:
```powershell
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png <local-path>.png
```
(Note: `adb exec-out screencap -p > file.png` via PowerShell `>` redirection
corrupts binary output — always use `adb shell screencap` + `adb pull`
instead.)

And filtering logcat to just the live process PID cuts through enormous
noise from other Android system processes:
```powershell
adb shell "ps -A | grep peripateticware"    # get the pid
adb logcat -d --pid=<pid>
```
