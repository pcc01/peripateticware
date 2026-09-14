# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
set_test_consent.py — TEST-ONLY tool to directly grant/revoke a student's
parental ConsentRecord, bypassing the real email/click-through flow.

Purpose: fast iteration while verifying the age-scoped-consent fix (see the
plan doc's "Test tooling" section) without waiting on real email delivery
each time. This is a shortcut ALONGSIDE the real flow
(routes/classrooms.py::accept_invite -> send_parent_consent_email ->
routes/privacy.py::record_consent), never a replacement for verifying that
real flow at least once.

Same connection/session pattern as cleanup_privacy_test_accounts.py
(core.database session factory, run as a one-off management script inside
the backend container — NOT wired into the app, NOT imported by anything,
NOT reachable via any HTTP route).

─────────────────────────────────────────────────────────────────────────────
USAGE
─────────────────────────────────────────────────────────────────────────────

  Grant (creates an active parental ConsentRecord covering the given data
  categories, deactivating any existing active one first — mirrors
  record_consent's own "one active record at a time" behaviour):

      docker exec peripateticware-backend python scripts/set_test_consent.py \\
          --email admin+priv-coppa-student1@thewordinbits.com \\
          --jurisdiction coppa_us --grant

  Revoke (deactivates any active parental ConsentRecord for this student —
  use to set up the "no consent" half of a test pair):

      docker exec peripateticware-backend python scripts/set_test_consent.py \\
          --email admin+priv-coppa-student2@thewordinbits.com --revoke

  --data-categories defaults to "identity,contact,location,behavioral,biometric,media"
  (the broadest set any seeded jurisdiction's consent_rules currently uses) —
  narrow it with a comma-separated list if testing a specific category only.

Looks the student up by email (same blind_index lookup
cleanup_privacy_test_accounts.py uses — email is EncryptedString, not
directly queryable), hashes their id the same way privacy_engine.py's
hash_student_id() does, and writes a models.compliance.ConsentRecord row
directly. Refuses to run against anything that doesn't look like a
throwaway test account (email local-part must contain "priv-" or "test",
matching this repo's existing admin+priv-*/admin+test-* conventions) unless
--force is passed — this is test tooling, not a support-ticket shortcut for
real families.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime

from sqlalchemy import select

sys.path.insert(0, __file__.rsplit("/scripts/", 1)[0] if "/scripts/" in __file__ else ".")

from core.database import get_session_factory  # noqa: E402
from core.encryption import blind_index  # noqa: E402
from models.user import User  # noqa: E402
from models.compliance import ConsentRecord  # noqa: E402
from services.privacy_engine import hash_student_id  # noqa: E402

DEFAULT_CATEGORIES = ["identity", "contact", "location", "behavioral", "biometric", "media"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--email", required=True, help="Student's login email")
    action = p.add_mutually_exclusive_group(required=True)
    action.add_argument("--grant", action="store_true", help="Create an active parental ConsentRecord")
    action.add_argument("--revoke", action="store_true", help="Deactivate any active parental ConsentRecord")
    p.add_argument("--jurisdiction", default="coppa_us", help="Jurisdiction id to record on the grant (default: coppa_us)")
    p.add_argument("--data-categories", default=",".join(DEFAULT_CATEGORIES),
                    help="Comma-separated data_categories for the grant")
    p.add_argument("--force", action="store_true",
                    help="Allow this against an email that doesn't look like a throwaway test account")
    return p.parse_args()


async def run() -> int:
    args = parse_args()
    local_part = args.email.split("@", 1)[0].lower()
    if not args.force and "priv-" not in local_part and "test" not in local_part:
        print(
            f"Refusing: '{args.email}' doesn't look like a throwaway test account "
            f"(expected 'priv-' or 'test' in the local part). Pass --force to override."
        )
        return 1

    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(User).where(User.email_index == blind_index(args.email)))
        student = result.scalar_one_or_none()
        if student is None:
            print(f"No user found for {args.email}")
            return 1

        student_hash = hash_student_id(str(student.id))

        existing = (await db.execute(
            select(ConsentRecord).where(
                ConsentRecord.student_id_hash == student_hash,
                ConsentRecord.consent_type == "parental",
                ConsentRecord.is_active == True,  # noqa: E712
            )
        )).scalars().all()
        for rec in existing:
            rec.is_active = False
            rec.withdrawn_at = datetime.utcnow()

        if args.grant:
            categories = [c.strip() for c in args.data_categories.split(",") if c.strip()]
            new_consent = ConsentRecord(
                student_id_hash=student_hash,
                jurisdiction=args.jurisdiction,
                consent_type="parental",
                data_categories=categories,
                is_active=True,
                granted_at=datetime.utcnow(),
                granted_by="set_test_consent.py (test tooling, not a real guardian action)",
            )
            db.add(new_consent)
            if getattr(student, "requires_parental_consent", False):
                student.is_active = True
                student.requires_parental_consent = False
            await db.commit()
            print(f"✓ Granted parental consent for {args.email} (student_id={student.id}, jurisdiction={args.jurisdiction}, categories={categories})")
        else:
            await db.commit()
            print(f"✓ Revoked any active parental consent for {args.email} (student_id={student.id})")

        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
