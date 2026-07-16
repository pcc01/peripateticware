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
