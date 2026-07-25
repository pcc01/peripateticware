# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Regulations Crawler
============================
Fetches regulation metadata from public authoritative sources, compares with
the currently active ComplianceRule versions, and upserts new versions when
changes are detected.

Design principles (shared with privacy_engine.py):
  - Rules are DATA not code — changes go into compliance_rules, not this file.
  - Audit log is INSERT-only — crawler writes to rule_audit_log on every run.
  - Strictest-wins merge is enforced by privacy_engine, not here.
  - Crawler is advisory: it flags changes and proposes new rule versions.
    PRIVACY_AUTO_LOAD=true writes them automatically;
    PRIVACY_AUTO_LOAD=false queues them for admin review.

Source adapters (all public, no auth required):
  gdpr_eu       → gdpr.eu/recitals/          (EU GDPR — canonical text)
  ico           → ico.org.uk/for-organisations (UK ICO guidance)
  ftc_coppa     → ftc.gov/enforcement/rules/rulemaking-regulatory-reform-proceedings/...
  ccpa          → oag.ca.gov/privacy/ccpa     (California AG)
  pipeda        → priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/...
  lgpd          → gov.br/cidadania/...         (Brazilian LGPD portal)
  pdpa          → pdpc.gov.sg/overview-of-pdpa (Singapore)

Country-onboarding hook:
  When a new jurisdiction is registered via POST /privacy/jurisdictions,
  run_jurisdiction_crawl(jurisdiction_id, country_code) is called to
  immediately fetch and seed rules for that country — no waiting for the
  weekly scheduled crawl.

TTL / staleness:
  Each source has a CHECK_INTERVAL_DAYS. If the DB already has a rule for
  that source whose created_at is within the interval, the source is skipped.
  This prevents hammering public sites on every container restart.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.compliance import ComplianceRule, RuleAuditLog
from services.privacy_engine import invalidate_rules_cache, hash_student_id

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Source registry
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PrivacySource:
    """Describes one authoritative public source."""
    source_id:           str          # e.g. "gdpr_eu"
    jurisdiction:        str          # e.g. "GDPR_EU"
    country_codes:       List[str]    # ISO 3166-1 alpha-2, e.g. ["EU", "DE", "FR"]
    framework:           str          # e.g. "gdpr"
    url:                 str          # URL to fetch for change detection
    version_xpath:       str          # CSS/text hint for version extraction (informational)
    check_interval_days: int = 7      # only re-check after this many days
    # Baseline rule definition — used when the live fetch cannot be parsed,
    # or when bootstrapping a jurisdiction for the first time.
    baseline_rule: Dict[str, Any] = field(default_factory=dict)


# Canonical source list.
# URLs point to stable guidance pages, not dynamic search results.
SOURCES: List[PrivacySource] = [
    PrivacySource(
        source_id           = "gdpr_eu",
        jurisdiction        = "GDPR_EU",
        country_codes       = ["EU", "DE", "FR", "IT", "ES", "NL", "PL", "BE", "SE", "AT"],
        framework           = "gdpr",
        url                 = "https://gdpr.eu/tag/gdpr/",
        version_xpath       = "article h1",
        check_interval_days = 14,
        baseline_rule       = {
            "framework":              "gdpr",
            "jurisdiction":           "GDPR_EU",
            "regulation_name":        "General Data Protection Regulation (GDPR)",
            "effective_date":         "2018-05-25",
            "source_url":             "https://gdpr.eu",
            "data_subject_rights":    ["access","rectification","erasure","portability","restriction","objection"],
            "consent_required":       True,
            "parental_age_threshold": 16,
            "max_retention_days":     None,
            "cross_border_transfer":  "adequacy_decision_or_sccs",
            "breach_notification_hours": 72,
            "dpo_required":           True,
            "notes":                  "Applies to any organisation processing EU resident data.",
        },
    ),
    PrivacySource(
        source_id           = "ico",
        jurisdiction        = "UK_GDPR",
        country_codes       = ["GB"],
        framework           = "gdpr",
        url                 = "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/",
        version_xpath       = "h1",
        check_interval_days = 14,
        baseline_rule       = {
            "framework":              "gdpr",
            "jurisdiction":           "UK_GDPR",
            "regulation_name":        "UK GDPR / Data Protection Act 2018",
            "effective_date":         "2021-01-01",
            "source_url":             "https://ico.org.uk",
            "data_subject_rights":    ["access","rectification","erasure","portability","restriction","objection"],
            "consent_required":       True,
            "parental_age_threshold": 13,
            "max_retention_days":     None,
            "cross_border_transfer":  "adequacy_decision_or_sccs",
            "breach_notification_hours": 72,
            "dpo_required":           True,
            "notes":                  "Post-Brexit UK implementation of GDPR.",
        },
    ),
    PrivacySource(
        source_id           = "ftc_coppa",
        jurisdiction        = "COPPA_US",
        country_codes       = ["US"],
        framework           = "coppa",
        url                 = "https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":                  "coppa",
            "jurisdiction":               "COPPA_US",
            "regulation_name":            "Children's Online Privacy Protection Act (COPPA)",
            "effective_date":             "2013-07-01",
            "source_url":                 "https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa",
            "parental_consent_required":  True,
            "age_threshold":              13,
            "data_minimization":          True,
            "permitted_disclosures":      ["service_provider","legal","safety"],
            "retention_policy":           "delete_when_no_longer_needed",
            "breach_notification":        "notify_ftc",
            "verifiable_parental_consent_methods": ["credit_card","toll_free","signed_form","knowledge_check"],
            "notes":                      "Applies to websites/apps directed at children under 13 or that knowingly collect data from them.",
        },
    ),
    PrivacySource(
        source_id           = "ccpa",
        jurisdiction        = "CCPA_CA",
        country_codes       = ["US-CA"],
        framework           = "ccpa",
        url                 = "https://oag.ca.gov/privacy/ccpa",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":           "ccpa",
            "jurisdiction":        "CCPA_CA",
            "regulation_name":     "California Consumer Privacy Act (CCPA / CPRA)",
            "effective_date":      "2023-01-01",
            "source_url":          "https://oag.ca.gov/privacy/ccpa",
            "consumer_rights":     ["know","delete","opt_out_sale","correct","limit_sensitive","non_discrimination"],
            "business_thresholds": {
                "annual_revenue_usd":       25000000,
                "records_bought_sold":      100000,
                "revenue_from_data_pct":    50,
            },
            "sensitive_data_categories": ["ssn","dl","financial","health","biometric","precise_geo","race","religion","sexual_orientation","union_membership","mail"],
            "opt_out_required":    True,
            "do_not_sell_link":    True,
            "response_days":       45,
            "notes":               "CPRA amendments effective Jan 2023. Applies to for-profit businesses meeting thresholds.",
        },
    ),
    PrivacySource(
        source_id           = "pipeda",
        jurisdiction        = "PIPEDA_CA",
        country_codes       = ["CA"],
        framework           = "pipeda",
        url                 = "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":           "pipeda",
            "jurisdiction":        "PIPEDA_CA",
            "regulation_name":     "Personal Information Protection and Electronic Documents Act (PIPEDA)",
            "effective_date":      "2001-01-01",
            "source_url":          "https://www.priv.gc.ca",
            "ten_principles":      ["accountability","identifying_purposes","consent","limiting_collection",
                                    "limiting_use","accuracy","safeguards","openness","individual_access","challenging_compliance"],
            "consent_required":    True,
            "breach_notification": "report_to_opc_if_real_risk",
            "response_days":       30,
            "notes":               "Canada's federal private sector privacy law. Quebec Law 25 adds stricter provincial requirements.",
        },
    ),
    PrivacySource(
        source_id           = "lgpd",
        jurisdiction        = "LGPD_BR",
        country_codes       = ["BR"],
        framework           = "lgpd",
        url                 = "https://www.gov.br/anpd/pt-br/assuntos/noticias",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "lgpd",
            "jurisdiction":           "LGPD_BR",
            "regulation_name":        "Lei Geral de Proteção de Dados (LGPD)",
            "effective_date":         "2021-08-01",
            "source_url":             "https://www.gov.br/anpd/",
            "data_subject_rights":    ["confirmation","access","correction","anonymization","portability","deletion","information","refusal"],
            "legal_bases":            ["consent","legitimate_interest","contract","legal_obligation","vital_interests","public_task","research","credit_protection","health"],
            "consent_required":       True,
            "parental_age_threshold": 18,
            "dpa":                    "ANPD",
            "breach_notification_hours": 72,
            "notes":                  "Brazil's data protection law, modelled on GDPR. Enforced by ANPD.",
        },
    ),
    PrivacySource(
        source_id           = "pdpa_sg",
        jurisdiction        = "PDPA_SG",
        country_codes       = ["SG"],
        framework           = "pdpa",
        url                 = "https://www.pdpc.gov.sg/Overview-of-PDPA/The-Legislation/Personal-Data-Protection-Act",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "pdpa",
            "jurisdiction":           "PDPA_SG",
            "regulation_name":        "Personal Data Protection Act (PDPA) 2012 (amended 2021)",
            "effective_date":         "2021-02-01",
            "source_url":             "https://www.pdpc.gov.sg",
            "data_subject_rights":    ["access","correction","withdrawal","portability","erasure"],
            "consent_required":       True,
            "legitimate_interest":    True,
            "breach_notification":    "notify_pdpc_within_3_days_if_significant",
            "dpa":                    "PDPC",
            "notes":                  "2021 amendments added mandatory breach notification and enhanced consent framework.",
        },
    ),

    # =========================================================================
    # ADDITIONAL COUNTRY PRIVACY ADAPTERS
    # =========================================================================

    PrivacySource(
        source_id           = "appi_jp",
        jurisdiction        = "APPI_JP",
        country_codes       = ["JP"],
        framework           = "appi",
        url                 = "https://www.ppc.go.jp/en/legal/",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "appi",
            "jurisdiction":           "APPI_JP",
            "regulation_name":        "Act on the Protection of Personal Information (APPI) — amended 2022",
            "effective_date":         "2022-04-01",
            "source_url":             "https://www.ppc.go.jp/en/",
            "data_subject_rights":    ["disclosure","correction","deletion","suspension_of_use","objection"],
            "consent_required":       True,
            "parental_age_threshold": 18,
            "sensitive_data":         ["race","creed","social_status","medical_history","criminal_record","disability","sexual_orientation"],
            "cross_border_transfer":  "consent_or_adequacy_decision",
            "breach_notification":    "notify_ppc_and_data_subjects_without_delay",
            "dpa":                    "Personal Information Protection Commission (PPC)",
            "response_days":          "without_delay",
            "notes":                  "2022 amendments added pseudonymised data, opt-out requirements, cross-border rules, and breach notification obligations.",
        },
    ),
    PrivacySource(
        source_id           = "privacy_act_au",
        jurisdiction        = "PRIVACY_ACT_AU",
        country_codes       = ["AU"],
        framework           = "privacy_act_au",
        url                 = "https://www.oaic.gov.au/privacy/the-privacy-act",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "privacy_act_au",
            "jurisdiction":           "PRIVACY_ACT_AU",
            "regulation_name":        "Privacy Act 1988 (Cth) — 2024 reforms",
            "effective_date":         "1988-12-21",
            "source_url":             "https://www.oaic.gov.au",
            "australian_privacy_principles": 13,
            "data_subject_rights":    ["access","correction","complaint"],
            "consent_required":       True,
            "parental_age_threshold": 15,
            "sensitive_information":  ["health","genetic","biometric","racial","political","religious","sexual_orientation","criminal"],
            "cross_border_transfer":  "accountability_principle",
            "breach_notification":    "notify_oaic_if_serious_harm_likely",
            "dpa":                    "Office of the Australian Information Commissioner (OAIC)",
            "response_days":          30,
            "notes":                  "2024 reform bill proposes new rights (erasure, objection, explanation for automated decisions) and higher penalties. Monitor for passage.",
        },
    ),
    PrivacySource(
        source_id           = "dpdp_in",
        jurisdiction        = "DPDP_IN",
        country_codes       = ["IN"],
        framework           = "dpdp",
        url                 = "https://www.meity.gov.in/data-protection-framework",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "dpdp",
            "jurisdiction":           "DPDP_IN",
            "regulation_name":        "Digital Personal Data Protection Act 2023 (DPDP)",
            "effective_date":         "2023-08-11",
            "source_url":             "https://www.meity.gov.in",
            "data_subject_rights":    ["access","correction","erasure","grievance_redressal","nominate_representative"],
            "consent_required":       True,
            "parental_age_threshold": 18,
            "children_data":          "verifiable_parental_consent_required",
            "cross_border_transfer":  "government_notified_countries_only",
            "breach_notification":    "notify_dpb_and_data_principals",
            "dpa":                    "Data Protection Board of India (DPB)",
            "significant_data_fiduciary_threshold": "volume_or_sensitivity_based",
            "notes":                  "Rules under DPDP are being drafted by MeitY. Cross-border whitelist not yet published. Monitor for subordinate legislation.",
        },
    ),
    PrivacySource(
        source_id           = "pipa_kr",
        jurisdiction        = "PIPA_KR",
        country_codes       = ["KR"],
        framework           = "pipa",
        url                 = "https://www.pipc.go.kr/eng/",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "pipa",
            "jurisdiction":           "PIPA_KR",
            "regulation_name":        "Personal Information Protection Act (PIPA) — amended 2023",
            "effective_date":         "2023-09-15",
            "source_url":             "https://www.pipc.go.kr/eng/",
            "data_subject_rights":    ["access","correction","deletion","suspension","automated_decision_explanation"],
            "consent_required":       True,
            "parental_age_threshold": 14,
            "sensitive_data":         ["ideology","belief","union","political_opinion","health","sexual_life","biometric","criminal","genetic"],
            "cross_border_transfer":  "consent_or_contractual_safeguards",
            "breach_notification":    "notify_pipc_within_72_hours",
            "dpa":                    "Personal Information Protection Commission (PIPC)",
            "response_days":          10,
            "notes":                  "2023 amendments aligned PIPA more closely with GDPR. Added right to explanation of automated decisions.",
        },
    ),
    PrivacySource(
        source_id           = "lfpdppp_mx",
        jurisdiction        = "LFPDPPP_MX",
        country_codes       = ["MX"],
        framework           = "lfpdppp",
        url                 = "https://www.inai.org.mx/vntmostra.asp?id=nfTEXT&idp=EN",
        version_xpath       = "h1",
        check_interval_days = 60,
        baseline_rule       = {
            "framework":              "lfpdppp",
            "jurisdiction":           "LFPDPPP_MX",
            "regulation_name":        "Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)",
            "effective_date":         "2010-07-05",
            "source_url":             "https://www.inai.org.mx",
            "data_subject_rights":    ["access","rectification","cancellation","opposition"],  # ARCO rights
            "consent_required":       True,
            "sensitive_data":         ["racial","ethnic","health","genetic","religious","philosophical","union","political","sexual"],
            "cross_border_transfer":  "binding_corporate_rules_or_consent",
            "privacy_notice_required": True,
            "dpa":                    "INAI",
            "response_days":          20,
            "notes":                  "ARCO rights (Acceso, Rectificación, Cancelación, Oposición). Privacy notice (aviso de privacidad) required before collection.",
        },
    ),
    PrivacySource(
        source_id           = "popia_za",
        jurisdiction        = "POPIA_ZA",
        country_codes       = ["ZA"],
        framework           = "popia",
        url                 = "https://inforegulator.org.za/",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "popia",
            "jurisdiction":           "POPIA_ZA",
            "regulation_name":        "Protection of Personal Information Act 4 of 2013 (POPIA)",
            "effective_date":         "2021-07-01",
            "source_url":             "https://inforegulator.org.za/",
            "conditions_for_lawful_processing": 8,
            "data_subject_rights":    ["access","correction","deletion","objection","automated_decisions"],
            "consent_required":       True,
            "parental_age_threshold": 18,
            "sensitive_data":         ["race","gender","sex","pregnancy","national_origin","color","sexual_orientation","age","disability","religion","conscience","belief","culture","language","birth","biometric","criminal"],
            "cross_border_transfer":  "adequacy_or_binding_agreement",
            "breach_notification":    "notify_regulator_and_data_subject_asap",
            "dpa":                    "Information Regulator of South Africa",
            "response_days":          30,
            "notes":                  "Full enforcement began July 2021. One of the broadest definitions of sensitive information globally.",
        },
    ),
    PrivacySource(
        source_id           = "uae_dp",
        jurisdiction        = "UAE_DP",
        country_codes       = ["AE"],
        framework           = "uae_dp",
        url                 = "https://tdra.gov.ae/en/aai/data-protection",
        version_xpath       = "h1",
        check_interval_days = 60,
        baseline_rule       = {
            "framework":              "uae_dp",
            "jurisdiction":           "UAE_DP",
            "regulation_name":        "UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection",
            "effective_date":         "2022-01-02",
            "source_url":             "https://tdra.gov.ae",
            "data_subject_rights":    ["access","correction","deletion","restriction","objection","portability"],
            "consent_required":       True,
            "sensitive_data":         ["health","biometric","financial","ethnic","religious","criminal","children"],
            "cross_border_transfer":  "adequacy_or_contractual_safeguards",
            "breach_notification":    "notify_authority_within_72_hours",
            "dpa":                    "UAE Data Office / TDRA",
            "response_days":          30,
            "notes":                  "Executive Regulations still being finalised. DIFC and ADGM have separate (stricter) data protection regimes for those free zones.",
        },
    ),
    PrivacySource(
        source_id           = "privacy_act_nz",
        jurisdiction        = "PRIVACY_ACT_NZ",
        country_codes       = ["NZ"],
        framework           = "privacy_act_nz",
        url                 = "https://www.privacy.org.nz/privacy-act-2020/",
        version_xpath       = "h1",
        check_interval_days = 60,
        baseline_rule       = {
            "framework":              "privacy_act_nz",
            "jurisdiction":           "PRIVACY_ACT_NZ",
            "regulation_name":        "Privacy Act 2020 (New Zealand)",
            "effective_date":         "2020-12-01",
            "source_url":             "https://www.privacy.org.nz",
            "information_privacy_principles": 13,
            "data_subject_rights":    ["access","correction","complaint"],
            "consent_required":       True,
            "cross_border_transfer":  "comparable_safeguards_required",
            "breach_notification":    "notify_opc_if_serious_harm_likely",
            "dpa":                    "Office of the Privacy Commissioner (OPC)",
            "response_days":          20,
            "notes":                  "Replaces the Privacy Act 1993. Mandatory breach notification and new criminal offences for misleading agency to access information.",
        },
    ),
    PrivacySource(
        source_id           = "il_ppl",
        jurisdiction        = "IL_PPL",
        country_codes       = ["IL"],
        framework           = "il_ppl",
        url                 = "https://www.gov.il/en/departments/the_privacy_protection_authority",
        version_xpath       = "h1",
        check_interval_days = 60,
        baseline_rule       = {
            "framework":              "il_ppl",
            "jurisdiction":           "IL_PPL",
            "regulation_name":        "Protection of Privacy Law 5741-1981 (amended)",
            "effective_date":         "1981-01-01",
            "source_url":             "https://www.gov.il/en/departments/the_privacy_protection_authority",
            "data_subject_rights":    ["access","correction","deletion"],
            "consent_required":       True,
            "database_registration":  True,
            "sensitive_data":         ["medical","financial","political","religious","criminal"],
            "cross_border_transfer":  "adequate_protection_required",
            "dpa":                    "Privacy Protection Authority (PPA)",
            "response_days":          30,
            "notes":                  "Major reform bill (resembling GDPR) under legislative review as of 2026. Monitor for passage. Israel has EU adequacy decision.",
        },
    ),
    PrivacySource(
        source_id           = "nfadp_ch",
        jurisdiction        = "NFADP_CH",
        country_codes       = ["CH"],
        framework           = "nfadp",
        url                 = "https://www.edoeb.admin.ch/edoeb/en/home/datenschutz/recht/schweizer-datenschutzrecht.html",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "framework":              "nfadp",
            "jurisdiction":           "NFADP_CH",
            "regulation_name":        "revised Federal Act on Data Protection (nFADP / revDSG)",
            "effective_date":         "2023-09-01",
            "source_url":             "https://www.edoeb.admin.ch",
            "data_subject_rights":    ["access","correction","deletion","restriction","portability","objection","automated_decision_explanation"],
            "consent_required":       True,
            "sensitive_data":         ["religion","ideology","political_opinion","health","intimacy","race","biometric","genetic","administrative_criminal","social_security"],
            "cross_border_transfer":  "adequate_country_or_safeguards",
            "breach_notification":    "notify_fdpic_asap_if_high_risk",
            "dpa":                    "Federal Data Protection and Information Commissioner (FDPIC)",
            "privacy_notice_required": True,
            "response_days":          30,
            "notes":                  "Switzerland is not EU but maintains adequacy status. nFADP is more GDPR-aligned than prior DSG. Applies to cross-border processing of Swiss resident data.",
        },
    ),

    # =========================================================================
    # AI REGULATION ADAPTERS
    # regulation_type = 'ai' for all entries below
    # =========================================================================

    PrivacySource(
        source_id           = "eu_ai_act",
        jurisdiction        = "EU_AI_ACT",
        country_codes       = ["EU", "DE", "FR", "IT", "ES", "NL", "PL", "BE", "SE", "AT"],
        framework           = "eu_ai_act",
        url                 = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "regulation_type":              "ai",
            "framework":                    "eu_ai_act",
            "jurisdiction":                 "EU_AI_ACT",
            "regulation_name":              "EU Artificial Intelligence Act (Regulation 2024/1689)",
            "effective_date":               "2024-08-01",
            "prohibited_ai_provisions":     "2025-02-02",
            "general_purpose_ai":           "2025-08-02",
            "high_risk_ai_provisions":      "2026-08-02",
            "source_url":                   "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689",
            # Education is explicitly listed as high-risk (Annex III, point 3)
            "education_classification":     "high_risk",
            "student_ai_permitted":         False,   # High-risk requires conformity assessment first
            "teacher_ai_permitted":         True,    # Teacher tools can be used with human oversight
            "human_oversight_required":     True,
            "conformity_assessment_required": True,
            "transparency_required":        True,
            "prohibited_uses":              [
                "biometric_categorisation_by_sensitive_attributes",
                "untargeted_scraping_for_facial_recognition",
                "emotion_recognition_in_workplace_or_education",
                "social_scoring_by_public_authorities",
                "manipulation_exploiting_vulnerabilities",
                "real_time_remote_biometric_identification_in_public"
            ],
            "high_risk_education_uses":     [
                "determining_access_to_educational_institutions",
                "assessing_students_on_exams",
                "monitoring_cheating",
                "evaluating_learning_outcomes",
                "predictive_assessment_of_learning_pathways"
            ],
            "logging_required":             True,
            "ai_literacy_required":         True,
            "dpa":                          "National market surveillance authorities + European AI Office",
            "notes":                        "Annex III point 3 classifies AI in education as high-risk. Emotion recognition in education is PROHIBITED (Art 5(1)(f)). Requires technical documentation, conformity assessment, and registration in EU database before deployment.",
        },
    ),
    PrivacySource(
        source_id           = "us_ai_eo",
        jurisdiction        = "US_AI_EO",
        country_codes       = ["US"],
        framework           = "us_ai_eo",
        url                 = "https://www.nist.gov/artificial-intelligence",
        version_xpath       = "h1",
        check_interval_days = 60,
        baseline_rule       = {
            "regulation_type":          "ai",
            "framework":                "us_ai_eo",
            "jurisdiction":             "US_AI_EO",
            "regulation_name":          "US EO 14110 (Safe AI) + NIST AI RMF 1.0 + FERPA AI guidance",
            "effective_date":           "2023-10-30",
            "source_url":               "https://www.nist.gov/artificial-intelligence",
            "student_ai_permitted":     True,   # No federal prohibition, but FERPA applies
            "teacher_ai_permitted":     True,
            "ferpa_applies":            True,
            "coppa_applies_under_13":   True,
            "transparency_required":    True,
            "human_oversight_required": False,  # Voluntary NIST framework
            "nist_rmf_functions":       ["govern","map","measure","manage"],
            "prohibited_uses":          [],     # No federal prohibition list yet
            "recommended_practices":    [
                "impact_assessments_for_student_data",
                "data_minimisation",
                "opt_out_for_automated_profiling",
                "disclose_ai_use_in_student_facing_tools"
            ],
            "state_laws_may_apply":     True,
            "notes":                    "No comprehensive US federal AI law as of 2026. EO 14110 is executive branch only. FERPA and COPPA remain the binding constraints for student data. Patchwork of state AI bills (see US_CA_AI, TX, CO, etc.).",
        },
    ),
    PrivacySource(
        source_id           = "us_ca_ai",
        jurisdiction        = "US_CA_AI",
        country_codes       = ["US-CA"],
        framework           = "us_ca_ai",
        url                 = "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240SB1047",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "regulation_type":              "ai",
            "framework":                    "us_ca_ai",
            "jurisdiction":                 "US_CA_AI",
            "regulation_name":              "California AI Accountability (AB 2013 + SB 942 + pending SB 1047 successor)",
            "effective_date":               "2025-01-01",
            "source_url":                   "https://leginfo.legislature.ca.gov",
            "student_ai_permitted":         True,
            "teacher_ai_permitted":         True,
            "transparency_required":        True,
            "ai_disclosure_to_students":    True,   # AB 2013 requires disclosure of AI-generated content
            "training_data_disclosure":     True,
            "human_oversight_required":     False,
            "prohibited_uses":              ["deceptive_ai_generated_content_without_disclosure"],
            "notes":                        "AB 2013 (2024) requires AI developers to post training data summaries. SB 942 requires disclosure of AI-generated content. SB 1047 (frontier model safety) vetoed but successor bills expected 2025–26. Monitor for new bills each session.",
        },
    ),
    PrivacySource(
        source_id           = "cn_ai",
        jurisdiction        = "CN_AI",
        country_codes       = ["CN"],
        framework           = "cn_ai",
        url                 = "https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "regulation_type":                  "ai",
            "framework":                        "cn_ai",
            "jurisdiction":                     "CN_AI",
            "regulation_name":                  "Interim Measures for the Management of Generative AI Services (2023)",
            "effective_date":                   "2023-08-15",
            "source_url":                       "https://www.cac.gov.cn",
            "student_ai_permitted":             True,
            "teacher_ai_permitted":             True,
            "content_moderation_required":      True,
            "real_name_registration_required":  True,
            "algorithmic_recommendation_rules": True,
            "watermarking_required":            True,
            "prohibited_uses":                  [
                "subverting_state_power",
                "endangering_national_security",
                "spreading_false_information",
                "gender_or_age_discrimination"
            ],
            "training_data_requirements":       "lawful_collection_consent_or_statutory_basis",
            "dpa":                              "Cyberspace Administration of China (CAC)",
            "notes":                            "Applies to generative AI services provided to Chinese users. Covers text, images, audio, video, code. Must not generate content violating Chinese law.",
        },
    ),
    PrivacySource(
        source_id           = "gb_ai",
        jurisdiction        = "GB_AI",
        country_codes       = ["GB"],
        framework           = "gb_ai",
        url                 = "https://www.gov.uk/government/organisations/ai-safety-institute",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "regulation_type":              "ai",
            "framework":                    "gb_ai",
            "jurisdiction":                 "GB_AI",
            "regulation_name":              "UK AI Safety Institute Guidance + Pro-Innovation AI Regulatory Framework",
            "effective_date":               "2023-03-29",
            "source_url":                   "https://www.gov.uk/government/publications/ai-regulation-a-pro-innovation-approach",
            "student_ai_permitted":         True,
            "teacher_ai_permitted":         True,
            "human_oversight_required":     True,
            "transparency_required":        True,
            "existing_regulators_apply":    True,  # ICO, Ofsted, etc. apply their own AI guidance
            "prohibited_uses":              [],
            "notes":                        "UK chose a principles-based, sector-regulator approach rather than a single AI Act. ICO published separate AI and data protection guidance. No binding AI-specific legislation as of 2026. Monitor AI Bill progress.",
        },
    ),
    PrivacySource(
        source_id           = "ca_aida",
        jurisdiction        = "CA_AIDA",
        country_codes       = ["CA"],
        framework           = "ca_aida",
        url                 = "https://www.parl.ca/LegisInfo/en/bill/44-1/C-27",
        version_xpath       = "h1",
        check_interval_days = 30,
        baseline_rule       = {
            "regulation_type":              "ai",
            "framework":                    "ca_aida",
            "jurisdiction":                 "CA_AIDA",
            "regulation_name":              "Artificial Intelligence and Data Act (AIDA) — Bill C-27 Part 3",
            "effective_date":               None,   # Not yet in force as of 2026
            "source_url":                   "https://www.parl.ca/LegisInfo/en/bill/44-1/C-27",
            "student_ai_permitted":         True,
            "teacher_ai_permitted":         True,
            "high_impact_systems":          "definition_pending_regulations",
            "human_oversight_required":     True,   # For high-impact systems
            "transparency_required":        True,
            "impact_assessment_required":   True,   # For high-impact systems
            "prohibited_uses":              ["reckless_endangerment_of_life","biometric_manipulation"],
            "notes":                        "AIDA is Part 3 of Bill C-27 (alongside CPPA replacing PIPEDA). Bill died on order paper when Parliament prorogued in Jan 2025. A successor bill is expected but not yet tabled. PIPEDA remains current law.",
        },
    ),
    PrivacySource(
        source_id           = "sg_ai",
        jurisdiction        = "SG_AI",
        country_codes       = ["SG"],
        framework           = "sg_ai",
        url                 = "https://www.pdpc.gov.sg/Help-and-Resources/2020/01/Model-AI-Governance-Framework",
        version_xpath       = "h1",
        check_interval_days = 60,
        baseline_rule       = {
            "regulation_type":              "ai",
            "framework":                    "sg_ai",
            "jurisdiction":                 "SG_AI",
            "regulation_name":              "Singapore Model AI Governance Framework (2nd Ed 2020) + Advisory Guidelines",
            "effective_date":               "2020-01-21",
            "source_url":                   "https://www.pdpc.gov.sg/Help-and-Resources/2020/01/Model-AI-Governance-Framework",
            "student_ai_permitted":         True,
            "teacher_ai_permitted":         True,
            "voluntary_framework":          True,
            "human_oversight_required":     True,
            "transparency_required":        True,
            "fairness_assessment_required": True,
            "prohibited_uses":              [],
            "notes":                        "Voluntary guidelines, not binding law. Strong focus on explainability and human oversight. Singapore is developing an AI Act-equivalent but no binding legislation as of 2026.",
        },
    ),
]

# Index by source_id and by country_code for fast lookup
_BY_SOURCE_ID   = {s.source_id:    s for s in SOURCES}
_BY_COUNTRY_CODE = {}
for src in SOURCES:
    for cc in src.country_codes:
        _BY_COUNTRY_CODE[cc] = src


# ─────────────────────────────────────────────────────────────────────────────
# Version fingerprint helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fingerprint(rule_definition: Dict[str, Any]) -> str:
    """SHA-256 of the canonical JSON of a rule_definition."""
    canonical = json.dumps(rule_definition, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _rule_id(source: PrivacySource, version: str) -> str:
    # compliance_rules.rule_id is a genuine UUID column (confirmed against the
    # live schema) -- a colon-joined "jurisdiction:source_id:version" string
    # was never a valid value here; nothing else parses this ID's structure
    # (grepped for rule_id.split usage -- none found), so a plain UUID is safe.
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# HTTP fetch helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_page(url: str, timeout: int = 15) -> Optional[str]:
    """
    Fetch a public regulation page.  Returns the raw text or None on failure.
    We intentionally use a generous timeout and don't raise — crawl failures
    are non-fatal and fall back to the baseline rule.
    """
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            headers={"User-Agent": "Peripateticware-PrivacyCrawler/1.0 (compliance-monitoring; contact: admin@peripateticware.com)"},
            timeout=timeout,
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.text
            logger.warning(f"Crawler: {url} returned HTTP {resp.status_code}")
            return None
    except Exception as exc:
        logger.warning(f"Crawler: failed to fetch {url}: {exc}")
        return None


def _extract_last_modified(html: Optional[str], source: PrivacySource) -> Optional[str]:
    """
    Best-effort extraction of a version/date signal from the page HTML.
    Returns a string like "2024-03" to use as the version identifier.
    Falls back to the current year-month so new crawl runs always produce
    a version string even when parsing fails.
    """
    if html:
        import re
        # Look for ISO date patterns in the page (2024-01-15 or similar)
        matches = re.findall(r'20\d\d-(?:0[1-9]|1[0-2])(?:-\d\d)?', html)
        # Pick the most recent date found
        if matches:
            return sorted(matches)[-1][:7]  # "YYYY-MM"
    # Fallback: current year-month
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_latest_rule(db: AsyncSession, jurisdiction: str) -> Optional[ComplianceRule]:
    result = await db.execute(
        select(ComplianceRule)
        .where(ComplianceRule.jurisdiction == jurisdiction, ComplianceRule.is_active == True)
        .order_by(desc(ComplianceRule.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _is_stale(db: AsyncSession, source: PrivacySource) -> bool:
    """
    Returns True if we should re-check this source.
    Skip if the latest active rule was created within check_interval_days.
    """
    latest = await _get_latest_rule(db, source.jurisdiction)
    if not latest:
        return True  # Never crawled — definitely stale
    age = datetime.now(timezone.utc) - latest.created_at.replace(tzinfo=timezone.utc)
    return age > timedelta(days=source.check_interval_days)


async def _upsert_rule(
    db: AsyncSession,
    source: PrivacySource,
    rule_definition: Dict[str, Any],
    version: str,
    change_log: str,
    auto_load: bool,
    regulation_type: str = "privacy",
    ai_student_permitted: bool = True,
    ai_teacher_permitted: bool = True,
) -> Optional[str]:
    """
    Compare fingerprint with the current active rule.
    If different (or no existing rule), insert a new ComplianceRule version.
    Returns the new rule_id if created, None if skipped (no change).
    """
    latest = await _get_latest_rule(db, source.jurisdiction)
    new_fp = _fingerprint(rule_definition)

    if latest:
        existing_fp = _fingerprint(
            latest.rule_definition if isinstance(latest.rule_definition, dict) else {}
        )
        if existing_fp == new_fp:
            logger.info(f"Crawler: {source.jurisdiction} unchanged (fingerprint match). Skipping.")
            return None

    new_rule_id = _rule_id(source, version)
    prev_id     = latest.rule_id if latest else None

    # Deactivate current rule if auto_load
    if latest and auto_load:
        latest.is_active = False

    rule_definition["_crawler_version"]  = version
    rule_definition["_crawled_at"]       = datetime.now(timezone.utc).isoformat()
    rule_definition["_auto_loaded"]      = auto_load

    # Non-blocking ingestibility check: warn (don't drop) if this rule_definition
    # wouldn't validate against the canonical ingestion schema, so a bad source
    # surfaces in logs instead of silently landing unusable JSON in the DB.
    try:
        from schemas.privacy_rule import validate_rule_definition
        _rd = dict(rule_definition)
        _rd.setdefault("jurisdiction_id", source.jurisdiction)
        _rd.setdefault("jurisdiction_name",
                       rule_definition.get("jurisdiction_name",
                                           rule_definition.get("regulation_name", source.jurisdiction)))
        _rd.setdefault("country_code",
                       rule_definition.get("country_code",
                                           (source.country_codes or ["XX"])[0]))
        validate_rule_definition(_rd)
    except Exception as _ve:
        logger.warning(f"Crawler: {source.jurisdiction} rule_definition failed schema validation "
                       f"(storing anyway, will fall back on read): {_ve}")

    new_rule = ComplianceRule(
        rule_id               = new_rule_id,
        regulation_id         = source.source_id,
        version               = version,
        jurisdiction          = source.jurisdiction,
        # effective_date / rule_audit_log.timestamp are "timestamp without time
        # zone" columns in the live schema -- a tz-aware datetime.now(timezone.utc)
        # makes asyncpg's codec raise a naive/aware subtraction DataError deep in
        # its own internals. Use utcnow() (naive) instead, same convention the
        # rest of this codebase already follows for these column types.
        effective_date        = datetime.utcnow(),
        rule_definition       = rule_definition,
        created_by            = "privacy_crawler",
        previous_version_id   = prev_id,
        change_log            = change_log,
        is_active             = auto_load,
        audit_hash            = new_fp,
        regulation_type       = regulation_type,
        ai_student_permitted  = ai_student_permitted,
        ai_teacher_permitted  = ai_teacher_permitted,
    )
    db.add(new_rule)

    # Write immutable audit log entry
    db.add(RuleAuditLog(
        id                  = uuid.uuid4(),
        rule_id             = new_rule_id,
        action              = "crawler_upsert",
        actor_id            = "privacy_crawler",
        actor_role          = "system",
        jurisdiction_ids    = [source.jurisdiction],
        compliance_status   = "COMPLIANT",
        notes               = json.dumps({
            "source_url":  source.url,
            "version":     version,
            "auto_loaded": auto_load,
            "change_log":  change_log,
        }),
        timestamp           = datetime.utcnow(),
    ))

    await db.commit()
    logger.info(f"Crawler: upserted {new_rule_id} (auto_load={auto_load})")
    return new_rule_id


# ─────────────────────────────────────────────────────────────────────────────
# Per-source crawl
# ─────────────────────────────────────────────────────────────────────────────

async def _crawl_source(
    db: AsyncSession,
    source: PrivacySource,
    force: bool = False,
    auto_load: bool = False,
) -> Dict[str, Any]:
    """
    Crawl a single source.  Returns a result dict with keys:
      source_id, jurisdiction, status, version, rule_id, skipped_reason
    """
    result = {
        "source_id":     source.source_id,
        "jurisdiction":  source.jurisdiction,
        "status":        "skipped",
        "version":       None,
        "rule_id":       None,
        "skipped_reason": None,
    }

    # TTL check (skip if recent)
    if not force and not await _is_stale(db, source):
        result["skipped_reason"] = f"checked within last {source.check_interval_days} days"
        return result

    # Fetch the page
    html    = await _fetch_page(source.url)
    version = _extract_last_modified(html, source)

    # Build rule definition — start from baseline, overlay live signals
    rule_def = dict(source.baseline_rule)
    if html:
        rule_def["_page_fetched"]  = True
        rule_def["_page_length"]   = len(html)
    else:
        rule_def["_page_fetched"]  = False
        rule_def["_fetch_warning"] = "Could not reach source page; baseline rule applied."

    change_log = (
        f"Crawled {source.url} on {datetime.now(timezone.utc).date()}. "
        f"Version signal: {version}. "
        f"{'Live page fetched.' if html else 'Fetch failed — baseline used.'}"
    )

    # Extract regulation_type and AI permission flags from the baseline rule definition
    reg_type            = rule_def.get("regulation_type", "privacy")
    ai_student          = bool(rule_def.get("student_ai_permitted", True))
    ai_teacher          = bool(rule_def.get("teacher_ai_permitted", True))

    new_rule_id = await _upsert_rule(
        db, source, rule_def, version, change_log, auto_load,
        regulation_type      = reg_type,
        ai_student_permitted = ai_student,
        ai_teacher_permitted = ai_teacher,
    )

    if new_rule_id:
        result["status"]  = "updated"
        result["version"] = version
        result["rule_id"] = new_rule_id
        await invalidate_rules_cache()
    else:
        result["status"]         = "unchanged"
        result["skipped_reason"] = "fingerprint match"

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Public API — full crawl
# ─────────────────────────────────────────────────────────────────────────────

async def run_privacy_crawler(
    db: AsyncSession,
    sources: Optional[List[str]] = None,
    force: bool = False,
    auto_load: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Run the privacy regulations crawler.

    Args:
        db:        AsyncSession — injected by the caller (FastAPI BackgroundTask or scheduled job)
        sources:   Optional list of source_ids to crawl. Defaults to all SOURCES.
        force:     Skip TTL check and crawl regardless of last-checked date.
        auto_load: Override PRIVACY_AUTO_LOAD setting. None = use setting.

    Returns:
        Summary dict with per-source results.
    """
    if auto_load is None:
        auto_load = getattr(settings, "PRIVACY_AUTO_LOAD", False)

    target_sources = (
        [_BY_SOURCE_ID[s] for s in sources if s in _BY_SOURCE_ID]
        if sources else SOURCES
    )

    logger.info(f"Privacy crawler: starting run for {len(target_sources)} sources (auto_load={auto_load}, force={force})")

    results   = []
    updated   = 0
    unchanged = 0
    skipped   = 0
    errors    = 0

    for source in target_sources:
        try:
            r = await _crawl_source(db, source, force=force, auto_load=auto_load)
            results.append(r)
            if r["status"] == "updated":   updated   += 1
            elif r["status"] == "unchanged": unchanged += 1
            else:                            skipped   += 1
        except Exception as exc:
            logger.error(f"Crawler: error on {source.source_id}: {exc}", exc_info=True)
            results.append({
                "source_id":      source.source_id,
                "jurisdiction":   source.jurisdiction,
                "status":         "error",
                "error":          str(exc),
            })
            errors += 1

    summary = {
        "ran_at":    datetime.now(timezone.utc).isoformat(),
        "sources":   len(target_sources),
        "updated":   updated,
        "unchanged": unchanged,
        "skipped":   skipped,
        "errors":    errors,
        "auto_load": auto_load,
        "results":   results,
    }
    logger.info(f"Privacy crawler: done — updated={updated}, unchanged={unchanged}, skipped={skipped}, errors={errors}")
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Country-onboarding hook
# ─────────────────────────────────────────────────────────────────────────────

async def run_jurisdiction_crawl(
    db: AsyncSession,
    country_code: str,
    force: bool = True,
    auto_load: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Targeted crawl for a single country/jurisdiction.
    Called when a new jurisdiction is onboarded (POST /privacy/jurisdictions).

    Uses the _BY_COUNTRY_CODE index to find the right source adapter.
    If no adapter exists for this country, returns a graceful not-supported result.

    Because this fires at onboarding time rather than the weekly schedule,
    force=True by default so we always fetch fresh rules for new jurisdictions.
    """
    cc_upper = country_code.upper()
    source   = _BY_COUNTRY_CODE.get(cc_upper)

    if not source:
        logger.info(f"No crawler adapter for country code '{cc_upper}'. Using no-op.")
        return {
            "country_code": cc_upper,
            "status":       "not_supported",
            "message":      f"No public source adapter available for '{cc_upper}'. "
                            f"Add a PrivacySource entry in iapp_privacy_crawler.py to enable auto-seeding.",
            "supported_countries": sorted(_BY_COUNTRY_CODE.keys()),
        }

    if auto_load is None:
        auto_load = getattr(settings, "PRIVACY_AUTO_LOAD", False)

    logger.info(f"Country onboarding: running targeted crawl for {cc_upper} → {source.source_id}")
    result = await _crawl_source(db, source, force=force, auto_load=auto_load)
    result["country_code"]       = cc_upper
    result["triggered_by"]       = "country_onboarding"
    return result


def get_supported_countries() -> List[str]:
    """Return the list of country codes that have a registered source adapter."""
    return sorted(_BY_COUNTRY_CODE.keys())


def get_source_for_country(country_code: str) -> Optional[PrivacySource]:
    """Return the PrivacySource for a given country code, or None."""
    return _BY_COUNTRY_CODE.get(country_code.upper())
