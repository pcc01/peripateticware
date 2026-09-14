# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add users.parent_email and users.last_consent_request_at

Revision ID: 20260914_user_parent_email
Revises: 20260913b_submission_standards_evaluation
Create Date: 2026-09-14

Real gap found while designing student-triggered consent requests: the
parent/guardian email a student's account was created with was never
persisted anywhere — `routes/classrooms.py::accept_invite` takes
`body.parent_email` as a one-shot request field, uses it once to send the
initial `send_parent_consent_email()`, then discards it. There was no way to
later resend a consent request (e.g. the original 72h-TTL link expired, or a
student is now blocked on a captures/upload consent check and wants to
prompt their guardian again) without asking the student to re-type an email
address they may not even know.

`parent_email` — persisted at accept_invite time going forward (existing
accounts predating this column stay NULL until/unless backfilled).
`last_consent_request_at` — timestamp of the most recent consent-request
send, used to rate-limit `POST /student/consent/request-guardian` (a student
tapping "ask my parent again" repeatedly shouldn't spam that inbox); a plain
column rather than a separate table since it's one value per user with no
history requirement.

See the age-scoped-consent plan doc's "Student-triggered consent request"
section for the full design.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260914_user_parent_email'
down_revision = '20260913b_submission_standards_evaluation'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
    ), {"t": table}).fetchone())


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if _table_exists(conn, 'users'):
        if not _column_exists(conn, 'users', 'parent_email'):
            # Stored via models.user.User.parent_email's EncryptedString(600)
            # TypeDecorator (see core/encryption.py) — same PII sensitivity
            # as `email`, so the raw DB column is a wide plain String (the
            # ciphertext is longer than the plaintext; 600 matches `email`'s
            # own column width) with encryption applied at the ORM layer,
            # not the database.
            op.add_column('users', sa.Column('parent_email', sa.String(length=600), nullable=True))
        if not _column_exists(conn, 'users', 'last_consent_request_at'):
            op.add_column('users', sa.Column('last_consent_request_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'users'):
        if _column_exists(conn, 'users', 'last_consent_request_at'):
            op.drop_column('users', 'last_consent_request_at')
        if _column_exists(conn, 'users', 'parent_email'):
            op.drop_column('users', 'parent_email')
