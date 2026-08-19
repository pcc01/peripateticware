# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Blog: add blog_posts table

Revision ID: 20260819_blog_posts
Revises: 20260817c_rag_documents_fulltext
Create Date: 2026-08-19

Backs the new /blog marketing pages and the /admin/blog editor
(models/blog.py, routes/blog.py). Guarded with existence checks so it's a
no-op if the table was ever created out-of-band, matching the pattern used
by 20260816_rag_documents.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260819_blog_posts'
down_revision = '20260817c_rag_documents_fulltext'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, 'blog_posts'):
        op.create_table(
            'blog_posts',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('slug', sa.String(220), nullable=False),
            sa.Column('title', sa.String(300), nullable=False),
            sa.Column('excerpt', sa.Text(), nullable=True),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('cover_image_url', sa.String(500), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
            sa.Column('author_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('author_name', sa.String(150), nullable=True),
            sa.Column('tags', postgresql.ARRAY(sa.String(60)), nullable=False, server_default='{}'),
            sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        )
        op.create_index('ix_blog_posts_slug', 'blog_posts', ['slug'], unique=True)
        op.create_index('ix_blog_posts_status_published_at', 'blog_posts', ['status', 'published_at'])


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'blog_posts'):
        op.drop_index('ix_blog_posts_status_published_at', table_name='blog_posts')
        op.drop_index('ix_blog_posts_slug', table_name='blog_posts')
        op.drop_table('blog_posts')
