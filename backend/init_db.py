# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from core.database import Base, DATABASE_URL
from models.database import User, UserRole

async def init_db():
    print("Creating database tables...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_db())