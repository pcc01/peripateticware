#!/usr/bin/env python3
"""
Diagnostic: test the exact DB queries used by billing/status and privacy/me
to find the root cause of the 500s.
Run: docker compose exec backend python scripts/debug_500s.py
"""
import asyncio
import os
import sys
import traceback
sys.path.insert(0, '/app')

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware"
)
# Ensure async driver
if "postgresql://" in DATABASE_URL and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def test_billing():
    print("\n=== BILLING /status query ===")
    async with AsyncSessionLocal() as db:
        try:
            # Get admin user's org_id
            r = await db.execute(text("SELECT id, org_id FROM users WHERE email = 'admin@example.com'"))
            row = r.fetchone()
            if not row:
                print("  ERROR: admin@example.com not found")
                return
            user_id, org_id = row
            print(f"  admin id={user_id}  org_id={org_id}")
            if not org_id:
                print("  Admin has no org_id — billing would return early 200 (no issue)")
                return

            # Run the billing query
            result = await db.execute(text("""
                SELECT license_tier, license_status, trial_started_at,
                       grace_period_started_at, paddle_customer_id,
                       paddle_subscription_id, subscription_ends_at, name
                FROM   organizations WHERE id = :oid
            """), {"oid": str(org_id)})
            brow = result.mappings().first()
            if brow:
                print(f"  Billing row: {dict(brow)}")
                print("  ✅ Billing query succeeded")
            else:
                print(f"  ERROR: No org found for id={org_id}")
        except Exception as e:
            print(f"  ❌ Billing query FAILED: {e}")
            traceback.print_exc()


async def test_privacy():
    print("\n=== PRIVACY /me query ===")
    async with AsyncSessionLocal() as db:
        try:
            # Get teacher user id
            r = await db.execute(text("SELECT id FROM users WHERE email = 'teacher@example.com'"))
            row = r.fetchone()
            if not row:
                print("  ERROR: teacher@example.com not found")
                return
            teacher_id = row[0]
            print(f"  teacher id={teacher_id}")

            # Import model
            from models.compliance import UserPrivacyPreference
            result = await db.execute(
                select(UserPrivacyPreference).where(UserPrivacyPreference.user_id == teacher_id)
            )
            prefs = result.scalar_one_or_none()
            if prefs:
                print(f"  Found existing prefs: org_governed={prefs.org_governed} org_id={prefs.org_id}")
                print("  ✅ Privacy query succeeded (row exists)")
            else:
                print("  No existing prefs — would auto-create")
                # Test creating new row
                new_prefs = UserPrivacyPreference(
                    user_id=teacher_id,
                    ferpa_enabled=True,
                    coppa_enabled=True,
                    data_sharing_enabled=False,
                    ai_enabled=True,
                )
                db.add(new_prefs)
                await db.commit()
                print("  ✅ Privacy INSERT succeeded")
        except Exception as e:
            print(f"  ❌ Privacy query FAILED: {e}")
            traceback.print_exc()


async def test_columns():
    print("\n=== Column existence check ===")
    async with AsyncSessionLocal() as db:
        for table, col in [
            ("organizations", "trial_started_at"),
            ("organizations", "paddle_customer_id"),
            ("organizations", "paddle_subscription_id"),
            ("organizations", "subscription_ends_at"),
            ("organizations", "grace_period_started_at"),
            ("user_privacy_preferences", "org_governed"),
            ("user_privacy_preferences", "org_id"),
        ]:
            try:
                await db.execute(text(f"SELECT {col} FROM {table} LIMIT 0"))
                print(f"  ✅ {table}.{col} exists")
            except Exception as e:
                print(f"  ❌ {table}.{col} MISSING: {e}")


async def main():
    await test_columns()
    await test_billing()
    await test_privacy()
    await engine.dispose()
    print("\nDone.")

asyncio.run(main())
