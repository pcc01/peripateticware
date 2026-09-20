# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Seed CSTA PK-12 Computer Science Standards (196 grade-level standards)

Revision ID: 20260920_seed_csta_standards
Revises: 20260914c_signup_source_locale
Create Date: 2026-09-20

Source: CSTA standards export (PDF, generated 2026-09-20, 196 standards,
levels PK/K, 1-5, Middle School, High School). Parsed deterministically into
alembic/data/csta_2026_standards.json — the upload route's LLM extraction
truncates to 12k chars, which cannot cover a 326-page document.

Mapping: code=CSTA identifier (e.g. EK-ALG-IM-03), category=Concept,
subject=Subconcept, description is prefixed with its grade level in brackets.
Seeded as a global state_standards set owned by the first ADMIN; idempotent.
"""

import json
import os

from alembic import op
import sqlalchemy as sa

revision = '20260920_seed_csta_standards'
down_revision = '20260914c_signup_source_locale'
branch_labels = None
depends_on = None

_NAME = 'CSTA PK–12 Computer Science Standards'
_DESC = ('CSTA K-12 Computer Science Standards: 196 grade-level standards across '
         'five concepts (Algorithms & Design, Programming, Data & Analysis, '
         'Systems & Security, Computing & Society), PK/K through Grade 12.')
_DATA = os.path.join(os.path.dirname(__file__), '..', 'data', 'csta_2026_standards.json')


def upgrade() -> None:
    with open(_DATA, encoding='utf-8') as f:
        criteria = json.load(f)
    conn = op.get_bind()
    admin = conn.execute(sa.text(
        "SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1")).scalar()
    if admin is None:
        return
    exists = conn.execute(sa.text(
        "SELECT 1 FROM standards_sets WHERE name = :n AND is_global = TRUE"), {"n": _NAME}).scalar()
    if exists:
        return
    conn.execute(sa.text(
        "INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,"
        "source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) "
        "VALUES (uuid_generate_v4(),:n,:d,'state_standards',:o,NULL,TRUE,NULL,'complete',NOW(),NULL,"
        "CAST(:c AS jsonb),NOW(),NOW())"),
        {"n": _NAME, "d": _DESC, "o": admin, "c": json.dumps(criteria, ensure_ascii=False)})


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "DELETE FROM standards_sets WHERE name = :n AND is_global = TRUE"), {"n": _NAME})
