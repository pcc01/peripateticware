# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Page content: add page_blocks + page_block_versions, seed landing hero

Revision ID: 20260819b_page_blocks
Revises: 20260819_blog_posts
Create Date: 2026-08-19

Backs the WYSIWYG-lite page-copy editor (models/page_content.py,
routes/page_content.py, /admin/pages). Seeds the four landing-page
homeschool-tab hero fields (page_key='landing') with their current
hardcoded English copy from components/LandingPage.tsx's heroContent.homeschool
so the admin editor has real, live-matching content to edit from day one
instead of an empty table -- the frontend's usePageBlocks() hook falls
back to the same hardcoded strings if these rows are ever deleted, so
this seed is a convenience, not a hard dependency.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

revision = '20260819b_page_blocks'
down_revision = '20260819_blog_posts'
branch_labels = None
depends_on = None

_SEED_BLOCKS = [
    ("landing.hero.homeschool.headline", "The World Is Your Classroom."),
    ("landing.hero.homeschool.intro",
     "Peripateticware is built for homeschool families who learn by doing. "
     "Peri — your Aristotelian AI guide — leads each child through real-world "
     "activities with structured questions that deepen understanding, not "
     "just fill in answers. Track state standards automatically, and "
     "generate portfolio reports in one click."),
    ("landing.hero.homeschool.cta", "Start Free — No Credit Card"),
    ("landing.hero.homeschool.secondary_cta", "See a Sample Activity"),
]


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, 'page_blocks'):
        op.create_table(
            'page_blocks',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('page_key', sa.String(100), nullable=False),
            sa.Column('block_key', sa.String(200), nullable=False),
            sa.Column('locale', sa.String(10), nullable=False, server_default='en'),
            sa.Column('format', sa.String(20), nullable=False, server_default='text'),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('status', sa.String(20), nullable=False, server_default='published'),
            sa.Column('updated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('updated_by_name', sa.String(150), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.UniqueConstraint('block_key', 'locale', name='uq_page_blocks_block_key_locale'),
        )
        op.create_index('ix_page_blocks_page_key', 'page_blocks', ['page_key'])
        op.create_index('ix_page_blocks_block_key', 'page_blocks', ['block_key'])

    if not _table_exists(conn, 'page_block_versions'):
        op.create_table(
            'page_block_versions',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('block_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('page_blocks.id'), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('status', sa.String(20), nullable=False),
            sa.Column('source', sa.String(20), nullable=False, server_default='human'),
            sa.Column('edited_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('edited_by_name', sa.String(150), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        )
        op.create_index('ix_page_block_versions_block_id', 'page_block_versions', ['block_id'])

    # Seed -- idempotent per block_key (ON CONFLICT DO NOTHING), safe to
    # re-run and safe if an admin already edited these before a redeploy.
    for block_key, content in _SEED_BLOCKS:
        block_id = str(uuid.uuid4())
        result = conn.execute(sa.text(
            "INSERT INTO page_blocks (id, page_key, block_key, locale, format, content, status) "
            "VALUES (:id, 'landing', :block_key, 'en', 'text', :content, 'published') "
            "ON CONFLICT (block_key, locale) DO NOTHING "
            "RETURNING id"
        ), {"id": block_id, "block_key": block_key, "content": content})
        inserted_id = result.scalar()
        if inserted_id:
            conn.execute(sa.text(
                "INSERT INTO page_block_versions (id, block_id, content, status, source) "
                "VALUES (:id, :block_id, :content, 'published', 'human')"
            ), {"id": str(uuid.uuid4()), "block_id": inserted_id, "content": content})


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'page_block_versions'):
        op.drop_index('ix_page_block_versions_block_id', table_name='page_block_versions')
        op.drop_table('page_block_versions')
    if _table_exists(conn, 'page_blocks'):
        op.drop_index('ix_page_blocks_block_key', table_name='page_blocks')
        op.drop_index('ix_page_blocks_page_key', table_name='page_blocks')
        op.drop_table('page_blocks')
