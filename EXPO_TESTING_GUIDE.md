# Peripateticware Mobile — Expo Testing Guide

> App: SDK 54 · React Native 0.81.5 · Package: `com.peripateticware.app`
> Updated: 2026-05-30

---

## Why Expo Go doesn't work

The bundle is ~15–25 MB (camera, audio, SQLite, location, offline sync).
Expo Go's Metro tunnel has a ~60s timeout. On typical home WiFi the transfer stalls.
**Expo Go is permanently off the table for this project.** Use a development build instead.

---

## Option A — EAS Development Build (Recommended)

A development build is a real APK/IPA that includes the Expo dev client.
Once installed it connects to your local Metro server exactly like Expo Go would,
but without the transfer timeout.

### Prerequisites

```bash
# Install EAS CLI globally (once)
npm install -g eas-cli

# Log in to your Expo account (free tier works)
eas login
# Enter your Expo account credentials

# Verify you're logged in
eas whoami
```

### First-time project setup

```bash
cd mobile

# Link project to EAS (only once)
eas init
# When prompted: use existing EAS project or create new one named "Peripateticware"
```

Check `eas.json` exists and has a `development` profile:

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal"
    }
  }
}
```

If `eas.json` doesn't exist, create it with the content above.

### Build the Android APK

```bash
cd mobile

# Build a development APK (runs on EAS cloud servers, ~10–15 min)
npx eas build --profile development --platform android

# When the build finishes, EAS prints a download URL.
# Download the .apk to your computer.
```

### Install on your Android device

1. Enable **Install from unknown sources** on your phone:
   Settings → Apps → Special app access → Install unknown apps → allow your file manager.

2. Transfer the APK to your phone (AirDrop substitute: use a USB cable, Google Drive, or email).

3. Tap the APK file to install.

4. Open the **Peripateticware** app (it shows the Expo dev client splash).

### Connect to your local Metro server

```bash
# In the mobile/ directory, start Metro
cd mobile
npx expo start --dev-client
```

Metro will print a URL like `exp+peripateticware://expo-development-client/?url=http%3A%2F%2F192.168.1.x%3A8081`.

On your phone:
- Open the installed Peripateticware app
- Tap "Enter URL manually" and paste the URL printed by Metro
- Or scan the QR code if your phone's camera can read it from the terminal

The app will connect and load your local bundle. Hot reload works normally.

### Point the app at your backend

The app reads `EXPO_PUBLIC_API_URL` from `mobile/.env`. Create it if it doesn't exist:

```bash
# Replace with your machine's local IP
echo "EXPO_PUBLIC_API_URL=http://192.168.1.X:8000/api/v1" > mobile/.env
```

Your machine's local IP:
- **Mac:** `ipconfig getifaddr en0`
- **Windows:** `ipconfig | findstr "IPv4"`
- **Linux:** `ip route get 1 | awk '{print $7}'`

Restart Metro after changing `.env`.

---

## Option B — Android Emulator (no physical device needed)

### Setup

1. Install **Android Studio**: https://developer.android.com/studio
2. Open Android Studio → Virtual Device Manager → Create Device
   - Device: Pixel 7 Pro (or similar)
   - System image: API 34 (Android 14)
3. Start the emulator (click the play button in AVD Manager)

### Run the app

```bash
cd mobile

# Start Metro and open in emulator automatically
npx expo start --android
```

If you have the development build installed on the emulator (install the APK via `adb`):

```bash
# Install APK to running emulator
adb install path/to/peripateticware-development.apk
```

The emulator accesses your host machine at `10.0.2.2`, so:

```bash
echo "EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1" > mobile/.env
```

---

## Option C — iOS Simulator (Mac only)

### Prerequisites

- Xcode 15+ installed (App Store)
- Xcode command line tools: `xcode-select --install`

### Build a development client for iOS simulator

```bash
cd mobile
npx eas build --profile development --platform ios --local
# --local runs the build on your machine (requires Xcode)
# This produces a .app bundle, not a .ipa
```

### Run

```bash
# Open iOS Simulator
open -a Simulator

# Start Metro
npx expo start --ios --dev-client
```

---

## Testing checklist once the app loads

Work through these screens to confirm the key flows work:

| Screen | What to verify |
|--------|---------------|
| Login | `student@example.com / SecurePassword123` logs in successfully |
| Discovery tab | Activities list loads from backend (not empty) |
| Activity detail | Tap an activity → brief sheet opens with title, description |
| Orient phase | Arrival check visible, learning targets shown |
| Inquiry phase | Prompt card renders, "Ask Peri" button present |
| Capture — photo | Camera opens, photo captured, uploads to backend |
| Capture — audio | Microphone permission prompt, recording works |
| Journal tab | Field notes list loads |
| Progress tab | Competency meters render (may be empty for new account) |
| Offline | Turn on airplane mode → activities still visible (SQLite cache) |
| Geofence | Move outside activity radius → toast appears within 30s |

---

## Common errors

**"Unable to find expo-dev-client" on launch**
The APK you installed doesn't have the dev client. Rebuild with `--profile development`.

**Metro "Network response timed out"**
Phone and computer are on different networks. Confirm both are on the same WiFi.
If behind a corporate VPN, disconnect VPN on the phone.

**"Invalid hook call" crash**
Version mismatch between React and React Native.
Run `npx expo install --fix` in `mobile/` to align versions.

**Camera/mic permission denied**
On Android 12+: Settings → Apps → Peripateticware → Permissions → enable Camera and Microphone.

**Backend 401 on all requests**
Token isn't being sent. Check `mobile/src/api/client.ts` — it reads the token from AsyncStorage.
In the dev client, open the Expo dev menu (shake device or Cmd+D in emulator) → confirm the API URL matches your backend.
