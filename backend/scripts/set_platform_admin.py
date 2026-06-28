#!/usr/bin/env python3
"""
One-time script: grant is_platform_admin = TRUE to a user by email.

Usage (inside backend container):
    python scripts/set_platform_admin.py admin@thewordinbits.com

Or with docker exec:
    docker exec peripateticware-backend python scripts/set_platform_admin.py admin@thewordinbits.com
"""
import asyncio
import sys
from pathlib import Path

# ensure app root is on path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from core.database import engine   # async engine


async def main(email: str) -> None:
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT id, email, is_platform_admin FROM users WHERE email = :e"),
            {"e": email},
        )
        row = result.first()
        if not row:
            print(f"❌  No user found with email: {email}")
            sys.exit(1)

        if row.is_platform_admin:
            print(f"ℹ️   {email} is already a platform admin.")
            return

        await conn.execute(
            text("UPDATE users SET is_platform_admin = TRUE WHERE email = :e"),
            {"e": email},
        )
        print(f"✅  {email} is now a platform admin.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/set_platform_admin.py <email>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
