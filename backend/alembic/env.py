from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.core.database import Base
from backend.models.database import User, Activity, ActivityStatus, ActivityType, CurriculumUnit, Project
from backend.models.assessment import LocationContext, AssessmentRubric

config = context.config

# Use credentials from docker-compose.yml
database_url = 'postgresql://peripateticware:peripateticware_secure_password_dev@localhost:5432/peripateticware'

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
