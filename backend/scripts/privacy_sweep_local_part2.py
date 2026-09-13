# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
LOCAL-ONLY privacy engine Stage 3 sweep — part 2.

Covers (lighter touch, per PRIVACY_LARGE_SCALE_TEST_PLAN.md):
  - Table 2c-ii: cross-endpoint parity spot-check at C1 (POST /activities/
    {id}/start) and C4 (POST /sessions/) against one blocking org (gdpr)
    and one permissive org (lenient).
  - Table 2c-vi: structurally-non-blocking sites (C3 reflection, C9
    notebook) confirm-only, against the 'strict' org.

Reuses the orgs/students/tokens created by privacy_sweep_local.py (run that
first). Run inside the backend container:
    docker exec peripateticware-backend python /app/scripts/privacy_sweep_local_part2.py
"""

import asyncio
import json
import sys
import uuid

sys.path.insert(0, "/app")

import httpx
from sqlalchemy import text

from core.database import get_session_factory
from core.security import SecurityManager
from core.encryption import blind_index
from services.privacy_engine import hash_actor_id

BASE_URL = "http://localhost:8000"
DOMAIN = "thewordinbits.com"

RESULTS = {"cases": []}


def record_case(table, slug, endpoint, scenario, expected_block, http_status, audit, note=""):
    would_block = audit["enforcement_actions"].get("would_block") if audit else None
    ok = (would_block == expected_block) if audit is not None else False
    RESULTS["cases"].append({
        "table": table, "jurisdiction": slug, "endpoint": endpoint, "scenario": scenario,
        "expected_would_block": expected_block, "actual_would_block": would_block,
        "http_status": http_status,
        "compliance_status": audit["compliance_status"] if audit else None,
        "pass": bool(ok), "note": note,
    })
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {table} {endpoint} {slug}/{scenario}: expected={expected_block} actual={would_block} http={http_status} {note}")


async def latest_audit(db, actor_id, data_type, since=None):
    """Return the most recent rule_audit_log row for this actor/data_type.

    `since`: if given, only a row strictly newer than this timestamp counts
    — otherwise a call that structurally never invokes enforce_or_raise at
    all (e.g. POST /activities/{id}/start with no GPS coords) would
    silently pick up a STALE row from an earlier, unrelated case for the
    same student, misreporting that earlier case's outcome as this one's.
    Returns a synthetic "no gate ran" marker (would_block=False,
    compliance_status=None) when `since` is given and nothing newer exists
    — structurally correct for a should-allow scenario, since the request
    plainly succeeded with no enforcement gate to block it.
    """
    actor_hash = hash_actor_id(str(actor_id))
    query = "SELECT compliance_status, enforcement_actions, timestamp FROM rule_audit_log WHERE actor_id=:a AND data_type=:d"
    params = {"a": actor_hash, "d": data_type}
    if since is not None:
        query += " AND timestamp > :since"
        params["since"] = since
    query += " ORDER BY timestamp DESC LIMIT 1"
    row = (await db.execute(text(query), params)).mappings().first()
    if not row:
        if since is not None:
            return {"compliance_status": None, "enforcement_actions": {"would_block": False, "note": "no audit row -- gate structurally not invoked"}}
        return None
    return {"compliance_status": row["compliance_status"], "enforcement_actions": row["enforcement_actions"]}


async def get_user_id_and_token(db, email):
    bidx = blind_index(email.lower())
    uid = (await db.execute(text("SELECT id FROM users WHERE email_index=:b"), {"b": bidx})).scalar_one()
    return str(uid), SecurityManager.create_access_token(user_id=str(uid))


async def main():
    sf = get_session_factory()
    async with sf() as db:
        # Shared fixtures: one published activity (C1), one curriculum unit (C4).
        activity_id = (await db.execute(
            text("SELECT id FROM activities WHERE title = 'Local Sweep — parity activity'")
        )).scalar_one_or_none()
        if not activity_id:
            activity_id = str(uuid.uuid4())
            await db.execute(text(
                "INSERT INTO activities (id, title, status, is_active, is_shareable) "
                "VALUES (:id, 'Local Sweep — parity activity', 'published', true, false)"
            ), {"id": activity_id})
            await db.commit()
            print(f"[prov] created activity {activity_id}")
        else:
            activity_id = str(activity_id)
            print(f"[prov] reusing activity {activity_id}")

        curriculum_id = (await db.execute(
            text("SELECT id FROM curriculum_units WHERE title = 'Local Sweep — parity curriculum'")
        )).scalar_one_or_none()
        if not curriculum_id:
            curriculum_id = str(uuid.uuid4())
            await db.execute(text(
                "INSERT INTO curriculum_units (id, title, is_active) "
                "VALUES (:id, 'Local Sweep — parity curriculum', true)"
            ), {"id": curriculum_id})
            await db.commit()
            print(f"[prov] created curriculum_unit {curriculum_id}")
        else:
            curriculum_id = str(curriculum_id)
            print(f"[prov] reusing curriculum_unit {curriculum_id}")

        # 'strict' student for the reflection/notebook (non-blocking) confirm pass.
        strict_uid, strict_token = await get_user_id_and_token(db, f"local-sweep-strict-student@{DOMAIN}")

        # Real learning_session owned by the strict student, for reflection (C3).
        session_id = (await db.execute(
            text("SELECT id FROM learning_sessions WHERE user_id=:u ORDER BY created_at DESC LIMIT 1"),
            {"u": strict_uid},
        )).scalar_one_or_none()
        if not session_id:
            session_id = str(uuid.uuid4())
            await db.execute(text(
                "INSERT INTO learning_sessions (id, user_id, activity_id, title, status) "
                "VALUES (:id, :u, :a, 'Local Sweep — reflection session', 'in_progress')"
            ), {"id": session_id, "u": strict_uid, "a": activity_id})
            await db.commit()
            print(f"[prov] created learning_session {session_id} for strict student")
        else:
            session_id = str(session_id)
            await db.execute(
                text("UPDATE learning_sessions SET activity_id=:a WHERE id=:id"),
                {"a": activity_id, "id": session_id},
            )
            await db.commit()
            print(f"[prov] reusing learning_session {session_id} (activity_id backfilled)")

    # Dedicated, consent-free students for this parity pass -- the
    # -student@ accounts from part 1 already had blanket consent granted
    # during that script's S2 step, which would make every consent check
    # here trivially pass regardless of site wiring. Fresh accounts with
    # the SAME org_id (so jurisdiction resolution is identical) avoid that
    # contamination.
    from models.user import User
    from core.security import hash_password

    async def get_or_create_parity_user(db, slug, org_email):
        org_id = (await db.execute(
            text("SELECT org_id FROM users WHERE email_index=:b"),
            {"b": blind_index(org_email.lower())},
        )).scalar_one()
        email = f"local-sweep-{slug}-parity@{DOMAIN}"
        bidx = blind_index(email.lower())
        uid = (await db.execute(text("SELECT id FROM users WHERE email_index=:b"), {"b": bidx})).scalar_one_or_none()
        if uid is None:
            uid = uuid.uuid4()
            db.add(User(
                id=uid, email=email, email_index=bidx, username=email.split("@")[0],
                hashed_password=hash_password("LocalSweep2026!"),
                first_name="Local", last_name="Sweep", full_name="Local Sweep",
                role="STUDENT", is_active=True, age_group=None,
                requires_parental_consent=False, org_id=org_id, primary_org_id=org_id,
            ))
            await db.commit()
            print(f"[prov] created parity student {email} ({uid})")
        else:
            await db.execute(text("UPDATE users SET org_id=:o WHERE id=:u"), {"o": org_id, "u": uid})
            await db.commit()
        return str(uid), SecurityManager.create_access_token(user_id=str(uid))

    async with sf() as db:
        gdpr_uid, gdpr_token = await get_or_create_parity_user(db, "gdpr", f"local-sweep-gdpr-student@{DOMAIN}")
    async with sf() as db:
        lenient_uid, lenient_token = await get_or_create_parity_user(db, "lenient", f"local-sweep-lenient-student@{DOMAIN}")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # ── Table 2c-ii: C1 (POST /activities/{id}/start) ──────────────────
        for slug, uid, token, expected_block_class in [
            ("gdpr", gdpr_uid, gdpr_token, True),
            ("lenient", lenient_uid, lenient_token, False),
        ]:
            # S1-style: with GPS, no consent -> should follow org class
            r = await client.post(
                f"/api/v1/student/activities/{activity_id}/start",
                json={"location_latitude": 47.6, "location_longitude": -122.3},
                headers={"Authorization": f"Bearer {token}"},
            )
            async with sf() as db:
                audit = await latest_audit(db, uid, "learning_session")
            record_case("2c-ii", slug, "C1 /activities/start", "S1(gps)", expected_block_class, r.status_code, audit)

        # S3-style: no GPS -> should always allow, regardless of org. Needs a
        # FRESH activity per call (route resumes an existing in_progress
        # session for the same user+activity, so re-using the same activity
        # id would just return the earlier session without re-running the
        # gate) — use a second shared activity.
        async with sf() as db:
            activity_id_2 = (await db.execute(
                text("SELECT id FROM activities WHERE title = 'Local Sweep — parity activity (no-gps)'")
            )).scalar_one_or_none()
            if not activity_id_2:
                activity_id_2 = str(uuid.uuid4())
                await db.execute(text(
                    "INSERT INTO activities (id, title, status, is_active, is_shareable) "
                    "VALUES (:id, 'Local Sweep — parity activity (no-gps)', 'published', true, false)"
                ), {"id": activity_id_2})
                await db.commit()
            else:
                activity_id_2 = str(activity_id_2)

        for slug, uid, token in [("gdpr", gdpr_uid, gdpr_token), ("lenient", lenient_uid, lenient_token)]:
            async with sf() as db:
                cutoff = (await db.execute(text("SELECT now()::timestamp"))).scalar_one()
            r = await client.post(
                f"/api/v1/student/activities/{activity_id_2}/start",
                json={},
                headers={"Authorization": f"Bearer {token}"},
            )
            async with sf() as db:
                audit = await latest_audit(db, uid, "learning_session", since=cutoff)
            record_case("2c-ii", slug, "C1 /activities/start", "S3(no-gps)", False, r.status_code, audit,
                        note="no evidence_types passed -> enforce_or_raise structurally not called; absence of a new audit row is the expected/correct signal")

        # ── Table 2c-ii: C4 (POST /sessions/) — lat/long are REQUIRED by
        # this endpoint's own schema, so only the GPS-present scenario is
        # structurally possible here. ──────────────────────────────────────
        for slug, uid, token, expected_block_class in [
            ("gdpr", gdpr_uid, gdpr_token, True),
            ("lenient", lenient_uid, lenient_token, False),
        ]:
            r = await client.post(
                "/api/v1/sessions/",
                json={
                    "title": "Local Sweep parity session",
                    "curriculum_id": curriculum_id,
                    "latitude": 47.6,
                    "longitude": -122.3,
                    "location_name": "Test Location",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            async with sf() as db:
                audit = await latest_audit(db, uid, "learning_session")
            record_case("2c-ii", slug, "C4 /sessions/", "S1(gps, required)", expected_block_class, r.status_code, audit)

        # ── Table 2c-vi: structurally non-blocking, confirm-only, 'strict' org ──
        r = await client.post(
            f"/api/v1/student/sessions/{session_id}/reflection",
            json={"content": "Local sweep reflection content — no evidence_types ever passed here."},
            headers={"Authorization": f"Bearer {strict_token}"},
        )
        async with sf() as db:
            audit = await latest_audit(db, strict_uid, "student_reflection")
        record_case("2c-vi", "strict", "C3 /sessions/{id}/reflection", "confirm-only", False, r.status_code, audit)

        r = await client.post(
            "/api/v1/student/notebook",
            json={"where_notes": "Local sweep notebook where", "why_notes": "why", "how_notes": "how"},
            headers={"Authorization": f"Bearer {strict_token}"},
        )
        async with sf() as db:
            audit = await latest_audit(db, strict_uid, "student_notebook")
        record_case("2c-vi", "strict", "C9 /student/notebook", "confirm-only", False, r.status_code, audit)

    with open("/tmp/privacy_sweep_results_part2.json", "w") as f:
        json.dump(RESULTS, f, indent=2, default=str)
    print("\nWrote /tmp/privacy_sweep_results_part2.json")


if __name__ == "__main__":
    asyncio.run(main())
