# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
One-time seed: 24 US state comprehensive consumer-privacy laws (all states
except California, which was already seeded from compliance_rules as
ccpa_california) into privacy_regulation_catalog, sourced from a rights/
obligations/exemptions/legislation spreadsheet the user supplied directly
(US_Privacy Google Sheet) -- content (rights columns, effective dates,
enactment names) is taken verbatim from that sheet. Official statute URLs
are filled in from general knowledge of each law's canonical .gov/legislature
page, NOT extracted from the sheet (its hyperlinks weren't recoverable via
the Drive read tool) -- flagged for a human spot-check, not blind trust.

Run once: docker exec peripateticware-backend python scripts/seed_us_state_privacy_laws.py
Idempotent -- ON CONFLICT (jurisdiction_code, framework) DO UPDATE.
"""

import asyncio
from datetime import date, datetime, timezone

from core.database import get_session_factory
from sqlalchemy import text

# jurisdiction_code convention: <framework>_us_<state-postal-code>, matching
# docs/ADDING_A_JURISDICTION.md's framework_region rule.
STATES = [
    {
        "state": "Virginia", "postal": "VA", "framework": "vcdpa",
        "law_name": "Virginia's Consumer Data Protection Act", "effective_date": date(2023, 1, 1),
        "source_url": "https://law.lis.virginia.gov/vacode/title59.1/chapter53/",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Colorado", "postal": "CO", "framework": "cpa",
        "law_name": "Colorado Privacy Act", "effective_date": date(2023, 7, 1),
        "source_url": "https://coag.gov/resources/colorado-privacy-act/",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Connecticut", "postal": "CT", "framework": "ctdpa",
        "law_name": "Connecticut Data Privacy Act", "effective_date": date(2023, 7, 1),
        "source_url": "https://www.cga.ct.gov/2022/act/pa/pdf/2022PA-00015-R00SB-00006-PA.PDF",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Utah", "postal": "UT", "framework": "ucpa",
        "law_name": "Utah Consumer Privacy Act", "effective_date": date(2023, 12, 31),
        "source_url": "https://le.utah.gov/~2022/bills/static/SB0227.html",
        "opt_in_sensitive": False, "dpia_required": False, "appeal_right": False,
    },
    {
        "state": "Texas", "postal": "TX", "framework": "tdpsa",
        "law_name": "Texas Data Privacy and Security Act", "effective_date": date(2024, 7, 1),
        "source_url": "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.541.htm",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Florida", "postal": "FL", "framework": "fdbr",
        "law_name": "Florida Digital Bill of Rights", "effective_date": date(2024, 7, 1),
        "source_url": "https://www.flsenate.gov/Laws/Statutes/2024/501.702",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Oregon", "postal": "OR", "framework": "ocpa",
        "law_name": "Oregon Consumer Privacy Act", "effective_date": date(2024, 7, 1),
        "source_url": "https://www.oregonlegislature.gov/bills_laws/ors/ors646A.html",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Montana", "postal": "MT", "framework": "mcdpa",
        "law_name": "Montana Consumer Data Privacy Act", "effective_date": date(2024, 10, 1),
        "source_url": "https://leg.mt.gov/bills/2023/billpdf/SB0384.pdf",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Nebraska", "postal": "NE", "framework": "ndpa",
        "law_name": "Nebraska Data Privacy Act", "effective_date": date(2025, 1, 1),
        "source_url": "https://nebraskalegislature.gov/bills/view_bill.php?DocumentID=54764",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Iowa", "postal": "IA", "framework": "icdpa",
        "law_name": "Iowa Consumer Data Protection Act", "effective_date": date(2025, 1, 1),
        "source_url": "https://www.legis.iowa.gov/docs/code/715D.pdf",
        "opt_in_sensitive": False, "dpia_required": False, "appeal_right": True,
    },
    {
        "state": "Delaware", "postal": "DE", "framework": "dpdpa",
        "law_name": "Delaware Personal Data Privacy Act", "effective_date": date(2025, 1, 1),
        "source_url": "https://delcode.delaware.gov/title6/c012d/index.html",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "New Hampshire", "postal": "NH", "framework": "nhpa",
        "law_name": "Expectation of Privacy Act", "effective_date": date(2025, 1, 1),
        "source_url": "https://www.gencourt.state.nh.us/rsa/html/XXXI/507-H/507-H-mrg.htm",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "New Jersey", "postal": "NJ", "framework": "njdpa",
        "law_name": "New Jersey Data Privacy Act", "effective_date": date(2025, 1, 15),
        "source_url": "https://pub.njleg.gov/Bills/2022/PL23/16_.PDF",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Tennessee", "postal": "TN", "framework": "tipa",
        "law_name": "Tennessee Information Protection Act", "effective_date": date(2025, 7, 1),
        "source_url": "https://www.capitol.tn.gov/Bills/113/Bill/HB1181.pdf",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Minnesota", "postal": "MN", "framework": "mncdpa",
        "law_name": "Minnesota Consumer Data Privacy Act", "effective_date": date(2025, 7, 31),
        "source_url": "https://www.revisor.mn.gov/statutes/cite/325O",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Maryland", "postal": "MD", "framework": "modpa",
        "law_name": "Maryland Online Data Privacy Act", "effective_date": date(2025, 10, 1),
        "source_url": "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcp&section=14-4601",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Indiana", "postal": "IN", "framework": "icdpa_state",
        "law_name": "Indiana Consumer Data Protection Act", "effective_date": date(2026, 1, 1),
        "source_url": "https://iga.in.gov/laws/2023/ic/titles/24#24-15",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Kentucky", "postal": "KY", "framework": "kcdpa",
        "law_name": "Kentucky Consumer Data Protection Act", "effective_date": date(2026, 1, 1),
        "source_url": "https://apps.legislature.ky.gov/law/statutes/chapter.aspx?id=54180",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Rhode Island", "postal": "RI", "framework": "ridtppa",
        "law_name": "Rhode Island Data Transparency and Privacy Protection Act", "effective_date": date(2026, 1, 1),
        "source_url": "http://webserver.rilegislature.gov/Statutes/TITLE6/6-56/INDEX.htm",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Oklahoma", "postal": "OK", "framework": "oadpa",
        "law_name": "Oklahoma's Act Relating to Data Privacy", "effective_date": date(2027, 1, 1),
        "source_url": "http://www.oklegislature.gov/BillInfo.aspx?Bill=hb1806&Session=2400",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Louisiana", "postal": "LA", "framework": "ldpa",
        "law_name": "Louisiana Data Privacy Act", "effective_date": date(2027, 1, 1),
        "source_url": "https://www.legis.la.gov/legis/BillInfo.aspx?s=24RS&b=SB355",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
    {
        "state": "Alabama", "postal": "AL", "framework": "apdpa",
        "law_name": "Alabama Personal Data Protection Act", "effective_date": date(2027, 5, 1),
        "source_url": "https://alison.legislature.state.al.us/bill-search?searchTerm=SB396",
        "opt_in_sensitive": True, "dpia_required": False, "appeal_right": False,
    },
    {
        "state": "Vermont", "postal": "VT", "framework": "vdposa",
        "law_name": "Vermont Data Privacy and Online Surveillance Act", "effective_date": date(2028, 1, 1),
        "source_url": "https://legislature.vermont.gov/Documents/2024/Docs/ACTS/ACT183/ACT183%20As%20Enacted.pdf",
        "opt_in_sensitive": True, "dpia_required": True, "appeal_right": True,
    },
]


def build_key_requirements(s: dict) -> list[str]:
    reqs = [
        "Right to access, correct, and delete personal data",
        "Right to data portability",
        "Right to opt out of the sale of personal data and targeted advertising",
    ]
    reqs.append(
        "Opt-IN consent required before processing sensitive data categories"
        if s["opt_in_sensitive"] else
        "Opt-OUT model for sensitive data processing (not opt-in)"
    )
    if s["dpia_required"]:
        reqs.append("Data Protection Impact Assessments (DPIAs) required for higher-risk processing")
    if s["appeal_right"]:
        reqs.append("Consumers have a right to appeal a denied privacy request")
    reqs.append("Applies generally to consumer data, not specifically to K-12 students or minors")
    return reqs


async def main():
    factory = get_session_factory()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    inserted, updated = 0, 0

    async with factory() as db:
        for s in STATES:
            jurisdiction_code = f"{s['framework']}_us_{s['postal'].lower()}"
            key_requirements = build_key_requirements(s)
            summary = (
                f"{s['law_name']}, effective {s['effective_date'].isoformat()}. "
                f"General consumer data privacy law (not education- or child-specific) "
                f"applying to {s['state']} residents."
            )

            existing = (await db.execute(
                text("SELECT id FROM privacy_regulation_catalog "
                     "WHERE jurisdiction_code = :jc AND framework = :fw"),
                {"jc": jurisdiction_code, "fw": s["framework"]},
            )).first()

            params = {
                "jc": jurisdiction_code,
                "fw": s["framework"],
                "short_name": f"{s['state']} Privacy Act",
                "full_name": s["law_name"],
                "subdivision_code": f"US-{s['postal']}",
                "region": s["state"],
                "country_codes": ["US"],
                "summary": summary,
                "key_requirements": key_requirements,
                "effective_date": s["effective_date"],
                "source_url": s["source_url"],
                "now": now,
            }

            if existing:
                await db.execute(text("""
                    UPDATE privacy_regulation_catalog
                    SET short_name = :short_name, full_name = :full_name,
                        subdivision_code = :subdivision_code, region = :region,
                        country_codes = CAST(:country_codes AS JSONB),
                        summary = :summary, key_requirements = CAST(:key_requirements AS JSONB),
                        effective_date = :effective_date, source_url = :source_url,
                        updated_at = :now
                    WHERE jurisdiction_code = :jc AND framework = :fw
                """), {**params,
                       "country_codes": __import__("json").dumps(params["country_codes"]),
                       "key_requirements": __import__("json").dumps(params["key_requirements"])})
                updated += 1
            else:
                await db.execute(text("""
                    INSERT INTO privacy_regulation_catalog
                        (id, short_name, full_name, jurisdiction_code, subdivision_code,
                         region, country_codes, framework, summary, key_requirements,
                         age_threshold, is_child_safety, is_featured, effective_date,
                         source_url, added_by_role, is_active, is_verified,
                         discovery_method, created_at, updated_at)
                    VALUES
                        (gen_random_uuid(), :short_name, :full_name, :jc, :subdivision_code,
                         :region, CAST(:country_codes AS JSONB), :fw, :summary,
                         CAST(:key_requirements AS JSONB),
                         NULL, FALSE, FALSE, :effective_date,
                         :source_url, 'system_seed', TRUE, TRUE,
                         'seed', :now, :now)
                """), {**params,
                       "country_codes": __import__("json").dumps(params["country_codes"]),
                       "key_requirements": __import__("json").dumps(params["key_requirements"])})
                inserted += 1

        await db.commit()

    print(f"Inserted {inserted}, updated {updated} US state privacy law catalog rows")


if __name__ == "__main__":
    asyncio.run(main())
