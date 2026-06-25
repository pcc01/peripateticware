"""
Multi-tenancy foundation — Phase 1.

New tables:
  organizations         — one row per school / district / homeschool org
  organization_members  — user↔org with role
  classrooms            — formal classroom entity within an org
  classroom_students    — student enrollment in classrooms
  classroom_invitations — tokens that let students join a classroom

Users changes:
  users.org_id  — nullable FK to organizations (null = platform admin / test)
  users.invite_token_used — the token that was consumed to create this account

Revision: 20260602_multitenancy_foundation
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision      = "20260602_multitenancy"
down_revision = None
branch_labels = None
depends_on    = None


def upgrade():
    # ── organizations ──────────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id",            UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("slug",          sa.String(100), unique=True, nullable=False),
        sa.Column("name",          sa.String(255), nullable=False),
        sa.Column("type",          sa.String(50),  nullable=False, server_default="school"),
        # License
        sa.Column("license_key",          sa.Text,        nullable=True),
        sa.Column("license_tier",         sa.String(30),  nullable=False, server_default="free"),
        sa.Column("license_status",       sa.String(20),  nullable=False, server_default="active"),
        sa.Column("license_valid_until",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_started_at",     sa.DateTime(timezone=True), nullable=True),
        # Limits (decoded from license JWT and cached here)
        sa.Column("max_teachers",    sa.Integer, server_default="3"),
        sa.Column("max_classrooms",  sa.Integer, server_default="1"),
        sa.Column("max_students",    sa.Integer, server_default="30"),
        # AI config
        sa.Column("ollama_base_url",       sa.Text, nullable=True),
        sa.Column("anthropic_api_key_enc", sa.Text, nullable=True),
        # Billing
        sa.Column("paddle_customer_id",      sa.String(128), nullable=True),
        sa.Column("paddle_subscription_id",  sa.String(128), nullable=True),
        # Meta
        sa.Column("contact_email",  sa.String(255), nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"])

    # ── organization_members ───────────────────────────────────────────────────
    op.create_table(
        "organization_members",
        sa.Column("id",        UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("org_id",    UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id",   UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role",      sa.String(30), nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "user_id", name="uq_org_members"),
    )
    op.create_index("ix_org_members_org",  "organization_members", ["org_id"])
    op.create_index("ix_org_members_user", "organization_members", ["user_id"])

    # ── classrooms ─────────────────────────────────────────────────────────────
    op.create_table(
        "classrooms",
        sa.Column("id",          UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("org_id",      UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id",  UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name",        sa.String(255), nullable=False),
        sa.Column("grade_level", sa.Integer, nullable=True),
        sa.Column("subject",     sa.String(100), nullable=True),
        sa.Column("is_active",   sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_classrooms_org",     "classrooms", ["org_id"])
    op.create_index("ix_classrooms_teacher", "classrooms", ["teacher_id"])

    # ── classroom_students ─────────────────────────────────────────────────────
    op.create_table(
        "classroom_students",
        sa.Column("classroom_id", UUID(as_uuid=True),
                  sa.ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id",   UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enrolled_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("classroom_id", "student_id"),
    )

    # ── classroom_invitations ──────────────────────────────────────────────────
    op.create_table(
        "classroom_invitations",
        sa.Column("id",           UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("classroom_id", UUID(as_uuid=True),
                  sa.ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id",       UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by",   UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email",        sa.String(255), nullable=True),   # null = open link
        sa.Column("token",        sa.String(128), unique=True, nullable=False),
        # 'pending' | 'accepted' | 'expired' | 'revoked'
        sa.Column("status",       sa.String(20), nullable=False, server_default="pending"),
        sa.Column("expires_at",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_by",  UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("accepted_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",   sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_classroom_invitations_token",     "classroom_invitations", ["token"])
    op.create_index("ix_classroom_invitations_classroom", "classroom_invitations", ["classroom_id"])
    op.create_index("ix_classroom_invitations_email",     "classroom_invitations", ["email"])

    # ── users.org_id ───────────────────────────────────────────────────────────
    # Nullable: platform admins and test users don't belong to an org.
    # All new signups get an org_id assigned at creation.
    op.add_column("users",
        sa.Column("org_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="SET NULL"),
                  nullable=True))
    op.add_column("users",
        sa.Column("invite_token_used", sa.String(128), nullable=True))
    op.create_index("ix_users_org_id", "users", ["org_id"])


def downgrade():
    op.drop_index("ix_users_org_id", "users")
    op.drop_column("users", "invite_token_used")
    op.drop_column("users", "org_id")
    op.drop_table("classroom_invitations")
    op.drop_table("classroom_students")
    op.drop_table("classrooms")
    op.drop_table("organization_members")
    op.drop_table("organizations")
