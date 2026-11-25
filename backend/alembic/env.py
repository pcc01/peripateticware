from sqlalchemy import engine_from_config, pool, text
from alembic import context
import os
import sys
from pathlib import Path

# Inside the container /app IS the backend package root — no 'backend.' prefix
app_root = Path(__file__).parent.parent
sys.path.insert(0, str(app_root))

from core.database import Base
from models.database import User, Activity, ActivityStatus, ActivityType, CurriculumUnit, Project
from models.assessment import LocationContext, AssessmentRubric

config = context.config

# Use DATABASE_URL from environment; swap asyncpg for sync psycopg2 driver
_async_url = os.environ.get(
    'DATABASE_URL',
    'postgresql+asyncpg://peripateticware:peripateticware_secure_password_dev@postgres:5432/peripateticware'
)
database_url = _async_url.replace('postgresql+asyncpg://', 'postgresql://')

def run_migrations_offline():
    context.configure(url=database_url, target_metadata=Base.metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config({'sqlalchemy.url': database_url}, prefix='sqlalchemy.', poolclass=pool.NullPool)
    with connectable.connect() as connection:
        # Alembic creates `alembic_version` itself (if missing) with its own
        # hardcoded VARCHAR(32) version_num column the first time any
        # revision is applied -- but at least one real revision ID in this
        # chain ('20260524_discovery_taxonomies_comprehensive', 43 chars)
        # doesn't fit. On a DB that's never run Alembic before (a fresh CI/
        # dev database -- prod has carried a manually-widened VARCHAR(255)
        # column for a while, hiding this), upgrading the whole chain
        # crashed with "value too long for type character varying(32)" the
        # moment it tried to record reaching that revision, after every
        # earlier migration had already applied successfully. Create the
        # table at the wider width up front (a no-op if it already exists
        # at >=255) and widen it if it exists narrower, so this can never
        # bite again regardless of how long some future revision ID is.
        connection.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(255) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        ))
        connection.execute(text(
            "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255)"
        ))
        connection.commit()

        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
