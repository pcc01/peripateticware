# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Admin approval step for privacy_promotion_proposals (see
services/privacy_auto_renew.py's monthly no-legislation-country recheck).
Nothing from that monthly check ever writes to compliance_rules/
privacy_regulation_catalog/the shared gdpr_eu row directly -- this script is
the only thing that does, and only for a specific country an admin has
reviewed and explicitly named.

Usage:
  docker exec peripateticware-backend python scripts/apply_promotion.py --list
  docker exec peripateticware-backend python scripts/apply_promotion.py <COUNTRY_CODE>
  docker exec peripateticware-backend python scripts/apply_promotion.py --reject <COUNTRY_CODE>
"""

import asyncio
import sys
from datetime import datetime

from core.database import get_session_factory
from sqlalchemy import select


async def list_pending():
    from models.compliance import PrivacyPromotionProposal

    async with get_session_factory()() as db:
        rows = (await db.execute(
            select(PrivacyPromotionProposal)
            .where(PrivacyPromotionProposal.status == "proposed")
            .order_by(PrivacyPromotionProposal.created_at)
        )).scalars().all()

        if not rows:
            print("No pending proposals.")
            return

        for r in rows:
            findings = r.ai_findings or {}
            print(f"\n{r.country_code} ({r.country_name})  [proposed {r.created_at}]")
            print(f"  short_name: {findings.get('short_name')}")
            print(f"  full_name:  {findings.get('full_name')}")
            print(f"  summary:    {findings.get('summary')}")
            print(f"  confidence: {findings.get('confidence')}")
        print(f"\nApprove one with: python scripts/apply_promotion.py <COUNTRY_CODE>")


async def reject(country_code: str):
    from models.compliance import PrivacyPromotionProposal

    async with get_session_factory()() as db:
        row = (await db.execute(
            select(PrivacyPromotionProposal)
            .where(PrivacyPromotionProposal.country_code == country_code.upper(),
                   PrivacyPromotionProposal.status == "proposed")
            .order_by(PrivacyPromotionProposal.created_at.desc())
        )).scalars().first()

        if not row:
            print(f"No pending proposal found for {country_code}.")
            return

        row.status = "rejected"
        row.reviewed_at = datetime.utcnow()
        row.reviewed_by = "admin_cli"
        await db.commit()
        print(f"Rejected proposal for {country_code}. It will be re-proposed if the "
              f"monthly check finds the same result again next month.")


async def approve(country_code: str):
    from models.compliance import PrivacyPromotionProposal, PrivacySourceRegistry
    from services.privacy_discovery_service import discover_and_store_jurisdiction
    from services.privacy_auto_renew import _remove_country_from_gdpr_default

    cc = country_code.upper()

    async with get_session_factory()() as db:
        proposal = (await db.execute(
            select(PrivacyPromotionProposal)
            .where(PrivacyPromotionProposal.country_code == cc,
                   PrivacyPromotionProposal.status == "proposed")
            .order_by(PrivacyPromotionProposal.created_at.desc())
        )).scalars().first()

        if not proposal:
            print(f"No pending proposal found for {cc}. Use --list to see what's pending.")
            return

        print(f"Approving {cc} — running full discovery to create its real jurisdiction entry...")
        result = await discover_and_store_jurisdiction(db, country_code=cc)

        if not result:
            print(f"Discovery failed for {cc} — proposal left as 'proposed'. Try again later "
                  f"or investigate services/privacy_discovery_service.py logs.")
            return

        await _remove_country_from_gdpr_default(db, cc)

        registry_row = (await db.execute(
            select(PrivacySourceRegistry).where(PrivacySourceRegistry.country_code == cc)
        )).scalars().first()
        if registry_row:
            registry_row.has_no_known_legislation = False

        proposal.status = "applied"
        proposal.reviewed_at = datetime.utcnow()
        proposal.reviewed_by = "admin_cli"
        proposal.applied_at = datetime.utcnow()
        proposal.resulting_jurisdiction_id = result.get("jurisdiction_id")

        await db.commit()
        print(f"Applied. {cc} now resolves to {result.get('jurisdiction_id')} "
              f"({result.get('short_name')}) instead of the GDPR default.")


def main():
    args = sys.argv[1:]

    if not args or args[0] == "--list":
        asyncio.run(list_pending())
    elif args[0] == "--reject" and len(args) == 2:
        asyncio.run(reject(args[1]))
    elif len(args) == 1:
        asyncio.run(approve(args[0]))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
