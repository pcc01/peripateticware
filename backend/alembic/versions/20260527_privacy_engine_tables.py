# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Add privacy engine tables: compliance_rules, rule_audit_log, consent_records

Revision ID: 20260527_privacy_engine_tables
Revises: 20260526_fix_enums_columns
Create Date: 2026-05-27

Tables created:
  compliance_rules   — versioned, admin-updatable JSON rule definitions
  rule_audit_log     — immutable INSERT-only audit trail for every data access
  consent_records    — parental / student consent tracking (COPPA/GDPR)

Design principles preserved:
  - Rules are DATA, not code. All jurisdiction logic lives in compliance_rules.
  - audit_log is INSERT-only; never UPDATE or DELETE a row.
  - Student IDs in audit_log are hashed (SHA-256 + salt), never raw.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260527_privacy_engine_tables'
down_revision = '20260526_fix_enums_columns'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # TABLE 1: compliance_rules
    # Source of truth for all jurisdiction policy definitions.
    # admin POST /api/v1/privacy/rules creates/updates rows here.
    # =========================================================================
    op.create_table(
        'compliance_rules',
        sa.Column('rule_id',             sa.String(256), primary_key=True),
        sa.Column('regulation_id',       sa.String(256), nullable=False,
                  comment='e.g. FERPA-1974-US-FEDERAL'),
        sa.Column('version',             sa.String(10),  nullable=False,
                  comment='Semantic version string, e.g. 2.1'),
        sa.Column('jurisdiction',        sa.String(50),  nullable=False,
                  comment='e.g. US_FEDERAL, EU, US_CA'),
        sa.Column('effective_date',      sa.DateTime,    nullable=False),
        sa.Column('sunset_date',         sa.DateTime,    nullable=True),
        sa.Column('rule_definition',     postgresql.JSONB, nullable=False,
                  comment='Full JurisdictionConfig serialised as JSON'),
        sa.Column('created_by',          sa.String(100), server_default='system'),
        sa.Column('created_at',          sa.DateTime,    server_default=sa.text('NOW()')),
        sa.Column('previous_version_id', sa.String(256), nullable=True),
        sa.Column('change_log',          sa.Text,        nullable=True),
        sa.Column('is_active',           sa.Boolean,     server_default='true', nullable=False),
        sa.Column('audit_hash',          sa.String(256), nullable=True,
                  comment='SHA-256 of rule_definition JSON — tampering detection'),
    )
    op.create_index(
        'ix_compliance_rules_jurisdiction',
        'compliance_rules',
        ['jurisdiction', 'is_active'],
    )
    op.create_index(
        'ix_compliance_rules_regulation',
        'compliance_rules',
        ['regulation_id', 'version'],
    )
    op.create_index(
        'ix_compliance_rules_active',
        'compliance_rules',
        ['is_active', 'effective_date'],
    )

    # =========================================================================
    # TABLE 2: rule_audit_log
    # INSERT-ONLY — every data access event is recorded here.
    # Used by GET /api/v1/privacy/audit-log and the CSV export endpoint.
    # =========================================================================
    op.create_table(
        'rule_audit_log',
        sa.Column('id',                  postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('rule_id',             sa.String(256), nullable=True),
        sa.Column('data_access_id',      postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('student_id_hash',     sa.String(256), nullable=True,
                  comment='SHA-256(student_id + AUDIT_HASH_SALT) — never raw ID'),
        sa.Column('action',              sa.String(100), nullable=False,
                  comment='e.g. EVIDENCE_SUBMIT, PARENT_VIEW, TEACHER_VIEW'),
        sa.Column('data_type',           sa.String(100), nullable=True,
                  comment='e.g. student_evidence, learning_session'),
        sa.Column('timestamp',           sa.DateTime,    server_default=sa.text('NOW()'), nullable=False),
        sa.Column('rules_applied',       postgresql.JSONB, nullable=True,
                  comment='[{regulation_id, version}, ...] list of rules checked'),
        sa.Column('enforcement_actions', postgresql.JSONB, nullable=True,
                  comment='What the engine decided: encryption algo, retention days, etc.'),
        sa.Column('compliance_status',   sa.String(20),  nullable=False, server_default='COMPLIANT',
                  comment='COMPLIANT | WARNING | BLOCKED'),
        sa.Column('actor_id',            sa.String(256), nullable=True,
                  comment='Hashed actor identifier'),
        sa.Column('actor_role',          sa.String(50),  nullable=True,
                  comment='student | teacher | parent | admin | system'),
        sa.Column('jurisdiction_ids',    postgresql.JSONB, nullable=True,
                  comment='Jurisdictions that were evaluated'),
        sa.Column('notes',               sa.Text,        nullable=True),
    )
    op.create_index(
        'ix_rule_audit_log_timestamp',
        'rule_audit_log',
        [sa.text('timestamp DESC')],
    )
    op.create_index(
        'ix_rule_audit_log_student_hash',
        'rule_audit_log',
        ['student_id_hash'],
    )
    op.create_index(
        'ix_rule_audit_log_status',
        'rule_audit_log',
        ['compliance_status'],
    )
    op.create_index(
        'ix_rule_audit_log_actor',
        'rule_audit_log',
        ['actor_id', 'actor_role'],
    )

    # =========================================================================
    # TABLE 3: consent_records
    # Tracks parental / student consent for COPPA (< 13) and GDPR (< 16).
    # Consent withdrawal sets is_active = False + withdrawn_at timestamp.
    # =========================================================================
    op.create_table(
        'consent_records',
        sa.Column('id',              postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('student_id_hash', sa.String(256), nullable=False),
        sa.Column('jurisdiction',    sa.String(50),  nullable=False),
        sa.Column('consent_type',    sa.String(50),  nullable=False,
                  comment='parental_consent | student_assent | opt_out'),
        sa.Column('data_categories', postgresql.JSONB, nullable=False,
                  comment='["location","behavioral","educational"]'),
        sa.Column('granted_at',      sa.DateTime,    server_default=sa.text('NOW()')),
        sa.Column('granted_by',      sa.String(256), nullable=True,
                  comment='Hashed parent/guardian identifier'),
        sa.Column('withdrawn_at',    sa.DateTime,    nullable=True),
        sa.Column('is_active',       sa.Boolean,     server_default='true', nullable=False),
        sa.Column('consent_version', sa.String(10),  nullable=True,
                  comment='Rule version in effect when consent was given'),
        sa.Column('ip_hash',         sa.String(256), nullable=True,
                  comment='Hashed IP address — GDPR accountability'),
        sa.Column('user_agent_hash', sa.String(256), nullable=True),
    )
    op.create_index(
        'ix_consent_records_student',
        'consent_records',
        ['student_id_hash', 'is_active'],
    )
    op.create_index(
        'ix_consent_records_jurisdiction',
        'consent_records',
        ['jurisdiction', 'consent_type'],
    )


def downgrade() -> None:
    op.drop_index('ix_consent_records_jurisdiction', table_name='consent_records')
    op.drop_index('ix_consent_records_student', table_name='consent_records')
    op.drop_table('consent_records')

    op.drop_index('ix_rule_audit_log_actor', table_name='rule_audit_log')
    op.drop_index('ix_rule_audit_log_status', table_name='rule_audit_log')
    op.drop_index('ix_rule_audit_log_student_hash', table_name='rule_audit_log')
    op.drop_index('ix_rule_audit_log_timestamp', table_name='rule_audit_log')
    op.drop_table('rule_audit_log')

    op.drop_index('ix_compliance_rules_active', table_name='compliance_rules')
    op.drop_index('ix_compliance_rules_regulation', table_name='compliance_rules')
    op.drop_index('ix_compliance_rules_jurisdiction', table_name='compliance_rules')
    op.drop_table('compliance_rules')
