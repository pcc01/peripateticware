#!/usr/bin/env bash
# Edge-overhead comparison: run the identical edge-overhead.js twice, once
# against loopback (on the host) and once against the public URL, then diff.
#
#   # on the prod host:
#   ./run-edge.sh loopback
#   # from anywhere (laptop):
#   ./run-edge.sh public
#
# Produces results/edge-<mode>-<ts>.json. Compare p95 of http_req_duration and
# the ep_* per-endpoint trends between the two files: public - loopback = the
# Cloudflare + tunnel overhead per route.
set -euo pipefail
cd "$(dirname "$0")"

K6_BIN="${K6_BIN:-$HOME/.local/bin/k6}"
command -v "$K6_BIN" >/dev/null 2>&1 || K6_BIN="k6"

[ -f .env.local ] || { echo "missing k6/.env.local"; exit 1; }
set -a; . ./.env.local; set +a
: "${LT_TEACHER_PASS:?set in .env.local}"

MODE="${1:-public}"
case "$MODE" in
  loopback) BASE="http://127.0.0.1:8000" ;;
  public)   BASE="https://peripateticware.com" ;;
  *) echo "usage: $0 [loopback|public]"; exit 1 ;;
esac

TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p ./results
"$K6_BIN" run \
  -e K6_BASE_URL="$BASE" \
  -e LT_TEACHER_PASS="$LT_TEACHER_PASS" \
  -e LT_EDGE_VUS="${LT_EDGE_VUS:-20}" \
  -e LT_EDGE_DURATION="${LT_EDGE_DURATION:-5m}" \
  --summary-export "./results/edge-$MODE-$TS.json" \
  edge-overhead.js | tee "./results/edge-$MODE-$TS.log"

echo "wrote results/edge-$MODE-$TS.json"
