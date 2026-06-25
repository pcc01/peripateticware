"""
Add max_students_per_classroom to organizations table.

Tier defaults applied at org creation / license upgrade:
  free:     30 per classroom (1 classroom, 30 total)
  starter:  35 per classroom (3 classrooms, 300 total)
  school:   40 per classroom (15 classrooms, 1500 total)
  district: 40 per classroom (60 classrooms, unlimited total)
  enterprise: no limit

Revision: 20260602_class_size_limit
"""
from alembic import op
import sqlalchemy as sa

revision      = "20260602_class_size"
down_revision = None
branch_labels = None
depends_on    = None


def upgrade():
    op.add_column(
        "organizations",
        sa.Column("max_students_per_classroom", sa.Integer,
                  nullable=False, server_default="30"),
    )
    # Back-fill existing rows based on their current tier
    op.execute("""
        UPDATE organizations SET max_students_per_classroom =
            CASE license_tier
                WHEN 'free'         THEN 30
                WHEN 'starter'      THEN 35
                WHEN 'school'       THEN 40
                WHEN 'district'     THEN 40
                WHEN 'enterprise'   THEN 999
                WHEN 'homeschool_family' THEN 10
                WHEN 'homeschool_coop'   THEN 10
                ELSE 30
            END
    """)


def downgrade():
    op.drop_column("organizations", "max_students_per_classroom")
