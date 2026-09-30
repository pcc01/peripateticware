# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""std_pipeline_documents.superseded_by: add the missing foreign key

Revision ID: 20260930b_superseded_by_fk
Revises: 20260930_standards_local_case_codes
Create Date: 2026-09-30

superseded_by was a plain UUID column with no foreign key constraint at
all -- nothing stopped a dangling reference from forming, and nothing
would catch it if it did. Root cause of NC:math:k12's "register reported
success but no registered document was found downstream" bug (see
HANDOFF.md): at some point a document row that another row's
superseded_by pointed at was deleted, with nothing to clean up the
now-dangling reference. store.current_documents() filters WHERE
superseded_by IS NULL, so the orphaned row silently disappeared from
every pipeline step after register forever, with no error anywhere.

ON DELETE SET NULL: if a superseding row is ever deleted in the future,
every row that pointed at it reverts to "not superseded" (visible again)
rather than silently vanishing from current_documents() the same way.

Table confirmed clean before this migration (fix_dangling_superseded.py
found and cleared the one existing dangling reference first), so this
constraint applies without conflict.
"""

from alembic import op

revision = '20260930b_superseded_by_fk'
down_revision = '20260930_standards_local_case_codes'
branch_labels = None
depends_on = None

_UPGRADE_DDL = """
ALTER TABLE std_pipeline_documents
    ADD CONSTRAINT fk_std_pipeline_documents_superseded_by
    FOREIGN KEY (superseded_by) REFERENCES std_pipeline_documents(id) ON DELETE SET NULL;
"""

_DOWNGRADE_DDL = """
ALTER TABLE std_pipeline_documents DROP CONSTRAINT IF EXISTS fk_std_pipeline_documents_superseded_by;
"""


def upgrade() -> None:
    # Not IF NOT EXISTS -- ADD CONSTRAINT has no such clause; if this has
    # already been applied, re-running would fail loudly rather than
    # silently no-op, which is the right behavior for a constraint (unlike
    # the idempotent CREATE TABLE/ADD COLUMN patterns elsewhere in this
    # module, a duplicate constraint add is worth knowing about).
    op.execute(_UPGRADE_DDL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_DDL)
