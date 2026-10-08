# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""standards_sets: add a real country_code column, deprecate the CA-BC hyphen convention

Revision ID: 20261008_standards_sets_country_code
Revises: 20261004_learning_outcomes
Create Date: 2026-10-08

standards_sets.state_code was briefly overloaded to hold either a bare US
state code ("TX") or an already-prefixed non-US ISO 3166-2 code ("CA-BC"),
parsed apart by a "-" check in services/standards_graph_fold.py. That was a
stopgap to unblock a live British Columbia test without a migration -- see
that file's _resolve_or_create_jurisdiction history. This migration adds a
proper country_code column instead, matching the pattern jurisdictions and
services/privacy_jurisdiction_resolver.py already use (country_code +
subdivision/state code as two separate fields). server_default='US' means
every existing row (all of which predate non-US support) backfills
correctly with no separate UPDATE needed.
"""

from alembic import op

revision = '20261008_standards_sets_country_code'
down_revision = '20261004_learning_outcomes'
branch_labels = None
depends_on = None

_UPGRADE_DDL = """
ALTER TABLE standards_sets
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(4) NOT NULL DEFAULT 'US';
"""

_DOWNGRADE_DDL = """
ALTER TABLE standards_sets DROP COLUMN IF EXISTS country_code;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_DDL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_DDL)
