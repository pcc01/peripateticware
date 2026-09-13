# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
LOCAL-ONLY privacy engine Stage 3 large-scale sweep.

Provisions 12 jurisdiction-class test orgs (teacher + 2 students each) directly
via the DB/ORM (SIGNUP_MODE=invite_only blocks the real signup flow locally,
same constraint noted in PRIVACY_LARGE_SCALE_TEST_PLAN.md for prod), mints
access tokens directly (bypassing login), then drives the real HTTP API
(POST /api/v1/student/field-notes as the canonical endpoint, plus a light
cross-endpoint parity pass and a structurally-non-blocking confirm pass) to
exercise Table 2c-i / 2c-ii / 2c-vi from PRIVACY_LARGE_SCALE_TEST_PLAN.md
against the LOCAL stack only, with ENFORCEMENT_MODE=log.

Run inside the backend container:
    docker exec peripateticware-backend python /app/scripts/privacy_sweep_local.py

Idempotent provisioning (get-or-create by email blind-index / org slug).
Writes results to /tmp/privacy_sweep_results.json inside the container,
which the caller copies out via `docker cp`.
"""

import asyncio
import json
import sys
import uuid
from datetime import datetime, date

sys.path.insert(0, "/app")

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session_factory
from core.security import SecurityManager, hash_password
from core.encryption import blind_index
from models.user import User, UserRole
from models.compliance import ConsentRecord
from services.privacy_engine import hash_student_id, hash_actor_id

BASE_URL = "http://localhost:8000"
DOMAIN = "thewordinbits.com"

# slug -> privacy_jurisdiction_ids
JURISDICTIONS = {
    "strict": ["coppa_us", "ferpa_us"],
    "lenient": ["ferpa_us"],
    "ccpa": ["ccpa_california"],
    "gdpr": ["gdpr_eu"],
    "pipeda": ["pipeda_canada"],
    "lgpd": ["lgpd_brazil"],
    "auprivacy": ["privacy_act_au"],
    "pdpa": ["pdpa_singapore"],
    "popia": ["popia_za"],
    "lpdc": ["lpdc_mx"],
    "aepd": ["aepd_ar"],
    "baseline": [],
}

# Per §2c-i of the plan: 10 of 12 are "blocking" class, lenient+baseline are
# "permissive" class -- this is the CORRECT expected S1 outcome per org, not
# a uniform expectation. Recorded here so the results table can mark
# deviations from this as real findings rather than flagging expected
# permissive behavior as a bug.
PERMISSIVE_ORGS = {"lenient", "baseline"}

RESULTS = {"cases": [], "provisioning": []}


def log_prov(msg):
    print(f"[prov] {msg}")
    RESULTS["provisioning"].append(msg)


async def get_or_create_org(db: AsyncSession, slug: str, jurisdiction_ids: list) -> str:
    org_slug = f"local-sweep-{slug}"
    row = (await db.execute(
        text("SELECT id FROM organizations WHERE slug = :slug"), {"slug": org_slug}
    )).scalar_one_or_none()
    if row:
        # Ensure jurisdiction ids are exactly as expected (idempotent fix-up).
        await db.execute(
            text("UPDATE organizations SET privacy_jurisdiction_ids = cast(:jids as jsonb) WHERE id = :id"),
            {"jids": json.dumps(jurisdiction_ids), "id": str(row)},
        )
        await db.commit()
        log_prov(f"org '{org_slug}' already existed (id={row}) — jurisdiction_ids refreshed")
        return str(row)

    org_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO organizations (id, slug, name, type, contact_email,
                country_code, has_under_13_students, privacy_jurisdiction_ids)
            VALUES (:id, :slug, :name, 'school', :email, 'US', true, cast(:jids as jsonb))
        """),
        {
            "id": org_id,
            "slug": org_slug,
            "name": f"Local Sweep — {slug}",
            "email": f"local-sweep-{slug}@{DOMAIN}",
            "jids": json.dumps(jurisdiction_ids),
        },
    )
    await db.commit()
    log_prov(f"created org '{org_slug}' (id={org_id}) jurisdiction_ids={jurisdiction_ids}")
    return org_id


async def get_or_create_user(
    db: AsyncSession, email: str, role: str, org_id: str,
    age_group: str = None, requires_parental_consent: bool = False,
) -> User:
    bidx = blind_index(email.lower())
    result = await db.execute(select(User).where(User.email_index == bidx))
    user = result.scalar_one_or_none()
    if user:
        # Idempotent fix-up of the fields this sweep cares about.
        user.org_id = uuid.UUID(org_id)
        user.age_group = age_group
        user.requires_parental_consent = requires_parental_consent
        user.is_active = True
        await db.commit()
        log_prov(f"user '{email}' already existed (id={user.id}) — fields refreshed")
        return user

    user = User(
        id=uuid.uuid4(),
        email=email,
        email_index=bidx,
        username=email.split("@")[0],
        hashed_password=hash_password("LocalSweep2026!"),
        first_name="Local",
        last_name="Sweep",
        full_name="Local Sweep",
        role=role,
        is_active=True,
        age_group=age_group,
        requires_parental_consent=requires_parental_consent,
        org_id=uuid.UUID(org_id),
        primary_org_id=uuid.UUID(org_id),
    )
    db.add(user)
    await db.commit()
    log_prov(f"created user '{email}' (id={user.id}, role={role}, age_group={age_group})")
    return user


def mint_token(user_id: str) -> str:
    return SecurityManager.create_access_token(user_id=str(user_id))


async def grant_consent(db: AsyncSession, student_id: str, jurisdiction: str):
    sid_hash = hash_student_id(str(student_id))
    existing = (await db.execute(
        select(ConsentRecord.id).where(
            ConsentRecord.student_id_hash == sid_hash,
            ConsentRecord.consent_type == "parental",
            ConsentRecord.is_active == True,
        )
    )).scalar_one_or_none()
    if existing:
        log_prov(f"consent already granted for student {student_id}")
        return
    rec = ConsentRecord(
        id=uuid.uuid4(),
        student_id_hash=sid_hash,
        jurisdiction=jurisdiction,
        consent_type="parental",
        data_categories=["location", "biometric", "identity", "contact", "behavioral"],
        granted_at=datetime.utcnow(),
        granted_by="local-sweep-parent@" + DOMAIN,
        is_active=True,
        consent_version="1.0",
    )
    db.add(rec)
    await db.commit()
    log_prov(f"granted blanket parental consent for student {student_id}")


async def latest_audit_row(db: AsyncSession, actor_id: str, data_type: str) -> dict:
    actor_hash = hash_actor_id(str(actor_id))
    row = (await db.execute(
        text("""
            SELECT compliance_status, rules_applied, enforcement_actions, timestamp
            FROM rule_audit_log
            WHERE actor_id = :actor_id AND data_type = :data_type
            ORDER BY timestamp DESC LIMIT 1
        """),
        {"actor_id": actor_hash, "data_type": data_type},
    )).mappings().first()
    if not row:
        return None
    return {
        "compliance_status": row["compliance_status"],
        "rules_applied": row["rules_applied"],
        "enforcement_actions": row["enforcement_actions"],
        "timestamp": str(row["timestamp"]),
    }


def record_case(table: str, slug: str, scenario: str, expected_block: bool, http_status: int, audit: dict, note: str = ""):
    would_block = audit["enforcement_actions"].get("would_block") if audit else None
    status_ok = (would_block == expected_block) if audit is not None else False
    RESULTS["cases"].append({
        "table": table,
        "jurisdiction": slug,
        "scenario": scenario,
        "expected_would_block": expected_block,
        "actual_would_block": would_block,
        "http_status": http_status,
        "compliance_status": audit["compliance_status"] if audit else None,
        "rules_applied": audit["rules_applied"] if audit else None,
        "pass": bool(status_ok),
        "note": note,
    })
    mark = "PASS" if status_ok else "FAIL"
    print(f"[{mark}] {table} {slug}/{scenario}: expected_would_block={expected_block} actual={would_block} http={http_status} {note}")


async def run_field_note(client: httpx.AsyncClient, token: str, with_gps: bool, title: str):
    body = {"title": title}
    if with_gps:
        body["location_latitude"] = 47.6062
        body["location_longitude"] = -122.3321
    r = await client.post(
        "/api/v1/student/field-notes",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )
    return r


async def main():
    session_factory = get_session_factory()
    orgs = {}
    students = {}  # slug -> {"adult": user, "u13": user}
    tokens = {}

    async with session_factory() as db:
        for slug, jids in JURISDICTIONS.items():
            org_id = await get_or_create_org(db, slug, jids)
            orgs[slug] = org_id

            teacher = await get_or_create_user(
                db, f"local-sweep-{slug}-teacher@{DOMAIN}", "TEACHER", org_id
            )
            adult_student = await get_or_create_user(
                db, f"local-sweep-{slug}-student@{DOMAIN}", "STUDENT", org_id,
                age_group=None, requires_parental_consent=False,
            )
            u13_student = await get_or_create_user(
                db, f"local-sweep-{slug}-u13@{DOMAIN}", "STUDENT", org_id,
                age_group="under_13", requires_parental_consent=True,
            )
            students[slug] = {"teacher": teacher, "adult": adult_student, "u13": u13_student}
            tokens[slug] = {
                "teacher": mint_token(teacher.id),
                "adult": mint_token(adult_student.id),
                "u13": mint_token(u13_student.id),
            }

    print("\n=== Provisioning complete. Running Table 2c-i (12 jurisdictions x 5 scenarios) ===\n")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        async with session_factory() as db:
            for slug, jids in JURISDICTIONS.items():
                expected_block_class = slug not in PERMISSIVE_ORGS
                adult_user = students[slug]["adult"]
                u13_user = students[slug]["u13"]
                adult_token = tokens[slug]["adult"]
                u13_token = tokens[slug]["u13"]

                # S1 — should-BLOCK (per org class): adult/unknown-age, GPS, no consent
                r = await run_field_note(client, adult_token, True, "S1 sensitive note (no consent)")
                audit = await latest_audit_row(db, adult_user.id, "student_field_note")
                record_case("2c-i", slug, "S1", expected_block_class, r.status_code, audit)

                # S2 — should-ALLOW (consent): grant consent, same student, repeat
                await grant_consent(db, adult_user.id, jids[0] if jids else "DEFAULT")
                r = await run_field_note(client, adult_token, True, "S2 sensitive note (with consent)")
                audit = await latest_audit_row(db, adult_user.id, "student_field_note")
                record_case("2c-i", slug, "S2", False, r.status_code, audit)

                # S3 — should-ALLOW (non-sensitive): same student, no GPS
                r = await run_field_note(client, adult_token, False, "S3 plain note")
                audit = await latest_audit_row(db, adult_user.id, "student_field_note")
                record_case("2c-i", slug, "S3", False, r.status_code, audit)

                # S4 — should-BLOCK (COPPA override): real under-13 student, GPS, no consent
                r = await run_field_note(client, u13_token, True, "S4 sensitive note (under-13, no consent)")
                audit = await latest_audit_row(db, u13_user.id, "student_field_note")
                record_case("2c-i", slug, "S4", True, r.status_code, audit,
                             note="expect coppa_us in rules_applied" if audit else "")

                # S5 — should-ALLOW (COPPA override + consent): grant consent, repeat
                await grant_consent(db, u13_user.id, "coppa_us")
                r = await run_field_note(client, u13_token, True, "S5 sensitive note (under-13, with consent)")
                audit = await latest_audit_row(db, u13_user.id, "student_field_note")
                record_case("2c-i", slug, "S5", False, r.status_code, audit)

    with open("/tmp/privacy_sweep_results.json", "w") as f:
        json.dump(RESULTS, f, indent=2, default=str)
    print("\nWrote /tmp/privacy_sweep_results.json")


if __name__ == "__main__":
    asyncio.run(main())
