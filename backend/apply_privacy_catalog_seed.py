#!/usr/bin/env python3
# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
apply_privacy_catalog_seed.py
==============================
Reads existing compliance_rules rows and inserts corresponding
privacy_regulation_catalog rows. Safe to re-run — uses ON CONFLICT DO NOTHING
on (jurisdiction_code, framework).

Run:
    docker cp backend/apply_privacy_catalog_seed.py peripateticware-backend:/app/apply_privacy_catalog_seed.py
    docker exec peripateticware-backend python /app/apply_privacy_catalog_seed.py
"""

import os
import sys
import json
import logging

import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware"
)
# asyncpg driver is not usable with psycopg2 — strip it
if DB_URL.startswith("postgresql+asyncpg://"):
    DB_URL = DB_URL.replace("postgresql+asyncpg://", "postgresql://")
elif DB_URL.startswith("postgresql+psycopg2://"):
    DB_URL = DB_URL.replace("postgresql+psycopg2://", "postgresql://")

# Frameworks that should be featured prominently in the catalog
FEATURED_FRAMEWORKS = {"ferpa", "coppa", "gdpr", "ccpa", "lgpd", "pipeda", "pdpa"}

# Child-safety frameworks
CHILD_SAFETY_FRAMEWORKS = {"coppa", "ferpa", "gdpr"}  # GDPR has special child provisions

# Human-readable display names for frameworks
FRAMEWORK_DISPLAY = {
    "gdpr":           ("GDPR",   "General Data Protection Regulation"),
    "ccpa":           ("CCPA",   "California Consumer Privacy Act"),
    "coppa":          ("COPPA",  "Children's Online Privacy Protection Act"),
    "ferpa":          ("FERPA",  "Family Educational Rights and Privacy Act"),
    "pipeda":         ("PIPEDA", "Personal Information Protection and Electronic Documents Act"),
    "lgpd":           ("LGPD",   "Lei Geral de Proteção de Dados"),
    "pdpa":           ("PDPA",   "Personal Data Protection Act"),
    "appi":           ("APPI",   "Act on the Protection of Personal Information"),
    "privacy_act_au": ("Privacy Act AU", "Australian Privacy Act 1988"),
    "dpdp":           ("DPDP",   "Digital Personal Data Protection Act"),
    "pipa":           ("PIPA",   "Personal Information Protection Act"),
    "lfpdppp":        ("LFPDPPP","Ley Federal de Protección de Datos Personales"),
    "popia":          ("POPIA",  "Protection of Personal Information Act"),
    "uae_dp":         ("UAE DP", "UAE Federal Decree-Law on Personal Data Protection"),
    "privacy_act_nz": ("Privacy Act NZ", "New Zealand Privacy Act 2020"),
    "il_ppl":         ("IL PPL", "Israel Protection of Privacy Law"),
    "nfadp":          ("nFADP",  "Swiss New Federal Act on Data Protection"),
    "eu_ai_act":      ("EU AI Act", "EU Artificial Intelligence Act"),
    "us_ai_eo":       ("US AI EO", "US Executive Order on AI Safety (EO 14110)"),
    "us_ca_ai":       ("CA AI",  "California AI Legislation"),
    "cn_ai":          ("CN AI",  "China Generative AI Measures"),
    "gb_ai":          ("GB AI",  "UK AI Safety Framework"),
    "ca_aida":        ("AIDA",   "Canadian Artificial Intelligence and Data Act"),
    "sg_ai":          ("SG AI",  "Singapore AI Governance Framework"),
    "custom":         ("Custom", "Custom Regulation"),
}

# Jurisdiction-to-region mapping for human-readable region names
JURISDICTION_REGION = {
    "US_FEDERAL":        "United States Federal",
    "US_FEDERAL_COPPA":  "United States Federal",
    "US_CA":             "United States — California",
    "EU":                "European Union",
    "BR":                "Brazil",
    "CA":                "Canada",
    "SG":                "Singapore",
    "JP":                "Japan",
    "AU":                "Australia",
    "IN":                "India",
    "KR":                "South Korea",
    "MX":                "Mexico",
    "ZA":                "South Africa",
    "AE":                "United Arab Emirates",
    "NZ":                "New Zealand",
    "IL":                "Israel",
    "CH":                "Switzerland",
    "GB":                "United Kingdom",
    "CN":                "China",
}


def derive_catalog_row(rule: dict) -> dict | None:
    """
    Convert a compliance_rules row into a privacy_regulation_catalog row.
    Returns None if we cannot derive meaningful catalog data.
    """
    rd = rule.get("rule_definition") or {}
    if isinstance(rd, str):
        try:
            rd = json.loads(rd)
        except Exception:
            rd = {}

    framework = (rd.get("framework") or "").lower().strip()
    jurisdiction_code = (rule.get("jurisdiction") or "").strip()

    if not framework or not jurisdiction_code:
        log.warning("Skipping rule %s — missing framework or jurisdiction", rule.get("rule_id"))
        return None

    # Short/full name from display map or fall back to rule_definition fields
    display = FRAMEWORK_DISPLAY.get(framework)
    if display:
        short_name, full_name = display
    else:
        jname = rd.get("jurisdiction_name") or jurisdiction_code
        short_name = framework.upper()
        full_name = jname

    # Override with jurisdiction_name from rule_definition if available
    jname = rd.get("jurisdiction_name") or ""

    region = JURISDICTION_REGION.get(jurisdiction_code) or jname or None

    # Country codes — derive from jurisdiction
    country_map = {
        "US_FEDERAL":       ["US"],
        "US_FEDERAL_COPPA": ["US"],
        "US_CA":            ["US"],
        "EU":               ["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
                              "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
                              "NL","PL","PT","RO","SE","SI","SK"],
        "BR":               ["BR"],
        "CA":               ["CA"],
        "SG":               ["SG"],
        "JP":               ["JP"],
        "AU":               ["AU"],
        "IN":               ["IN"],
        "KR":               ["KR"],
        "MX":               ["MX"],
        "ZA":               ["ZA"],
        "AE":               ["AE"],
        "NZ":               ["NZ"],
        "IL":               ["IL"],
        "CH":               ["CH"],
        "GB":               ["GB"],
        "CN":               ["CN"],
    }
    country_codes = country_map.get(jurisdiction_code)

    summary = rd.get("description") or None
    key_requirements = rd.get("key_requirements") or None
    applies_to = rd.get("applies_to") or None

    # Age threshold — known values
    age_map = {
        "coppa":  13,
        "ferpa":  None,
        "gdpr":   16,
        "ccpa":   None,
    }
    age_threshold = age_map.get(framework)

    is_child_safety = framework in CHILD_SAFETY_FRAMEWORKS
    is_featured = framework in FEATURED_FRAMEWORKS

    # Effective date
    eff_raw = rd.get("effective_date")
    if eff_raw:
        # Accept "YYYY-MM-DD" or datetime string
        effective_date = str(eff_raw)[:10]
    else:
        effective_date = None

    # Source URLs for known frameworks
    source_url_map = {
        "gdpr":   "https://gdpr-info.eu/",
        "ccpa":   "https://oag.ca.gov/privacy/ccpa",
        "coppa":  "https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa",
        "ferpa":  "https://studentprivacy.ed.gov/ferpa",
        "pipeda": "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/",
        "lgpd":   "https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd",
        "pdpa":   "https://www.pdpc.gov.sg/Overview-of-PDPA/The-Legislation/Personal-Data-Protection-Act",
    }
    source_url = source_url_map.get(framework)

    return {
        "rule_id":          rule.get("rule_id"),
        "short_name":       short_name,
        "full_name":        full_name,
        "jurisdiction_code": jurisdiction_code,
        "region":           region,
        "country_codes":    json.dumps(country_codes) if country_codes else None,
        "framework":        framework,
        "summary":          summary,
        "key_requirements": json.dumps(key_requirements) if key_requirements else None,
        "applies_to":       json.dumps(applies_to) if applies_to else None,
        "age_threshold":    age_threshold,
        "is_child_safety":  is_child_safety,
        "is_featured":      is_featured,
        "effective_date":   effective_date,
        "source_url":       source_url,
        "added_by_user_id": None,
        "added_by_role":    "system",
        "is_active":        True,
    }


def run():
    log.info("Connecting to: %s", DB_URL.split("@")[-1])
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT rule_id, jurisdiction, regulation_type, is_active, rule_definition
                FROM compliance_rules
                WHERE regulation_type = 'privacy'
                  AND is_active = true
            """)
            rules = cur.fetchall()
            log.info("Found %d active privacy rules in compliance_rules.", len(rules))

            seeded = 0
            skipped = 0
            for rule in rules:
                row = derive_catalog_row(dict(rule))
                if row is None:
                    skipped += 1
                    continue

                cur.execute("""
                    INSERT INTO privacy_regulation_catalog (
                        rule_id, short_name, full_name, jurisdiction_code, region,
                        country_codes, framework, summary, key_requirements, applies_to,
                        age_threshold, is_child_safety, is_featured, effective_date,
                        source_url, added_by_user_id, added_by_role, is_active
                    ) VALUES (
                        %(rule_id)s, %(short_name)s, %(full_name)s, %(jurisdiction_code)s, %(region)s,
                        %(country_codes)s, %(framework)s, %(summary)s, %(key_requirements)s, %(applies_to)s,
                        %(age_threshold)s, %(is_child_safety)s, %(is_featured)s, %(effective_date)s,
                        %(source_url)s, %(added_by_user_id)s, %(added_by_role)s, %(is_active)s
                    )
                    ON CONFLICT (jurisdiction_code, framework) DO NOTHING
                """, row)
                if cur.rowcount:
                    seeded += 1
                    log.info("  Seeded: %s (%s)", row["short_name"], row["jurisdiction_code"])
                else:
                    log.info("  Skipped (already exists): %s (%s)", row["short_name"], row["jurisdiction_code"])

            conn.commit()
            log.info("Seeded %d catalog entries from compliance_rules. (%d skipped/already exist)", seeded, skipped)

    except Exception:
        conn.rollback()
        log.exception("Fatal error during seed.")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    run()
