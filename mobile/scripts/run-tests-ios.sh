#!/usr/bin/env bash
# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
#
# ============================================================================
# run-tests-ios.sh
#
# One-command iOS Detox E2E runner. Mirrors run-android-e2e.ps1's shape
# (preflight → build → per-config test loop → artifact collection → summary
# table) but for the iOS/macOS toolchain (Bundler-pinned CocoaPods, Xcode,
# xcrun simctl).
#
# Usage:
#   cd /path/to/peripateticware/mobile
#   bash scripts/run-tests-ios.sh                       # default: ios.16 + ios.17 (locally-achievable)
#   bash scripts/run-tests-ios.sh --skip-preflight
#   bash scripts/run-tests-ios.sh --skip-build
#   bash scripts/run-tests-ios.sh --config ios.17.debug
#   bash scripts/run-tests-ios.sh --config ios.16.debug,ios.17.debug
#   bash scripts/run-tests-ios.sh --all                  # attempt full matrix incl. ios.18/ios.26 (will likely fail on Ventura/Xcode 15.2)
# ============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$MOBILE_DIR" || { echo "FATAL: cannot cd into $MOBILE_DIR"; exit 1; }

c_reset=$'\033[0m'; c_red=$'\033[31m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_cyan=$'\033[36m'

SKIP_PREFLIGHT=0
SKIP_BUILD=0
RUN_ALL=0
CONFIGS_ARG=""

# ── Parse flags ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-preflight) SKIP_PREFLIGHT=1; shift ;;
    --skip-build)      SKIP_BUILD=1; shift ;;
    --all)             RUN_ALL=1; shift ;;
    --config)
      CONFIGS_ARG="$2"
      shift 2
      ;;
    --config=*)
      CONFIGS_ARG="${1#*=}"
      shift
      ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

# ── Resolve config list ──────────────────────────────────────────────────
LOCAL_CONFIGS=("ios.16.debug" "ios.17.debug")
ALL_CONFIGS=("ios.16.debug" "ios.17.debug" "ios.18.debug" "ios.26.debug")

CONFIGS=()
if [[ -n "$CONFIGS_ARG" ]]; then
  IFS=',' read -r -a CONFIGS <<< "$CONFIGS_ARG"
elif [[ "$RUN_ALL" -eq 1 ]]; then
  CONFIGS=("${ALL_CONFIGS[@]}")
  echo "${c_yellow}[WARN] --all requested: attempting the FULL iOS matrix, including ios.18.debug"
  echo "and ios.26.debug. These require Xcode 16+/17+. On a macOS Ventura Intel Mac"
  echo "(capped at Xcode 15.2 / iOS 17 SDK) these WILL LIKELY FAIL to build or boot a"
  echo "simulator. Use this only on a newer Mac, or for documentation/dry-run purposes.${c_reset}"
else
  CONFIGS=("${LOCAL_CONFIGS[@]}")
fi

echo ""
echo "=============================================="
echo "   Peripateticware - iOS E2E Suite"
echo "=============================================="
echo "  Configs to run: ${CONFIGS[*]}"
echo ""

# ── Step 1: Preflight ────────────────────────────────────────────────────
if [[ "$SKIP_PREFLIGHT" -eq 0 ]]; then
  echo "${c_cyan}-- Step 1/4: Pre-flight -----------------------------------${c_reset}"
  if ! bash "$SCRIPT_DIR/test-preflight-ios.sh"; then
    echo "${c_red}Pre-flight failed. Fix the [FAIL] items above, or re-run with --skip-preflight to bypass (not recommended).${c_reset}"
    exit 1
  fi
else
  echo "${c_cyan}-- Step 1/4: Pre-flight skipped (--skip-preflight) --------${c_reset}"
fi

# ── Step 2: Expo prebuild (native iOS project + Pods) ────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo ""
  echo "${c_cyan}-- Step 2/4: Generating native iOS project (expo prebuild) --${c_reset}"
  if ! npx expo prebuild --platform ios --no-install; then
    echo "${c_red}expo prebuild failed.${c_reset}"
    exit 1
  fi

  echo ""
  echo "${c_cyan}-- Step 2/4: Installing Pods (bundle exec, pinned CocoaPods) --${c_reset}"
  if ! bundle exec pod install --project-directory=ios; then
    echo "${c_red}pod install failed. Re-run 'bash scripts/test-preflight-ios.sh' to diagnose.${c_reset}"
    exit 1
  fi
else
  echo ""
  echo "${c_cyan}-- Step 2/4: Build skipped (--skip-build) — reusing existing native project --${c_reset}"
fi

# ── Step 3: Build + test loop ─────────────────────────────────────────────
echo ""
echo "${c_cyan}-- Step 3/4: Build + test per config --${c_reset}"

ARTIFACTS_ROOT="$MOBILE_DIR/artifacts"
RUN_DATE="$(date +%Y-%m-%d_%H%M%S)"

declare -a RESULT_NAMES
declare -a RESULT_STATUS
declare -a RESULT_SECONDS

for CONFIG in "${CONFIGS[@]}"; do
  echo ""
  echo "  -- $CONFIG -----------------------------------"
  START_TS=$(date +%s)
  STATUS="FAIL"

  if [[ "$SKIP_BUILD" -eq 0 ]]; then
    echo "  > npx detox build -c $CONFIG"
    if ! npx detox build -c "$CONFIG"; then
      echo "  ${c_red}Build failed for $CONFIG${c_reset}"
      RESULT_NAMES+=("$CONFIG"); RESULT_STATUS+=("BUILD-FAIL"); RESULT_SECONDS+=("$(( $(date +%s) - START_TS ))")
      continue
    fi
  fi

  # Boot the simulator ahead of time (Detox will also do this, but booting
  # explicitly here surfaces "runtime not installed" errors early & clearly).
  IOS_VERSION="$(echo "$CONFIG" | sed -E 's/ios\.([0-9]+)\.debug/\1/')"
  DEVICE_NAME=""
  case "$CONFIG" in
    ios.16.debug) DEVICE_NAME="iPhone 8" ;;
    ios.17.debug) DEVICE_NAME="iPhone 15" ;;
    ios.18.debug) DEVICE_NAME="iPhone 15" ;;
    ios.26.debug) DEVICE_NAME="iPhone 16" ;;
  esac

  if [[ -n "$DEVICE_NAME" ]] && command -v xcrun >/dev/null 2>&1; then
    UDID="$(xcrun simctl list devices available 2>/dev/null | grep "$DEVICE_NAME" | grep "iOS $IOS_VERSION" | head -1 | grep -E -o '[0-9A-F-]{36}')"
    if [[ -n "$UDID" ]]; then
      echo "  > xcrun simctl boot $UDID  ($DEVICE_NAME, iOS $IOS_VERSION)"
      xcrun simctl boot "$UDID" 2>/dev/null || true   # already-booted is fine
    else
      echo "  ${c_yellow}[WARN] No simulator found for $DEVICE_NAME / iOS $IOS_VERSION — Detox will attempt to create/boot one itself.${c_reset}"
    fi
  fi

  echo "  > npx detox test -c $CONFIG --record-videos failing --take-screenshots failing"
  if npx detox test -c "$CONFIG" --record-videos failing --take-screenshots failing; then
    STATUS="PASS"
  else
    STATUS="FAIL"
  fi

  ELAPSED=$(( $(date +%s) - START_TS ))
  if [[ "$STATUS" == "PASS" ]]; then
    echo "  ${c_green}-> PASS ($ELAPSED s)${c_reset}"
  else
    echo "  ${c_red}-> FAIL ($ELAPSED s)${c_reset}"
  fi

  # ── Copy artifacts, mirroring the Android convention: per-config, per-run ──
  # Detox's default artifact path (no custom `artifacts` block in .detoxrc.js)
  # is mobile/artifacts/<configuration>.<timestamp>/. We copy the freshest
  # matching run into mobile/artifacts/<config-name>/<date>/ so iOS and
  # Android artifacts browse the same way.
  DEST_DIR="$ARTIFACTS_ROOT/$CONFIG/$RUN_DATE"
  mkdir -p "$DEST_DIR"
  LATEST_RUN_DIR="$(ls -1dt "$ARTIFACTS_ROOT/${CONFIG}."* 2>/dev/null | head -1)"
  if [[ -n "$LATEST_RUN_DIR" && -d "$LATEST_RUN_DIR" ]]; then
    cp -R "$LATEST_RUN_DIR"/. "$DEST_DIR"/ 2>/dev/null || true
    echo "  Artifacts copied to: $DEST_DIR"
  else
    echo "  ${c_yellow}[WARN] No Detox artifact directory found for $CONFIG to copy.${c_reset}"
  fi

  RESULT_NAMES+=("$CONFIG"); RESULT_STATUS+=("$STATUS"); RESULT_SECONDS+=("$ELAPSED")
done

# ── Step 4: Summary ────────────────────────────────────────────────────────
echo ""
echo "${c_cyan}-- Step 4/4: Summary ---------------------------------------${c_reset}"
echo ""
printf "  %-18s %-10s %s\n" "CONFIG" "RESULT" "TIME"
printf "  %-18s %-10s %s\n" "------" "------" "----"

PASS_COUNT=0
FAIL_COUNT=0
for i in "${!RESULT_NAMES[@]}"; do
  NAME="${RESULT_NAMES[$i]}"
  STATUS="${RESULT_STATUS[$i]}"
  SECS="${RESULT_SECONDS[$i]}"
  if [[ "$STATUS" == "PASS" ]]; then
    COLOR="$c_green"; PASS_COUNT=$((PASS_COUNT+1))
  else
    COLOR="$c_red"; FAIL_COUNT=$((FAIL_COUNT+1))
  fi
  printf "  %-18s ${COLOR}%-10s${c_reset} %ss\n" "$NAME" "$STATUS" "$SECS"
done

echo ""
echo "  $PASS_COUNT passed, $FAIL_COUNT failed"
echo "  Artifacts: $ARTIFACTS_ROOT/<config>/$RUN_DATE/"
echo "=============================================="

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
