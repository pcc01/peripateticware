# Launching Peripateticware — Apple App Store & Google Play

Two independent paths per store: **EAS** (Expo's build/submit service — recommended) or **manual** (Xcode / Android Studio + the consoles directly). Store copy (descriptions, keywords, privacy answers, reviewer notes) is in `docs/store-listings.md` — this doc is only the mechanics of getting a signed build into review. Pre-submission test gates are in `mobile/docs/mobile-test-plan.md` §6.

---

## 0. What this repo's build config already means for you

Checked directly in `mobile/`:

- **EAS is already set up and you're logged in** as `pcc01` (`pcerda0@gmail.com`), project id `aff166e5-83d2-45a6-abc3-e822b7755de4` (`eas.json`, `app.json extra.eas.projectId`). No `eas login` needed.
- **`eas.json` has a `production` build profile** (`autoIncrement: true`, channel `production`) and an empty `submit.production: {}` — submission credentials (App Store Connect API key, Play service account) aren't configured yet; see §3.4/§3.5.
- **iOS is managed (CNG)** — `mobile/ios/` is *not* committed to git, so EAS/`expo prebuild` regenerates it fresh every build from `app.json`. Whatever team ID is baked into a local one-off `ios/` folder (there's a stale `DEVELOPMENT_TEAM` from earlier device-build experiments) is irrelevant to EAS Build.
- **Android is bare (committed)** — `mobile/android/` *is* committed to git, so EAS Build (and any local `gradlew` build) uses that checked-in project **as-is**, native config plugins in `app.json` notwithstanding.
- **⚠️ `android/app/build.gradle`'s `release` build type signs with the debug keystore**:
  ```groovy
  release {
      // Caution! In production, you need to generate your own keystore file.
      signingConfig signingConfigs.debug
      ...
  }
  ```
  This is fine for sideloading (what every field/emulator build this cycle has used) but **Google Play will reject an upload signed with the debug key**. This must be fixed before any Play submission — §2.2 covers it once, the same way, for both the EAS and manual paths.
- **Version fields aren't set yet**: no `ios.buildNumber` / `android.versionCode` in `app.json`. With `appVersionSource: "local"` + `autoIncrement: true`, the first `eas build --profile production` per platform initializes them (1) and writes back to `app.json` — **commit that diff** after your first production build, or the next machine's build starts back at 1.
- `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` is already set (skips the export-compliance question on every App Store Connect build).

---

## 1. Accounts you need (one-time, do these first — they gate everything else)

| Account | Cost | Get it at | Notes |
|---|---|---|---|
| Apple Developer Program | $99/yr | developer.apple.com/programs | Must be the **paid** program, not a free Apple ID — App Store distribution requires it. Confirm which Apple ID/org this is under; earlier this cycle the only working signing identity on the build Mac was a *free* personal team (`cerda_paul@hotmail.com`), which cannot ship to the App Store. |
| App Store Connect access | included above | appstoreconnect.apple.com | Same login once enrolled. |
| Google Play Console | $25 one-time | play.google.com/console/signup | Per-developer, not per-app. |
| Privacy policy, live at a public URL | — | — | Both stores require this before you can submit. Point it at `https://peripateticware.com/privacy` (or wherever it actually lives) — confirm it's live and covers the data in `docs/store-listings.md`'s App Privacy / Data Safety tables. |

Nothing else below works without these.

---

## 2. One-time setup common to both paths

### 2.1 Reserve the app in each console

- **App Store Connect** → My Apps → **+** → New App → platform iOS, name "Peripateticware", primary language, bundle ID `com.peripateticware.app` (register it first under **Certificates, Identifiers & Profiles → Identifiers** if it's not already there), SKU (any unique string, e.g. `peripateticware-ios`).
- **Play Console** → All apps → **Create app** → name "Peripateticware", default language, App/Game = App, Free, accept the declarations. Package name `com.peripateticware.app` gets locked in on your **first upload**, not here — but decide now that it's staying `com.peripateticware.app` (matches iOS, matches `app.json`).

This just reserves the listing shell; the actual description/screenshots/etc. come later (§4) and can be filled in over multiple sessions before you submit.

### 2.2 Fix the Android signing key (do this once, before *any* Play upload — EAS or manual)

Generate a real upload keystore (this is the one thing you must never lose — back it up somewhere durable):

```powershell
cd C:\dev\peripateticware\mobile\android\app
& "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot\bin\keytool.exe" -genkeypair -v `
  -storetype PKCS12 -keystore peripateticware-upload.keystore `
  -alias peripateticware-upload -keyalg RSA -keysize 2048 -validity 10000
```
It'll prompt for a keystore password, key password, and your name/org (used only in the cert, not shown to users). **Save both passwords in a password manager — losing this keystore means you can never update the app again under this listing.**

Then wire it into the release build type (replace `signingConfig signingConfigs.debug` for `release`):
```groovy
signingConfigs {
    debug { ... }               // leave as-is
    release {
        storeFile file('peripateticware-upload.keystore')
        storePassword System.getenv("PPW_UPLOAD_STORE_PASSWORD")
        keyAlias 'peripateticware-upload'
        keyPassword System.getenv("PPW_UPLOAD_KEY_PASSWORD")
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        ...
    }
}
```
Set `PPW_UPLOAD_STORE_PASSWORD` / `PPW_UPLOAD_KEY_PASSWORD` as local env vars when you build (never commit the passwords). **Do not commit `peripateticware-upload.keystore` to a public repo** — add it to `mobile/.gitignore` and keep a private backup instead.

*(If you go the EAS route, EAS can generate and hold this keystore for you instead — see §3.3 — but you still need to remove the `signingConfig signingConfigs.debug` line from `release`, since a committed `android/` folder makes EAS treat this as a bare-workflow project and it will honor whatever the gradle file says.)*

---

## 3. Path A — EAS (recommended)

Faster, handles most of the signing dance, and you're already authenticated.

### 3.1 Sanity-check the config
```powershell
cd C:\dev\peripateticware\mobile
npx eas-cli build:configure          # confirms eas.json / app.json are consistent; safe to re-run
```

### 3.2 iOS credentials
```powershell
npx eas-cli credentials --platform ios
```
Choose **production** profile → let EAS manage credentials → it either finds an existing Distribution Certificate + App Store provisioning profile under your Apple Developer account or creates them (this needs your paid-account Apple ID login, once, interactively — 2FA required). This is a separate identity from whatever free personal-team cert exists on any development Mac; EAS's cloud build doesn't use that Mac at all.

### 3.3 Android credentials
```powershell
npx eas-cli credentials --platform android
```
With the debug-signing line removed from `build.gradle` (§2.2), choose **production** → let EAS generate and store a new upload keystore (simplest — it manages backup/retrieval for you), *or* upload the keystore you made in §2.2 if you'd rather hold it yourself.

### 3.4 Build
```powershell
npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production
# or both in one: --platform all
```
Runs in Expo's cloud (10–25 min each), gives you a progress URL. First run per platform will prompt to finalize credentials if §3.2/§3.3 weren't completed first. When it's done, **commit the `app.json` diff** (`autoIncrement` will have written a build number / version code).

### 3.5 Submit
One-time per platform, then reusable:

**iOS** — needs an App Store Connect API key: App Store Connect → Users and Access → Integrations → **App Store Connect API** → generate a key (role: App Manager) → download the `.p8` **once** (Apple won't let you re-download it), note the Key ID and Issuer ID.
```powershell
npx eas-cli submit --platform ios --profile production
```
Answer the prompts with the Key ID / Issuer ID / `.p8` path (or pre-fill them under `submit.production.ios` in `eas.json` so you're not prompted every time).

**Android** — needs a Google Play service account: Play Console → Setup → **API access** → link/create a Google Cloud project → create a service account → grant it **Release manager** access to this app → download its JSON key.
```powershell
npx eas-cli submit --platform android --profile production
```
Point it at the JSON key path when prompted (or set `submit.production.android.serviceAccountKeyPath` in `eas.json`).

`eas submit` uploads the *binary* to TestFlight (iOS) / an Internal testing track (Android) — it does not fill in your store listing or press "submit for review." That's §4–§5.

---

## 4. Path B — Manual

Use this if you'd rather not route through Expo's build servers, or want to keep the existing fast local Android loop (`gradlew assembleRelease`, used all through this test cycle) as your production path too.

### 4.1 iOS — Xcode

On the Mac, with the paid Apple Developer account signed into Xcode (Xcode ▸ Settings ▸ Accounts):
```bash
cd ~/Documents/peripateticware/mobile
npx expo prebuild --platform ios --no-install
bundle exec pod install --project-directory=ios
open ios/Peripateticware.xcworkspace
```
In Xcode: select target **Peripateticware** → **Signing & Capabilities** → Team = your paid team → confirm bundle id `com.peripateticware.app` resolves with **no red errors** (it will now, since the App ID is registered in §2.1). Set the run destination to **Any iOS Device (arm64)**. **Product ▸ Archive**. When it finishes, the Organizer opens → **Distribute App** → **App Store Connect** → **Upload**. It lands in App Store Connect under TestFlight within ~15–60 min (processing).

### 4.2 Android — Play Console

With §2.2's real keystore wired into `build.gradle`:
```powershell
cd C:\dev\peripateticware\mobile\android
$env:PPW_UPLOAD_STORE_PASSWORD = "…"
$env:PPW_UPLOAD_KEY_PASSWORD = "…"
.\gradlew.bat bundleRelease          # AAB, not APK — Play requires an Android App Bundle for new apps
```
Output: `android/app/build/outputs/bundle/release/app-release.aab`. Play Console → your app → **Production** (or **Internal testing** first, recommended) → **Create new release** → upload the `.aab` → fill release notes → save → review → roll out.

---

## 5. Store listing — the part neither EAS nor Xcode does for you

Both consoles need the metadata filled in by hand (or by API, out of scope here) before you can submit for review, regardless of which build path you used:

- **App Store Connect**: app record → **App Information** (category, age rating questionnaire) → **Pricing and Availability** → the version page (description, keywords, screenshots, promotional text, support/marketing URLs) → **App Privacy** (data-collection questions).
- **Play Console**: **Store presence → Main store listing** (title, descriptions, graphics) → **Store presence → App content** (privacy policy URL, ads declaration, content rating questionnaire, target audience / Play Families, Data safety form).

Every field, plus the exact App Privacy / Data Safety answers for this app (location, photos, mic, account data — no ads, no tracking) and the required screenshot list, is already drafted in **`docs/store-listings.md`** — copy straight from there.

Screenshots/icons themselves aren't in that doc (only the spec of what's needed) — capture them from a device or simulator running a `production`-pointed build.

---

## 6. Compliance flags specific to this app — resolve before submitting

- **Kids/COPPA stance**: already decided in `docs/store-listings.md` — **not** submitting to Apple's Kids Category, age rating 9+; COPPA/FERPA handled via school authorization + guardian consent rather than the Kids Category's stricter data rules. Make sure the age-rating questionnaire answers in both consoles match this (don't accidentally opt into "Made for Kids" / Play Families on the console side — it asks separately from what you put in the store description).
- **Billing happens on the website, not in the app** (homeschool subscriptions via Paddle, per `docs/store-listings.md`). If any screen in the app **links out** to a payment/upgrade page, that's Apple Guideline 3.1.1 (In-App Purchase) territory — Apple can require IAP for any digital subscription purchase flow reachable from the app, or reject an external payment link depending on category and region rules, which have shifted several times. Before submitting: confirm there is no in-app "Upgrade"/"Subscribe" button that opens a web checkout, or get a definitive read on Apple's current External Purchase Link Entitlement applicability for this app's country/category — this is the single highest-risk rejection reason for this app and isn't a call to make solo without checking Apple's current guideline text.
- **Location + camera + mic usage strings** are already in `app.json` (`NSLocationWhenInUseUsageDescription`, etc.) and reviewed as part of `docs/store-listings.md`'s App Privacy table — no action needed, just don't drop them in a future `app.json` edit.
- **Encryption export compliance**: `ITSAppUsesNonExemptEncryption: false` is set — correct as long as the app only uses standard HTTPS/TLS (true today); revisit if custom crypto is ever added.

---

## 7. Before you hit "Submit for Review" — final gate

Cross-check against `mobile/docs/mobile-test-plan.md` §6 (wayfinding/geofence pass on both platforms, the `4-6` submit investigation resolved, manual on-device checklist done on one real Android + one real iOS device) and `docs/store-listings.md`'s asset list (screenshots, icon, feature graphic). Both stores review app **behavior**, not just the listing — a build that crashes or mis-declares a permission on first launch is the most common quick rejection.

Recommend **TestFlight** (iOS, automatic once you archive/upload) and a Play **Internal testing** track (Android) for at least one full manual pass on real devices before promoting to public review, even though you've already field-tested pre-release builds this cycle — the store-signed binary is technically a different artifact from the sideloaded ones.
