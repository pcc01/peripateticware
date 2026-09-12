#!/usr/bin/env bash
# ============================================================================
# run-maestro-ios-prod.sh   (run on the Mac)
#
# iOS-Simulator twin of scripts/run-maestro-prod.ps1: builds the app pointed
# at PROD (peripateticware.com), boots a Simulator, installs, and runs the
# non-waypoint Maestro flows one file at a time (per MAC_SETUP_GUIDE.md
# Part 2 §8–§9 and .github/workflows/mobile-e2e-maestro.yml's ios-maestro job).
#
# Runs: activity auth capture discover journal navigation onboarding
#       perispeech progress settings starter
# Skips: geofence, wayfinding  -> the FINAL pass, run separately (see §"iOS"
#        in PROD_E2E_GUIDE.md); offline -> needs OS network toggling;
#        12.3/12.4 photo+video capture -> no Simulator camera.
#
# NOTE: authored on the Windows box — sanity-check the first run on the Mac.
#
# Usage (credentials from your shell env — never in the repo; see
# PROD_E2E_GUIDE.md §0):
#   cd ~/dev/peripateticware/mobile
#   export STUDENT_EMAIL='<prod test student>' STUDENT_PASSWORD='<password>'
#   bash scripts/run-maestro-ios-prod.sh \
#       --student-email "$STUDENT_EMAIL" --student-password "$STUDENT_PASSWORD"
#
#   # reuse an existing build / pick the device:
#   bash scripts/run-maestro-ios-prod.sh --skip-build \
#       --device "iPhone 16" --runtime iOS-18 \
#       --student-email "$STUDENT_EMAIL" --student-password "$STUDENT_PASSWORD"
# ============================================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$MOBILE_DIR" || { echo "FATAL: cannot cd into $MOBILE_DIR"; exit 1; }

PROD_URL="https://peripateticware.com"
SKIP_BUILD=0
DEVICE_NAME="iPhone 17"
RUNTIME_MATCH="iOS-26"          # substring of the simctl runtime key, e.g. iOS-26, iOS-18
STUDENT_EMAIL=""
STUDENT_PASSWORD=""
APP_PATH="ios/build/Build/Products/Release-iphonesimulator/Peripateticware.app"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)        SKIP_BUILD=1; shift ;;
    --device)            DEVICE_NAME="$2"; shift 2 ;;
    --runtime)           RUNTIME_MATCH="$2"; shift 2 ;;
    --student-email)     STUDENT_EMAIL="$2"; shift 2 ;;
    --student-password)  STUDENT_PASSWORD="$2"; shift 2 ;;
    -h|--help)           grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

[[ "$(uname -s)" == "Darwin" ]] || { echo "FATAL: run this on the Mac."; exit 1; }
if [[ -z "$STUDENT_EMAIL" || -z "$STUDENT_PASSWORD" ]]; then
  echo "FATAL: --student-email and --student-password are required (use the prod test account)."; exit 1
fi
command -v maestro >/dev/null || { echo "FATAL: maestro not on PATH (MAC_SETUP_GUIDE.md Part 2 §4)."; exit 1; }
command -v jq      >/dev/null || { echo "FATAL: jq not on PATH (brew install jq)."; exit 1; }

# ── 1. Build against prod ────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "== expo prebuild + pod install =="
  npx expo prebuild --platform ios --no-install || exit 1
  bundle exec pod install --project-directory=ios || exit 1

  echo "== xcodebuild (Release, unsigned, EXPO_PUBLIC_API_URL=$PROD_URL) =="
  xcodebuild -workspace ios/Peripateticware.xcworkspace \
    -scheme Peripateticware \
    -configuration Release \
    -sdk iphonesimulator \
    -derivedDataPath ios/build \
    CODE_SIGNING_ALLOWED=NO \
    EXPO_PUBLIC_API_URL="$PROD_URL" || exit 1
else
  echo "== --skip-build: reusing $APP_PATH (confirm it was built against $PROD_URL) =="
fi
[[ -d "$APP_PATH" ]] || { echo "FATAL: $APP_PATH not found — build first."; exit 1; }

# ── 2. Boot the Simulator + install ─────────────────────────────────────────
echo "== locating Simulator: '$DEVICE_NAME' on runtime *$RUNTIME_MATCH* =="
UDID="$(xcrun simctl list devices available --json | \
  jq -r --arg d "$DEVICE_NAME" --arg r "$RUNTIME_MATCH" \
    '.devices | to_entries[] | select(.key | contains($r)) | .value[] | select(.name == $d) | .udid' | head -1)"
if [[ -z "$UDID" || "$UDID" == "null" ]]; then
  echo "FATAL: no available Simulator '$DEVICE_NAME' on a *$RUNTIME_MATCH* runtime."
  echo "       xcrun simctl list devices available   # see what you have"
  exit 1
fi
echo "   UDID $UDID"
xcrun simctl boot "$UDID" 2>/dev/null || true      # already-booted is fine
xcrun simctl bootstatus "$UDID" -b || true
xcrun simctl uninstall "$UDID" com.peripateticware.app 2>/dev/null || true
xcrun simctl install "$UDID" "$APP_PATH" || exit 1

# ── 3. Run the non-waypoint flows, one file per invocation ──────────────────
export STUDENT_EMAIL STUDENT_PASSWORD
export MAESTRO_DRIVER_STARTUP_TIMEOUT=90000        # cold-driver-attach headroom, same as CI

RUN_DIR="maestro/reports/ios-prod-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RUN_DIR"
echo "== running flows -> $RUN_DIR =="

overall_exit=0
i=0
pass=0
fail=0
for dir in activity auth capture discover journal navigation onboarding perispeech progress settings starter; do
  for flow in maestro/flows/"$dir"/*.yaml; do
    [[ -e "$flow" ]] || continue
    case "$flow" in
      */12.3-photo-capture.yaml|*/12.4-video-capture.yaml) echo "-- skip (no Simulator camera): $flow"; continue ;;
    esac
    i=$((i + 1))
    echo ""
    echo "== [$i] maestro test $flow =="
    # Retry once on failure — the iOS XCUITest driver attach/teardown is
    # flaky between flows (see the flow-file comments throughout this suite),
    # and a whole flow failing on a transient driver hiccup shouldn't count.
    # A flow that fails twice is a real failure. The run always continues to
    # the next flow either way.
    attempt=1
    flow_ok=0
    while [[ $attempt -le 2 ]]; do
      if maestro --device "$UDID" test "$flow" \
           -e STUDENT_EMAIL="$STUDENT_EMAIL" -e STUDENT_PASSWORD="$STUDENT_PASSWORD" \
           --format junit --output "$RUN_DIR/junit-$i.xml"; then
        flow_ok=1
        [[ $attempt -gt 1 ]] && echo "   (passed on retry)"
        break
      fi
      if [[ $attempt -eq 1 ]]; then
        echo "   [$i] failed — retrying once in 5s..."
        xcrun simctl terminate "$UDID" com.peripateticware.app 2>/dev/null || true
        sleep 5
      fi
      attempt=$((attempt + 1))
    done
    if [[ $flow_ok -eq 1 ]]; then
      pass=$((pass + 1))
    else
      fail=$((fail + 1)); overall_exit=1
    fi
  done
done

echo ""
echo "=============================================="
echo "  iOS prod run: $pass passed, $fail failed  ($i flows)"
echo "  JUnit:      $RUN_DIR/"
echo "  Maestro debug (screens/hierarchy): ~/.maestro/tests/<timestamp>/"
echo "=============================================="
exit $overall_exit
