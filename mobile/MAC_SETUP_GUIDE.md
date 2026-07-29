# Mac setup guide — 2017 27" iMac (Intel), macOS Ventura

Covers setup for running the **iOS** Detox E2E suite on this Mac. Android
testing stays on the Windows machine (`scripts/run-android-e2e.ps1` /
`npm run test:android:*`) — this iMac is natively x86_64 with no Android SDK
work needed here.

The repo already ships working iOS test tooling that this guide sets up for:
- `scripts/test-preflight-ios.sh` — checks Xcode, Ruby/CocoaPods, simulator
  runtimes, `.env.test`, and backend reachability before anything runs.
- `scripts/run-tests-ios.sh` — builds + runs Detox against each iOS
  simulator config, with a summary table at the end.

---

## 0. Hardware reality check

40 GB of RAM is plenty — Xcode, a couple of iOS simulators, and Docker
Desktop for the backend can all run comfortably at once. The one thing that
still matters on this machine is the **Fusion Drive** (spinning disk + small
SSD cache): Xcode builds, CocoaPods installs, and Docker's Postgres volume
are all disk-I/O heavy, and a Fusion Drive is meaningfully slower here than
an SSD. Expect `pod install` and the first `expo prebuild` / Xcode build to
take longer than you'd guess from the RAM headroom alone — that's disk, not
memory, being the bottleneck. Nothing to configure for this, just budget the
time.

## 1. The Xcode ceiling on Ventura (read this before installing anything)

macOS Ventura caps at **Xcode 15.2**, which bundles the **iOS 17 SDK**. That
means:

- `ios.16.debug` and `ios.17.debug` (Detox configs in `.detoxrc.js`) run
  locally on this Mac — these are "all the iOS builds" you can actually test
  here.
- `ios.18.debug` and `ios.26.debug` require Xcode 16+/17+, which Ventura
  cannot install. These are CI-only (`.github/workflows/mobile-e2e.yml` runs
  them on GitHub-hosted macOS runners with a current Xcode). Don't spend time
  trying to force a newer Xcode onto Ventura — it won't install.

Both `test-preflight-ios.sh` and `run-tests-ios.sh` already know this and
default to the two locally-achievable configs.

## 2. Xcode

Install Xcode 15.2 from the App Store (or Apple's developer downloads page
if the App Store no longer offers 15.2 directly for Ventura — search
"Xcode 15.2" on developer.apple.com/download/all/). Then:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcodebuild -version   # should print Xcode 15.2
```

Open Xcode once and let it install additional components if prompted, then
confirm the iOS 16 and 17 simulator runtimes are present: **Xcode → Settings
→ Platforms**. If either is missing:

```bash
xcodebuild -downloadPlatform iOS
```

## 3. Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

On this **Intel** Mac, Homebrew installs to `/usr/local` (not `/opt/homebrew`
— that's the Apple Silicon path). The installer prints the exact
`eval "$(/usr/local/bin/brew shellenv)"` line to add to `~/.zprofile`
(Ventura's default shell is zsh).

## 4. Ruby (via rbenv — do not use macOS's system Ruby)

Ventura ships Ruby 2.6.10, which is too old for the CocoaPods version pinned
in `mobile/Gemfile` (1.17.0 needs Ruby >= 2.7.4). `test-preflight-ios.sh`
checks for this specifically and will tell you to do the following if it
catches system Ruby active:

```bash
brew install rbenv ruby-build
rbenv install 3.2.4
cd ~/dev/peripateticware/mobile   # or wherever you cloned the repo
rbenv local 3.2.4
echo 'eval "$(rbenv init -)"' >> ~/.zshrc
source ~/.zshrc
ruby -v   # should now print 3.2.4, not 2.6.10
```

## 5. Node

```bash
brew install node watchman
```

## 6. Docker Desktop (for the backend)

The iOS simulator shares the Mac's network namespace, so it talks to the
backend at `localhost:8000` directly (no special-cased host IP the way the
Android emulator needs `10.0.2.2`).

Download the **Intel chip** build from docker.com/products/docker-desktop —
the site offers separate Apple Silicon and Intel installers, make sure you
get Intel. Ventura is a supported host OS; with 40 GB of RAM there's no need
to trim Docker's resource allocation the way a lower-RAM machine would.

## 7. Get the repo and install dependencies

```bash
cd ~/dev   # or wherever you keep projects
git clone <repo-url> peripateticware   # or pull if already cloned
cd peripateticware/mobile
npm install
```

## 8. Test credentials file

```bash
cp .env.test.example .env.test
```

The defaults in `.env.test.example` already match the backend's seeded test
accounts (`student@test.local` / `Test1234!`, `teacher@test.local` /
`Test1234!` — seeded automatically by
`backend/startup.py::seed_test_accounts()`), so for local dev you likely
don't need to edit anything, just make sure the file exists.

## 9. Bring the backend up

```bash
cd ~/dev/peripateticware   # repo root, not mobile/
docker compose up --build -d
docker compose logs backend --tail 15   # look for "Application startup complete."
```

Dev mode works with no `.env` at all — see `LOCAL_DOCKER.md` at the repo root
if you want real generated secrets instead of the dev fallbacks.

## 10. Run pre-flight, then the suite

```bash
cd ~/dev/peripateticware/mobile
bash scripts/test-preflight-ios.sh
```

Fix anything marked `[FAIL]` (warnings are OK to proceed with). Once it
passes:

```bash
bash scripts/run-tests-ios.sh
```

With no flags this runs both locally-achievable configs — `ios.16.debug`
(iPhone 8, iOS 16 floor) and `ios.17.debug` (iPhone 15, iOS 17) — building
the native project once (`expo prebuild` + `bundle exec pod install`), then
Detox-testing each in turn with a pass/fail summary table at the end.

Other useful invocations:

```bash
bash scripts/run-tests-ios.sh --config ios.17.debug     # just one config
bash scripts/run-tests-ios.sh --skip-preflight           # once you've verified the machine once
bash scripts/run-tests-ios.sh --skip-build                # rerun tests only, reuse the existing native project/Pods
bash scripts/run-tests-ios.sh --all                       # attempt ios.18/ios.26 too — will fail here per the Xcode 15.2 ceiling; documented for completeness, not expected to pass on this Mac
```

## 11. Reading results

Per-config artifacts (videos/screenshots on failure) land in
`mobile/artifacts/<config>/<run-date>/`, and the final terminal output prints
a summary table (`CONFIG | RESULT | TIME`) plus a pass/fail count.

---

## Troubleshooting

- **`pod install` fails / CocoaPods errors** — almost always the Ruby version
  issue in section 4. Confirm `ruby -v` shows 3.2.4 (rbenv), not 2.6.10
  (system Ruby), in the shell you're running from.
- **`ios.18.debug`/`ios.26.debug` fail to build or boot** — expected on this
  Mac; Ventura caps at Xcode 15.2 (iOS 17 SDK). Not a bug, see section 1.
- **Simulator runtime not found** — `xcodebuild -downloadPlatform iOS`, or
  Xcode → Settings → Platforms and install the missing iOS version manually.
- **Backend not reachable** — `test-preflight-ios.sh`'s last check hits
  `http://localhost:8000/health`; confirm `docker compose up -d` succeeded
  and `docker compose logs backend` shows the app started.
- **Slow builds** — check Activity Monitor's Disk tab before assuming
  something's wrong; the Fusion Drive is the likely cause per section 0, not
  a misconfiguration.

---

# Part 2: Mac setup guide — Apple Silicon Mac, macOS 26 (Tahoe)

A separate, newer Mac from the Ventura iMac above. This part covers running
the **Maestro** E2E suite (`mobile/maestro/`) against the iOS Simulator —
the same suite `.github/workflows/mobile-e2e-maestro.yml`'s `ios-maestro` job
runs in CI (`ios-version: '26'`, `runner: macos-latest`,
`xcode-version: latest-stable`). Nothing here touches the iMac's Detox suite
or Android tooling.

Unlike the iMac, there's no Xcode-version ceiling to work around — Tahoe
installs the current Xcode straight from the App Store, matching what CI's
`macos-latest` runner already uses for the iOS 26 leg.

## 1. Read this first: camera capture (12.3/12.4) will still be skipped here

Before setting anything up: **plugging in the iPhone 12 does not make the
camera-capture flows (`12.3-photo-capture.yaml`, `12.4-video-capture.yaml`)
runnable, on this Mac or any Mac, today.** This isn't a setup gap — it's a
current limitation of Maestro itself, confirmed against Maestro's own docs
(2026-07-27): iOS support is Simulator-only, and physical iOS devices are
explicitly documented as unsupported ("Executing tests on physical iOS
devices is not supported yet"). Real-device support (via `devicectl`/
`iproxy`) exists only as an open, unmerged PR upstream — not in any released
Maestro CLI version. `maestro test` has no way to address a real iOS device
at all, independent of code signing, device trust, or Developer Mode being
set up correctly.

Practically, that means:

- The iOS Simulator has no camera hardware, so `12.3`/`12.4` will hit the
  same "Starting camera…" stall documented in
  `maestro/flows/capture/12.3-photo-capture.yaml`'s header and in the CI
  workflow's `ios-maestro` job — skip them with the same
  `case "$flow" in */12.3-photo-capture.yaml|*/12.4-video-capture.yaml)
  continue ;; esac` pattern CI already uses (see step 5 below).
- The iPhone 12 is still useful for **manual** verification of the in-app
  camera (`src/components/InAppCamera.tsx`) — install a dev build on it
  directly and exercise Observe & Capture by hand — but that's outside
  Maestro and needs its own code-signing setup (see section 11 below for
  the actual steps; a free Apple ID works but re-signs/expires the build
  every 7 days). Don't set that up unless you actually want to do that
  manual pass — it isn't needed for anything below.
- Camera capture is already exercised automatically on **Android**, both
  locally (`scripts/run-maestro-all-devices.ps1`) and in CI — the emulator's
  synthetic test-pattern camera is enough to drive the capture pipeline
  end-to-end there. This Mac doesn't change that; it just extends the same
  Simulator-only coverage the iOS CI job already has.

If Maestro ships real iOS device support later, revisit this section —
until then, treat 12.3/12.4 on iOS as "Android-verified, iOS manual-only."

## 2. Xcode

Install Xcode from the App Store (latest version — Tahoe has no ceiling like
Ventura's Xcode 15.2 cap). Then:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcodebuild -version
```

Open Xcode once to let it finish installing components, then confirm an iOS
Simulator runtime is present (Xcode → Settings → Platforms). If missing:

```bash
xcodebuild -downloadPlatform iOS
```

## 3. Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

This is an **Apple Silicon** Mac, so Homebrew installs to `/opt/homebrew`
(not `/usr/local` — that's the Intel iMac's path in Part 1). The installer
prints the exact line to add to `~/.zprofile`:

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

## 4. Maestro CLI

Same install CI uses:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
echo 'export PATH="$HOME/.maestro/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
maestro --version
```

## 5. Ruby (via rbenv), Node, Watchman

Same rationale as the iMac's section 4 — don't rely on system Ruby, it won't
match the CocoaPods version pinned in `mobile/Gemfile`:

```bash
brew install rbenv ruby-build node watchman
rbenv install 3.2.4
cd ~/dev/peripateticware/mobile   # or wherever you cloned the repo
rbenv local 3.2.4
echo 'eval "$(rbenv init -)"' >> ~/.zshrc
source ~/.zshrc
ruby -v   # should print 3.2.4
```

## 6. Backend

Same as the iMac's sections 6–9: install Docker Desktop's **Apple Silicon**
build from docker.com/products/docker-desktop, clone the repo, then:

```bash
cd ~/dev/peripateticware   # repo root
docker compose up --build -d
docker compose logs backend --tail 15   # look for "Application startup complete."
```

The Simulator shares the Mac's network namespace, so the app reaches the
backend at `localhost:8000`/`127.0.0.1:8000` directly — same as the iMac's
Detox setup, no special host IP needed.

## 7. Repo, dependencies, test credentials

```bash
cd ~/dev/peripateticware/mobile
npm install
cp .env.test.example .env.test
```

Defaults already match the backend's seeded test accounts
(`student@test.local` / `Test1234!`) — no edits needed for local dev.

## 8. Build the app for Simulator and boot it

Mirrors what `.github/workflows/mobile-e2e-maestro.yml`'s `ios-maestro` job
does (Release build, `CODE_SIGNING_ALLOWED=NO` — no Apple ID needed for a
Simulator build):

```bash
npx expo prebuild --platform ios --no-install
bundle exec pod install --project-directory=ios

xcodebuild -workspace ios/Peripateticware.xcworkspace \
  -scheme Peripateticware \
  -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath ios/build \
  CODE_SIGNING_ALLOWED=NO \
  EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

`127.0.0.1`, not `localhost` — CI's own comment on this step found the
Simulator's NSURLSession racing IPv6/IPv4 resolution of `localhost` and
eating several seconds per request on an instant IPv6 connection refusal
before falling back to IPv4. The literal IPv4 address skips that.

Boot a Simulator and install the build:

```bash
xcrun simctl list devices available   # find a runtime, e.g. "iPhone 17"
UDID=$(xcrun simctl list devices available --json | \
  jq -r '.devices | to_entries[] | select(.key | contains("iOS-26")) | .value[] | select(.name == "iPhone 17") | .udid' | head -1)
xcrun simctl boot "$UDID"
xcrun simctl install "$UDID" ios/build/Build/Products/Release-iphonesimulator/Peripateticware.app
```

## 9. Run the flows

Wait for the backend health check, then run each folder through
`scripts/run-maestro-flows.sh` — one `maestro test` invocation per flow
file, same as CI, so one dead XCUITest driver connection only costs that
flow instead of cascading (see that script's header comment and the CI
workflow's matching comment for the real failures this works around):

```bash
curl -fs http://localhost:8000/health   # confirm backend is up first

export STUDENT_EMAIL=student@test.local
export STUDENT_PASSWORD=Test1234!
export MAESTRO_DRIVER_STARTUP_TIMEOUT=90000   # cold-driver-attach headroom, same as CI

mkdir -p artifacts
overall_exit=0
i=0
for dir in activity auth capture discover geofence journal navigation onboarding perispeech progress settings starter; do
  for flow in maestro/flows/"$dir"/*.yaml; do
    # Per section 1: no camera hardware in the Simulator, skip these two.
    case "$flow" in
      */12.3-photo-capture.yaml|*/12.4-video-capture.yaml) continue ;;
    esac
    i=$((i + 1))
    maestro --device "$UDID" test "$flow" \
      -e STUDENT_EMAIL="$STUDENT_EMAIL" -e STUDENT_PASSWORD="$STUDENT_PASSWORD" \
      --format junit --output "artifacts/junit-$i.xml"
    [ "$?" = 0 ] || overall_exit=1
  done
done
echo "exit: $overall_exit"
```

`maestro/flows/offline/` is deliberately excluded — those two flows need
real OS network toggling around them, and there's no verified,
non-disruptive way to cut just the Simulator's network on this Mac (see the
CI workflow's matching comment on why that job skips it too).

For a quick one-off check instead of the full sweep, `package.json` already
has:

```bash
npm run test:maestro:settings   # -e STUDENT_EMAIL/PASSWORD baked in, one folder
```

## 10. Reading results

Same as the iMac's Detox suite: per-flow JUnit XML lands in `artifacts/`,
and Maestro's own richer debug output (screenshots, view hierarchy) lands in
`~/.maestro/tests/<timestamp>/` — copy it out if you need to dig into a
failure:

```bash
cp -r ~/.maestro/tests/<latest-timestamp-folder> ~/dev/peripateticware/mobile/maestro-debug/
```

## 11. Installing on your iPhone 12 for manual testing (free Apple ID)

Not part of the Maestro sweep — this is for the manual-only camera pass
flagged in section 1, or just running the app by hand on real hardware.
Unlike the Simulator build in section 8, this needs real code signing
(`CODE_SIGNING_ALLOWED=NO` only works for the Simulator) but *not* a paid
Apple Developer Program membership — Apple lets any free Apple ID sign and
install to a device you own, with two tradeoffs: the install **expires
after 7 days** (re-run from Xcode to refresh it, no rebuild needed unless
the code changed), and there's no TestFlight/push-notification-entitlement
access without the paid Program.

1. Plug the iPhone 12 into the Mac via USB. If prompted on the phone, tap
   "Trust This Computer."
2. Add your Apple ID to Xcode, if not already there: Xcode → Settings →
   Accounts → `+` → sign in.
3. Generate the native project and open it (same prebuild as section 8,
   but no `CODE_SIGNING_ALLOWED=NO` this time — Xcode needs to sign it for
   real):
   ```bash
   cd ~/dev/peripateticware/mobile
   npx expo prebuild --platform ios --no-install
   bundle exec pod install --project-directory=ios
   open ios/Peripateticware.xcworkspace
   ```
4. In Xcode's device dropdown (top toolbar), select "iPhone 12" — it
   should appear once trusted in step 1.
5. Project navigator → "Peripateticware" target → **Signing &
   Capabilities** tab → check "Automatically manage signing" → set
   **Team** to your Apple ID (shows as "*(Personal Team)*").
6. Click ▶ Run. Xcode builds, signs with the free personal-team
   certificate, and installs straight to the phone.
7. First launch will be blocked as an "Untrusted Developer" — on the
   phone: Settings → General → VPN & Device Management → tap your Apple ID
   under Developer App → Trust.

`EXPO_PUBLIC_API_URL` defaults to whatever's baked in at build time (see
`src/api/client.ts`) — for hitting the same Docker backend from section 6,
the phone needs the Mac's LAN IP, not `127.0.0.1`/`localhost` (those
resolve to the phone itself over USB/Wi-Fi, not the Mac). Find it with
`ipconfig getifaddr en0` and pass
`EXPO_PUBLIC_API_URL=http://<that-ip>:8000` as a build setting, or edit
the scheme's environment variables in Xcode, before step 6.

---

## Troubleshooting (Part 2 — Maestro on Tahoe)

- **`DeviceUnreachableException during deviceInfo` / a flow just hangs then
  fails** — a known upstream Maestro/WebDriverAgent regression on iOS 26.x
  (mobile-dev-inc/maestro#3318, #3254, #2932): the XCUITest driver
  connection can drop mid-session. Running one `maestro test` per flow file
  (section 9 above) already works around this — if it still happens, rerun
  just that one flow rather than the whole sweep.
- **iOS driver not ready in time /
  `IOSDriverTimeoutException`** — bump `MAESTRO_DRIVER_STARTUP_TIMEOUT`
  further; a cold Simulator boot can be slow enough to blow past the
  default.
- **12.3/12.4 stuck on "Starting camera…"** — expected here, not a bug; see
  section 1. Skip them, don't debug them, on this Mac.
- **`pod install` fails** — check `ruby -v` is 3.2.4 (rbenv), not system
  Ruby, same as the iMac's Troubleshooting entry.
- **Backend not reachable** — confirm `docker compose up -d` succeeded and
  `docker compose logs backend` shows the app started; the app was built
  with `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` baked in, so a backend
  bound to a different host/port won't be reachable without rebuilding.
- **iPhone 12 (section 11) — "Unable to Install" / signing errors in
  Xcode** — usually a stale provisioning profile after switching Apple
  IDs or teams; Xcode → Settings → Accounts → select the account →
  "Download Manual Profiles," or just toggle "Automatically manage
  signing" off and back on to force a refresh.
- **iPhone 12 — app opens then immediately shows "Unable to Verify App" /
  won't launch** — the 7-day free-signing expiry from section 11 hit;
  re-run from Xcode (step 6 there) to re-sign, no code changes needed.
- **iPhone 12 — app launches but can't reach the backend** — check you
  used the Mac's LAN IP (`ipconfig getifaddr en0`), not `127.0.0.1`, per
  section 11's `EXPO_PUBLIC_API_URL` note; also confirm the phone and Mac
  are on the same Wi-Fi network (or that USB networking is enabled) and
  the Mac's firewall isn't blocking incoming connections to port 8000.
- **iPhone 12 — app crashes on launch with "No script URL provided" /
  `scriptURLString=(null)`** — the Debug build (section 11) has no
  embedded JS bundle; it loads from Metro over Bonjour/mDNS
  auto-discovery, and this is what fails when that discovery doesn't
  happen. Cheapest cause first, robust fix if it keeps happening:
  - **Quick check:** confirm `npx expo start` is actually running in a
    terminal on the Mac *before* hitting Xcode's ▶ Run — Xcode does not
    reliably start Metro for you on a device build. Also confirm the
    phone is on the same Wi-Fi network as the Mac (not just plugged in
    via USB), and that the Mac's firewall didn't block node's first
    "allow incoming connections" prompt. On the phone, Settings →
    Privacy & Security → Local Network should show the app toggled on;
    if it's missing from that list entirely, Bonjour discovery can't
    work at all until the Info.plist carries the right permission key
    (see the dev-client fix below, which handles this).
  - **Robust fix:** install `expo-dev-client` so a failed auto-discovery
    shows a manual bundler-URL entry screen instead of crashing:
    ```bash
    npx expo install expo-dev-client
    npx expo prebuild --platform ios --clean
    bundle exec pod install --project-directory=ios
    ```
    Rebuild/run from Xcode, then on the dev-client screen enter
    `http://<mac-lan-ip>:8081` (same IP as the `EXPO_PUBLIC_API_URL`
    note above, port 8081 instead of 8000).
