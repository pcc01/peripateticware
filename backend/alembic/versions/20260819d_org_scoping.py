# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Org-scoped admin views: is_protected flag, demo orgs, admin org linkage

Revision ID: 20260819d_org_scoping
Revises: 20260819c_content_admin_flag
Create Date: 2026-08-19

Backs the org-scoped /admin/* rewrite (routes/admin.py): role=ADMIN
accounts now only see their own org's data via organization_members
(the canonical membership model going forward -- users.org_id/
primary_org_id are inconsistently populated across accounts and are
NOT what the new scoping filters check). is_platform_admin remains the
only bypass that sees platform-wide data.

This migration:
  1. Adds users.is_protected -- a hard guard (see routes/admin.py's PUT/
     DELETE /users/{id}) against a tester deleting/modifying a seed/demo
     account through the admin panel, separate from the startup-time
     upsert reconciliation (belt and suspenders, not either/or).
  2. Seeds two canonical demo orgs (a school, a homeschool co-op) so the
     org-scoped admin demo has real data instead of an empty org.
  3. Links the `admin` seed account (if it exists) to the school org,
     marks every known seed/demo account is_protected, and forces
     `admin`.is_content_admin=false explicitly (defense in depth on top
     of that column's own default).
  4. Adds a small amount of sample data (1 teacher + 2 students + 1
     classroom, all in the school org) so admin's dashboard shows real
     counts. These sample accounts have random passwords that are never
     recorded anywhere -- they exist only to be counted, not logged
     into.

Every step here is conditional on rows already existing (`admin` might
not exist on a fresh dev DB) or ON CONFLICT-guarded, so this is safe to
run against any environment's current state.
"""

from alembic import op
import sqlalchemy as sa
import bcrypt
import secrets
import uuid

revision = '20260819d_org_scoping'
down_revision = '20260819c_content_admin_flag'
branch_labels = None
depends_on = None

SCHOOL_ORG_SLUG = 'demo-school'
HOMESCHOOL_ORG_SLUG = 'demo-homeschool-coop'

# Every account this app's own seed functions create that a tester could
# plausibly delete/deactivate mid-test-run -- kept in one place so the
# is_protected backfill and any future seed additions stay in sync.
PROTECTED_USERNAMES = [
    'admin',
    'test_student', 'test_teacher', 'test_parent', 'test_admin', 'test_homeschool', 'test_platform',
    'teacher', 'student', 'parent', 'homeschool',
]


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column}).fetchone())


def _placeholder_email_index(email: str) -> str:
    """core.encryption.blind_index() is HMAC-SHA256 keyed off
    FIELD_ENCRYPTION_KEY when encryption is enabled (prod), or a plain
    lowercase/strip when it's not (local dev) -- this migration doesn't
    have access to that key material, and doesn't need to: these sample
    accounts are never looked up by email (random, unrecorded passwords --
    they exist purely to be counted on the demo dashboard, not logged
    into), so an email_index that doesn't match the app's real algorithm
    has no functional effect. Just needs to be non-null and unique."""
    return email.lower().strip()


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, 'users', 'is_protected'):
        op.add_column(
            'users',
            sa.Column('is_protected', sa.Boolean(), nullable=False, server_default='false'),
        )

    # ── 2. Seed the two canonical demo orgs ────────────────────────────────
    school_id = conn.execute(sa.text(
        "INSERT INTO organizations (id, slug, name, type, license_tier) "
        "VALUES (:id, :slug, 'Demo School', 'school', 'free') "
        "ON CONFLICT (slug) DO UPDATE SET name = organizations.name "  # no-op update just to RETURNING on conflict too
        "RETURNING id"
    ), {"id": str(uuid.uuid4()), "slug": SCHOOL_ORG_SLUG}).scalar()

    homeschool_id = conn.execute(sa.text(
        "INSERT INTO organizations (id, slug, name, type, org_type_v2, license_tier) "
        "VALUES (:id, :slug, 'Demo Homeschool Co-op', 'homeschool_family', 'homeschool_family', 'free') "
        "ON CONFLICT (slug) DO UPDATE SET name = organizations.name "
        "RETURNING id"
    ), {"id": str(uuid.uuid4()), "slug": HOMESCHOOL_ORG_SLUG}).scalar()

    # ── 3. Protect known seed/demo accounts; link + fix up `admin` ────────
    conn.execute(sa.text(
        "UPDATE users SET is_protected = true WHERE username = ANY(:names)"
    ), {"names": PROTECTED_USERNAMES})

    admin_id = conn.execute(sa.text(
        "SELECT id FROM users WHERE username = 'admin'"
    )).scalar()

    if admin_id:
        conn.execute(sa.text(
            "UPDATE users SET is_content_admin = false WHERE id = :uid"
        ), {"uid": admin_id})
        conn.execute(sa.text(
            "INSERT INTO organization_members (id, org_id, user_id, role) "
            "VALUES (:id, :org_id, :uid, 'admin') "
            "ON CONFLICT (org_id, user_id) DO NOTHING"
        ), {"id": str(uuid.uuid4()), "org_id": school_id, "uid": admin_id})

    # ── 4. Sample data in the school org so admin's dashboard isn't zeros ──
    # Random passwords, never recorded -- these rows exist purely to be
    # counted (users_count, classrooms, students_count), not logged into.
    def _new_user(email: str, username: str, first: str, last: str, role: str) -> str:
        existing = conn.execute(sa.text(
            "SELECT id FROM users WHERE username = :u"
        ), {"u": username}).scalar()
        if existing:
            return existing
        uid = str(uuid.uuid4())
        pw_hash = bcrypt.hashpw(secrets.token_urlsafe(32).encode(), bcrypt.gensalt()).decode()
        conn.execute(sa.text(
            "INSERT INTO users (id, email, email_index, username, first_name, last_name, full_name, "
            "hashed_password, role, is_active, is_protected) "
            "VALUES (:id, :email, :ei, :username, :first, :last, :full, :pw, :role, true, true)"
        ), {
            "id": uid, "email": email, "ei": _placeholder_email_index(email), "username": username,
            "first": first, "last": last, "full": f"{first} {last}", "pw": pw_hash, "role": role,
        })
        return uid

    teacher_id = _new_user('demo.teacher@peripateticware-internal.example', 'demo_school_teacher', 'Dana', 'Okafor', 'TEACHER')
    student1_id = _new_user('demo.student1@peripateticware-internal.example', 'demo_school_student1', 'Rosa', 'Nguyen', 'STUDENT')
    student2_id = _new_user('demo.student2@peripateticware-internal.example', 'demo_school_student2', 'Miles', 'Park', 'STUDENT')

    for uid in (teacher_id, student1_id, student2_id):
        conn.execute(sa.text(
            "INSERT INTO organization_members (id, org_id, user_id, role) "
            "VALUES (:id, :org_id, :uid, 'member') "
            "ON CONFLICT (org_id, user_id) DO NOTHING"
        ), {"id": str(uuid.uuid4()), "org_id": school_id, "uid": uid})

    classroom_id = conn.execute(sa.text(
        "SELECT id FROM classrooms WHERE org_id = :org_id AND teacher_id = :tid"
    ), {"org_id": school_id, "tid": teacher_id}).scalar()
    if not classroom_id:
        classroom_id = str(uuid.uuid4())
        conn.execute(sa.text(
            "INSERT INTO classrooms (id, name, grade_level, subject, teacher_id, org_id, is_active) "
            "VALUES (:id, 'Demo Classroom', 5, 'Science', :tid, :org_id, true)"
        ), {"id": classroom_id, "tid": teacher_id, "org_id": school_id})

    for sid in (student1_id, student2_id):
        conn.execute(sa.text(
            "INSERT INTO classroom_students (classroom_id, student_id) "
            "VALUES (:cid, :sid) ON CONFLICT (classroom_id, student_id) DO NOTHING"
        ), {"cid": classroom_id, "sid": sid})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE FROM classroom_students WHERE student_id IN "
        "(SELECT id FROM users WHERE username IN ('demo_school_student1','demo_school_student2'))"
    ))
    conn.execute(sa.text(
        "DELETE FROM classrooms WHERE teacher_id IN "
        "(SELECT id FROM users WHERE username = 'demo_school_teacher')"
    ))
    conn.execute(sa.text(
        "DELETE FROM organization_members WHERE user_id IN "
        "(SELECT id FROM users WHERE username IN "
        "('demo_school_teacher','demo_school_student1','demo_school_student2'))"
    ))
    conn.execute(sa.text(
        "DELETE FROM users WHERE username IN "
        "('demo_school_teacher','demo_school_student1','demo_school_student2')"
    ))
    conn.execute(sa.text(
        "UPDATE users SET is_protected = false WHERE username = ANY(:names)"
    ), {"names": PROTECTED_USERNAMES})
    if _column_exists(conn, 'users', 'is_protected'):
        op.drop_column('users', 'is_protected')
    # Orgs and admin's membership intentionally left in place on downgrade --
    # dropping them could cascade-delete unrelated data a later migration
    # or manual action has since attached to these orgs.
