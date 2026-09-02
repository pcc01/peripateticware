#!/usr/bin/env bash
# Run the load test on the prod host against the loopback backend.
# Copy this repo's k6/ dir to the host first, or run this from a checkout there.
#
#   scp -r k6 pcc@192.168.50.76:/home/pcc/peripateticware/k6
#   ssh pcc@192.168.50.76
#   cd /home/pcc/peripateticware/k6 && cp .env.local.example .env.local && $EDITOR .env.local
#   ./run-loopback.sh smoke      # smoke test only
#   ./run-loopback.sh capacity   # full capacity run
set -euo pipefail
cd "$(dirname "$0")"

K6_BIN="${K6_BIN:-$HOME/.local/bin/k6}"
command -v "$K6_BIN" >/dev/null 2>&1 || K6_BIN="k6"
"$K6_BIN" version >/dev/null 2>&1 || {
  echo "k6 not found. Install the static binary without sudo:"
  echo "  V=0.52.0; cd /tmp && curl -sSL -o k6.tgz \\"
  echo "    https://github.com/grafana/k6/releases/download/v\$V/k6-v\$V-linux-amd64.tar.gz \\"
  echo "    && tar xzf k6.tgz && mkdir -p ~/.local/bin && cp k6-v\$V-linux-amd64/k6 ~/.local/bin/"
  exit 1
}

[ -f .env.local ] || { echo "missing k6/.env.local (copy .env.local.example)"; exit 1; }
set -a; . ./.env.local; set +a
: "${LT_TEACHER_PASS:?set in .env.local}"

MODE="${1:-smoke}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-./results}"
mkdir -p "$OUT_DIR"

case "$MODE" in
  smoke)
    "$K6_BIN" run \
      -e K6_BASE_URL="${K6_BASE_URL:-http://127.0.0.1:8000}" \
      -e LT_TEACHER_PASS="$LT_TEACHER_PASS" \
      -e LT_HOMESCHOOL_PASS="${LT_HOMESCHOOL_PASS:-}" \
      -e LT_STUDENT_PASS="${LT_STUDENT_PASS:-}" \
      --summary-export "$OUT_DIR/smoke-$TS.json" \
      smoke.js | tee "$OUT_DIR/smoke-$TS.log"
    ;;
  capacity)
    "$K6_BIN" run \
      -e K6_BASE_URL="${K6_BASE_URL:-http://127.0.0.1:8000}" \
      -e LT_TEACHER_PASS="$LT_TEACHER_PASS" \
      -e LT_HOMESCHOOL_PASS="${LT_HOMESCHOOL_PASS:-}" \
      -e LT_STUDENT_PASS="${LT_STUDENT_PASS:-}" \
      -e LT_ALLOW_WRITES="${LT_ALLOW_WRITES:-}" \
      -e LT_ALLOW_AI="${LT_ALLOW_AI:-}" \
      -e LT_PEAK="${LT_PEAK:-1.0}" \
      --summary-export "$OUT_DIR/capacity-$TS.json" \
      --out json="$OUT_DIR/capacity-$TS.ndjson" \
      capacity.js | tee "$OUT_DIR/capacity-$TS.log"
    ;;
  *)
    echo "usage: $0 [smoke|capacity]"; exit 1;;
esac

echo "results in $OUT_DIR/*-$TS.*"
