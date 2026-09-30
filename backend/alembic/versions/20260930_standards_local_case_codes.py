# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Standards items: separate local_code and case_code from human_coding_scheme

Revision ID: 20260930_standards_local_case_codes
Revises: 20260925_standards_pipeline
Create Date: 2026-09-30

human_coding_scheme is the single "displayed" code for a promoted standard,
but by the time promote() writes it, that value may already be the raw
state-printed code, a CASE-matched code, or (rarely, before the 2026-09-30
guardrail) a hallucinated final_code -- there was no way to tell which
after the fact, and the original local code was lost whenever something
else overwrote it.

Two new nullable columns preserve the inputs separately instead of
collapsing them into one field:

  local_code  the raw code as extracted from the state's own source PDF
              (std_pipeline_candidates.code) -- untouched by any CASE
              match or LLM fix-pass rewrite.
  case_code   the human_coding_scheme of the CASE framework item this
              candidate matched, when std_pipeline_candidates.case_item_id
              is set (consensus.py's case_verified tier). Note: this is
              only a genuine CCSS code when the matched CASE framework
              happens to itself be CCSS -- for a state that publishes its
              own standards in CASE format, case_code is that state's own
              CASE-native code, not a CCSS crosswalk. No CASE cross-
              framework association/alignment data is ingested by this
              pipeline, so a true independent CCSS alignment is not
              available; see PPW-Standards_Puller HANDOFF.md if that
              becomes a separate project.

Both are populated going forward by promote.py; backfilling the ~33k
already-promoted items is a separate script
(PPW-Standards_Puller/tools/backfill_local_case_codes.py), not part of
this migration.

Idempotent DDL (IF NOT EXISTS) so this is safe whether the deploy runs
`alembic upgrade` or not.
"""

from alembic import op

revision = '20260930_standards_local_case_codes'
down_revision = '20260925_standards_pipeline'
branch_labels = None
depends_on = None

_DDL = """
ALTER TABLE standards_items ADD COLUMN IF NOT EXISTS local_code VARCHAR(200);
ALTER TABLE standards_items ADD COLUMN IF NOT EXISTS case_code VARCHAR(200);
"""


def upgrade() -> None:
    for stmt in _DDL.split(";"):
        if stmt.strip():
            op.execute(stmt)


def downgrade() -> None:
    op.execute("ALTER TABLE standards_items DROP COLUMN IF EXISTS local_code")
    op.execute("ALTER TABLE standards_items DROP COLUMN IF EXISTS case_code")
