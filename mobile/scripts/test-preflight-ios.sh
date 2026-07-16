#!/usr/bin/env bash
# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
#
# ============================================================================
# test-preflight-ios.sh
#
# iOS/macOS pre-flight checks for Detox E2E tests. Mirrors the spirit of
# run-android-e2e.ps1's setup checks (SDK/AVD/env verification) but for the
# iOS toolchain: Xcode, Ruby/Bundler/CocoaPods, simulator runtimes, the
# .env.test credentials file, and backend reachability.
#
# Usage:
#   cd /path/to/peripateticware/mobile
#   bash scripts/test-preflight-ios.sh
#
# Exit codes:
#   0  = all hard checks passed (warnings may still be printed)
#   1+ = a hard failure occurred (missing Xcode, Ruby too old with no rbenv
#        fallback taken, bundle install failure, missing .env.test)
#
# Locally-achievable Detox configs on a macOS Ventura (13.x) Intel Mac:
#   ios.16.debug, ios.17.debug
# CI-only configs (require Xcode 16+/17+, not installable on Ventura):
#   ios.18.debug, ios.26.debug
# ============================================================================

set -u
HARD_FAIL=0
WARNINGS=0

# ── Resolve mobile/ as the working directory regardless of invocation cwd ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$MOBILE_DIR" || { echo "FATAL: cannot cd into $MOBILE_DIR"; exit 1; }

# ── Pretty printers ─────────────────────────────────────────────────────────
c_reset=$'\033[0m'; c_red=$'\033[31m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_cyan=$'\033[36m'
ok()    { echo "  ${c_green}[OK]${c_reset}   $1"; }
warn()  { echo "  ${c_yellow}[WARN]${c_reset} $1"; WARNINGS=$((WARNINGS+1)); }
fail()  { echo "  ${c_red}[FAIL]${c_reset} $1"; HARD_FAIL=1; }
info()  { echo "  ${c_cyan}[INFO]${c_reset} $1"; }
section() { echo ""; echo "${c_cyan}-- $1 --${c_reset}"; }

echo ""
echo "=============================================="
echo "  Peripateticware - iOS E2E Pre-flight"
echo "=============================================="
echo "  mobile dir: $MOBILE_DIR"

# ── Step 0: sanity — must be running on macOS ───────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This script must run on macOS (found: $(uname -s)). iOS simulators/Xcode are macOS-only."
  echo ""
  echo "Pre-flight FAILED. See [FAIL] items above."
  exit 1
fi

# ── Step 1: macOS / Xcode ceiling detection ─────────────────────────────────
section "Step 1/7: macOS version & Xcode ceiling"

MACOS_VERSION="$(sw_vers -productVersion 2>/dev/null || echo "unknown")"
MACOS_MAJOR="${MACOS_VERSION%%.*}"
info "macOS version: $MACOS_VERSION"

IOS18_26_LOCALLY_POSSIBLE=1
if [[ "$MACOS_MAJOR" =~ ^[0-9]+$ ]] && [[ "$MACOS_MAJOR" -le 13 ]]; then
  warn "macOS $MACOS_VERSION (Ventura or earlier) caps Xcode at 15.2."
  warn "Xcode 15.2 bundles the iOS 17 SDK/simulator runtime — it CANNOT run"
  warn "iOS 18 or iOS 26 simulators. The ios.18.debug and ios.26.debug Detox"
  warn "configs will NOT work on this Mac. Only ios.16.debug and ios.17.debug"
  warn "are achievable locally; leave ios.18/ios.26 coverage to CI"
  warn "(.github/workflows/mobile-e2e.yml runs those on GitHub-hosted macOS"
  warn "runners with current Xcode)."
  IOS18_26_LOCALLY_POSSIBLE=0
else
  info "macOS $MACOS_VERSION should support a current Xcode (16+). ios.18/ios.26"
  info "may be runnable locally too — verify with 'xcodebuild -version'."
fi

# ── Step 2: Ruby version ─────────────────────────────────────────────────────
section "Step 2/7: Ruby version (needed for CocoaPods via Bundler)"

if ! command -v ruby >/dev/null 2>&1; then
  fail "ruby not found on PATH. Install via rbenv (see guidance below)."
else
  RUBY_VERSION_STR="$(ruby -v 2>/dev/null)"
  info "$RUBY_VERSION_STR"
  RUBY_VER="$(ruby -e 'print RUBY_VERSION' 2>/dev/null || echo "0.0.0")"
  RUBY_MAJOR="$(echo "$RUBY_VER" | cut -d. -f1)"
  RUBY_MINOR="$(echo "$RUBY_VER" | cut -d. -f2)"

  RUBY_TOO_OLD=0
  if [[ "$RUBY_MAJOR" -lt 2 ]] || { [[ "$RUBY_MAJOR" -eq 2 ]] && [[ "$RUBY_MINOR" -lt 7 ]]; }; then
    RUBY_TOO_OLD=1
  fi

  if [[ "$RUBY_TOO_OLD" -eq 1 ]]; then
    warn "Ruby $RUBY_VER detected — this is almost certainly macOS's bundled"
    warn "system Ruby (Ventura ships 2.6.10). CocoaPods 1.17.0 (pinned in"
    warn "mobile/Gemfile) requires Ruby >= 2.7.4 and will fail to install."
    warn "This IS the 'latest CocoaPods doesn't run on the Intel Mac' bug."
    echo ""
    echo "  Fix — install a modern Ruby via rbenv (do NOT use system Ruby):"
    echo "    brew install rbenv ruby-build"
    echo "    rbenv install 3.2.4"
    echo "    cd $MOBILE_DIR && rbenv local 3.2.4"
    echo "    eval \"\$(rbenv init -)\"   # add to ~/.zshrc if not already present"
    echo "    ruby -v                  # should now print 3.2.4"
    echo ""
    fail "Ruby too old (< 2.7) and no rbenv-managed Ruby detected active in this shell. Run the commands above, then re-run this script."
  else
    ok "Ruby $RUBY_VER is >= 2.7 — compatible with CocoaPods 1.17.0."
  fi
fi

# ── Step 3: Bundler + pinned CocoaPods (mobile/Gemfile) ─────────────────────
section "Step 3/7: Bundler + pinned CocoaPods (mobile/Gemfile)"

if [[ "$HARD_FAIL" -eq 0 ]]; then
  if ! command -v bundle >/dev/null 2>&1; then
    warn "bundler not found — installing (gem install bundler)..."
    if gem install bundler; then
      ok "bundler installed."
    else
      fail "gem install bundler failed. Check your Ruby/gem setup (see Step 2)."
    fi
  else
    ok "bundler found: $(bundle -v 2>/dev/null)"
  fi

  if command -v bundle >/dev/null 2>&1 && [[ "$HARD_FAIL" -eq 0 ]]; then
    if [[ ! -f "$MOBILE_DIR/Gemfile" ]]; then
      fail "mobile/Gemfile not found — cannot pin CocoaPods version."
    else
      info "Running 'bundle check' in $MOBILE_DIR ..."
      if bundle check >/dev/null 2>&1; then
        ok "Gemfile dependencies already satisfied."
      else
        info "Dependencies missing — running 'bundle install' (this may take a minute)..."
        if bundle install; then
          ok "bundle install succeeded."
        else
          fail "bundle install failed. Common causes: Ruby too old (see Step 2), missing Xcode command-line tools (xcode-select --install), or network issues."
        fi
      fi
    fi
  fi

  if [[ "$HARD_FAIL" -eq 0 ]]; then
    if bundle exec pod --version >/dev/null 2>&1; then
      POD_VERSION="$(bundle exec pod --version 2>/dev/null)"
      ok "bundle exec pod --version → $POD_VERSION"
    else
      fail "'bundle exec pod --version' failed. CocoaPods is not usable via Bundler yet."
    fi
  fi
else
  warn "Skipping Bundler/CocoaPods checks — Ruby check failed above."
fi

# ── Step 4: Xcode ─────────────────────────────────────────────────────────
section "Step 4/7: Xcode"

if ! XCODE_PATH="$(xcode-select -p 2>/dev/null)"; then
  fail "xcode-select -p failed — Xcode command-line tools not selected/installed."
  echo "    Fix: install Xcode from the App Store, then run:"
  echo "      sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer"
else
  info "Active developer dir: $XCODE_PATH"
  if XCODE_VERSION_STR="$(xcodebuild -version 2>/dev/null)"; then
    ok "$(echo "$XCODE_VERSION_STR" | head -1)"
  else
    fail "xcodebuild -version failed. Is the full Xcode.app installed (not just CLT)?"
  fi
fi

# ── Step 5: Simulator runtimes vs locally-achievable Detox configs ─────────
section "Step 5/7: Simulator runtimes (ios.16 / ios.17)"

if command -v xcrun >/dev/null 2>&1; then
  RUNTIMES="$(xcrun simctl list runtimes 2>/dev/null || echo "")"
  if [[ -z "$RUNTIMES" ]]; then
    warn "Could not list simulator runtimes (xcrun simctl list runtimes failed)."
  else
    for v in 16 17; do
      if echo "$RUNTIMES" | grep -q "iOS $v\."; then
        ok "iOS $v simulator runtime installed (needed for ios.$v.debug)."
      else
        warn "iOS $v simulator runtime NOT found — ios.$v.debug will fail to boot a device."
        warn "  Fix: xcodebuild -downloadPlatform iOS   (downloads the latest available runtime for the active Xcode)"
        warn "  Or open Xcode > Settings > Platforms and install iOS $v manually."
      fi
    done
    if [[ "$IOS18_26_LOCALLY_POSSIBLE" -eq 0 ]]; then
      info "(Not checking iOS 18/26 runtimes — already confirmed CI-only on this Mac in Step 1.)"
    fi
  fi
else
  warn "xcrun not found — cannot check simulator runtimes."
fi

# ── Step 6: mobile/.env.test ─────────────────────────────────────────────
section "Step 6/7: mobile/.env.test (test credentials)"

ENV_TEST="$MOBILE_DIR/.env.test"
ENV_TEST_EXAMPLE="$MOBILE_DIR/.env.test.example"

if [[ -f "$ENV_TEST" ]]; then
  ok "mobile/.env.test exists."
else
  if [[ -f "$ENV_TEST_EXAMPLE" ]]; then
    cp "$ENV_TEST_EXAMPLE" "$ENV_TEST"
    fail "mobile/.env.test was missing — copied from .env.test.example."
    echo "    Edit mobile/.env.test now and fill in real values (test account"
    echo "    credentials, backend URL), then re-run this script."
  else
    fail "mobile/.env.test is missing AND mobile/.env.test.example does not exist either. Cannot proceed without test credentials."
  fi
fi

# ── Step 7: Backend health check ─────────────────────────────────────────
section "Step 7/7: Backend reachability"

BACKEND_URL="http://localhost:8000"
if [[ -f "$ENV_TEST" ]]; then
  FROM_ENV="$(grep -E '^TEST_BACKEND_URL=' "$ENV_TEST" 2>/dev/null | tail -1 | cut -d= -f2-)"
  if [[ -n "${FROM_ENV:-}" ]]; then
    BACKEND_URL="$FROM_ENV"
  fi
fi

if command -v curl >/dev/null 2>&1; then
  if curl -sf --max-time 5 "$BACKEND_URL/health" >/dev/null 2>&1; then
    ok "Backend healthy at $BACKEND_URL/health"
  else
    warn "Backend not reachable at $BACKEND_URL/health."
    warn "  Start it with: cd ../backend && uvicorn main:app --reload  (or your usual docker compose up)"
  fi
else
  # Fallback: plain TCP check on port 8000 via /dev/tcp (bash builtin)
  HOST_PORT="${BACKEND_URL#*://}"
  HOST="${HOST_PORT%%:*}"
  PORT="${HOST_PORT##*:}"
  [[ "$PORT" == "$HOST" ]] && PORT=8000
  if (exec 3<>"/dev/tcp/$HOST/$PORT") 2>/dev/null; then
    exec 3>&- 3<&-
    ok "TCP port $PORT open on $HOST (curl unavailable, used raw TCP check)."
  else
    warn "Backend not reachable — TCP connect to $HOST:$PORT failed (curl also unavailable)."
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
if [[ "$HARD_FAIL" -ne 0 ]]; then
  echo "  ${c_red}Pre-flight FAILED${c_reset} — see [FAIL] items above."
  echo "=============================================="
  exit 1
elif [[ "$WARNINGS" -gt 0 ]]; then
  echo "  ${c_yellow}Pre-flight passed with $WARNINGS warning(s)${c_reset} — review [WARN] items above."
  echo "=============================================="
  exit 0
else
  echo "  ${c_green}Pre-flight passed — all checks OK${c_reset}"
  echo "=============================================="
  exit 0
fi
