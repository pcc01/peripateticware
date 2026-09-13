# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Data-fix migration — 006
Corrects a data-authoring bug in 002_seed_privacy_rules.py's SEED_RULES,
caught live during Stage 3's full jurisdiction x scenario sweep
(PRIVACY_LARGE_SCALE_TEST_PLAN.md Table 2c-i, S1) run against the local
stack in ENFORCEMENT_MODE=log. See PRIVACY_LARGE_SCALE_TEST_FINDINGS.md
Finding 1 for the full writeup.

The `ferpa_us` row's `rule_definition.student_monitoring_allowed` was
authored as `False`. This directly contradicts that SAME row's own
`consent_rules[0]` entry ("consent_type": "none_required",
"requires_parental_consent": False, note: "FERPA uses rights transfer, not
consent-based model") and the legacy `US` row's value (True) that `ferpa_us`
was meant to supersede.

`enforce_on_submission()` reads `student_monitoring_allowed` on an
independent code path from `consent_rules` — when False, it sets
`consent_required=True` for ANY sensitive evidence (gps/location/audio/
video/photo/biometric) regardless of what consent_rules says, and blocks
unless a consent record already exists. For any org whose *only* seeded
jurisdiction is `ferpa_us` (no COPPA, no other stricter jurisdiction to
independently justify blocking — e.g. the "lenient" test org), this
silently flipped that org from permissive to blocking the moment migration
002 ran, with no code change and no test coverage that would have caught it
at the time. This is exactly the "should-allow case that unexpectedly
blocks" failure mode PRIVACY_LARGE_SCALE_TEST_PLAN.md's own framing calls
the highest-priority thing to find, and it was flagged as an open risk (not
yet confirmed) in PRIVACY_JURISDICTION_DATA_BACKFILL_PLAN.md's own Summary
item 5.

FERPA governs confidentiality/disclosure of education records; it does not
impose a blanket ban on in-classroom monitoring/observation the way COPPA or
GDPR do. True is the historically- and legally-accurate value here, matching
the legacy `US` row and the empirical "lenient = permissive" class this
engine has documented since before this backfill (PRIVACY_LARGE_SCALE_TEST_PLAN.md
Table 2b).

002_seed_privacy_rules.py has also been fixed at the source (so a fresh seed
on a clean database is correct from the start) — this script exists because
002 already ran once against this database (`ON CONFLICT (rule_id) DO
NOTHING` means re-running 002 will not pick up the source fix), so the
already-inserted `ferpa_us` row needs a direct UPDATE.

Idempotent: flipping an already-True value to True is a no-op; recomputes
audit_hash the same way 002/003/004 do (SHA-256 of
json.dumps(rule_definition, sort_keys=True)), so re-running after success
produces the same hash.

Usage:
    python backend/migrations/006_fix_ferpa_monitoring_allowed_bug.py

Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) after
running this — `_get_cached_rules()` will keep serving the buggy (False)
value to any process that already cached it:
    docker exec peripateticware-redis redis-cli DEL 'privacy:rules:all'
"""

import asyncio
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from core.database import get_engine

JURISDICTION_TO_FIX = "ferpa_us"


def compute_hash(rule_definition: dict) -> str:
    """Identical to 002/003/004's compute_hash — SHA-256 of the canonical
    (sorted-key) JSON representation, so re-running this script after it
    already succeeded is a true no-op."""
    canonical = json.dumps(rule_definition, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def run() -> None:
    async with get_engine().begin() as conn:
        row = (await conn.execute(
            text(
                "SELECT rule_id, rule_definition FROM compliance_rules "
                "WHERE jurisdiction = :jurisdiction AND is_active = true "
                "ORDER BY effective_date DESC LIMIT 1"
            ),
            {"jurisdiction": JURISDICTION_TO_FIX},
        )).first()

        if row is None:
            print(
                f"  ! No active compliance_rules row for '{JURISDICTION_TO_FIX}' — skipped "
                f"(expected only if Stage 1's 002 seed hasn't been run yet)."
            )
            return

        rule_id, rule_definition = row
        rule_def = rule_definition if isinstance(rule_definition, dict) else json.loads(rule_definition)

        if rule_def.get("student_monitoring_allowed") is True:
            print(f"  = {JURISDICTION_TO_FIX} already correct (student_monitoring_allowed=True) — no-op.")
            return

        rule_def["student_monitoring_allowed"] = True
        new_hash = compute_hash(rule_def)

        await conn.execute(
            text(
                "UPDATE compliance_rules "
                "SET rule_definition = cast(:rule_definition as jsonb), audit_hash = :audit_hash "
                "WHERE rule_id = :rule_id"
            ),
            {
                "rule_definition": json.dumps(rule_def),
                "audit_hash": new_hash,
                "rule_id": rule_id,
            },
        )
        print(f"  ✓ Fixed {JURISDICTION_TO_FIX} (rule_id={rule_id}) — student_monitoring_allowed: false -> true")


if __name__ == "__main__":
    asyncio.run(run())
    print()
    print("Migration 006_fix_ferpa_monitoring_allowed_bug complete.")
    print(
        "Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) "
        "before assuming this fix is live — see this file's module docstring."
    )
