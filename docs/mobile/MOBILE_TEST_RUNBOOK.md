# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# Mobile E2E Test Runbook

Detox + Jest end-to-end testing for the Peripateticware mobile app: how to run
it, on which machine, across which OS versions, and how to fix the recurring
CocoaPods/Ruby problem on the Intel Mac.

---

## 1. Architecture overview

- **Test framework:** Detox (device automation) + Jest (test runner), config
  at `mobile/.detoxrc.js`, Jest config at `mobile/e2e/jest.config.js`.
- **Android:** emulators driven from this Windows PC via
  `mobile/scripts/run-android-e2e.ps1`, which provisions AVDs with
  `sdkmanager`/`avdmanager`, builds a release APK, and runs the full API
  matrix locally.
- **iOS:** simulators driven from Paul's Intel Mac (macOS Ventura, 13.x) via
  `mobile/scripts/test-preflight-ios.sh` and `mobile/scripts/run-tests-ios.sh`.
  CocoaPods is installed through a pinned `mobile/Gemfile` + Bundler, not a
  bare `gem install`, so the version doesn't silently drift.
- **CI:** GitHub Actions (`.github/workflows/mobile-e2e.yml`) runs the full
  matrix — all Android API levels on `ubuntu-latest`, and all iOS versions
  (including the ones the Ventura Mac can't run) on GitHub-hosted macOS
  runners with current Xcode. CI is the source of truth for full-matrix
  coverage; local runs are for fast iteration on what each machine can
  actually execute.

## 2. Release matrix

| Platform | Version | Runs on Windows (local) | Runs on Mac (local) | Runs in CI | Notes |
|---|---|---|---|---|---|
| Android | API 24 (7.0 Nougat) | Yes | — | Yes | `android.api24.debug` |
| Android | API 30 (11 R) | Yes | — | Yes | `android.api30.debug` |
| Android | API 33 (13 Tiramisu) | Yes | — | Yes | `android.api33.debug` |
| Android | API 35 (15 VanillaIceCream) | Yes | — | Yes | `android.api35.debug` |
| Android | API 37 (17 Cinnamon Bun) | Yes | — | Yes | `android.api37.debug` — newly added |
| iOS | 16 | — | Yes | Yes | `ios.16.debug` — floor (iPhone 8) |
| iOS | 17 | — | Yes | Yes | `ios.17.debug` — newly added, fills the 16→18 gap |
| iOS | 18 | — | **No** | Yes | `ios.18.debug` — CI-only |
| iOS | 26 | — | **No** | Yes | `ios.26.debug` — CI-only |

**Why iOS 18/26 are CI-only on the Ventura Mac:** macOS Ventura caps the
installable Xcode version at 15.2 (Xcode 16+ requires macOS Sonoma 14.5 or
later). Xcode 15.2 bundles the iOS 17 SDK and simulator runtime, and Apple
does not let you install newer simulator runtimes than your Xcode supports —
so the iOS 18 and iOS 26 simulators are physically impossible to run on this
Mac until it's upgraded past Ventura. CI's GitHub-hosted macOS runners get a
current Xcode via `maxim-lobanov/setup-xcode@v1`, so they cover iOS 18/26
without that constraint.

## 3. Windows quick-start (Android)

```powershell
cd C:\dev\peripateticware\mobile
.\scripts\run-android-e2e.ps1
```

Optional flags: `-SkipBuild` (reuse existing APK), `-SkipSetup` (assume
AVDs already exist), `-Config android.api37.debug` (run a single config).

## 4. Mac quick-start (iOS)

```bash
cd /path/to/peripateticware/mobile
bash scripts/test-preflight-ios.sh     # verify environment — Xcode, Ruby, CocoaPods, simulators, .env.test, backend
bash scripts/run-tests-ios.sh          # preflight (again) + build + run ios.16.debug + ios.17.debug
```

Flags for `run-tests-ios.sh`:
- `--skip-preflight` — skip the preflight check (not recommended)
- `--skip-build` — reuse the existing native iOS project / Pods / app bundle
- `--config <name>` — run one or more specific configs, e.g.
  `--config ios.17.debug` or `--config ios.16.debug,ios.17.debug`
- `--all` — attempt the full matrix including `ios.18.debug` and
  `ios.26.debug`. This is for documentation/dry-run purposes or a future
  newer Mac — it prints a warning and will most likely fail to build or boot
  a simulator on this Ventura machine.

### One-time Ruby/CocoaPods fix (do this once, before the first iOS run)

This is the actual fix for "the latest CocoaPods doesn't run on the Intel
Mac." Ventura ships a system Ruby (2.6.10) that current CocoaPods can't use.
Don't try to `sudo gem install cocoapods` against system Ruby — install a
modern Ruby via rbenv instead:

```bash
brew install rbenv ruby-build
rbenv install 3.2.4
cd /path/to/peripateticware/mobile
rbenv local 3.2.4                 # writes mobile/.ruby-version, scoped to this project
eval "$(rbenv init -)"            # add this line to ~/.zshrc (or ~/.bash_profile) if not already there
ruby -v                           # should now print ruby 3.2.4, not 2.6.10

gem install bundler
bundle install                    # reads mobile/Gemfile, installs CocoaPods 1.17.0 (pinned)
bundle exec pod --version         # sanity check — should print 1.17.0
```

After this one-time setup, `test-preflight-ios.sh` will detect the rbenv
Ruby and Bundler-managed CocoaPods automatically on every future run.

## 5. Troubleshooting: CocoaPods on Intel Mac / Ventura

Two independent root causes were found and fixed. Both matter — fixing only
one will still leave iOS testing broken.

**Root cause 1 — Ruby version.** macOS Ventura's system Ruby is 2.6.10.
CocoaPods dropped support for Ruby < 2.7 years ago; the current release
(CocoaPods 1.17.0, July 2026) requires Ruby >= 2.7.4. Running
`sudo gem install cocoapods` against system Ruby fails outright — this is
the literal "latest CocoaPods does not run on the Mac Intel" error Paul hit.
**Fix:** install Ruby via rbenv (not system Ruby) — see the one-time fix
above — and manage CocoaPods through `mobile/Gemfile` + Bundler
(`bundle exec pod ...`) instead of a global gem install, so the version is
pinned and reproducible instead of silently tracking "latest."

**Root cause 2 — Xcode ceiling.** macOS Ventura (13.x) can install at most
Xcode 15.2 (Xcode 16+ requires macOS Sonoma 14.5+). Xcode 15.2 only bundles
the iOS 17 SDK and simulator runtime, so it cannot create or boot iOS 18 or
iOS 26 simulators — the `ios.18.debug` and `ios.26.debug` Detox configs are
not achievable on this hardware/OS combination, independent of the Ruby
problem. **Fix:** restrict local runs to `ios.16.debug` / `ios.17.debug`
(the default behavior of `run-tests-ios.sh` with no flags) and rely on CI's
GitHub-hosted macOS runners, which get a current Xcode, to cover iOS 18/26.

If `bundle install` or `bundle exec pod install` fails after the Ruby fix,
also check:
- Xcode command-line tools are selected: `xcode-select -p` should print a
  path under `/Applications/Xcode.app`, not just the CLT-only path. Fix with
  `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`.
- Missing simulator runtime: `xcrun simctl list runtimes` should list iOS 16
  and iOS 17. If one is missing, run `xcodebuild -downloadPlatform iOS` or
  install it via Xcode > Settings > Platforms.

## 6. For the Mac's Claude Code agent

Paste this block directly into the Claude Code session running on the Mac:

```
Run the iOS Detox E2E suite for peripateticware/mobile.

1. cd into the mobile/ directory of this repo.
2. Run: bash scripts/test-preflight-ios.sh
   - If it exits non-zero, read the [FAIL] lines it prints.
   - If it fails on Ruby version: follow the one-time rbenv fix in
     docs/mobile/MOBILE_TEST_RUNBOOK.md section "One-time Ruby/CocoaPods
     fix" — install rbenv + Ruby 3.2.4, `rbenv local 3.2.4` inside mobile/,
     then `bundle install`. Do NOT try to fix this with `sudo gem install
     cocoapods` — that's the broken path (system Ruby 2.6 vs CocoaPods
     needing >= 2.7). See docs/mobile/MOBILE_TEST_RUNBOOK.md section
     "Troubleshooting: CocoaPods on Intel Mac / Ventura" for the full
     explanation before re-diagnosing from scratch.
   - If it fails because mobile/.env.test is missing: it will auto-copy
     mobile/.env.test.example to mobile/.env.test. Fill in real test
     credentials (ask Paul if you don't have them) before continuing.
   - If it warns about missing iOS 16/17 simulator runtimes: run
     `xcodebuild -downloadPlatform iOS`.
   - Re-run preflight until it exits 0 (warnings are fine, [FAIL] is not).
3. Run: bash scripts/run-tests-ios.sh
   - This runs ios.16.debug and ios.17.debug by default (the only two iOS
     versions this Ventura Mac can actually execute — ios.18.debug and
     ios.26.debug are CI-only, don't try to force them with --all unless
     Paul specifically asks for a dry-run).
4. Report back: the pass/fail summary table the script prints at the end,
   plus the artifact paths (mobile/artifacts/<config>/<date>/) for any
   failing config so Paul can review screenshots/videos.
```

## 7. New automated coverage

Detox test files added for the sections of `MANUAL_TESTING_GUIDE.md` that
were previously manual-only (`mobile/e2e/starter.test.js` already covered
"App Launch & Auth" item 1.3, the bare login screen). All new files pick up
automatically under `e2e/jest.config.js`'s `testMatch:
['<rootDir>/e2e/**/*.test.{js,ts}']` — no config changes were needed.
`mobile/e2e/helpers.js` (not a test file itself) holds a shared
`loginAsStudent()` used by every file below; it reads
`TEST_STUDENT_EMAIL`/`TEST_STUDENT_PASSWORD` from `mobile/.env.test`, which
`e2e/jest.config.js` now loads via `dotenv` before tests run.

| Manual guide section | New test file | Covers | Caveats |
|---|---|---|---|
| 1. App Launch & Auth | `e2e/auth.test.js` | Wrong-password alert (1.4), student login → Discover redirect (1.5), session persists after backgrounding/reopening (1.6) | Skips 1.1/1.2 (onboarding splash/name/location) — unauthenticated launch always routes straight to `/login` (`app/_layout.tsx` `AuthGuard`); the `(onboarding)` route group isn't reachable from a normal cold start |
| 2. Navigation | `e2e/navigation.test.js` | All 4 tabs navigate to their screen; confirms no 5th "Explore" tab renders even though `app/(tabs)/explore.tsx` exists on disk | Added `tabBarButtonTestID` (`tab-discover`/`tab-journal`/`tab-progress`/`tab-settings`) to `app/(tabs)/_layout.tsx` |
| 3. Discover | `e2e/discover.test.js` | Seeded activity cards render (title/subject/location), pull-to-refresh, tap card → Brief phase | Skips 3.2/3.3 (offline banner via WiFi toggle) — no WiFi-toggle mocking pattern exists in this codebase and Detox has no built-in cross-platform API for it |
| 4 & 6. Activity Flow / Completing an Activity | `e2e/activity-flow.test.js` | Full Brief → Orient → Inquiry → Reflect → Submit walk, plus opening/sending in Ask Peri and dismissing the sheet | Ask Peri step only asserts the user's own message renders (not the AI reply — that needs Ollama running, per the manual guide) |
| 5. Student Capture Tools | *(none — skipped)* | — | The Inquiry phase's 📷🎤✏️🎥 buttons in `app/activity/[id].tsx` (`InquiryPhase`) are still wired to `Alert.alert('Coming soon', ...)`, not to `CaptureSheet` (which has real photo/audio/note logic but is unreachable — its `showCapture` state is never set to `true` from the UI). Not fabricating a test against capture flows the UI doesn't actually expose yet. |
| 7. Journal | `e2e/journal.test.js` | Screen loads (list or empty state), pull-to-refresh doesn't crash | Skips 7.2/7.3 (entry detail screen `/journal/[id]`) — no such route exists in `mobile/app/`, and journal entry cards are plain non-touchable `<View>`s with no navigation wired up |
| 8. Progress | `e2e/progress.test.js` | Stats row (activities/captures/streak labels), scroll to bottom doesn't crash | Competency/badge sections are conditional on non-empty data, so their presence isn't asserted for a freshly-seeded account |
| 9. Settings | `e2e/settings.test.js` | Account email + theme/age-band picker options visible, theme switch is interactive, Sign Out → back to login | Skips 9.3 (language picker) — no language control exists in the current `app/(tabs)/settings.tsx` (a `work_tracking.md` note references one from an earlier pass, but it's not in this working tree). Sign-out test taps the *2nd* `by.text('Sign out')` match to hit the native confirm-alert's destructive button — first use of that pattern here, worth a manual on-device check across both platforms. |
| 10. Geofence | `e2e/geofence.test.js` | No toast inside the activity radius; non-blocking toast appears and the flow stays usable once `device.setLocation()` moves outside the radius | **First use of `device.setLocation()` in this codebase.** No prior location-mocking pattern existed. iOS support depends on the deprecated `fbsimctl`; Android needs the `permissions: { location: 'always' }` launch option to actually grant runtime permission for `useGeofence`'s `watchPositionAsync` to start. Verify on-device before trusting in CI. Uses the real seeded "Creek Habitat Study" activity (`backend/startup.py::seed_sample_activities`, lat 37.8716/lon -122.2727, 500m radius). |
| 11. Age-Band Adaptation | `e2e/age-band-adaptation.test.js` | Default (7–12) vs. K–6 copy differences in Journal ("Field Notes" vs. "Field Journal") and Progress ("Activities" vs. "Adventures") stat labels, switched via the Settings age-band picker | **Gap:** the manual guide implies age band is a per-account/login attribute ("log in with a K–6 account"), but it's actually client-only local state (`src/bands/BandContext.tsx`, defaults to `m712`) with no link to the logged-in user. `mobile/.env.test.example` and `backend/startup.py::seed_test_accounts()` only seed one student account with no age-band variants. This test exercises the real mechanism (the Settings picker) instead of fabricating K–6/7–12 login accounts that don't exist. |

### testID additions made to support the above

Existing components had almost no `testID`s beyond `login-screen`
(`app/login.tsx`). Added, following that same kebab-case convention:

- `app/login.tsx` — `email-input`, `password-input` (`TextInput`s)
- `app/(tabs)/_layout.tsx` — `tabBarButtonTestID`: `tab-discover`, `tab-journal`, `tab-progress`, `tab-settings`
- `app/(tabs)/index.tsx` — `discover-screen` (root), `discover-list` (`FlatList`)
- `app/(tabs)/journal.tsx` — `journal-screen` (root), `journal-list` (`FlatList`)
- `app/(tabs)/progress.tsx` — `progress-screen` (root), `progress-scroll` (`ScrollView`)
- `app/(tabs)/settings.tsx` — `settings-screen` (root)
- `app/activity/[id].tsx` — `activity-screen` (root), `geofence-toast` (toast `TouchableOpacity`), `reflection-input` (`TextInput`)
- `src/components/PeriChatSheet.tsx` — `peri-chat-sheet` (root), `peri-chat-input` (`TextInput`), `peri-chat-send` / `peri-chat-close` (`TouchableOpacity`s)

Deliberately *not* added: `testID`s on `ActivityCard` (Discover) or journal
entry cards — both are dynamic `FlatList` items keyed by real (seeded)
content, not something needing an index-based ID for this pass.

---

## Appendix: file map

| File | Purpose |
|---|---|
| `mobile/.detoxrc.js` | Detox device/app/configuration matrix (Android + iOS) |
| `mobile/Gemfile` | Pins CocoaPods to a known-good version via Bundler |
| `mobile/.env.test` | Real test credentials (gitignored) |
| `mobile/.env.test.example` | Template for `.env.test` |
| `mobile/scripts/run-android-e2e.ps1` | Windows/Android: SDK+AVD setup, build, full matrix run |
| `mobile/scripts/test-preflight-ios.sh` | macOS/iOS: environment verification |
| `mobile/scripts/run-tests-ios.sh` | macOS/iOS: preflight + build + test runner |
| `.github/workflows/mobile-e2e.yml` | CI: full Android + iOS matrix on GitHub-hosted runners |
