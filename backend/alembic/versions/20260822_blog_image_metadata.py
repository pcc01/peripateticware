# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Blog: add cover image caption/attribution/dimensions

Revision ID: 20260822_blog_image_metadata
Revises: 20260820_ai_interaction_mode
Create Date: 2026-08-22

Adds cover_image_caption/cover_image_attribution (shown under the cover
image on the public post view, same treatment routes/blog.py's inline
`^caption | attribution` body-image syntax gets) plus
cover_image_width/cover_image_height, captured from the upload at
_save_blog_image() time so the frontend can size the cover image box to
the image's real aspect ratio instead of a fixed-crop object-fit: cover,
which was cutting off the tops/bottoms of non-landscape covers.

Existing rows get NULLs for all four -- covers uploaded before this
migration have no known caption/attribution/dimensions, and the frontend
falls back to the pre-existing cropped display for those rather than
guessing.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260822_blog_image_metadata'
down_revision = '20260820_ai_interaction_mode'
branch_labels = None
depends_on = None

_COLUMNS = [
    ('cover_image_caption', sa.Text()),
    ('cover_image_attribution', sa.String(length=300)),
    ('cover_image_width', sa.Integer()),
    ('cover_image_height', sa.Integer()),
]


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    for name, col_type in _COLUMNS:
        if not _column_exists(conn, 'blog_posts', name):
            op.add_column('blog_posts', sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    for name, _ in _COLUMNS:
        if _column_exists(conn, 'blog_posts', name):
            op.drop_column('blog_posts', name)
