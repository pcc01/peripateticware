# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Data-fix migration — 004
Corrects a data-authoring bug in 002_seed_privacy_rules.py's SEED_RULES,
caught live during the staged `log`-mode rollout of PRIVACY_BUGFIX_PLAN.md's
Bug 2 fix (age-differentiated consent enforcement).

Four jurisdictions' `consent_rules[0].age_groups` wrongly included "adult"
alongside the actual minor age bracket, with `requires_parental_consent:
True` on the same entry — meaning an ADULT student would be flagged as
needing PARENTAL consent, which is never correct. Confirmed live: a plain
adult GDPR-org student submitting a GPS field note got
`enforcement_actions.warnings` including "Student's age group ('adult')
requires parental consent..." once 002's rows went active.

Affected (age_groups fixed to drop "adult"; requires_parental_consent left
True, matching the jurisdiction's real minor-age requirement):
  - gdpr_eu:         ["under_16", "adult"] -> ["under_16"]
  - ccpa_california: ["under_16", "adult"] -> ["under_16"]
  - lgpd_brazil:      ["under_18", "adult"] -> ["under_18"]
  - pipeda_canada:    ["under_18", "adult"] -> ["under_18"]

NOT touched (correct as-is):
  - coppa_us: already ["under_13"] only.
  - ferpa_us: age_groups includes "adult" too, but requires_parental_consent
    is already False on that entry (FERPA is a rights-transfer model, not
    consent-based) -- "adult" being present there is harmless, not a bug.

002_seed_privacy_rules.py itself has also been fixed at the source (so a
fresh seed on a clean database is correct from the start) -- this script
exists because 002 already ran once against this production database
(`ON CONFLICT (rule_id) DO NOTHING` means simply re-running 002 will not
pick up the source fix), so the already-inserted rows need a direct UPDATE.

Idempotent: removing "adult" from a list that no longer contains it is a
no-op; recomputes audit_hash the same way 002/003 do (SHA-256 of
json.dumps(rule_definition, sort_keys=True)), so re-running after success
produces the same hash.

Usage:
    python backend/migrations/004_fix_consent_rules_adult_bug.py

Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) after
running this — `_get_cached_rules()` will keep serving the buggy
consent_rules content to any process that already cached it:
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

# jurisdiction -> the exact age_groups list to remove "adult" from wherever
# it appears in that jurisdiction's consent_rules entries.
JURISDICTIONS_TO_FIX = ["gdpr_eu", "ccpa_california", "lgpd_brazil", "pipeda_canada"]


def compute_hash(rule_definition: dict) -> str:
    """Identical to 002/003's compute_hash — SHA-256 of the canonical
    (sorted-key) JSON representation, so re-running this script after it
    already succeeded is a true no-op."""
    canonical = json.dumps(rule_definition, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def run() -> None:
    async with get_engine().begin() as conn:
        for jurisdiction in JURISDICTIONS_TO_FIX:
            row = (await conn.execute(
                text(
                    "SELECT rule_id, rule_definition FROM compliance_rules "
                    "WHERE jurisdiction = :jurisdiction AND is_active = true "
                    "ORDER BY effective_date DESC LIMIT 1"
                ),
                {"jurisdiction": jurisdiction},
            )).first()

            if row is None:
                print(
                    f"  ! No active compliance_rules row for '{jurisdiction}' — skipped "
                    f"(expected only if Stage 1's 002 seed hasn't been run yet)."
                )
                continue

            rule_id, rule_definition = row
            rule_def = rule_definition if isinstance(rule_definition, dict) else json.loads(rule_definition)

            consent_rules = rule_def.get("consent_rules") or []
            changed = False
            for entry in consent_rules:
                if isinstance(entry, dict) and "adult" in (entry.get("age_groups") or []):
                    entry["age_groups"] = [g for g in entry["age_groups"] if g != "adult"]
                    changed = True

            if not changed:
                print(f"  = {jurisdiction} already correct (no 'adult' entry found) — no-op.")
                continue

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
            print(f"  ✓ Fixed {jurisdiction} (rule_id={rule_id}) — removed 'adult' from consent_rules age_groups")


if __name__ == "__main__":
    asyncio.run(run())
    print()
    print("Migration 004_fix_consent_rules_adult_bug complete.")
    print(
        "Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) "
        "before assuming this fix is live — see this file's module docstring."
    )
