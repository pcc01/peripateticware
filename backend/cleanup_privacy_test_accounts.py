# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
cleanup_privacy_test_accounts.py — delete the throwaway privacy-engine
test accounts/orgs/data created for the 2026-09-12 privacy verification
effort (see PRIVACY_ENFORCEMENT_HANDOFF.md's "Cleanup" section) from the
PRODUCTION database, once a human has decided the verification work is
fully done (both Track A and Track B in that handoff doc).

Same connection/session pattern as set_admin.py (core.database session
factory, run as a one-off management script inside the backend container —
NOT wired into the app, NOT imported by anything).

─────────────────────────────────────────────────────────────────────────────
USAGE  (run on the PROD HOST, by a human — never assume this is safe to run
        against a database you haven't personally pointed the container at)
─────────────────────────────────────────────────────────────────────────────

  1) Get the current account list onto the prod host and into the container.
     The known-so-far list lives at C:\\Users\\pcerd\\privacy_emu_created.json
     (12 jurisdiction orgs, one teacher + one student each). Copy it up:

         scp C:\\Users\\pcerd\\privacy_emu_created.json \\
             pcc@192.168.50.76:/home/pcc/peripateticware/privacy_emu_created.json
         docker cp /home/pcc/peripateticware/privacy_emu_created.json \\
             peripateticware-backend:/app/privacy_emu_created.json

     If Track A (under-13 student + parent, `admin+priv-lenient-a13*@
     thewordinbits.com`) or Track B (GDPR-org test activity/session) added
     MORE accounts/orgs that never made it into that JSON, either update the
     JSON before copying it up, or pass them directly with the --extra-*
     flags below (no file edit needed) or via a second --accounts-json file.

  2) DRY RUN (always do this first — makes no writes):

         docker exec peripateticware-backend python cleanup_privacy_test_accounts.py \\
             --accounts-json /app/privacy_emu_created.json --dry-run

     Add extras inline, e.g. for Track A's parent account and Track B's org
     (Track B reuses the existing `gdpr` org/teacher already in the JSON, so
     usually nothing extra is needed there beyond what the activity/session
     itself created, which is swept up automatically once the gdpr teacher's
     activities and the gdpr students' sessions are matched):

         docker exec peripateticware-backend python cleanup_privacy_test_accounts.py \\
             --accounts-json /app/privacy_emu_created.json \\
             --extra-email admin+priv-lenient-a13-student@thewordinbits.com \\
             --extra-email admin+priv-lenient-a13-parent@thewordinbits.com \\
             --dry-run

  3) Read the report. It prints, per table, how many rows WOULD be deleted
     or WOULD cascade-delete (with the live ON DELETE rule this session
     actually found in the database — not just what this script assumes),
     plus any safety warnings (see "Safety checks" below). Nothing is
     written in this mode, regardless of what the report says.

  4) Only once satisfied, re-run with --confirm (same arguments) to actually
     delete, in one transaction (rolls back completely on any error):

         docker exec peripateticware-backend python cleanup_privacy_test_accounts.py \\
             --accounts-json /app/privacy_emu_created.json --confirm

─────────────────────────────────────────────────────────────────────────────
ACCOUNTS-JSON SCHEMA (extensible — this is the whole point: Track A/B and
any future round can add to this without editing this script)
─────────────────────────────────────────────────────────────────────────────

--accounts-json may be passed more than once; every file is merged. Each
file is either:

  (a) a JSON list, matching privacy_emu_created.json's existing shape:
      [
        {
          "slug": "gdpr",
          "teacher_email": "admin+priv-gdpr@thewordinbits.com",
          "teacher_user_id": "b10ba69c-736e-4004-94e7-17b06ceb7b3d",
          "org_id": "f2b17dee-2def-4cef-a63c-b6cbbcbbabb1",
          "student_emails": ["admin+priv-gdpr-s1@thewordinbits.com"]
        },
        ...
      ]

  (b) a JSON object for stray accounts that don't fit the org/teacher/
      student mold (e.g. a parent account from Track A):
      {
        "extra_emails":   ["admin+priv-lenient-a13-parent@thewordinbits.com"],
        "extra_user_ids": ["<uuid>", ...],
        "extra_org_ids":  ["<uuid>", ...]
      }

--extra-email / --extra-user-id / --extra-org-id (each repeatable) do the
same thing as (b) directly on the command line, for a quick one-off without
editing any file.

Every id/email is resolved to a real row by EXACT id lookup or by exact
`email_index` equality (the blind-index HMAC — never a LIKE/pattern query;
`email` itself is EncryptedString and cannot be pattern-matched at rest).
See "Safety checks" below for what happens to anything that resolves but
doesn't look like a throwaway test account.

─────────────────────────────────────────────────────────────────────────────
DELETE ORDER AND WHY (see the report at the top of this file's docstring in
the final report handed back to the requester for the full table-by-table
rationale; short version here)
─────────────────────────────────────────────────────────────────────────────

Ground truth for FK/ON DELETE behavior was taken from `database/init.sql`
(mounted as `/docker-entrypoint-initdb.d/01-init.sql` — runs once, on the
very first Postgres container start on an empty volume, and is therefore
what actually shaped prod's schema), cross-checked against
`backend/startup.py`'s idempotent self-healing DDL patches (which run on
every container start) and, live, against Postgres's own `pg_constraint`
catalog every time this script runs (see `_introspect_fk_inventory`) — not
assumed from the SQLAlchemy models alone, several of which (e.g.
`models/student_models.py`'s `EvidenceCapture`/`NotebookEntry`/
`ActivitySubmission`) declare a bare `ForeignKey(...)` with no `ondelete`,
which would emit NO ACTION/RESTRICT if SQLAlchemy had created the table —
but the table actually live in prod was created by init.sql instead, with
an explicit `ON DELETE CASCADE` on those same columns. Trust init.sql /
the live catalog, not the ORM model, when the two disagree.

Two tables are notably NOT ORM-modeled at all and were easy to miss:
`organizations` and `classrooms` (plus `organization_members`,
`classroom_invitations`, `classroom_students`) — managed entirely via raw
SQL in init.sql/startup.py, no `models.py` class. `classrooms` is also a
completely different table from `classes` (a separate, simpler Phase-7
stub keyed only by `teacher_id`, backing `student_peer_projects`/
`class_settings` — not the org-scoped classroom entity `routes/
classrooms.py` uses for invites/enrollment).

High-level order:
  1. Resolve every target id (teachers, students, any --extra-* accounts).
  2. SAFETY CHECK: reject (warn + exclude) any resolved id whose real,
     decrypted email doesn't look like a throwaway test account.
  3. Live FK inventory (`pg_constraint`) for every table referencing
     users/organizations/classrooms/classes/activities/learning_sessions,
     with real counts — informational, cross-checks everything below.
  4. Gather activity ids authored by the target teachers, and learning
     session ids belonging to the target users (read-only).
  5. SAFETY CHECK: drop any activity from the delete set if some OTHER,
     non-target user has evidence/notebook/submission/session/consent data
     against it — never silently cascade away a real user's data because
     it happens to reference a throwaway teacher's activity.
  6. SAFETY CHECK: drop any org from the delete set if some OTHER,
     non-target user is a member of it — never null a real user's org_id
     or drop their membership row as a side effect.
  7. Explicit deletes (no FK exists for these at all, or the FK is
     SET NULL/RESTRICT rather than CASCADE, so nothing else cleans them up
     automatically): rule_audit_log (hash-matched), consent_records
     (hash-matched), session_events, session_tracks,
     session_waypoint_progress, sync_logs, parent_child_links,
     compliance_checks, data_retention_policies, standards_sets.
  8. Delete activities (survivors of step 5) — cascades activity_waypoints,
     activity_locations, activity_standards_map, project_activities.
  9. Delete projects owned by the target teachers.
 10. Delete organizations (survivors of step 6) — cascades classrooms,
     organization_members, classroom_invitations, classroom_students.
 11. Delete users — cascades essentially everything else keyed by
     student_id/teacher_id/user_id (student_profiles, learning_sessions →
     multimodal_inputs/triple_join_records, evidence_captures,
     notebook_entries, activity_submissions, student_captures →
     capture_annotations/notebook_capture_links, student_notebooks →
     notebook_capture_links/notebook_feedback, student_competencies,
     notifications, email_preferences, student_projects,
     homeschool_children, user_privacy_preferences, classes →
     student_peer_projects → their captures/responses, student_self_
     projects, student_field_notes → student_field_note_captures,
     student_proposals, classroom_events, classroom_announcements,
     parent_messages, parent_settings — all verified ON DELETE CASCADE
     from users.id in init.sql).

`student_id_hash` derivation (rule_audit_log / consent_records): both are
SHA-256(id + AUDIT_HASH_SALT) hex digest — see `services/privacy_engine.py`
`hash_student_id()`/`hash_actor_id()` (the latter is a plain alias of the
former). Reimplemented locally below rather than importing
`services.privacy_engine` (which pulls in the whole engine + Redis cache
module tree) — the hash function itself is two lines and must use this
same process's `settings.AUDIT_HASH_SALT`, which it does either way since
both read from the container's environment. `rule_audit_log.actor_id` is
NOT consistently hashed in the live app — `services/privacy_engine.py`'s
`log_access()` hashes it, but `routes/privacy.py`'s `/my-data` GET/DELETE
handlers write it RAW (`str(current_user.id)`). This script matches
`actor_id` against BOTH the raw id strings and the hashes, for every
resolved target id, to catch either write path.

Not fully verifiable from static reading (flagged rather than guessed):
  - Whether prod's actual live schema still matches init.sql exactly, given
    startup.py's own comments describe at least one migration
    (`alembic/versions/20260627_parent_portal_tables.py`) as "never
    actually applied" and mirrored by hand into startup.py instead, and a
    separate `backend/migrations/20260602_multitenancy_foundation.py`
    (an Alembic-shaped file that is NOT wired into the real Alembic chain
    in `backend/alembic/versions/`) duplicates organizations/classrooms/
    classroom_students with different ON DELETE values than init.sql's
    version (SET NULL vs. CASCADE) — this script does not trust either
    file blindly; `_introspect_fk_inventory()` reads the live
    `pg_constraint` catalog at runtime instead, every time it's run, and
    the report below is built from THAT, not from this docstring.
  - Whether any table this script doesn't know about references
    users/organizations/activities/learning_sessions with a live
    NO ACTION/RESTRICT FK it doesn't explicitly clear first. If so, the
    final DELETE in step 11/10/8 will raise, and the whole transaction
    rolls back (nothing partially applied) — see `_introspect_fk_inventory`
    output for anything with delete_rule NOT IN ('CASCADE') and a nonzero
    live count that isn't already one of the explicit steps above.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy import bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_session_factory
from core.encryption import blind_index
from models.user import User

# ─────────────────────────────────────────────────────────────────────────────
# Safety-net constant: every id this script resolves gets its real,
# decrypted email checked against this pattern before being added to the
# delete set. Anything that doesn't match is dropped with a loud warning,
# never silently included — a typo'd id in an --extra-user-id, or a stale
# id in an updated accounts JSON, must never end up deleting a real account.
# ─────────────────────────────────────────────────────────────────────────────
EXPECTED_EMAIL_LOCAL_PREFIX = "admin+priv-"
EXPECTED_EMAIL_DOMAIN = "thewordinbits.com"

# Tables whose live FK inventory we introspect from pg_constraint at
# runtime (see _introspect_fk_inventory). Anything with a real FK to one of
# these five tables gets discovered and counted automatically; the few
# tables with NO FK at all (rule_audit_log, consent_records, session_events,
# session_tracks, session_waypoint_progress, parent_child_links) can't be
# discovered this way and are handled by explicit hardcoded steps instead.
INTROSPECTED_PARENT_TABLES = (
    "users",
    "organizations",
    "classrooms",
    "classes",
    "activities",
    "learning_sessions",
)


def hash_student_id(raw_id: str) -> str:
    """SHA-256(id + AUDIT_HASH_SALT) — must match services/privacy_engine.py's
    hash_student_id()/hash_actor_id() exactly (the latter just calls the
    former). Reimplemented here rather than imported to avoid pulling in
    the full privacy-engine/Redis-cache import tree for a two-line hash."""
    raw = f"{raw_id}{settings.AUDIT_HASH_SALT}"
    return hashlib.sha256(raw.encode()).hexdigest()


def looks_like_throwaway_email(email: str) -> bool:
    """Post-fetch Python string check on an already-decrypted email — NOT a
    SQL LIKE/pattern query (those are banned: email is EncryptedString and
    email_index is a blind index usable only for exact-match lookups)."""
    if not email or "@" not in email:
        return False
    local, _, domain = email.rpartition("@")
    return (
        domain.lower() == EXPECTED_EMAIL_DOMAIN
        and local.lower().startswith(EXPECTED_EMAIL_LOCAL_PREFIX)
    )


# ─────────────────────────────────────────────────────────────────────────────
# Input loading
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class OrgEntry:
    slug: str
    org_id: str
    teacher_email: Optional[str]
    teacher_user_id: Optional[str]
    student_emails: list[str] = field(default_factory=list)


@dataclass
class RawInputs:
    """Everything gathered from --accounts-json file(s) and --extra-* flags,
    before any DB resolution has happened."""
    org_entries: list[OrgEntry] = field(default_factory=list)
    extra_emails: set[str] = field(default_factory=set)
    extra_user_ids: set[str] = field(default_factory=set)
    extra_org_ids: set[str] = field(default_factory=set)


def load_accounts_json(path: Path) -> tuple[list[OrgEntry], set[str], set[str], set[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    org_entries: list[OrgEntry] = []
    extra_emails: set[str] = set()
    extra_user_ids: set[str] = set()
    extra_org_ids: set[str] = set()

    if isinstance(data, list):
        # Schema (a): list of org/teacher/student entries, e.g.
        # privacy_emu_created.json itself.
        for row in data:
            org_entries.append(OrgEntry(
                slug=row.get("slug", "?"),
                org_id=row["org_id"],
                teacher_email=row.get("teacher_email"),
                teacher_user_id=row.get("teacher_user_id"),
                student_emails=list(row.get("student_emails") or []),
            ))
    elif isinstance(data, dict):
        # Schema (b): flat extras file (parent accounts, stray ids, etc.)
        extra_emails.update(data.get("extra_emails") or [])
        extra_user_ids.update(data.get("extra_user_ids") or [])
        extra_org_ids.update(data.get("extra_org_ids") or [])
        # Also accept an org-entries list nested under "orgs"/"entries", in
        # case a future extras file wants to mix both shapes in one file.
        for key in ("orgs", "entries"):
            for row in (data.get(key) or []):
                org_entries.append(OrgEntry(
                    slug=row.get("slug", "?"),
                    org_id=row["org_id"],
                    teacher_email=row.get("teacher_email"),
                    teacher_user_id=row.get("teacher_user_id"),
                    student_emails=list(row.get("student_emails") or []),
                ))
    else:
        raise ValueError(f"{path}: expected a JSON list or object, got {type(data).__name__}")

    return org_entries, extra_emails, extra_user_ids, extra_org_ids


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Delete throwaway privacy-engine test accounts/orgs/data from PRODUCTION.",
    )
    p.add_argument("--accounts-json", action="append", default=[], metavar="PATH",
                    help="Path to an accounts JSON file (repeatable; see module docstring for schema).")
    p.add_argument("--extra-email", action="append", default=[], metavar="EMAIL",
                    help="One more account email to resolve and include (repeatable).")
    p.add_argument("--extra-user-id", action="append", default=[], metavar="UUID",
                    help="One more user id to include directly, no email lookup (repeatable).")
    p.add_argument("--extra-org-id", action="append", default=[], metavar="UUID",
                    help="One more org id to include directly (repeatable).")
    p.add_argument("--confirm", action="store_true",
                    help="Actually delete. Without this flag, nothing is ever written.")
    p.add_argument("--dry-run", action="store_true",
                    help="No-op / documentation flag — this is the default whenever --confirm is absent.")
    return p.parse_args(argv)


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

def _in_clause(sql: str, *param_names: str):
    """Wrap a raw SQL string in text() with expanding bindparams for every
    name in param_names, so `col IN :name` works with a Python list bound
    to :name (SQLAlchemy expands it to `IN (:name_1, :name_2, ...)`)."""
    stmt = text(sql)
    for name in param_names:
        stmt = stmt.bindparams(bindparam(name, expanding=True))
    return stmt


async def count_rows(db: AsyncSession, table: str, column: str, ids: list[str]) -> int:
    if not ids:
        return 0
    stmt = _in_clause(f"SELECT COUNT(*) FROM {table} WHERE {column} IN :ids", "ids")
    result = await db.execute(stmt, {"ids": ids})
    return int(result.scalar_one())


async def fetch_ids(db: AsyncSession, table: str, column: str, ids: list[str]) -> list[str]:
    if not ids:
        return []
    stmt = _in_clause(f"SELECT id FROM {table} WHERE {column} IN :ids", "ids")
    result = await db.execute(stmt, {"ids": ids})
    return [str(r[0]) for r in result.all()]


async def delete_rows(db: AsyncSession, sql: str, param_names: Iterable[str], params: dict) -> int:
    stmt = _in_clause(sql, *param_names)
    result = await db.execute(stmt, params)
    return result.rowcount if result.rowcount is not None else -1


# ─────────────────────────────────────────────────────────────────────────────
# Resolution
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ResolvedTargets:
    teacher_ids: set[str] = field(default_factory=set)
    all_user_ids: set[str] = field(default_factory=set)
    org_ids: set[str] = field(default_factory=set)
    # Reporting only
    resolved_report: list[str] = field(default_factory=list)
    unresolved_report: list[str] = field(default_factory=list)
    rejected_report: list[str] = field(default_factory=list)  # failed the email-pattern safety check


async def _resolve_user_by_id(db: AsyncSession, user_id: str, label: str, out: ResolvedTargets) -> Optional[str]:
    row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if row is None:
        out.unresolved_report.append(f"  ! {label}: user id {user_id} not found (already deleted?)")
        return None
    if not looks_like_throwaway_email(row.email or ""):
        out.rejected_report.append(
            f"  !! REJECTED {label}: id {user_id} resolved to email {row.email!r}, "
            f"which does NOT look like a throwaway test account "
            f"(expected local part starting {EXPECTED_EMAIL_LOCAL_PREFIX!r} "
            f"@ {EXPECTED_EMAIL_DOMAIN}). Excluded from the delete set."
        )
        return None
    out.resolved_report.append(f"  - {label}: {row.email} (id={user_id}, role={row.role})")
    return str(row.id)


async def _resolve_user_by_email(db: AsyncSession, email: str, label: str, out: ResolvedTargets) -> Optional[str]:
    if not looks_like_throwaway_email(email):
        out.rejected_report.append(
            f"  !! REJECTED {label}: requested email {email!r} does not look like a "
            f"throwaway test account and was never looked up."
        )
        return None
    row = (await db.execute(
        select(User).where(User.email_index == blind_index(email))
    )).scalar_one_or_none()
    if row is None:
        out.unresolved_report.append(f"  ! {label}: email {email} not found (already deleted, or never created)")
        return None
    out.resolved_report.append(f"  - {label}: {row.email} (id={row.id}, role={row.role})")
    return str(row.id)


async def resolve_targets(db: AsyncSession, raw: RawInputs) -> ResolvedTargets:
    out = ResolvedTargets()

    for entry in raw.org_entries:
        out.org_ids.add(entry.org_id)
        teacher_id = None
        if entry.teacher_user_id:
            teacher_id = await _resolve_user_by_id(
                db, entry.teacher_user_id, f"[{entry.slug}] teacher", out)
        elif entry.teacher_email:
            teacher_id = await _resolve_user_by_email(
                db, entry.teacher_email, f"[{entry.slug}] teacher", out)
        if teacher_id:
            out.teacher_ids.add(teacher_id)
            out.all_user_ids.add(teacher_id)

        for s_email in entry.student_emails:
            student_id = await _resolve_user_by_email(db, s_email, f"[{entry.slug}] student", out)
            if student_id:
                out.all_user_ids.add(student_id)

    for email in sorted(raw.extra_emails):
        uid = await _resolve_user_by_email(db, email, "extra", out)
        if uid:
            out.all_user_ids.add(uid)

    for uid in sorted(raw.extra_user_ids):
        resolved = await _resolve_user_by_id(db, uid, "extra", out)
        if resolved:
            out.all_user_ids.add(resolved)

    out.org_ids.update(raw.extra_org_ids)

    return out


# ─────────────────────────────────────────────────────────────────────────────
# Live FK inventory (informational + safety cross-check)
# ─────────────────────────────────────────────────────────────────────────────

FK_INVENTORY_SQL = """
    SELECT
        con.conrelid::regclass::text  AS child_table,
        att.attname                   AS child_column,
        con.confrelid::regclass::text AS parent_table,
        CASE con.confdeltype
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'a' THEN 'NO ACTION'
            ELSE con.confdeltype::text
        END AS delete_rule
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
    WHERE con.contype = 'f'
      AND con.confrelid::regclass::text IN :parents
    ORDER BY parent_table, child_table, child_column;
"""


@dataclass
class FkRow:
    child_table: str
    child_column: str
    parent_table: str
    delete_rule: str
    live_count: int = 0


async def introspect_fk_inventory(db: AsyncSession, id_lists: dict[str, list[str]]) -> list[FkRow]:
    """Read pg_constraint directly (not information_schema — more reliable
    for composite/renamed constraints) for every FK pointing at one of
    INTROSPECTED_PARENT_TABLES, then live-count matching rows for each,
    using the id list appropriate to that FK's parent table."""
    result = await db.execute(
        text(FK_INVENTORY_SQL).bindparams(bindparam("parents", expanding=True)),
        {"parents": list(INTROSPECTED_PARENT_TABLES)},
    )
    rows = [FkRow(child_table=r.child_table, child_column=r.child_column,
                   parent_table=r.parent_table, delete_rule=r.delete_rule)
            for r in result.all()]
    for fk in rows:
        ids = id_lists.get(fk.parent_table, [])
        fk.live_count = await count_rows(db, fk.child_table, fk.child_column, ids)
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

async def main() -> int:
    args = parse_args()

    raw = RawInputs()
    for p in args.accounts_json:
        entries, emails, uids, oids = load_accounts_json(Path(p))
        raw.org_entries.extend(entries)
        raw.extra_emails.update(emails)
        raw.extra_user_ids.update(uids)
        raw.extra_org_ids.update(oids)
    raw.extra_emails.update(args.extra_email)
    raw.extra_user_ids.update(args.extra_user_id)
    raw.extra_org_ids.update(args.extra_org_id)

    if not raw.org_entries and not raw.extra_emails and not raw.extra_user_ids and not raw.extra_org_ids:
        print(
            "Nothing to do: no --accounts-json file(s) and no --extra-* flags given.\n"
            "Pass at least one, e.g.:\n"
            "  --accounts-json /app/privacy_emu_created.json",
            file=sys.stderr,
        )
        return 2

    confirm = args.confirm
    print(f"Mode: {'CONFIRM (will write)' if confirm else 'DRY RUN (no writes)'}")
    print(f"DB target: {settings.DATABASE_URL.split('@')[-1]}")
    print()

    session_factory = get_session_factory()
    async with session_factory() as db:
        targets = await resolve_targets(db, raw)

        print("── Resolution ─────────────────────────────────────────────")
        for line in targets.resolved_report:
            print(line)
        if targets.unresolved_report:
            print("\nNot found (informational, not fatal):")
            for line in targets.unresolved_report:
                print(line)
        if targets.rejected_report:
            print("\n*** SAFETY REJECTIONS (excluded from delete set) ***")
            for line in targets.rejected_report:
                print(line)
        print()

        if not targets.all_user_ids and not targets.org_ids:
            print("Nothing resolved to a real, verified throwaway account/org. Stopping.")
            return 1

        all_ids = sorted(targets.all_user_ids)
        teacher_ids = sorted(targets.teacher_ids)
        org_ids_candidate = sorted(targets.org_ids)

        # Extra defense-in-depth: loudly flag (never block) if any resolved
        # id happens to be a platform admin. Per
        # peripateticware-admin-accounts memory, the real prod platform
        # admin is admin@thewordinbits.com, which can never match
        # looks_like_throwaway_email() above and would already have been
        # rejected — this is a second, independent check on the live flag.
        if all_ids:
            # NOTE: deliberately going through the ORM's select(), not raw
            # text(), so User.email's EncryptedString TypeDecorator actually
            # decrypts it — a raw SQL SELECT would return ciphertext.
            admin_rows = (await db.execute(
                select(User.id, User.email, User.is_platform_admin)
                .where(User.id.in_(all_ids))
            )).all()
            for r in admin_rows:
                if r.is_platform_admin:
                    print(f"*** WARNING: {r.email} (id={r.id}) has is_platform_admin=True. "
                          f"Double-check this is really meant to be deleted. ***")
        print()

        # ── Read-only gathering ──────────────────────────────────────────
        session_ids = await fetch_ids(db, "learning_sessions", "user_id", all_ids)
        candidate_activity_ids = await fetch_ids(db, "activities", "teacher_id", teacher_ids)
        classroom_ids = sorted(set(
            await fetch_ids(db, "classrooms", "org_id", org_ids_candidate)
            + await fetch_ids(db, "classrooms", "teacher_id", teacher_ids)
        ))
        class_ids = await fetch_ids(db, "classes", "teacher_id", teacher_ids)

        # ── Safety check: activities touched by a non-target user ───────
        activity_ids: list[str] = []
        skipped_activities: list[str] = []
        for act_id in candidate_activity_ids:
            contaminated = False
            for table, col in (
                ("evidence_captures", "student_id"),
                ("notebook_entries", "student_id"),
                ("activity_submissions", "student_id"),
                ("student_captures", "student_id"),
                ("student_notebooks", "student_id"),
                ("student_competencies", "student_id"),
                ("consent_logs", "student_id"),
                ("learning_sessions", "user_id"),
            ):
                stmt = _in_clause(
                    f"SELECT COUNT(*) FROM {table} WHERE activity_id = :aid "
                    f"AND {col} NOT IN :ids", "ids")
                cnt = (await db.execute(stmt, {"aid": act_id, "ids": all_ids or ["00000000-0000-0000-0000-000000000000"]})).scalar_one()
                if cnt:
                    contaminated = True
                    break
            if contaminated:
                skipped_activities.append(act_id)
            else:
                activity_ids.append(act_id)

        if skipped_activities:
            print("*** SAFETY: excluding these activities from deletion — some OTHER, "
                  "non-target user has data against them (evidence/notebook/submission/"
                  "session/consent). Investigate manually before deleting by hand: ***")
            for a in skipped_activities:
                print(f"  !! activity {a}")
            print()

        # ── Safety check: orgs with a non-target member ──────────────────
        org_ids: list[str] = []
        skipped_orgs: list[str] = []
        for org_id in org_ids_candidate:
            stmt1 = _in_clause(
                "SELECT COUNT(*) FROM users WHERE org_id = :oid AND id NOT IN :ids", "ids")
            stmt2 = _in_clause(
                "SELECT COUNT(*) FROM organization_members WHERE org_id = :oid AND user_id NOT IN :ids", "ids")
            ids_or_placeholder = all_ids or ["00000000-0000-0000-0000-000000000000"]
            c1 = (await db.execute(stmt1, {"oid": org_id, "ids": ids_or_placeholder})).scalar_one()
            c2 = (await db.execute(stmt2, {"oid": org_id, "ids": ids_or_placeholder})).scalar_one()
            if c1 or c2:
                skipped_orgs.append(org_id)
            else:
                org_ids.append(org_id)

        if skipped_orgs:
            print("*** SAFETY: excluding these orgs from deletion — some OTHER, "
                  "non-target user is a member. Investigate manually: ***")
            for o in skipped_orgs:
                print(f"  !! org {o}")
            print()

        # ── Hash sets for rule_audit_log / consent_records ───────────────
        hashes = [hash_student_id(uid) for uid in all_ids]
        actor_match_values = sorted(set(hashes) | set(all_ids))

        # ── Live FK inventory (informational cross-check) ────────────────
        id_lists = {
            "users": all_ids,
            "organizations": org_ids,
            "classrooms": classroom_ids,
            "classes": class_ids,
            "activities": activity_ids,
            "learning_sessions": session_ids,
        }
        fk_rows = await introspect_fk_inventory(db, id_lists)
        print("── Live FK inventory (informational — cross-checks the plan below) ──")
        for fk in fk_rows:
            marker = "" if fk.live_count == 0 else "  <-- has matching rows"
            print(f"  {fk.child_table}.{fk.child_column} -> {fk.parent_table} "
                  f"[ON DELETE {fk.delete_rule}] : {fk.live_count} row(s){marker}")
        # Anything with a NO ACTION/RESTRICT rule and a nonzero count would
        # block the corresponding parent DELETE below (Postgres would raise,
        # and the whole transaction rolls back cleanly) — flag it loudly
        # up front instead of waiting to find out.
        blockers = [fk for fk in fk_rows if fk.delete_rule in ("NO ACTION", "RESTRICT") and fk.live_count]
        if blockers:
            print("\n*** These FKs will BLOCK deletion unless cleared first (not handled by "
                  "any explicit step below — this script does not know what to do with them): ***")
            for fk in blockers:
                print(f"  !! {fk.child_table}.{fk.child_column} -> {fk.parent_table} "
                      f"[{fk.delete_rule}] : {fk.live_count} row(s)")
        print()

        # ── Explicit (non-cascading) tables ───────────────────────────────
        explicit_plan: list[tuple[str, str, list[str], dict]] = [
            ("rule_audit_log",
             "DELETE FROM rule_audit_log WHERE student_id_hash IN :hashes OR actor_id IN :actors",
             ["hashes", "actors"], {"hashes": hashes, "actors": actor_match_values}),
            ("consent_records",
             "DELETE FROM consent_records WHERE student_id_hash IN :hashes",
             ["hashes"], {"hashes": hashes}),
            ("session_events",
             "DELETE FROM session_events WHERE student_id IN :ids OR session_id IN :sids",
             ["ids", "sids"], {"ids": all_ids, "sids": session_ids}),
            ("session_tracks",
             "DELETE FROM session_tracks WHERE student_id IN :ids OR session_id IN :sids",
             ["ids", "sids"], {"ids": all_ids, "sids": session_ids}),
            ("session_waypoint_progress",
             "DELETE FROM session_waypoint_progress WHERE student_id IN :ids OR session_id IN :sids",
             ["ids", "sids"], {"ids": all_ids, "sids": session_ids}),
            ("sync_logs",
             "DELETE FROM sync_logs WHERE session_id IN :sids",
             ["sids"], {"sids": session_ids}),
            ("parent_child_links",
             "DELETE FROM parent_child_links WHERE parent_id IN :ids OR child_id IN :ids",
             ["ids"], {"ids": all_ids}),
            ("compliance_checks",
             "DELETE FROM compliance_checks WHERE activity_id IN :aids OR checked_by_user_id IN :ids",
             ["aids", "ids"], {"aids": activity_ids, "ids": all_ids}),
            ("data_retention_policies",
             "DELETE FROM data_retention_policies WHERE activity_id IN :aids",
             ["aids"], {"aids": activity_ids}),
            ("standards_sets",
             "DELETE FROM standards_sets WHERE owner_id IN :ids",
             ["ids"], {"ids": all_ids}),
        ]

        print("── Explicit delete plan (no cascade covers these) ────────────")
        for table, sql, param_names, params in explicit_plan:
            # Count first (dry-run-safe: SELECT only).
            select_sql = sql.replace("DELETE FROM", "SELECT COUNT(*) FROM", 1)
            cnt = (await db.execute(_in_clause(select_sql, *param_names), params)).scalar_one()
            print(f"  {table}: {cnt} row(s) would be deleted")
        print()

        print("── Cascade-triggering top-level deletes ──────────────────────")
        print(f"  activities:    {len(activity_ids)} row(s) (teacher-authored, safety-checked)")
        proj_cnt = await count_rows(db, "projects", "teacher_id", teacher_ids)
        print(f"  projects:      {proj_cnt} row(s)")
        print(f"  organizations: {len(org_ids)} row(s) (safety-checked)")
        print(f"  users:         {len(all_ids)} row(s)")
        print()

        if not confirm:
            print("Dry run complete. No changes were made. Re-run with --confirm to apply.")
            return 0

        # ── CONFIRM: apply everything in one transaction ──────────────────
        # NOTE: deliberately NOT `async with db.begin():` — the read/report
        # queries above already auto-began a transaction on this session
        # (AsyncSession's default autobegin=True), so calling db.begin() here
        # would raise "a transaction is already begun on this Session". The
        # whole session's lifetime from open to here is already one
        # transaction; we just need to end it with an explicit commit/
        # rollback, which is exactly the FK-safe, all-or-nothing behavior
        # the task asked for.
        print("── Applying deletes (single transaction, rollback on any error) ──")
        try:
            for table, sql, param_names, params in explicit_plan:
                n = await delete_rows(db, sql, param_names, params)
                print(f"  {table}: deleted {n} row(s)")

            if activity_ids:
                n = await delete_rows(
                    db, "DELETE FROM activities WHERE id IN :aids", ["aids"],
                    {"aids": activity_ids})
                print(f"  activities: deleted {n} row(s)")

            if teacher_ids:
                n = await delete_rows(
                    db, "DELETE FROM projects WHERE teacher_id IN :ids", ["ids"],
                    {"ids": teacher_ids})
                print(f"  projects: deleted {n} row(s)")

            if org_ids:
                n = await delete_rows(
                    db, "DELETE FROM organizations WHERE id IN :ids", ["ids"],
                    {"ids": org_ids})
                print(f"  organizations: deleted {n} row(s) (cascaded classrooms/"
                      f"organization_members/classroom_invitations/classroom_students)")

            if all_ids:
                n = await delete_rows(
                    db, "DELETE FROM users WHERE id IN :ids", ["ids"],
                    {"ids": all_ids})
                print(f"  users: deleted {n} row(s) (cascaded student_profiles/"
                      f"learning_sessions/evidence_captures/notebook_entries/"
                      f"activity_submissions/student_captures/student_notebooks/"
                      f"student_competencies/notifications/email_preferences/"
                      f"student_projects/homeschool_children/"
                      f"user_privacy_preferences/classes/student_self_projects/"
                      f"student_field_notes/student_proposals/and more — see report above)")

            await db.commit()
            print("\nCommitted successfully.")
        except Exception:
            await db.rollback()
            print("\n*** ERROR — transaction rolled back, NOTHING was changed. ***", file=sys.stderr)
            raise

        if skipped_activities or skipped_orgs:
            print("\nNOTE: some activities/orgs were intentionally skipped by the safety "
                  "checks above and still need manual review.")
            return 1

        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
