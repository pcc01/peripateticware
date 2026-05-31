from sqlalchemy import engine_from_config, pool
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
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
