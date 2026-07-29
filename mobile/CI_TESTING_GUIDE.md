# Running the Detox E2E Suite on GitHub Actions

This covers `.github/workflows/mobile-e2e.yml`, which already exists in the repo and already runs the full Android + iOS Detox matrix — including iOS 18 and iOS 26, which can't run on the local Intel Mac (Xcode 15.2 tops out at the iOS 17 SDK). This guide is about getting it running for you, not building it from scratch.

## 1. One-time setup

**Confirm Actions is enabled.** Settings → Actions → General → "Allow all actions and reusable workflows" (or your org's equivalent). Most repos already have this on.

**Add two repository secrets.** Both jobs pass `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD` into the Detox test run as env vars — these are the seed account the E2E suite logs in as. Without them, every test after the login screen will fail.

Settings → Secrets and variables → Actions → New repository secret:
- `TEST_STUDENT_EMAIL`
- `TEST_STUDENT_PASSWORD`

Use the same seed-account credentials your local E2E runs already use (see `mobile/e2e/helpers.js`).

**Ruby/CocoaPods lockfile — no action needed.** `mobile/Gemfile` exists but `Gemfile.lock` doesn't yet. That's fine: `ruby/setup-ruby@v1`'s `bundler-cache: true` runs `bundle install` and generates the lockfile on the first run, then caches it for subsequent runs. Nothing to do here — flagging only so a first-run "installing gems" step doesn't look like a problem.

That's it — no Apple Developer account, signing certs, or App Store Connect access needed. `CODE_SIGNING_ALLOWED=NO` in `.detoxrc.js`'s iOS build means these are unsigned simulator builds only.

## 2. Triggering a run

Three ways, after the edit made alongside this guide added a manual trigger:

- **Automatic on push** — pushing to `main` or `develop` with changes under `mobile/**` (or to the workflow file itself) runs the full suite.
- **Automatic on PR** — opening/updating a PR into `main` or `develop` that touches `mobile/**` runs it too.
- **Manual, on demand** — repo → Actions tab → "Mobile E2E (Detox)" in the left sidebar → "Run workflow" button (top right) → pick a branch → Run workflow. This is the one you'll want most: it lets you kick off just the iOS 26/18 jobs whenever you want, without needing a real push.

## 3. Reading results

Actions tab → the run → each matrix leg shows as its own job: `iOS 26 (iPhone 16)`, `iOS 18 (iPhone 15)`, `iOS 16 (iPhone 8)`, and five Android jobs for API 37/35/33/30/24.

A green check means that OS/device combo passed the whole suite. A red X — click into the job to see which `it(...)` block failed in the log.

On failure, scroll to the bottom of the job and open the **Artifacts** section (also visible on the run's summary page): each job uploads `detox-ios26-<run-id>` / `detox-android-api30-<run-id>` etc., containing Detox's recorded video and screenshots for the failing test(s), kept for 14 days.

## 4. Time and cost to expect

- Each iOS job has a 90-minute timeout (Xcode select → prebuild → pod install → build → boot simulator → run tests); each Android job 75 minutes. Actual wall-clock is usually well under that once caches (Gradle, CocoaPods) are warm.
- macOS runners are billed at roughly **10x** the rate of Linux minutes on GitHub's hosted runners. On a private repo, three iOS jobs at up to 90 minutes each could burn through a monthly free-minutes allowance fast if run on every push. If this repo is private, consider either restricting the iOS jobs to `workflow_dispatch` only (manual trigger, run when you actually need iOS coverage) or leaving push/PR triggers on Android only — happy to make that change if you want it.
- `fail-fast: false` on both jobs means one failing OS/API combo doesn't cancel the others — you get the full matrix result every time.

## 5. Local vs. CI split (for reference)

| Config | Where it runs | Why |
|---|---|---|
| `ios.26.debug`, `ios.18.debug` | CI only | Needs Xcode 16+/17+ (iOS 18/26 SDK) — unavailable on the Intel Mac's Xcode 15.2 ceiling |
| `ios.17.debug`, `ios.16.debug` | Local or CI | Xcode 15.2 ships the iOS 17 SDK, so these run fine on the Intel Mac (`detox test -c ios.17.debug`) |
| `android.api37/35/33/30/24.debug` | Local (with Android SDK/emulator) or CI | All runnable locally; CI runs the full matrix on every push for regression coverage |

Sources: [GitHub Actions billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage), [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing), [GitHub Actions macOS runner availability changelog](https://github.blog/changelog/2025-07-11-upcoming-changes-to-macos-hosted-runners-macos-latest-migration-and-xcode-support-policy-updates/)
