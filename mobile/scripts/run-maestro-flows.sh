#!/usr/bin/env bash
# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
#
# ============================================================================
# run-maestro-flows.sh
#
# Runs each Maestro flow *.yaml file under the given maestro/flows/<dir>
# folders as its own separate `maestro test` invocation, instead of pointing
# one invocation at a whole folder (or several). Exists because CI's Android
# and iOS jobs both hit the on-device/simulator test-driver connection
# becoming unstable partway through a single long-running multi-flow
# `maestro test` session — see this script's callers in
# .github/workflows/mobile-e2e-maestro.yml for the specific real-CI-run
# evidence on each platform. A dead connection only costs that one flow here,
# instead of cascading into every flow still queued behind it in the same
# invocation.
#
# Usage:
#   run-maestro-flows.sh <junit-output-dir> <junit-prefix> <flow-dir> [<flow-dir> ...]
#
# Requires STUDENT_EMAIL / STUDENT_PASSWORD in the environment (passed
# through to each flow via `maestro test -e`). Exits non-zero if any flow
# failed; always runs every flow regardless of earlier failures.
# ============================================================================

set -u

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <junit-output-dir> <junit-prefix> <flow-dir> [<flow-dir> ...]" >&2
  exit 1
fi

JUNIT_DIR="$1"; shift
JUNIT_PREFIX="$1"; shift

mkdir -p "$JUNIT_DIR"

overall_exit=0
i=0
for dir in "$@"; do
  for flow in maestro/flows/"$dir"/*.yaml; do
    i=$((i + 1))
    echo "== maestro test $flow =="
    maestro test "$flow" \
      -e STUDENT_EMAIL="$STUDENT_EMAIL" -e STUDENT_PASSWORD="$STUDENT_PASSWORD" \
      --format junit --output "$JUNIT_DIR/${JUNIT_PREFIX}-$i.xml"
    [[ $? -eq 0 ]] || overall_exit=1
  done
done

exit $overall_exit
