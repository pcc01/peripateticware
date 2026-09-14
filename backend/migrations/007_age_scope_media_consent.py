# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Data-fix migration — 007
Age-scopes photo/audio/video capture consent, replacing a blanket
age-blind block. See the age-scoped-consent plan doc and
`services/privacy_engine.py`'s 2026-09-14 rewrite of
`enforce_on_submission()`'s sensitive-evidence branch for the full design.

Background: `enforce_on_submission()` used to gate ALL sensitive evidence
(gps/location/audio/video/photo/biometric) purely on the jurisdiction-level
`student_monitoring_allowed` flag, with zero regard for the requesting
student's actual age. Every jurisdiction that has that flag False (explicit
or by schema default — confirmed to be `coppa_us`, `gdpr_eu`,
`ccpa_california`, `lgpd_brazil`, `pipeda_canada`, `popia_za`, `lpdc_mx`,
`aepd_ar`, `pdpa_singapore`, `privacy_act_au` — every seeded jurisdiction
except `ferpa_us`, fixed True by migration 006) therefore blocked EVERY
student in an org under that jurisdiction from ever uploading a photo/audio/
video, 8-year-old or 28-year-old alike. Confirmed live in prod (2026-09-14):
once `ENFORCEMENT_MODE=block` was flipped, this produced a ~100% block rate
on ordinary capture uploads platform-wide.

The engine already has a real, source-grounded, per-jurisdiction age-bucket
translation for exactly this purpose — `consent_rules[].age_groups` (built
by 002 for coppa_us/gdpr_eu/ccpa_california/lgpd_brazil/pipeda_canada, and
by 005, with extensive per-jurisdiction legal-text-grounding in that file's
own docstring, for popia_za/lpdc_mx/aepd_ar/pdpa_singapore/privacy_act_au).
It just wasn't being consulted for photo/audio/video — only gps/location/
biometric were mapped to a `DataCategory` (`_EVIDENCE_DATA_CATEGORY`) that
those rules could match against. `privacy_engine.py` now maps photo/audio/
video to the new `DataCategory.MEDIA` and uses these `consent_rules` as the
SOLE age-aware gate (no more blanket flag) — this migration is the other
half: adding `"media"` to the `data_categories` list of each jurisdiction's
existing `requires_parental_consent=True` consent_rules entries, so that new
code path actually has something to match against. `age_groups` and
`parental_age_threshold` on every entry are left completely untouched — 005's
docstring already did careful, source-grounded work translating each
jurisdiction's real legal age threshold into the engine's 4 buckets; this
migration only adds a data category to already-correct rules, never
re-derives an age boundary.

`ferpa_us` needs no change: its only consent_rules entry has
`requires_parental_consent: False` ("FERPA uses rights transfer, not a
consent-based model") and is skipped by this script's own filter.

Idempotent: if `"media"` is already present in an entry's `data_categories`,
that entry is left untouched; recomputes `audit_hash` the same way
002/003/004/006 do (SHA-256 of json.dumps(rule_definition, sort_keys=True)),
so re-running after success is a true no-op.

Usage:
    python backend/migrations/007_age_scope_media_consent.py

Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) after
running this — `_get_cached_rules()` will keep serving the old
(media-less) consent_rules to any process that already cached them:
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

# Every jurisdiction whose student_monitoring_allowed resolves False (explicit
# or by schema default) AND has at least one requires_parental_consent=True
# consent_rules entry today. ferpa_us is deliberately excluded (see docstring).
TARGET_JURISDICTIONS = [
    "coppa_us",
    "gdpr_eu",
    "ccpa_california",
    "lgpd_brazil",
    "pipeda_canada",
    "popia_za",
    "lpdc_mx",
    "aepd_ar",
    "pdpa_singapore",
    "privacy_act_au",
]


def compute_hash(rule_definition: dict) -> str:
    """Identical to 002/003/004/006's compute_hash — SHA-256 of the
    canonical (sorted-key) JSON representation, so re-running this script
    after it already succeeded is a true no-op."""
    canonical = json.dumps(rule_definition, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def run() -> None:
    async with get_engine().begin() as conn:
        for jurisdiction in TARGET_JURISDICTIONS:
            row = (await conn.execute(
                text(
                    "SELECT rule_id, rule_definition FROM compliance_rules "
                    "WHERE jurisdiction = :jurisdiction AND is_active = true "
                    "ORDER BY effective_date DESC LIMIT 1"
                ),
                {"jurisdiction": jurisdiction},
            )).first()

            if row is None:
                print(f"  ! No active compliance_rules row for '{jurisdiction}' — skipped.")
                continue

            rule_id, rule_definition = row
            rule_def = rule_definition if isinstance(rule_definition, dict) else json.loads(rule_definition)

            consent_rules = rule_def.get("consent_rules") or []
            changed = False
            touched_entries = 0
            for entry in consent_rules:
                if not entry.get("requires_parental_consent"):
                    continue
                categories = entry.setdefault("data_categories", [])
                if "media" not in categories:
                    categories.append("media")
                    changed = True
                    touched_entries += 1

            if not changed:
                print(f"  = {jurisdiction} already has 'media' on every applicable rule — no-op.")
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
            print(f"  ✓ {jurisdiction} (rule_id={rule_id}) — added 'media' to {touched_entries} consent_rules entr{'y' if touched_entries == 1 else 'ies'}")


if __name__ == "__main__":
    asyncio.run(run())
    print()
    print("Migration 007_age_scope_media_consent complete.")
    print(
        "Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) "
        "before assuming this fix is live — see this file's module docstring."
    )
