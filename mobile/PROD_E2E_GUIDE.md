# Running the mobile E2E suite against PROD (peripateticware.com)

Final-review lane for the waypoints / wayfinding / geofence features. The
standard Maestro suite (`maestro/flows/**`) targets a **fresh local backend**
with seeded data; this guide covers what changes to point it at prod.

- **Android automated**: this Windows machine — `scripts\run-maestro-prod.ps1`
  (Maestro + the API 24–37 AVDs; §3, §8).
- **iOS automated**: the Mac — `scripts/run-maestro-ios-prod.sh` (Maestro on the
  Xcode Simulator; §7).
- **On-device manual**: real GPS by walking / driving the Langley + South
  Whidbey Community Park locations the field builds target (§6, §9).

> **Prod already has the seed activities.** As of 2026-09-09 the k6 load-test
> student account (see §0) sees `Campus Wayfinding Hunt` — full rung-B, ordered,
> 3 waypoints at the seed coordinates, `my_session: null` — and
> `Creek Habitat Study`, both at the Berkeley seed coords. So **the standard
> `maestro/flows/**` suite runs against prod unmodified with that account**. The
> `maestro/flows-prod/` twins and the §2 provisioning are only needed for the
> **field builds** — real coordinates at walkable/drivable WA locations.

---

## 0. Credentials & host — never in the repo

Every script here takes the login and prod-host address as parameters / env.
Nothing is committed. Set them in your shell for the length of a session
(pull the values from your password manager / team vault — the k6 load-test
accounts and prod-host address are the ones the `k6/` suite uses):

```bash
# macOS / Git Bash
export STUDENT_EMAIL='<prod test student email>'
export STUDENT_PASSWORD='<prod test student password>'
export PROD_SSH='<user>@<prod-host>'     # only for the §4 session reset
export DB_USER='<prod db user>'          # only for the §4 session reset
export DB_NAME='<prod db name>'
```

```powershell
# Windows PowerShell
$env:STUDENT_EMAIL    = '<prod test student email>'
$env:STUDENT_PASSWORD = '<prod test student password>'
$env:PROD_SSH         = '<user>@<prod-host>'
$env:DB_USER          = '<prod db user>'
$env:DB_NAME          = '<prod db name>'
```

The snippets below reference these variables rather than literal values. If you
prefer, pass `-StudentEmail` / `-StudentPassword` (PowerShell) or
`--student-email` / `--student-password` (bash) explicitly instead.

---

## 1. What differs from the local suite

| | Local suite | Prod lane |
|---|---|---|
| Backend | fresh Postgres per run, seeded | live prod DB, persistent |
| Student login | `student@test.local` (auto-seeded) | a real prod account (§0) |
| Activities | `startup.seed_*` demo rows | already present on prod, or authored (§2) |
| Session state | clean every run | **resumes** — needs a reset between runs (§4) |
| `offline/14.*` flows | stop the backend container | **not runnable** against prod — skipped |
| GPS coordinates | Berkeley campus (seed) | Berkeley (stock) or Langley WA + South Whidbey (field) |

Prod-coordinate GPS flows live in **`maestro/flows-prod/`**:
`wayfinding-prod.yaml`, `geofence-prod.yaml`. The `run-maestro-prod.ps1`
wrapper runs those plus the prod-safe standard folders and skips
`geofence/`, `wayfinding/`, `offline/` from `maestro/flows/`.

---

## 2. Provision on prod (only for the field builds)

The stock suite needs nothing here — prod already has `Campus Wayfinding Hunt`
and `Creek Habitat Study` visible to the k6 student account. Do this section
only when re-authoring the activities at the real WA locations for on-device
field testing.

### 2a. A student account

Reuse the k6 load-test student account if those accounts still exist, or make a
dedicated one. It must be **in a class** that has the activities below assigned
/ published. (Student self-signup is broken on prod — provision via the same
backend-container script the k6 work used, or promote an existing account.)

Set `$STUDENT_EMAIL` / `$STUDENT_PASSWORD` (§0).

### 2b. Activity — "Creek Habitat Study"  (discovery, single location guard)

Keep the title **exactly** `Creek Habitat Study` — 8 standard flows
(`discover/3`, `activity/4-6`, `journal/7`, `progress/8`, `capture/12.1–12.4`)
open it by that literal string, so no flow edits are needed.

| Field | Value |
|---|---|
| Type | discovery |
| Location centre | `48.04210, -122.40560`  (First Street, downtown Langley WA) |
| Radius | `400` m |
| Published / assigned | to the test student's class |

`geofence-prod.yaml` drives the student from the centre out to
`48.03300, -122.41500` (~1.3 km SW, well outside 400 m) and asserts the
"you've left the activity area" toast. For the **manual drive test**: start on
First Street, head out Cascade Ave / Langley Rd — you cross 400 m within about
half a kilometre.

### 2c. Activity — "QA Waypoints — South Whidbey Community Park"  (wayfinding, rung B)

| Field | Value |
|---|---|
| Type | discovery, **wayfinding enabled**, capability **ceiling = rung B** (on-device arrival, no coordinate stored, no consent prompt) |
| Navigation mode | **ordered** |
| Stop 1 "Trailhead" | `47.99790, -122.43850` · arrival radius `60` m |
| Stop 2 "Forest Loop" | `47.99900, -122.43720` · arrival radius `60` m |
| Stop 3 "Picnic Shelter" | `47.99680, -122.43680` · arrival radius `60` m |
| Published / assigned | to the test student's class |

Stops are placed on the loop trail at **South Whidbey Community Park**
(5495 Maxwelton Rd, Langley) so you can also walk it on a real device in
~10 min. **The coordinates above are approximate** — open them on a map, nudge
each to the real trail point you'll walk to, then regenerate the flow's
`setLocation` stepping:

```
node scripts/gen-wayfinding-steps.mjs --start 47.99780,-122.43870 \
  47.99790,-122.43850  47.99900,-122.43720  47.99680,-122.43680
```

Paste its output over the stepping blocks in `maestro/flows-prod/wayfinding-prod.yaml`
(and match Stop 1/2/3 in the prod activity to the same numbers).

---

## 3. Run it (Android, this machine)

```powershell
cd C:\dev\peripateticware\mobile
# $env:STUDENT_EMAIL / $env:STUDENT_PASSWORD set per §0

# one device (API 35), builds a prod APK from mobile\.env, runs the lane
.\scripts\run-maestro-prod.ps1 `
    -StudentEmail $env:STUDENT_EMAIL -StudentPassword $env:STUDENT_PASSWORD

# full Android matrix (pauses for a state reset between devices — see §4)
.\scripts\run-maestro-prod.ps1 -StudentEmail $env:STUDENT_EMAIL -StudentPassword $env:STUDENT_PASSWORD `
    -Devices API37,API35,API33,API30,API24

# iterate without rebuilding; drop the capture flows
.\scripts\run-maestro-prod.ps1 -StudentEmail $env:STUDENT_EMAIL -StudentPassword $env:STUDENT_PASSWORD `
    -SkipBuild -SkipSetup -IncludeCapture:$false
```

`mobile/.env` must have `EXPO_PUBLIC_API_URL=https://peripateticware.com`
(already set) — the wrapper refuses to build otherwise. Reports land in
`maestro/reports/<AvdName>/` (`junit.xml`, `console.log`, `artifacts/`).

---

## 4. Reset session state between runs

`startActivitySession` is *start **or resume*** server-side. After one
wayfinding run the student's session for that activity is complete, so the next
run (or the next device) opens straight to "All stops found!" and fails every
`N of 3 stops` assertion.

Reset (scoped to the one activity by title — never touches other data). With
`$PROD_SSH` / `$DB_USER` / `$DB_NAME` set per §0:

```powershell
Get-Content scripts\reset-wayfinding-prod.sql | ssh $env:PROD_SSH `
  "docker exec -i peripateticware-postgres psql -U $env:DB_USER -d $env:DB_NAME `
   -v activity='Campus Wayfinding Hunt'"
```

```bash
ssh "$PROD_SSH" "docker exec -i peripateticware-postgres psql -U $DB_USER -d $DB_NAME \
  -v activity='Campus Wayfinding Hunt'" < scripts/reset-wayfinding-prod.sql
```

Use the activity title you actually ran (`Campus Wayfinding Hunt` for the stock
flow, `QA Waypoints — South Whidbey Community Park` for the field flow). A
multi-device run pauses and prints the command after each device; run it, then
press ENTER.

---

## 5. Teardown after the final run

- If you authored QA activities/accounts for the field builds: delete the
  student account + any auto-created org / class, and the two QA activities.
- Delete evidence captured by the `capture/12.*` flows (notes, audio, photo,
  video rows under the test student) — or skip those flows with
  `-IncludeCapture:$false` and cover capture manually.
- **Rotate the k6 load-test password / deactivate those accounts** when the
  whole load-test + E2E effort is done — it is a shared prod credential.

---

## 6. Coverage — automated vs. manual

**Automated (emulator, mocked GPS) covers:** activity discovery, the
rung-B arrival → progress → "all stops found" path, ordered-sequence
enforcement, the geofence enter/leave toast, offline-cache reads of activity
content, and every non-GPS screen (auth, nav, journal, progress, settings,
perispeech, capture UI).

**Must be done manually on a real device — automation can't reach these:**

- Real GPS drift / movement (mocked `setLocation` is a teleport, not a walk).
- Background / screen-locked behaviour, Android Doze, OEM battery killing.
- Arrival **notification** delivery.
- The granular iOS permission states (While Using / Once / precise-off) and
  the Android 11+ separate background-location prompt.
- Map tile rendering + the route line on Apple Maps (iOS) vs Google (Android).
- Actually walking South Whidbey Community Park with the wayfinding panel up,
  and driving in/out of the Langley 400 m radius.

---

## 7. iOS on the Mac — same suite, Xcode Simulator

One-time Mac setup is `MAC_SETUP_GUIDE.md` **Part 2** (Homebrew, Maestro CLI,
`jq`, rbenv Ruby, Node, Watchman, Xcode + a Simulator runtime). Then, with
`$STUDENT_EMAIL` / `$STUDENT_PASSWORD` exported per §0:

```bash
cd ~/dev/peripateticware/mobile
git pull                       # get scripts/run-maestro-ios-prod.sh + flows-prod/

# non-waypoint suite against prod (build → boot Simulator → install → run)
bash scripts/run-maestro-ios-prod.sh \
  --student-email "$STUDENT_EMAIL" --student-password "$STUDENT_PASSWORD"

# pick a specific Simulator you actually have installed:
bash scripts/run-maestro-ios-prod.sh --device "iPhone 16" --runtime iOS-18 \
  --student-email "$STUDENT_EMAIL" --student-password "$STUDENT_PASSWORD"
```

What the script does (mirrors `run-maestro-prod.ps1` and the CI `ios-maestro`
job): `expo prebuild` + `pod install`, `xcodebuild` a **Release, unsigned**
Simulator build with `EXPO_PUBLIC_API_URL=https://peripateticware.com` baked
in, `xcrun simctl boot`/`install`, then `maestro test` **one flow file at a
time** (a dead XCUITest driver only costs that flow) over folders
`activity auth capture discover journal navigation onboarding perispeech
progress settings starter`.

Skipped on the Simulator: `12.3-photo-capture` / `12.4-video-capture` (no
camera), `offline/` (needs OS network toggling), and — for this pass —
`geofence` + `wayfinding` (the final pass, §7a). JUnit → `maestro/reports/ios-prod-<ts>/`.

### 7a. iOS final pass — wayfinding + geofence

Prod's `Campus Wayfinding Hunt` / `Creek Habitat Study` are at the Berkeley
seed coordinates, and Maestro's `setLocation` drives the iOS Simulator the same
way it drives the Android emulator, so the **stock** flows work:

```bash
export MAESTRO_DRIVER_STARTUP_TIMEOUT=90000
UDID=$(xcrun simctl list devices booted -j | jq -r '.devices[][0].udid')

maestro --device "$UDID" test maestro/flows/geofence/10-geofence.yaml \
  -e STUDENT_EMAIL="$STUDENT_EMAIL" -e STUDENT_PASSWORD="$STUDENT_PASSWORD"
maestro --device "$UDID" test maestro/flows/wayfinding/11-wayfinding.yaml \
  -e STUDENT_EMAIL="$STUDENT_EMAIL" -e STUDENT_PASSWORD="$STUDENT_PASSWORD"
```

Re-running wayfinding needs the §4 session reset first (it's `start or resume`).
`maestro/flows-prod/*` are the WA-coordinate twins — use those only when the
prod activities have been re-authored at the WA locations for field testing.

---

## 8. Reproducing the Android run yourself (Android Studio)

The `run-maestro-prod.ps1` / `run-maestro-all-devices.ps1` scripts use the same
emulator + `adb` that Android Studio ships — Android Studio's only role is the
**Device Manager** (create / boot an AVD) and the **SDK Manager** (system
images). The tests themselves are `maestro test` from a terminal.

```powershell
cd C:\dev\peripateticware\mobile

# full non-waypoint suite, one device, builds a prod APK from mobile\.env:
.\scripts\run-maestro-all-devices.ps1 -SkipSetup -Devices API35 `
  -Flows "starter,auth,navigation,discover,activity,journal,progress,perispeech,onboarding,settings,capture" `
  -StudentEmail $env:STUDENT_EMAIL -StudentPassword $env:STUDENT_PASSWORD
```

To watch it in the Android Studio emulator window, boot the AVD from Device
Manager first and add `-SkipSetup` (the script attaches to the already-running
`emulator-5556` for `Pixel_6_API_35`). Reports → `maestro\reports\Pixel_6_API_35\`.

Final Android pass (after the reset in §4 if re-running wayfinding):

```powershell
.\scripts\run-maestro-all-devices.ps1 -SkipSetup -SkipBuild -Devices API35 `
  -Flows "geofence,wayfinding" `
  -StudentEmail $env:STUDENT_EMAIL -StudentPassword $env:STUDENT_PASSWORD
```

---

## 9. Field builds (real device, real GPS)

After the automated passes, build installable versions so the WA locations can
be walked / driven:

- **Android**: `eas build --profile preview --platform android` (internal-dist
  APK, prod channel per `eas.json`) — sideload it.
- **iOS**: `MAC_SETUP_GUIDE.md` Part 2 §11 (free Apple ID, `xcodebuild` +
  `ios-deploy` / Xcode ▸ Devices) for a personal-team build onto your iPhone.

Re-author the two activities from §2 at the real coordinates first, and use the
`maestro/flows-prod/*` flows / `gen-wayfinding-steps.mjs` output to keep the
mocked-GPS runs in sync with what you'll walk.
