# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add jurisdictions + CASE-shaped standards tables (Satchel Rosetta Exchange ingest)

Revision ID: 20260807_case_standards
Revises: 20260726_privacy_promotion_proposals
Create Date: 2026-08-07

Adds the content-standards half of PRD-standards-alignment-engine-2026-07-31_1.md
(Part I §7.1/§7.2, Part II §16.1) as its own table family, separate from the
existing PDF-upload path (StandardsSet / standards_sets, database.py:1316):

  jurisdictions            -- one row per place: country, state/province, county,
                               city, or district/issuing-agency (self-referencing
                               parent_id so US-ID -> Idaho State Dept of Ed and
                               a district like GCPS both fit). Generalizes
                               organizations.country_code/subdivision_code
                               (added by 20260607_org_jurisdiction), which are
                               descriptive columns on a many-rows-per-place
                               regulatory-config table and can't serve as a clean
                               FK target -- see PRD §13 item 7.
  standards_sources        -- polling registry: one row per upstream CASE server
                               or Rosetta Exchange mirror.
  standards_frameworks     -- CASE CFDocument. is_authoritative_over_uploads
                               (default true) is the precedence flag: alignment
                               lookups must prefer a matching row here over a
                               StandardsSet row (source_file-based, i.e.
                               PDF-uploaded) for the same jurisdiction+subject,
                               falling back to StandardsSet only where no CASE
                               framework covers that jurisdiction+subject yet.
  standards_items          -- CASE CFItem. id is the CASE GUID verbatim
                               (never re-minted) -- it is the alignment key.
  standards_associations   -- CASE CFAssociation (isChildOf, exactMatchOf, ...).
  standards_item_revisions -- change log / review queue for upstream edits.

content_alignments, diploma_pathways, and the RAG/embedding pipeline (PRD §7.3
onward) are a separate future migration -- out of scope here, which covers only
the standards data itself.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260807_case_standards'
down_revision = '20260726_privacy_promotion_proposals'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table}).fetchone())


def _index_exists(conn, index: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    # ── jurisdictions ───────────────────────────────────────────────────────
    if not _table_exists(conn, 'jurisdictions'):
        op.create_table(
            'jurisdictions',
            sa.Column('id',               postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('country_code',     sa.String(4),   nullable=False),   # ISO 3166-1: US, ...
            sa.Column('subdivision_code', sa.String(20),  nullable=True),    # ISO 3166-2: US-ID, or synthetic for county/city/district
            sa.Column('parent_id',        postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('jurisdictions.id', ondelete='SET NULL'), nullable=True),
            sa.Column('level',            sa.String(20),  nullable=False),   # country|state|county|city|district|organization
            sa.Column('name',             sa.String(300), nullable=False),
            sa.Column('name_local',       sa.String(300), nullable=True),    # for non-English official names; defaults to name
            sa.Column('is_issuing_agency', sa.Boolean(),  nullable=False, server_default=sa.text('FALSE')),
            sa.Column('external_ref',     sa.String(50),  nullable=True),    # source's own short code, e.g. Rosetta's 'GA', 'GCPS'
            sa.Column('created_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            # 'organization' covers issuing agencies with no single geographic home:
            # national/international bodies like WIDA, IACET, College Board (SAT), ACT, Inc.,
            # Dynamic Learning Maps (DLM) -- CASE issuing agencies are not all governments.
            sa.CheckConstraint("level IN ('country','state','county','city','district','organization')", name='ck_jurisdictions_level'),
            sa.UniqueConstraint('country_code', 'subdivision_code', name='uq_jurisdictions_country_subdivision'),
        )
    if not _index_exists(conn, 'idx_jurisdictions_parent_id'):
        op.create_index('idx_jurisdictions_parent_id', 'jurisdictions', ['parent_id'])
    if not _index_exists(conn, 'idx_jurisdictions_country_code'):
        op.create_index('idx_jurisdictions_country_code', 'jurisdictions', ['country_code'])

    # ── standards_sources ───────────────────────────────────────────────────
    if not _table_exists(conn, 'standards_sources'):
        op.create_table(
            'standards_sources',
            sa.Column('id',              postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('name',            sa.String(300), nullable=False),   # 'Idaho State Dept of Ed CASE server', 'Satchel Rosetta Exchange'
            sa.Column('source_type',     sa.String(20),  nullable=False),   # case_api|html_page|pdf|ecs_index
            sa.Column('base_url',        sa.String(500), nullable=False),
            sa.Column('jurisdiction_id', postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('jurisdictions.id', ondelete='SET NULL'), nullable=True),
            sa.Column('is_authoritative', sa.Boolean(),  nullable=False, server_default=sa.text('TRUE')),  # agency's own CASE server vs Rosetta mirror
            sa.Column('poll_frequency_days', sa.Integer(), nullable=False, server_default=sa.text('7')),
            sa.Column('last_polled_at',  sa.DateTime(),  nullable=True),
            sa.Column('last_changed_at', sa.DateTime(),  nullable=True),
            sa.Column('last_status',     sa.String(500), nullable=True),
            sa.Column('content_hash',    sa.String(64),  nullable=True),
            sa.Column('created_at',      sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at',      sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.CheckConstraint("source_type IN ('case_api','html_page','pdf','ecs_index')", name='ck_standards_sources_type'),
        )
    if not _index_exists(conn, 'idx_standards_sources_jurisdiction_id'):
        op.create_index('idx_standards_sources_jurisdiction_id', 'standards_sources', ['jurisdiction_id'])

    # ── standards_frameworks (CASE CFDocument) ──────────────────────────────
    if not _table_exists(conn, 'standards_frameworks'):
        op.create_table(
            'standards_frameworks',
            sa.Column('id',               postgresql.UUID(as_uuid=True), primary_key=True),  # = CASE identifier GUID; never re-minted
            sa.Column('source_id',        postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('standards_sources.id', ondelete='RESTRICT'), nullable=False),
            sa.Column('jurisdiction_id',  postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('jurisdictions.id', ondelete='SET NULL'), nullable=True),
            sa.Column('title',            sa.String(500), nullable=False),
            sa.Column('subject',          sa.String(50),  nullable=True),
            sa.Column('version',          sa.String(50),  nullable=True),
            sa.Column('adoption_status',  sa.String(50),  nullable=True),
            sa.Column('official_source_url', sa.String(1000), nullable=False),
            sa.Column('case_uri',         sa.String(1000), nullable=True),
            sa.Column('last_change_datetime', sa.DateTime(), nullable=True),
            sa.Column('is_authoritative_over_uploads', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')),
            sa.Column('raw',              postgresql.JSONB(), nullable=False),
            sa.Column('created_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at',       sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        )
    if not _index_exists(conn, 'idx_standards_frameworks_jurisdiction_id'):
        op.create_index('idx_standards_frameworks_jurisdiction_id', 'standards_frameworks', ['jurisdiction_id'])
    if not _index_exists(conn, 'idx_standards_frameworks_subject'):
        op.create_index('idx_standards_frameworks_subject', 'standards_frameworks', ['subject'])

    # ── standards_items (CASE CFItem) ───────────────────────────────────────
    if not _table_exists(conn, 'standards_items'):
        op.create_table(
            'standards_items',
            sa.Column('id',                 postgresql.UUID(as_uuid=True), primary_key=True),  # = CASE GUID; the alignment key
            sa.Column('framework_id',       postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('standards_frameworks.id', ondelete='CASCADE'), nullable=False),
            sa.Column('human_coding_scheme', sa.String(200), nullable=True),  # 'CCSS.MATH.4.NF.A.1'
            sa.Column('full_statement',     sa.Text(),      nullable=False),
            sa.Column('education_levels',   postgresql.ARRAY(sa.String(10)), nullable=True),
            sa.Column('item_type',          sa.String(50),  nullable=True),
            sa.Column('parent_id',          postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('standards_items.id', ondelete='SET NULL'), nullable=True),  # denormalized isChildOf
            sa.Column('list_enumeration',   sa.String(50),  nullable=True),
            sa.Column('last_change_datetime', sa.DateTime(), nullable=True),
            sa.Column('is_retired',         sa.Boolean(),   nullable=False, server_default=sa.text('FALSE')),  # never hard-delete a GUID with alignments
            sa.Column('raw',                postgresql.JSONB(), nullable=False),
            sa.Column('created_at',         sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at',         sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
        )
    if not _index_exists(conn, 'idx_standards_items_framework_id'):
        op.create_index('idx_standards_items_framework_id', 'standards_items', ['framework_id'])
    if not _index_exists(conn, 'idx_standards_items_parent_id'):
        op.create_index('idx_standards_items_parent_id', 'standards_items', ['parent_id'])
    if not _index_exists(conn, 'idx_standards_items_education_levels'):
        op.create_index('idx_standards_items_education_levels', 'standards_items', ['education_levels'],
                         postgresql_using='gin')

    # ── standards_associations (CASE CFAssociation) ─────────────────────────
    if not _table_exists(conn, 'standards_associations'):
        op.create_table(
            'standards_associations',
            sa.Column('id',                  postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('framework_id',        postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('standards_frameworks.id', ondelete='CASCADE'), nullable=False),
            sa.Column('origin_item_id',      postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('destination_item_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('association_type',    sa.String(50),  nullable=False),  # isChildOf|exactMatchOf|isRelatedTo|precedes|...
            sa.Column('raw',                 postgresql.JSONB(), nullable=True),
        )
    if not _index_exists(conn, 'idx_standards_associations_framework_id'):
        op.create_index('idx_standards_associations_framework_id', 'standards_associations', ['framework_id'])
    if not _index_exists(conn, 'idx_standards_associations_origin_item_id'):
        op.create_index('idx_standards_associations_origin_item_id', 'standards_associations', ['origin_item_id'])

    # ── standards_item_revisions (change log / review queue) ────────────────
    if not _table_exists(conn, 'standards_item_revisions'):
        op.create_table(
            'standards_item_revisions',
            sa.Column('id',            sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column('item_id',       postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('standards_items.id', ondelete='CASCADE'), nullable=False),
            sa.Column('detected_at',   sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.Column('change_type',   sa.String(20),  nullable=False),  # added|text_changed|moved|retired
            sa.Column('old_value',     postgresql.JSONB(), nullable=True),
            sa.Column('new_value',     postgresql.JSONB(), nullable=True),
            sa.Column('review_status', sa.String(20),  nullable=False, server_default='pending'),
            sa.CheckConstraint("change_type IN ('added','text_changed','moved','retired')",
                                name='ck_standards_item_revisions_change_type'),
        )
    if not _index_exists(conn, 'idx_standards_item_revisions_item_id'):
        op.create_index('idx_standards_item_revisions_item_id', 'standards_item_revisions', ['item_id'])
    if not _index_exists(conn, 'idx_standards_item_revisions_review_status'):
        op.create_index('idx_standards_item_revisions_review_status', 'standards_item_revisions', ['review_status'])


def downgrade() -> None:
    conn = op.get_bind()

    for idx, table in [
        ('idx_standards_item_revisions_review_status', 'standards_item_revisions'),
        ('idx_standards_item_revisions_item_id', 'standards_item_revisions'),
        ('idx_standards_associations_origin_item_id', 'standards_associations'),
        ('idx_standards_associations_framework_id', 'standards_associations'),
        ('idx_standards_items_education_levels', 'standards_items'),
        ('idx_standards_items_parent_id', 'standards_items'),
        ('idx_standards_items_framework_id', 'standards_items'),
        ('idx_standards_frameworks_subject', 'standards_frameworks'),
        ('idx_standards_frameworks_jurisdiction_id', 'standards_frameworks'),
        ('idx_standards_sources_jurisdiction_id', 'standards_sources'),
        ('idx_jurisdictions_country_code', 'jurisdictions'),
        ('idx_jurisdictions_parent_id', 'jurisdictions'),
    ]:
        if _index_exists(conn, idx):
            op.drop_index(idx, table_name=table)

    for table in [
        'standards_item_revisions',
        'standards_associations',
        'standards_items',
        'standards_frameworks',
        'standards_sources',
        'jurisdictions',
    ]:
        if _table_exists(conn, table):
            op.drop_table(table)
