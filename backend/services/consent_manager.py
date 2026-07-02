# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
ConsentManager — high-level service for consent record management.
Wraps the raw consent_records table with business logic:
  - Check if a user has active consent for a given type/jurisdiction
  - Record new consent
  - Withdraw consent (soft-delete via is_active=False)
  - Get consent history for a user
"""
import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.compliance import ConsentRecord
from services.privacy_engine import hash_student_id

logger = logging.getLogger(__name__)


def _hash_id(raw_id: str) -> str:
    """One-way hash of a user/student ID for privacy-safe storage.

    Delegates to privacy_engine.hash_student_id (SHA-256 + AUDIT_HASH_SALT) so
    every code path (ConsentManager, routes/privacy.py, routes/dsr.py) produces
    the SAME hash for the same user. Previously this was an UNSALTED hash,
    which (a) meant consent records written here were invisible to
    routes/privacy.py lookups and vice versa, and (b) let anyone who knew a
    student's UUID derive the hash and query the public
    GET /privacy/consent/{student_hash} endpoint.
    """
    return hash_student_id(raw_id)


class ConsentManager:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def has_active_consent(
        self,
        user_id: str,
        consent_type: str,
        jurisdiction: str,
    ) -> bool:
        """Return True if the user has active consent for this type+jurisdiction."""
        id_hash = _hash_id(user_id)
        result = await self.db.execute(
            select(ConsentRecord).where(
                ConsentRecord.student_id_hash == id_hash,
                ConsentRecord.consent_type == consent_type,
                ConsentRecord.jurisdiction == jurisdiction,
                ConsentRecord.is_active == True,
            )
        )
        return result.scalar_one_or_none() is not None

    async def record_consent(
        self,
        user_id: str,
        consent_type: str,
        jurisdiction: str,
        data_categories: List[str],
        granted_by: Optional[str] = None,
        consent_version: str = "1.0",
        ip_hash: Optional[str] = None,
    ) -> ConsentRecord:
        """Record new consent, deactivating any prior consent of the same type."""
        id_hash = _hash_id(user_id)

        # Deactivate prior consents of this type
        await self.db.execute(
            update(ConsentRecord)
            .where(
                ConsentRecord.student_id_hash == id_hash,
                ConsentRecord.consent_type == consent_type,
                ConsentRecord.jurisdiction == jurisdiction,
                ConsentRecord.is_active == True,
            )
            .values(is_active=False, withdrawn_at=datetime.utcnow())
        )

        record = ConsentRecord(
            student_id_hash=id_hash,
            jurisdiction=jurisdiction,
            consent_type=consent_type,
            data_categories=data_categories,
            granted_by=granted_by,
            consent_version=consent_version,
            ip_hash=ip_hash,
            is_active=True,
        )
        self.db.add(record)
        await self.db.flush()
        return record

    async def withdraw_consent(
        self,
        user_id: str,
        consent_type: str,
        jurisdiction: str,
    ) -> int:
        """Withdraw active consent. Returns count of records deactivated."""
        id_hash = _hash_id(user_id)
        result = await self.db.execute(
            update(ConsentRecord)
            .where(
                ConsentRecord.student_id_hash == id_hash,
                ConsentRecord.consent_type == consent_type,
                ConsentRecord.jurisdiction == jurisdiction,
                ConsentRecord.is_active == True,
            )
            .values(is_active=False, withdrawn_at=datetime.utcnow())
        )
        return result.rowcount or 0

    async def get_consent_history(self, user_id: str) -> List[ConsentRecord]:
        """Return all consent records (active and inactive) for a user."""
        id_hash = _hash_id(user_id)
        result = await self.db.execute(
            select(ConsentRecord)
            .where(ConsentRecord.student_id_hash == id_hash)
            .order_by(ConsentRecord.granted_at.desc())
        )
        return result.scalars().all()
