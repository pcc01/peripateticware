# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Rules Seed — 005
Seeds real compliance_rules rows for the 5 jurisdictions that have a
richly-authored JSON file under backend/config/jurisdictions/ but were never
seeded into the DB at all (see PRIVACY_JURISDICTION_DATA_BACKFILL_PLAN.md,
"What this plan does NOT cover"):

    pdpa_singapore.json  -> jurisdiction "pdpa_singapore"  (org slug: pdpa)
    privacy_act_au.json  -> jurisdiction "privacy_act_au"  (org slug: auprivacy)
    popia_za.json        -> jurisdiction "popia_za"        (org slug: popia)
    lpdc_mx.json         -> jurisdiction "lpdc_mx"         (org slug: lpdc)
    aepd_ar.json         -> jurisdiction "aepd_ar"         (org slug: aepd)

Unlike 002 (which hand-authored its rule_definition literals) and 003/004
(which hand-authored small UPDATE payloads), this script LOADS each source
JSON file at runtime (backend/config/jurisdictions/<jurisdiction_id>.json)
and inserts its full parsed content as rule_definition, plus one added key
(`consent_rules` — see "Consent rules" below). This is deliberate: these 5
files are already the canonical, deployed content for these jurisdictions
(services/privacy_config_loader.py and privacy_jurisdiction_resolver.py both
already read them by this exact filename), so loading them at runtime avoids
a second, hand-transcribed copy that could silently drift from the source
file. Every field that transfers unmodified (student_age_categories,
prohibited_data_collection, special_restrictions, consent_requirements,
data_retention, compliance_checks, third_party_restrictions, warnings,
requirements, jurisdiction_id, jurisdiction_name, framework, country_code,
version, description, ...) comes from the file verbatim, byte for byte.

No JURISDICTION_ALIASES entry is needed for any of these 5 (confirmed by
reading resolve_jurisdiction_id() in services/privacy_engine.py): each has
only ever had one spelling anywhere in the system (the config-file name,
matching organizations.privacy_jurisdiction_ids and this file's own
jurisdiction_id), so `if jid in configs: return jid` resolves them directly
with zero alias lookups.

────────────────────────────────────────────────────────────────────────────
Schema note: PrivacyRule (schemas/privacy_rule.py) already declares
student_age_categories / consent_requirements / prohibited_data_collection /
allowed_data_collection / third_party_restrictions / data_retention /
compliance_checks / special_restrictions / warnings / requirements as typed
fields with `extra="allow"` on everything else — so every key already in
these 5 JSON files round-trips through PrivacyRule.model_validate() cleanly.
`consent_rules` is NOT a declared PrivacyRule field (same as for 002's
jurisdictions) -- it only matters because _build_consent_rules() in
privacy_engine.py reads it directly off the raw rule_definition dict, not
off the validated pydantic model, so adding it as a plain extra key is
sufficient and is exactly how 002's own consent_rules work today.

`data_retention` in these 5 files already matches RetentionEntry's shape
(retention_months / deletion_method / archival_allowed, plus an extra
archival_duration_months tolerated by extra="allow") -- so
PrivacyRule.effective_max_retention_days() (min over retention_months*30,
capped by the flat max_retention_days scalar, which none of these 5 files
sets, so it defaults to 365) works with ZERO extra code, exactly the "some
fields DO match directly by name" case the brief called out. No
max_retention_days field is added to any of these rows.

────────────────────────────────────────────────────────────────────────────
FIELD-MAPPING DECISIONS (why each value was chosen, jurisdiction by
jurisdiction) — the whole point of this docstring is that nobody needs to
re-read all 5 source JSONs to audit these choices later.

encryption_required (all 5): left UNSET (schema default False). None of
the 5 files contain the string "encrypt" anywhere. They all describe
generic "security measures" / "protect against loss and unauthorized
access" language (PDPA's `data_security` compliance_check, POPIA/LPDC/AEPD's
`information_officer`/security-safeguards language) -- real, but not
encryption-specific, exactly like FERPA's own 002 row (encryption_required:
False) despite FERPA obviously implying "protect records" too. Setting True
here would be inventing a technical-control claim none of these laws'
authored text actually makes. This mirrors the FERPA precedent, not a new
policy.

student_monitoring_allowed / student_data_sharing_allowed /
student_targeting_allowed (all 5): left UNSET (schema default False in all
cases). Reasoning per field:
  - student_monitoring_allowed=False is actively CORRECT, not just a
    fallback: setting it True would SKIP this engine's consent-required gate
    entirely for sensitive (gps/location/audio/video/photo/biometric)
    evidence (see enforce_on_submission()'s `if not
    config.student_monitoring_allowed: consent_required = True` branch) --
    and popia_za/lpdc_mx/aepd_ar's own `special_restrictions.location_data`
    sections explicitly say `"requires_explicit_consent": true` for exactly
    this evidence type. True would contradict the source data; False is
    what actually enforces what these 3 files say. pdpa_singapore/
    privacy_act_au have no special_restrictions section, but both have a
    `consent_documentation` compliance_check requiring documented consent
    for "collection" broadly -- same conclusion, False.
  - student_data_sharing_allowed: popia_za/lpdc_mx/aepd_ar all explicitly
    list `third_party_restrictions.forbidden: ["data_brokers",
    "advertising_networks", "social_media_trackers"]` -- a real, named
    prohibition, grounding False directly. pdpa_singapore/privacy_act_au
    have `forbidden: []` but gate `third_party_sharing` behind
    `requires_explicit_consent` -- not an unconditional "allowed", so False
    (the restrictive default) is still the accurate read, not an invented
    one.
  - student_targeting_allowed: privacy_act_au explicitly gates
    `direct_marketing` behind explicit consent; popia_za/lpdc_mx/aepd_ar
    forbid `advertising_networks` outright. pdpa_singapore has no
    targeting/marketing language at all -- for pdpa_singapore specifically
    this is a genuine "source is silent" case, left False per the fail-safe
    default (matches JurisdictionConfig's own dataclass default and what
    all 5 orgs already get today via the generic fallback), not a claim
    that pdpa_singapore's real law says anything about targeting.

student_profiling_allowed: left UNSET (False) for all 5, but the strength
of the grounding differs:
  - popia_za, lpdc_mx, aepd_ar: EXPLICIT. Each has
    `special_restrictions.profiling: {"allowed": false, "description":
    "...profiling of children...prohibited"}` verbatim. False here is a
    direct transcription of stated law, not a fallback.
  - pdpa_singapore, privacy_act_au: no special_restrictions section, no
    profiling language anywhere in either file. This is a genuine "source
    doesn't say" case -- False is the honest restrictive default per the
    brief's own instruction, not a claim these 2 laws specifically restrict
    profiling.

max_retention_days: not set explicitly (see "Schema note" above) --
effective_max_retention_days() derives it from each file's own
`data_retention` section automatically. No field invented.

────────────────────────────────────────────────────────────────────────────
consent_rules — the age-differentiated signal, jurisdiction by jurisdiction.

Background: User.age_group (routes/classrooms.py::accept_invite) assigns
ONE of 4 mutually-exclusive buckets from date_of_birth: 'under_13' (age<13),
'under_16' (13<=age<16), 'under_18' (16<=age<18), 'adult' (18+). A
consent_rules entry only fires for a student whose *literal* age_group
string appears in that entry's age_groups list (privacy_engine.py's
`student_age_group in r.age_groups` check) -- there is no "less than"
semantics, so a law with a single "under 18" threshold must be translated
into however many of these 4 buckets that threshold actually spans, or the
narrower buckets go uncovered by this specific check (falling back to
whatever the org's other jurisdictions / the student_monitoring_allowed
gate still provide).

  - popia_za (explicit `child_age_threshold: 18`, a single uniform
    "child" age category spanning 0-17 with ONE parental-consent rule, no
    internal graduation): 0-17 exactly equals under_13 ∪ under_16 ∪
    under_18. All three buckets are included -- this is a complete,
    unambiguous translation of "everyone under 18", not an invented
    threshold (the threshold itself, 18, is the file's own stated value).

  - lpdc_mx (explicit `child_age_threshold: 18`, same single-band shape
    as popia_za: "child" 0-17, one parental-consent rule): same reasoning,
    same result -- all three minor buckets included.

  - aepd_ar (the richest signal of the 5 -- TWO explicit thresholds,
    `child_age_threshold: 13` and `secondary_age_threshold: 16`, AND three
    separate student_age_categories bands that align EXACTLY with the
    engine's own buckets: young_child 0-12 == under_13, child 13-15 ==
    under_16, teen 16-17 == under_18):
      * young_child (0-12, "parental consent required...for ALL
        processing") -> consent_rules entry, age_groups=["under_13"].
      * child (13-15, "parental consent required...for non-essential
        processing" per secondary_age_threshold) -> a SECOND entry,
        age_groups=["under_16"]. NOTE: ConsentRule has no
        purpose-scoping field (no way to say "only for non-essential
        purposes") -- ANY match sets requires_parental_consent=True
        identically to young_child's stronger "all processing" rule. This
        is a real, documented simplification (favors over-protection, not
        under-protection) rather than a silent loss of nuance.
      * teen (16-17): consent_requirements.teen states
        `"parental_consent_required": false` EXPLICITLY ("may consent
        independently"). No consent_rules entry for under_18 -- an
        explicit "this band does NOT need one" signal, not an omission.

  - pdpa_singapore (no child_age_threshold field, but
    consent_requirements gives an explicit parental_consent_required
    boolean per age band): young_child (0-12, true) == under_13 exactly.
    teen (13-17, ALSO literally true, despite the softer prose "parent
    should be notified; child can provide assent") == under_16 ∪ under_18
    exactly (13-17 is precisely the union of those two buckets, no
    boundary mismatch). The teen band's boolean is honored literally per
    the brief's instruction to use the file's own stated signal rather
    than override it with a narrower reading of its prose --
    flagged here in case a reviewer judges the "notification, not full
    consent" prose should have won instead. adult (18+, false) correctly
    excluded. Net: all three minor buckets included, same shape as
    popia_za/lpdc_mx, but for a genuinely different structural reason (two
    *different* stated bands that happen to jointly cover 0-17, rather
    than one uniform band already covering it).

  - privacy_act_au (no child_age_threshold field; consent_requirements
    gives child 0-14 (true) / young_adult 15-17 (explicitly FALSE,
    "individual can consent") / adult 18+ (false)): this is the ONE
    jurisdiction of the 5 where the file's own band boundary does NOT
    align with an engine bucket boundary -- "child" ends at 14, but the
    engine's under_16 bucket spans 13-15 (i.e. age 15 is inside under_16
    AND explicitly stated as NOT requiring parental consent). Rather than
    guess which way to round, this script includes ONLY
    age_groups=["under_13"] (0-12, entirely and unambiguously inside the
    "child" band) and leaves under_16 OUT. This under-covers ages 13-14
    (part of "child", but bucketed as under_16) and avoids over-covering
    age 15 (part of "young_adult", explicitly consent-exempt, but also
    bucketed as under_16) -- there is no engine bucket that lets this
    script express "13-14 yes, 15 no" precisely, so it deliberately picks
    the smaller, unambiguous subset rather than invent a rounding rule.
    **Flagged explicitly for the coordinator**: a 13-14-year-old
    Australian student in a `privacy_act_au`-only org will NOT get this
    specific age-differentiated consent check (though they still get
    whatever student_monitoring_allowed=False's own consent-required gate
    provides, which is independent of this check and unaffected by this
    gap).

data_categories on every consent_rules entry across all 5 jurisdictions:
["location", "biometric"]. None of the 5 files gives a categories list
tied to their parental-consent requirement specifically (unlike 002's own
hand-authored entries, e.g. COPPA's ["identity","contact","location",
"behavioral","biometric"], which were themselves an author's synthesis, not
transcribed from an external field either). ["location","biometric"] is
the ENTIRE set of categories privacy_engine.py's own
_EVIDENCE_DATA_CATEGORY map actually recognises (gps/location -> location,
biometric -> biometric) -- adding identity/contact/behavioral/educational
here would have zero functional effect (nothing maps evidence to them) and
would only be padding the list to look more thorough, not making it more
accurate. Keeping it to the two categories the check can actually match
against is the more honest choice, not a narrower one in practice.

────────────────────────────────────────────────────────────────────────────
Run this script once, from inside the backend container:
  docker exec peripateticware-backend python backend/migrations/005_seed_remaining_jurisdictions.py

Idempotent, same pattern as 002: INSERT ... ON CONFLICT (rule_id) DO NOTHING,
rule_id is a deterministic uuid5 of a literal string unique to this script's
5 rows. Confirmed safe against the local dev DB's already-accumulated rows
(APPI_JP, custom_vn, dpa_ng, kenya_children_online_protection_act_ke,
pcpa_th, us_student_privacy_ng, plus 002's 6 + the 4 legacy US/US-COPPA/
US-CA/EU rows) -- none of those use any of this script's 5 jurisdiction
keys or rule_id strings, and compliance_rules.jurisdiction has no unique
constraint (only rule_id, the primary key, is), so this can only ADD rows,
never collide with or overwrite anything already in the table.

Reminder: invalidate the Redis rules cache after running this (or wait out
its 1h TTL) -- same as 002/003/004:
  docker exec peripateticware-redis redis-cli DEL 'privacy:rules:all'
"""

import asyncio
import hashlib
import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Allow running from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware",
)

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config" / "jurisdictions"

# ─────────────────────────────────────────────────────────────────────────────
# Per-jurisdiction seed metadata + the one field this script actually adds
# (consent_rules) -- see the module docstring above for the full reasoning.
# ─────────────────────────────────────────────────────────────────────────────

_LOCATION_BIOMETRIC = ["location", "biometric"]

SEED_JURISDICTIONS = [
    {
        "filename": "pdpa_singapore.json",
        "jurisdiction": "pdpa_singapore",
        "regulation_id": "PDPA-2015-SG",
        "rule_id": "PDPA-2015-SG-v1.0",
        "consent_rules": [
            {
                "data_categories": _LOCATION_BIOMETRIC,
                "age_groups": ["under_13", "under_16", "under_18"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 18,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
                "note": (
                    "PDPA consent_requirements: young_child (0-12) and teen "
                    "(13-17) both state parental_consent_required=true "
                    "(teen's is softer prose -- 'parent notified, child "
                    "assents' -- but the boolean is honored literally per "
                    "the source data). adult (18+) correctly excluded."
                ),
            }
        ],
        "ensure_empty_keys": ["prohibited_data_collection", "special_restrictions"],
        "change_log": "Initial seed (005) — PDPA Singapore, sourced from backend/config/jurisdictions/pdpa_singapore.json",
    },
    {
        "filename": "privacy_act_au.json",
        "jurisdiction": "privacy_act_au",
        "regulation_id": "PRIVACY_ACT-2014-AU",
        "rule_id": "PRIVACY_ACT-2014-AU-v1.0",
        "consent_rules": [
            {
                "data_categories": _LOCATION_BIOMETRIC,
                "age_groups": ["under_13"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 15,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
                "note": (
                    "Privacy Act consent_requirements: child (0-14) "
                    "requires parental consent; young_adult (15-17) "
                    "EXPLICITLY does not. The file's band boundary (14/15) "
                    "does not align with the engine's under_16 bucket "
                    "(13-15), so only the unambiguous under_13 (0-12) "
                    "portion is included here -- ages 13-14 are left "
                    "uncovered by this specific check rather than guessed "
                    "in either direction. See module docstring."
                ),
            }
        ],
        "ensure_empty_keys": ["prohibited_data_collection", "special_restrictions"],
        "change_log": "Initial seed (005) — Australia Privacy Act/APPs, sourced from backend/config/jurisdictions/privacy_act_au.json",
    },
    {
        "filename": "popia_za.json",
        "jurisdiction": "popia_za",
        "regulation_id": "POPIA-2021-ZA",
        "rule_id": "POPIA-2021-ZA-v1.0",
        "consent_rules": [
            {
                "data_categories": _LOCATION_BIOMETRIC,
                "age_groups": ["under_13", "under_16", "under_18"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 18,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
                "note": (
                    "POPIA's own child_age_threshold is 18, applied "
                    "uniformly to a single 0-17 'child' category with no "
                    "internal graduation -- 0-17 exactly equals the union "
                    "of under_13/under_16/under_18, so all three are "
                    "included."
                ),
            }
        ],
        "ensure_empty_keys": [],  # popia_za already has both keys natively
        "change_log": "Initial seed (005) — POPIA South Africa, sourced from backend/config/jurisdictions/popia_za.json",
    },
    {
        "filename": "lpdc_mx.json",
        "jurisdiction": "lpdc_mx",
        "regulation_id": "LFPDPPP-2010-MX",
        "rule_id": "LFPDPPP-2010-MX-v1.0",
        "consent_rules": [
            {
                "data_categories": _LOCATION_BIOMETRIC,
                "age_groups": ["under_13", "under_16", "under_18"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 18,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
                "note": (
                    "LFPDPPP's own child_age_threshold is 18, applied "
                    "uniformly to a single 0-17 'child' category with no "
                    "internal graduation -- same shape and reasoning as "
                    "popia_za."
                ),
            }
        ],
        "ensure_empty_keys": [],  # lpdc_mx already has both keys natively
        "change_log": "Initial seed (005) — Mexico LFPDPPP, sourced from backend/config/jurisdictions/lpdc_mx.json",
    },
    {
        "filename": "aepd_ar.json",
        "jurisdiction": "aepd_ar",
        "regulation_id": "LEY25326-2000-AR",
        "rule_id": "LEY25326-2000-AR-v1.0",
        "consent_rules": [
            {
                "data_categories": _LOCATION_BIOMETRIC,
                "age_groups": ["under_13"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 13,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
                "note": (
                    "Ley 25.326's primary child_age_threshold (13): "
                    "young_child (0-12) requires parental consent for ALL "
                    "processing. Maps exactly onto under_13 (0-12) — no "
                    "boundary mismatch."
                ),
            },
            {
                "data_categories": _LOCATION_BIOMETRIC,
                "age_groups": ["under_16"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 16,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
                "note": (
                    "Ley 25.326's secondary_age_threshold (16): child "
                    "(13-15) requires parental consent for NON-ESSENTIAL "
                    "processing only. Maps exactly onto under_16 (13-15) "
                    "-- no boundary mismatch. ConsentRule has no "
                    "purpose-scoping field, so this entry is functionally "
                    "identical to the under_13 entry above (any match "
                    "requires parental consent, regardless of purpose) -- "
                    "a documented simplification that favors "
                    "over-protection, not a claim the law is this "
                    "absolute for 13-15-year-olds. teen (16-17) is "
                    "explicitly parental_consent_required=false in the "
                    "source ('may consent independently') and "
                    "deliberately gets NO consent_rules entry (under_18 "
                    "is intentionally absent from both entries)."
                ),
            },
        ],
        "ensure_empty_keys": [],  # aepd_ar already has both keys natively
        "change_log": "Initial seed (005) — Argentina Ley 25.326 (PDPA), sourced from backend/config/jurisdictions/aepd_ar.json",
    },
]


def compute_hash(rule_definition: dict) -> str:
    """Identical to 002/003/004's compute_hash — SHA-256 of the canonical
    (sorted-key) JSON representation, so a re-run after success is a true
    no-op (same merged dict -> same hash -> same row content)."""
    canonical = json.dumps(rule_definition, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _load_rule_definition(entry: dict) -> dict:
    """Load the source JSON file verbatim, then add exactly the keys this
    script is responsible for (consent_rules, and empty-dict placeholders
    for the two structural keys a couple of the 5 files don't have at all
    -- matching 003's own precedent of adding {} for ferpa_us rather than
    leaving the key entirely absent)."""
    path = CONFIG_DIR / entry["filename"]
    with open(path, "r", encoding="utf-8") as fh:
        rule_def = json.load(fh)

    if rule_def.get("jurisdiction_id") != entry["jurisdiction"]:
        raise ValueError(
            f"{entry['filename']}: jurisdiction_id "
            f"{rule_def.get('jurisdiction_id')!r} does not match expected "
            f"{entry['jurisdiction']!r}"
        )

    for key in entry["ensure_empty_keys"]:
        rule_def.setdefault(key, {})

    # The one field this script adds beyond the file's own content.
    rule_def["consent_rules"] = entry["consent_rules"]

    return rule_def


async def seed(engine) -> None:
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        for entry in SEED_JURISDICTIONS:
            rule_def = _load_rule_definition(entry)
            audit_hash = compute_hash(rule_def)

            # Source files store effective_date as a plain "YYYY-MM-DD"
            # string; datetime.fromisoformat handles date-only ISO strings
            # natively (midnight UTC-naive), matching 002's own parsing.
            effective_date = datetime.fromisoformat(rule_def["effective_date"])

            await session.execute(
                text("""
                    INSERT INTO compliance_rules (
                        rule_id, regulation_id, version, jurisdiction,
                        effective_date, rule_definition, created_by,
                        change_log, is_active, audit_hash
                    ) VALUES (
                        :rule_id, :regulation_id, :version, :jurisdiction,
                        :effective_date, cast(:rule_definition as jsonb), :created_by,
                        :change_log, true, :audit_hash
                    )
                    ON CONFLICT (rule_id) DO NOTHING
                """),
                {
                    "rule_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, entry["rule_id"])),
                    "regulation_id": entry["regulation_id"],
                    "version": rule_def.get("version", "1.0"),
                    "jurisdiction": entry["jurisdiction"],
                    "effective_date": effective_date,
                    "rule_definition": json.dumps(rule_def),
                    "created_by": "seed_script",
                    "change_log": entry["change_log"],
                    "audit_hash": audit_hash,
                },
            )
            print(f"  ✓ Seeded: {entry['rule_id']} ({entry['jurisdiction']})")

        await session.commit()


async def main() -> None:
    print("Peripateticware — Remaining Jurisdictions Seed (005)")
    print(f"Target DB: {DATABASE_URL.split('@')[-1]}")
    print(f"Source dir: {CONFIG_DIR}")
    print()

    engine = create_async_engine(DATABASE_URL, echo=False)

    try:
        await seed(engine)
        print()
        print(f"✅ {len(SEED_JURISDICTIONS)} jurisdiction rules seeded successfully.")
    except Exception as exc:
        print(f"❌ Seed failed: {exc}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
    print()
    print(
        "Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) "
        "before assuming this is live — see this file's module docstring."
    )
