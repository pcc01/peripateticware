# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Add breach_incidents table — GDPR Art. 33/34 notification log.

Revision: add_breach_incidents_table
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision      = "add_breach_incidents"
down_revision = None   # set to the last migration revision in your chain
branch_labels = None
depends_on    = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS breach_incidents (
            id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            discovered_at              TIMESTAMP NOT NULL DEFAULT NOW(),
            reported_by                VARCHAR(256) NOT NULL,
            description                TEXT NOT NULL,
            root_cause                 TEXT,
            severity                   VARCHAR(20) NOT NULL DEFAULT 'medium',
            status                     VARCHAR(20) NOT NULL DEFAULT 'discovered',
            affected_user_count        INTEGER,
            data_categories            JSONB NOT NULL DEFAULT '[]'::jsonb,
            jurisdictions              JSONB NOT NULL DEFAULT '[]'::jsonb,
            dpa_notification_required  BOOLEAN NOT NULL DEFAULT TRUE,
            dpa_deadline               TIMESTAMP,
            dpa_notified_at            TIMESTAMP,
            dpa_reference_number       VARCHAR(100),
            user_notification_required BOOLEAN NOT NULL DEFAULT FALSE,
            users_notified_at          TIMESTAMP,
            users_notified_count       INTEGER,
            containment_actions        TEXT,
            internal_notes             TEXT,
            created_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
            closed_at                  TIMESTAMP
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_breach_status
            ON breach_incidents(status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_breach_dpa_deadline
            ON breach_incidents(dpa_deadline)
            WHERE dpa_notified_at IS NULL
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_breach_dpa_deadline")
    op.execute("DROP INDEX IF EXISTS idx_breach_status")
    op.execute("DROP TABLE IF EXISTS breach_incidents")
