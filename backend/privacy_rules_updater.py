#!/usr/bin/env python3
"""
privacy_rules_updater.py
========================
Peripateticware Privacy Compliance Engine — Monthly Rules Updater

Fetches each regulation's source URL, detects amendments, bumps versions,
and saves privacy_rules.json atomically.  Handles unknown regulations via
interactive prompts and the --new-regulation CLI flag.

Usage:
    python privacy_rules_updater.py [options]

Options:
    --rules-file PATH      Path to privacy_rules.json  (default: ./privacy_rules.json)
    --dry-run              Show what would change without writing
    --new-regulation ID    Add a new unknown regulation and prompt for source
    --resolve-regulation   Interactive: prompt for source URL for unknown regs
    --add-jurisdiction     Interactive wizard: add a fully-configured jurisdiction
    --list                 Print a formatted table of all current regulations
    --log-level LEVEL      DEBUG / INFO / WARNING  (default: INFO)
    --force-update         Force fetch all sources even if recently checked

Dependencies (beyond stdlib):
    pip install requests beautifulsoup4 lxml
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import urllib.parse
from copy import deepcopy
from datetime import datetime, timezone, date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
LOG_FILE = "privacy_rules_updater.log"
USER_AGENT = (
    "Mozilla/5.0 (compatible; Peripateticware-PrivacyBot/1.0; "
    "+https://peripateticware.com/privacy-engine)"
)
REQUEST_TIMEOUT = 20          # seconds per HTTP request
MAX_RETRIES = 3
BACKOFF_FACTOR = 2.0          # exponential: 2, 4, 8 seconds

# Patterns that indicate an amendment / effective-date update in HTML pages
AMENDMENT_DATE_PATTERNS: List[re.Pattern] = [
    re.compile(r"Effective\s+\w+\s+\d{1,2},\s+\d{4}", re.IGNORECASE),
    re.compile(r"Last\s+amended\s+\d{4}-\d{2}-\d{2}", re.IGNORECASE),
    re.compile(r"amended\s+(?:as\s+of\s+)?\w+\s+\d{1,2},\s+\d{4}", re.IGNORECASE),
    re.compile(r"entered\s+into\s+force\s+on\s+\d{4}-\d{2}-\d{2}", re.IGNORECASE),
    re.compile(r"Date\s+of\s+effect\s*:\s*\d{4}-\d{2}-\d{2}", re.IGNORECASE),
    re.compile(r"Last\s+modified\s*:\s*\d{4}-\d{2}-\d{2}", re.IGNORECASE),
]

# EUR-Lex XML tags that carry document date
EURLEX_DATE_TAGS = ["WORK_DATE_DOCUMENT", "DATE_DOCUMENT", "DATE_PUBLICATION"]

# ANSI colour codes (only when stdout is a terminal)
_COLORS = {
    "reset":  "\033[0m",
    "bold":   "\033[1m",
    "green":  "\033[92m",
    "yellow": "\033[93m",
    "red":    "\033[91m",
    "cyan":   "\033[96m",
}

# Known US state legislature domains keyed by 2-letter state code
US_STATE_LEGISLATURE_DOMAINS: Dict[str, str] = {
    "TX": "https://statutes.capitol.texas.gov/",
    "VA": "https://law.lis.virginia.gov/",
    "CO": "https://leg.colorado.gov/",
    "CA": "https://leginfo.legislature.ca.gov/",
    "FL": "https://www.flsenate.gov/Laws/Statutes",
    "NY": "https://www.nysenate.gov/legislation",
    "IL": "https://www.ilga.gov/legislation/ilcs/ilcs.asp",
    "WA": "https://app.leg.wa.gov/rcw/",
    "OR": "https://www.oregonlegislature.gov/bills_laws/",
    "MA": "https://malegislature.gov/Laws/GeneralLaws",
    "CT": "https://www.cga.ct.gov/current/pub/titles.htm",
    "NV": "https://www.leg.state.nv.us/NRS/",
    "UT": "https://le.utah.gov/",
    "IA": "https://www.legis.iowa.gov/law/iowaCode",
    "IN": "https://iga.in.gov/laws/",
    "MN": "https://www.revisor.mn.gov/statutes/",
    "OH": "https://codes.ohio.gov/ohio-revised-code",
}

# ---------------------------------------------------------------------------
# Framework rule templates
# ---------------------------------------------------------------------------
FRAMEWORK_TEMPLATES: Dict[str, Dict] = {
    "gdpr_like": {
        "consent_rules": [
            {
                "rule_id": "tmpl-gdpr-consent-explicit",
                "category": "general",
                "consent_type": "explicit",
                "description": "Explicit consent required for processing personal data",
                "article_reference": "Template — adapt to specific article"
            }
        ],
        "processing_rules": [
            {
                "rule_id": "tmpl-gdpr-processing-minimization",
                "principle": "data_minimization",
                "description": "Data collected must be adequate, relevant and limited to what is necessary",
                "article_reference": "Template — adapt to specific article"
            },
            {
                "rule_id": "tmpl-gdpr-processing-purpose-limitation",
                "principle": "purpose_limitation",
                "description": "Data collected for specified, explicit and legitimate purposes",
                "article_reference": "Template — adapt to specific article"
            }
        ],
        "transfer_rules": [
            {
                "rule_id": "tmpl-gdpr-transfer-adequacy",
                "transfer_type": "third_country",
                "condition": "adequacy_decision_or_safeguards",
                "description": "Transfers to third countries require adequacy decision or appropriate safeguards",
                "article_reference": "Template — adapt to specific article"
            }
        ],
        "retention_policies": {
            "educational": {
                "max_days": 1825,
                "description": "Educational records — 5 years"
            },
            "behavioral": {
                "max_days": 365,
                "description": "Behavioral/analytics data — 1 year"
            }
        },
        "rights_rules": [
            {"right": "access", "response_days": 30, "description": "Right of access by the data subject"},
            {"right": "erasure", "response_days": 30, "description": "Right to erasure"},
            {"right": "portability", "response_days": 30, "description": "Right to data portability"},
            {"right": "rectification", "response_days": 30, "description": "Right to rectification"},
            {"right": "object", "response_days": 30, "description": "Right to object to processing"}
        ],
        "student_flags": {
            "data_sharing_allowed": False,
            "monitoring_allowed": False,
            "profiling_allowed": False,
            "targeting_allowed": False
        },
        "requires_pia": True,
        "requires_dpo": True,
        "incident_reporting_days": 3,
        "breach_notification_threshold": "likely_harm"
    },
    "ccpa_like": {
        "consent_rules": [
            {
                "rule_id": "tmpl-ccpa-consent-opt-out",
                "category": "general",
                "consent_type": "opt_out",
                "description": "Consumers have the right to opt-out of sale of personal information",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "processing_rules": [
            {
                "rule_id": "tmpl-ccpa-processing-no-discrimination",
                "principle": "non_discrimination",
                "description": "Businesses may not discriminate against consumers for exercising rights",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "transfer_rules": [
            {
                "rule_id": "tmpl-ccpa-transfer-service-providers",
                "transfer_type": "service_provider",
                "condition": "contractual_limitations",
                "description": "Transfers to service providers require contractual prohibition on further use",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "retention_policies": {
            "educational": {
                "max_days": 1095,
                "description": "Default retention — 3 years"
            }
        },
        "rights_rules": [
            {"right": "know", "response_days": 45, "description": "Right to know about personal information collected"},
            {"right": "delete", "response_days": 45, "description": "Right to delete personal information"},
            {"right": "opt_out", "response_days": 15, "description": "Right to opt-out of sale — must comply within 15 days"}
        ],
        "student_flags": {
            "data_sharing_allowed": False,
            "monitoring_allowed": False,
            "profiling_allowed": False,
            "targeting_allowed": False
        },
        "requires_pia": False,
        "requires_dpo": False,
        "incident_reporting_days": 72,
        "breach_notification_threshold": "likely_harm"
    },
    "coppa_like": {
        "consent_rules": [
            {
                "rule_id": "tmpl-coppa-consent-parental-verifiable",
                "category": "children",
                "consent_type": "parental_verifiable",
                "age_threshold": 13,
                "description": "Verifiable parental consent required before collecting personal information from children under 13",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "processing_rules": [
            {
                "rule_id": "tmpl-coppa-processing-no-behavioral-targeting",
                "principle": "prohibition",
                "description": "Behavioral targeting of children under 13 is prohibited",
                "article_reference": "Template — adapt to specific section"
            },
            {
                "rule_id": "tmpl-coppa-processing-no-location-tracking",
                "principle": "prohibition",
                "description": "Precise location tracking of children under 13 requires separate parental consent",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "transfer_rules": [
            {
                "rule_id": "tmpl-coppa-transfer-third-party",
                "transfer_type": "third_party",
                "condition": "prohibited_without_parental_consent",
                "description": "Disclosure of children's personal information to third parties requires verifiable parental consent",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "retention_policies": {
            "behavioral": {
                "max_days": 90,
                "description": "Behavioral data for children under 13 — 90 days maximum"
            },
            "location": {
                "max_days": 30,
                "description": "Location data for children under 13 — 30 days maximum"
            },
            "identity": {
                "max_days": 365,
                "description": "Identity/account data — 1 year after account closure or last use"
            }
        },
        "rights_rules": [
            {"right": "access", "response_days": 30, "description": "Parents have the right to review personal information collected from their child"},
            {"right": "deletion", "response_days": 30, "description": "Parents have the right to request deletion of their child's personal information"}
        ],
        "student_flags": {
            "data_sharing_allowed": False,
            "monitoring_allowed": False,
            "profiling_allowed": False,
            "targeting_allowed": False
        },
        "requires_pia": False,
        "requires_dpo": False,
        "incident_reporting_days": 0,
        "breach_notification_threshold": "any_breach"
    },
    "ferpa_like": {
        "consent_rules": [
            {
                "rule_id": "tmpl-ferpa-consent-disclosure",
                "category": "educational_records",
                "consent_type": "written_consent",
                "description": "Written consent required before disclosing education records; exceptions include school officials, directory information, emergencies",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "processing_rules": [
            {
                "rule_id": "tmpl-ferpa-processing-legitimate-educational-interest",
                "principle": "purpose_limitation",
                "description": "Access to education records limited to those with legitimate educational interest",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "transfer_rules": [
            {
                "rule_id": "tmpl-ferpa-transfer-no-disclosure",
                "transfer_type": "third_party",
                "condition": "prohibited_without_consent_except_listed_exceptions",
                "description": "Education records may not be disclosed to third parties without consent except listed exceptions",
                "article_reference": "Template — adapt to specific section"
            }
        ],
        "retention_policies": {
            "educational": {
                "max_days": 3650,
                "description": "Educational records — 10 years"
            },
            "identity": {
                "max_days": 3650,
                "description": "Access and disclosure audit logs — 10 years"
            }
        },
        "rights_rules": [
            {"right": "access", "response_days": 45, "description": "Right to inspect education records within 45 days"},
            {"right": "amendment", "response_days": None, "response_timeframe": "reasonable_time", "description": "Right to request amendment of inaccurate or misleading records"},
            {"right": "hearing", "response_days": None, "response_timeframe": "allowed", "description": "Right to a hearing if amendment is denied"}
        ],
        "student_flags": {
            "data_sharing_allowed": False,
            "monitoring_allowed": False,
            "profiling_allowed": False,
            "targeting_allowed": False
        },
        "requires_pia": False,
        "requires_dpo": False,
        "incident_reporting_days": 0,
        "breach_notification_threshold": "any_breach"
    }
}


def _c(color: str, text: str, use_color: bool = True) -> str:
    """Wrap *text* in ANSI colour if *use_color* is True."""
    if not use_color:
        return text
    return f"{_COLORS.get(color, '')}{text}{_COLORS['reset']}"


# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

def setup_logging(level_name: str) -> logging.Logger:
    """Configure root logger with console (coloured) + file handlers."""
    level = getattr(logging, level_name.upper(), logging.INFO)
    logger = logging.getLogger("privacy_updater")
    logger.setLevel(level)

    fmt = "%(asctime)s [%(levelname)s] %(message)s"
    datefmt = "%Y-%m-%dT%H:%M:%SZ"

    # File handler — plain text
    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setFormatter(logging.Formatter(fmt, datefmt=datefmt))
    logger.addHandler(fh)

    # Console handler — coloured if TTY
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(logging.Formatter(fmt, datefmt=datefmt))
    logger.addHandler(ch)

    return logger


log: logging.Logger = logging.getLogger("privacy_updater")

# ---------------------------------------------------------------------------
# HTTP session with retry
# ---------------------------------------------------------------------------

def build_session() -> requests.Session:
    """Return a requests.Session with retry logic and custom User-Agent."""
    session = requests.Session()
    retry = Retry(
        total=MAX_RETRIES,
        backoff_factor=BACKOFF_FACTOR,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": USER_AGENT})
    return session


# ---------------------------------------------------------------------------
# Version helpers
# ---------------------------------------------------------------------------

def bump_patch(version: str) -> str:
    """Increment the patch component of a semver string (e.g. '1.0.0' -> '1.0.1')."""
    parts = version.split(".")
    if len(parts) == 3:
        try:
            parts[2] = str(int(parts[2]) + 1)
            return ".".join(parts)
        except ValueError:
            pass
    return version + ".1"


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def utcnow_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def first_day_next_month() -> str:
    """Return ISO datetime for the first day of the month after today."""
    today = date.today()
    if today.month == 12:
        nxt = date(today.year + 1, 1, 1)
    else:
        nxt = date(today.year, today.month + 1, 1)
    return nxt.strftime("%Y-%m-%dT00:00:00Z")


# ---------------------------------------------------------------------------
# Source fetching
# ---------------------------------------------------------------------------

def fetch_url(
    session: requests.Session,
    url: str,
) -> Tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Fetch *url* and return (body_text, status_code, error_message).

    Returns (None, status_code, error_msg) on failure.
    """
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        if resp.ok:
            return resp.text, resp.status_code, None
        return None, resp.status_code, f"HTTP {resp.status_code}"
    except requests.exceptions.Timeout:
        return None, None, "timeout"
    except requests.exceptions.ConnectionError as exc:
        return None, None, f"connection_error: {exc}"
    except requests.exceptions.RequestException as exc:
        return None, None, f"request_error: {exc}"


# ---------------------------------------------------------------------------
# Change detection: XML (EUR-Lex)
# ---------------------------------------------------------------------------

def detect_change_xml(
    body: str,
    regulation: Dict[str, Any],
) -> Tuple[bool, Optional[str]]:
    """
    Parse EUR-Lex XML for known date tags.  Returns (changed, found_date_str).
    """
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(body)
    except ET.ParseError:
        # Some EUR-Lex responses are HTML wrapped — fall through to HTML parser
        log.debug("XML parse failed; falling back to HTML extraction for XML source")
        return detect_change_html(body, regulation)

    found_date: Optional[str] = None
    for tag in EURLEX_DATE_TAGS:
        # Search namespace-agnostic
        for elem in root.iter():
            if elem.tag.endswith(tag) and elem.text:
                found_date = elem.text.strip()
                break
        if found_date:
            break

    if not found_date:
        log.debug("No recognised date tag found in XML for %s", regulation["regulation_id"])
        return False, None

    stored = regulation.get("effective_date")
    changed = (stored is not None) and (found_date != stored)
    return changed, found_date


# ---------------------------------------------------------------------------
# Change detection: HTML scrape
# ---------------------------------------------------------------------------

def detect_change_html(
    body: str,
    regulation: Dict[str, Any],
) -> Tuple[bool, Optional[str]]:
    """
    Scrape HTML for amendment / effective date strings.
    Returns (changed, found_date_str).
    """
    soup = BeautifulSoup(body, "lxml")
    text = soup.get_text(separator=" ", strip=True)

    found_dates: List[str] = []
    for pattern in AMENDMENT_DATE_PATTERNS:
        matches = pattern.findall(text)
        found_dates.extend(matches)

    if not found_dates:
        return False, None

    # Use the first / most-prominent match
    found_date = found_dates[0].strip()
    stored = regulation.get("effective_date")
    # Simple heuristic: if found_date string contains the stored date, no change
    if stored and stored in found_date:
        return False, found_date
    # If we found something and it doesn't match stored, flag as changed
    changed = bool(stored) and found_date not in str(stored)
    return changed, found_date


# ---------------------------------------------------------------------------
# Auto-discovery engine
# ---------------------------------------------------------------------------

def auto_discover_source(regulation_id: str, session: requests.Session) -> Optional[str]:
    """
    Attempt to discover the official source URL for a regulation by its ID.

    Parses the regulation_id format (e.g. TEXAS-PRIVACY-2024-US-TX or PIPA-2011-KR)
    to extract country/subdivision codes, then tries a prioritized list of URL patterns.

    Returns the first URL that returns HTTP 200 with non-empty body (>500 bytes),
    or None if nothing found.
    """
    # Parse regulation_id to extract components
    # Expected formats: NAME-YEAR-COUNTRY or NAME-YEAR-COUNTRY-SUBDIVISION
    # e.g. TEXAS-PRIVACY-2024-US-TX, PIPA-2011-KR, GDPR-2018-EU
    parts = regulation_id.split("-")

    country_code: Optional[str] = None
    subdivision_code: Optional[str] = None
    name_parts: List[str] = []
    year: Optional[str] = None

    # Find year (4-digit number)
    year_idx: Optional[int] = None
    for i, part in enumerate(parts):
        if re.match(r"^\d{4}$", part):
            year_idx = i
            year = part
            break

    if year_idx is not None:
        name_parts = parts[:year_idx]
        remainder = parts[year_idx + 1:]
        if remainder:
            country_code = remainder[0].upper()
        if len(remainder) >= 2:
            subdivision_code = remainder[1].upper()
    else:
        # Fallback: last 2-letter part is country code
        name_parts = parts[:-1]
        if parts:
            country_code = parts[-1].upper()

    reg_name = " ".join(name_parts).lower()
    reg_name_encoded = urllib.parse.quote(reg_name + " privacy")

    candidate_urls: List[str] = []

    if country_code == "US":
        if subdivision_code and subdivision_code in US_STATE_LEGISLATURE_DOMAINS:
            # US State: try known state legislature domain
            state_base = US_STATE_LEGISLATURE_DOMAINS[subdivision_code]
            candidate_urls.append(state_base)
        # US Federal eCFR search
        candidate_urls.append(
            f"https://www.ecfr.gov/search?query={reg_name_encoded}"
        )
    elif country_code in ("EU", "EUR"):
        # EUR-Lex
        candidate_urls.append(
            f"https://eur-lex.europa.eu/search.html?type=act&text={urllib.parse.quote(reg_name)}"
        )
    elif country_code == "CA":
        # Canada
        candidate_urls.append("https://laws-lois.justice.gc.ca/eng/acts/")
    elif country_code == "SG":
        # Singapore
        candidate_urls.append("https://sso.agc.gov.sg/")
    elif country_code == "KR":
        # South Korea — generic search fallback
        candidate_urls.append(
            f"https://elaw.klri.re.kr/eng_mobile/search.do?query={urllib.parse.quote(reg_name)}"
        )
    else:
        # Generic fallback: construct from name parts
        if country_code:
            candidate_urls.append(
                f"https://www.ecfr.gov/search?query={reg_name_encoded}"
            )

    # Generic fallback for all: try a constructed search URL
    candidate_urls.append(
        f"https://eur-lex.europa.eu/search.html?type=act&text={urllib.parse.quote(reg_name)}"
    )

    for url in candidate_urls:
        log.debug("auto_discover: trying %s", url)
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
            content_len = len(resp.content) if resp.ok else 0
            log.debug(
                "auto_discover: %s -> HTTP %s, body=%d bytes",
                url, resp.status_code, content_len
            )
            if resp.ok and content_len > 500:
                log.debug("auto_discover: found valid source at %s", url)
                return url
        except Exception as exc:
            log.debug("auto_discover: error fetching %s: %s", url, exc)

    log.debug("auto_discover: no source found for %s", regulation_id)
    return None


# ---------------------------------------------------------------------------
# Core: process one regulation
# ---------------------------------------------------------------------------

def process_regulation(
    regulation: Dict[str, Any],
    session: requests.Session,
    dry_run: bool,
) -> Dict[str, Any]:
    """
    Fetch the regulation's source, detect changes, and return a result dict:

        {
            "regulation_id": str,
            "status": "updated" | "unchanged" | "source_unavailable" | "manual",
            "old_version": str,
            "new_version": str | None,
            "detail": str,
            "found_date": str | None,
        }
    """
    reg_id = regulation["regulation_id"]
    url = regulation.get("source_url", "")
    source_type = regulation.get("source_type", "html_scrape")
    old_version = regulation.get("version", "1.0.0")

    result: Dict[str, Any] = {
        "regulation_id": reg_id,
        "status": "unchanged",
        "old_version": old_version,
        "new_version": None,
        "detail": "",
        "found_date": None,
    }

    # Handle manual regulations — no HTTP fetch
    if source_type == "manual":
        log.info("manual regulation — no source URL; skipping auto-check: %s", reg_id)
        result["status"] = "manual"
        result["detail"] = "manual regulation — no source URL; skipping auto-check"
        return result

    if not url:
        result["status"] = "source_unavailable"
        result["detail"] = "no source_url configured"
        return result

    log.info("Checking %s  (%s)", reg_id, url)
    body, status_code, error = fetch_url(session, url)

    if body is None:
        result["status"] = "source_unavailable"
        result["detail"] = error or f"HTTP {status_code}"
        log.warning("  [%s] %s — source unavailable: %s", reg_id, url, result["detail"])
        return result

    # Detect changes
    try:
        if source_type == "xml":
            changed, found_date = detect_change_xml(body, regulation)
        else:
            changed, found_date = detect_change_html(body, regulation)
    except Exception as exc:  # noqa: BLE001
        log.warning("  [%s] Change detection error: %s", reg_id, exc)
        result["status"] = "source_unavailable"
        result["detail"] = f"parse_error: {exc}"
        return result

    result["found_date"] = found_date
    now = utcnow_iso()

    if changed:
        new_version = bump_patch(old_version)
        result["status"] = "updated"
        result["new_version"] = new_version
        result["detail"] = f"date changed from '{regulation.get('effective_date')}' to '{found_date}'"
        log.info("  [%s] UPDATED %s -> %s  (%s)", reg_id, old_version, new_version, result["detail"])

        if not dry_run:
            regulation["version"] = new_version
            regulation["last_fetched"] = now
            regulation.setdefault("change_log", []).append({
                "timestamp": now,
                "old_version": old_version,
                "new_version": new_version,
                "detail": result["detail"],
            })
    else:
        result["status"] = "unchanged"
        result["detail"] = f"no detectable change (found_date='{found_date}')"
        log.info("  [%s] unchanged", reg_id)

        if not dry_run:
            regulation["last_fetched"] = now

    return result


# ---------------------------------------------------------------------------
# Unknown regulations
# ---------------------------------------------------------------------------

def process_unknown_regulations(
    unknown_regs: List[Dict[str, Any]],
    session: requests.Session,
    dry_run: bool,
) -> List[Dict[str, Any]]:
    """
    Attempt to fetch/resolve any entries in unknown_regulations.
    Returns list of result dicts.
    """
    results: List[Dict[str, Any]] = []
    for entry in unknown_regs:
        reg_id = entry.get("regulation_id", "<unknown>")
        user_source = entry.get("user_provided_source")
        prompt_sent = entry.get("user_prompt_sent", False)

        if user_source:
            log.info("Attempting to fetch user-provided source for %s: %s", reg_id, user_source)
            body, status_code, error = fetch_url(session, user_source)
            if body:
                changed, found_date = detect_change_html(body, entry)
                results.append({
                    "regulation_id": reg_id,
                    "status": "unknown_fetched",
                    "detail": f"fetched user_provided_source; found_date={found_date}",
                })
                log.info("  [%s] fetched user source successfully (found_date=%s)", reg_id, found_date)
            else:
                results.append({
                    "regulation_id": reg_id,
                    "status": "source_unavailable",
                    "detail": error or f"HTTP {status_code}",
                })
        elif not prompt_sent:
            # Print a clear prompt for the human operator
            print()
            print("=" * 60)
            print(f"ACTION REQUIRED — Unknown regulation: {reg_id}")
            print("=" * 60)
            print(
                f"Regulation '{reg_id}' has no source URL configured.\n"
                "Please provide the official source URL by editing privacy_rules.json:\n\n"
                f'  Find the entry with "regulation_id": "{reg_id}"\n'
                '  Set "user_provided_source": "<official URL>"\n\n'
                "Suggested Google search:\n"
                f"  https://www.google.com/search?q=official+text+"
                + urllib.parse.quote(reg_id)
                + "+law+site:gov+OR+site:europa.eu"
            )
            print("=" * 60)
            print()
            if not dry_run:
                entry["user_prompt_sent"] = True
            results.append({
                "regulation_id": reg_id,
                "status": "prompt_sent",
                "detail": "operator prompt printed; awaiting user_provided_source",
            })
        else:
            results.append({
                "regulation_id": reg_id,
                "status": "awaiting_source",
                "detail": "user_prompt_sent=True; no source provided yet",
            })
    return results


# ---------------------------------------------------------------------------
# Add new regulation
# ---------------------------------------------------------------------------

def add_new_regulation(
    rules: Dict[str, Any],
    regulation_id: str,
) -> None:
    """
    Add *regulation_id* to unknown_regulations and print guidance.
    Idempotent — skips if already present.
    """
    existing_ids = [
        e.get("regulation_id") for e in rules.get("unknown_regulations", [])
    ]
    existing_ids += [r.get("regulation_id") for r in rules.get("regulations", [])]

    if regulation_id in existing_ids:
        log.info("Regulation '%s' already exists — skipping add.", regulation_id)
        return

    search_url = (
        "https://www.google.com/search?q=official+text+"
        + urllib.parse.quote(regulation_id)
        + "+law+site:gov+OR+site:europa.eu"
    )

    entry: Dict[str, Any] = {
        "regulation_id": regulation_id,
        "display_name": "",
        "user_provided_source": None,
        "user_prompt_sent": True,
        "added_at": utcnow_iso(),
    }
    rules.setdefault("unknown_regulations", []).append(entry)

    print()
    print("=" * 60)
    print(f"New regulation queued: {regulation_id}")
    print("=" * 60)
    print(
        f"'{regulation_id}' has been added to unknown_regulations.\n\n"
        "Next steps:\n"
        "  1. Locate the official text URL for this regulation.\n"
        "  2. Edit privacy_rules.json and set:\n"
        f'       "user_provided_source": "<official URL>"\n'
        "     in the unknown_regulations entry for this ID.\n"
        "  3. Re-run the updater to fetch and parse the source.\n\n"
        "Suggested sources to check:\n"
        f"  Google: {search_url}\n"
        "  EUR-Lex (EU):  https://eur-lex.europa.eu\n"
        "  eCFR   (US):   https://www.ecfr.gov\n"
        "  GovInfo:       https://www.govinfo.gov\n"
    )
    print("=" * 60)
    print()


# ---------------------------------------------------------------------------
# Resolve unknown regulations interactively
# ---------------------------------------------------------------------------

def resolve_unknown_regulations(rules: Dict[str, Any]) -> None:
    """
    Interactive loop: prompt the user to supply a source URL for each
    unknown regulation that doesn't have one yet.
    """
    unknown = rules.get("unknown_regulations", [])
    pending = [e for e in unknown if not e.get("user_provided_source")]

    if not pending:
        print("No unknown regulations pending resolution.")
        return

    for entry in pending:
        reg_id = entry.get("regulation_id", "<unknown>")
        print(f"\nRegulation: {reg_id}")
        url = input("  Enter official source URL (or press Enter to skip): ").strip()
        if url:
            entry["user_provided_source"] = url
            entry["user_prompt_sent"] = True
            print(f"  Saved. Re-run the updater to fetch '{reg_id}'.")
        else:
            print("  Skipped.")


# ---------------------------------------------------------------------------
# --list: formatted table of all regulations
# ---------------------------------------------------------------------------

def list_regulations(rules: Dict[str, Any]) -> None:
    """Print a formatted table of all regulations in the rules file."""
    regs = rules.get("regulations", [])
    unknown = rules.get("unknown_regulations", [])

    # Column widths
    id_w = 29
    name_w = 37
    fw_w = 14
    ver_w = 8
    fetch_w = 14

    def truncate(s: str, width: int) -> str:
        if len(s) > width:
            return s[:width - 1] + "…"
        return s

    top    = "┌" + "─" * (id_w + 2) + "┬" + "─" * (name_w + 2) + "┬" + "─" * (fw_w + 2) + "┬" + "─" * (ver_w + 2) + "┬" + "─" * (fetch_w + 2) + "┐"
    header = ("│ " + "ID".ljust(id_w) + " │ " +
               "Name".ljust(name_w) + " │ " +
               "Framework".ljust(fw_w) + " │ " +
               "Version".ljust(ver_w) + " │ " +
               "Last Fetched".ljust(fetch_w) + " │")
    sep    = "├" + "─" * (id_w + 2) + "┼" + "─" * (name_w + 2) + "┼" + "─" * (fw_w + 2) + "┼" + "─" * (ver_w + 2) + "┼" + "─" * (fetch_w + 2) + "┤"
    bottom = "└" + "─" * (id_w + 2) + "┴" + "─" * (name_w + 2) + "┴" + "─" * (fw_w + 2) + "┴" + "─" * (ver_w + 2) + "┴" + "─" * (fetch_w + 2) + "┘"

    print(top)
    print(header)
    print(sep)

    for reg in regs:
        reg_id = truncate(reg.get("regulation_id", ""), id_w)
        name = truncate(reg.get("display_name", ""), name_w)
        framework = truncate(reg.get("framework", ""), fw_w)
        version = truncate(reg.get("version", ""), ver_w)
        last_fetched = reg.get("last_fetched")
        if last_fetched:
            # Shorten ISO timestamp to date only
            last_fetched_display = truncate(str(last_fetched)[:10], fetch_w)
        else:
            last_fetched_display = "never"

        row = ("│ " + reg_id.ljust(id_w) + " │ " +
               name.ljust(name_w) + " │ " +
               framework.ljust(fw_w) + " │ " +
               version.ljust(ver_w) + " │ " +
               last_fetched_display.ljust(fetch_w) + " │")
        print(row)

    print(bottom)

    if unknown:
        print(f"\nUnknown/pending ({len(unknown)}):")
        for entry in unknown:
            uid = entry.get("regulation_id", "<unknown>")
            src = entry.get("user_provided_source")
            note = "no source URL yet" if not src else f"source: {src}"
            print(f"  • {uid} — {note}")
    else:
        print(f"\n{len(regs)} regulation(s) total. No unknown/pending entries.")


# ---------------------------------------------------------------------------
# --add-jurisdiction wizard
# ---------------------------------------------------------------------------

FRAMEWORK_MENU: List[Tuple[str, str]] = [
    ("1", "GDPR"),
    ("2", "CCPA"),
    ("3", "COPPA"),
    ("4", "PIPEDA"),
    ("5", "LGPD"),
    ("6", "PDPA"),
    ("7", "FERPA"),
    ("8", "HIPAA"),
    ("9", "Custom"),
]

FRAMEWORK_CODE_MAP: Dict[str, str] = {
    "1": "gdpr", "2": "ccpa", "3": "coppa", "4": "pipeda",
    "5": "lgpd", "6": "pdpa", "7": "ferpa", "8": "hipaa", "9": "custom",
}

FRAMEWORK_TEMPLATE_MAP: Dict[str, str] = {
    "gdpr": "gdpr_like",
    "ccpa": "ccpa_like",
    "coppa": "coppa_like",
    "ferpa": "ferpa_like",
}

REGULATION_ID_PATTERN = re.compile(
    r"^[A-Z0-9_]+-[0-9]{4}-[A-Z]{2,10}(-[A-Z]{2})?$"
)


def _prompt(prompt_text: str, required: bool = True, default: Optional[str] = None) -> str:
    """Prompt the user for input. If required, loop until non-empty."""
    while True:
        suffix = f" [{default}]" if default else ""
        val = input(f"{prompt_text}{suffix}: ").strip()
        if not val and default:
            return default
        if val or not required:
            return val
        print("  (required — please enter a value)")


def _prompt_optional(prompt_text: str) -> Optional[str]:
    """Prompt for an optional value; return None if empty."""
    val = input(f"{prompt_text} (optional, press Enter to skip): ").strip()
    return val if val else None


def add_jurisdiction_wizard(rules: Dict[str, Any], rules_path: Path, dry_run: bool) -> int:
    """
    Interactive wizard to add a fully-configured jurisdiction/regulation entry.
    Returns 0 on success, 1 on cancellation or error.
    """
    print()
    print("=" * 60)
    print("  Add Jurisdiction Wizard")
    print("=" * 60)
    print("Press Ctrl+C at any time to cancel.\n")

    try:
        # 1. regulation_id
        while True:
            regulation_id = _prompt(
                "1. Regulation ID (e.g. TEXAS-PRIVACY-2024-US-TX)"
            ).upper()
            if REGULATION_ID_PATTERN.match(regulation_id):
                break
            print(
                "  Invalid format. Expected: NAME-YEAR-COUNTRY or NAME-YEAR-COUNTRY-SUBDIVISION\n"
                "  e.g. TEXAS-PRIVACY-2024-US-TX  or  PIPA-2011-KR"
            )

        # Check for duplicates
        existing_ids = (
            [r.get("regulation_id") for r in rules.get("regulations", [])]
            + [e.get("regulation_id") for e in rules.get("unknown_regulations", [])]
        )
        if regulation_id in existing_ids:
            print(f"\n  Regulation '{regulation_id}' already exists. Exiting wizard.")
            return 1

        # 2. display_name
        display_name = _prompt("2. Display name (e.g. Texas Data Privacy and Security Act)")

        # 3. framework
        print("\n3. Framework:")
        for num, name in FRAMEWORK_MENU:
            print(f"   ({num}) {name}")
        while True:
            fw_choice = _prompt("   Enter number").strip()
            if fw_choice in FRAMEWORK_CODE_MAP:
                framework = FRAMEWORK_CODE_MAP[fw_choice]
                break
            print("  Please enter a number from 1-9.")

        # 4. country_code
        while True:
            country_code = _prompt("4. Country code (2-letter ISO, e.g. US, EU, CA)").upper()
            if re.match(r"^[A-Z]{2,3}$", country_code):
                break
            print("  Please enter a 2-3 letter ISO country code.")

        # 5. subdivision_code
        subdivision_raw = _prompt_optional("5. Subdivision code (e.g. TX for Texas)")
        subdivision_code: Optional[str] = subdivision_raw.upper() if subdivision_raw else None

        # 6. effective_date
        while True:
            effective_date = _prompt("6. Effective date (YYYY-MM-DD)")
            if re.match(r"^\d{4}-\d{2}-\d{2}$", effective_date):
                break
            print("  Please enter a date in YYYY-MM-DD format.")

        # 7. source_url — try auto-discovery first
        print("\n7. Source URL")
        print("   Searching for official source...")
        session = build_session()
        discovered_url = auto_discover_source(regulation_id, session)

        source_url: Optional[str] = None
        if discovered_url:
            print(f"   Discovered: {discovered_url}")
            confirm = _prompt("   Use this URL? (y/n)", default="y").lower()
            if confirm in ("y", "yes"):
                source_url = discovered_url

        if not source_url:
            print("   Options:")
            print("   (a) Enter URL manually")
            print("   (b) Mark as manual/no-URL (custom institutional policy)")
            url_choice = _prompt("   Choose (a/b)", default="a").lower()
            if url_choice == "a":
                source_url = _prompt("   Enter official source URL")
            else:
                source_url = None
                print("   Marked as manual — no auto-check will be performed.")

        # 8. source_type — derived
        source_type = "html_scrape" if source_url else "manual"

        # 9. Quick rule configuration
        print("\n8. Quick rule configuration:")
        print("   (a) Copy rules from existing regulation")
        print("   (b) Apply a framework template")
        print("   (c) Start with empty rules (fill in JSON manually later)")
        rule_choice = _prompt("   Choose (a/b/c)", default="c").lower()

        consent_rules: List[Dict] = []
        processing_rules: List[Dict] = []
        transfer_rules: List[Dict] = []
        retention_policies: Dict = {}
        rights_rules: List[Dict] = []
        student_flags: Dict = {
            "data_sharing_allowed": False,
            "monitoring_allowed": False,
            "profiling_allowed": False,
            "targeting_allowed": False,
        }
        requires_pia = False
        requires_dpo = False
        incident_reporting_days = 0
        breach_notification_threshold = "likely_harm"

        if rule_choice == "a":
            # Copy from existing regulation
            existing_regs = rules.get("regulations", [])
            if not existing_regs:
                print("   No existing regulations to copy from. Starting with empty rules.")
            else:
                print("   Existing regulations:")
                for i, reg in enumerate(existing_regs, 1):
                    print(f"   ({i}) {reg['regulation_id']} — {reg.get('display_name', '')}")
                while True:
                    try:
                        pick = int(_prompt("   Enter number to copy from")) - 1
                        if 0 <= pick < len(existing_regs):
                            source_reg = existing_regs[pick]
                            consent_rules = deepcopy(source_reg.get("consent_rules", []))
                            processing_rules = deepcopy(source_reg.get("processing_rules", []))
                            transfer_rules = deepcopy(source_reg.get("transfer_rules", []))
                            retention_policies = deepcopy(source_reg.get("retention_policies", {}))
                            rights_rules = deepcopy(source_reg.get("rights_rules", []))
                            student_flags = deepcopy(source_reg.get("student_flags", student_flags))
                            requires_pia = source_reg.get("requires_pia", False)
                            requires_dpo = source_reg.get("requires_dpo", False)
                            incident_reporting_days = source_reg.get("incident_reporting_days", 0)
                            breach_notification_threshold = source_reg.get(
                                "breach_notification_threshold", "likely_harm"
                            )
                            print(f"   Copied rules from {source_reg['regulation_id']}.")
                            break
                        else:
                            print("   Invalid selection.")
                    except (ValueError, IndexError):
                        print("   Please enter a valid number.")

        elif rule_choice == "b":
            # Apply framework template
            print("   Framework templates:")
            print("   (1) GDPR-like (explicit consent, 30-day rights)")
            print("   (2) CCPA-like (opt-out, 45-day rights)")
            print("   (3) COPPA-like (parental consent, under-13)")
            print("   (4) FERPA-like (educational records, 45-day access, 10-year retention)")
            tmpl_map = {
                "1": "gdpr_like", "2": "ccpa_like",
                "3": "coppa_like", "4": "ferpa_like",
            }
            while True:
                tmpl_choice = _prompt("   Choose (1-4)").strip()
                if tmpl_choice in tmpl_map:
                    tmpl_key = tmpl_map[tmpl_choice]
                    tmpl = FRAMEWORK_TEMPLATES[tmpl_key]
                    consent_rules = deepcopy(tmpl.get("consent_rules", []))
                    processing_rules = deepcopy(tmpl.get("processing_rules", []))
                    transfer_rules = deepcopy(tmpl.get("transfer_rules", []))
                    retention_policies = deepcopy(tmpl.get("retention_policies", {}))
                    rights_rules = deepcopy(tmpl.get("rights_rules", []))
                    student_flags = deepcopy(tmpl.get("student_flags", student_flags))
                    requires_pia = tmpl.get("requires_pia", False)
                    requires_dpo = tmpl.get("requires_dpo", False)
                    incident_reporting_days = tmpl.get("incident_reporting_days", 0)
                    breach_notification_threshold = tmpl.get(
                        "breach_notification_threshold", "likely_harm"
                    )
                    print(f"   Applied {tmpl_key} template.")
                    break
                print("   Please choose 1-4.")

        # 10. Confirm and save
        print()
        print("─" * 60)
        print("  Review new regulation entry:")
        print(f"  ID:            {regulation_id}")
        print(f"  Name:          {display_name}")
        print(f"  Framework:     {framework}")
        print(f"  Country:       {country_code}")
        print(f"  Subdivision:   {subdivision_code or '(none)'}")
        print(f"  Effective:     {effective_date}")
        print(f"  Source URL:    {source_url or '(none — manual)'}")
        print(f"  Source type:   {source_type}")
        print(f"  Rules copied:  {len(consent_rules)} consent, {len(processing_rules)} processing, "
              f"{len(transfer_rules)} transfer, {len(rights_rules)} rights")
        print("─" * 60)
        confirm_save = _prompt("Save this entry? (y/n)", default="y").lower()
        if confirm_save not in ("y", "yes"):
            print("Cancelled — nothing saved.")
            return 1

        # Build the new regulation entry
        new_entry: Dict[str, Any] = {
            "regulation_id": regulation_id,
            "display_name": display_name,
            "framework": framework,
            "jurisdiction_id": f"{country_code.lower()}_{subdivision_code.lower() if subdivision_code else 'national'}",
            "country_code": country_code,
            "subdivision_code": subdivision_code,
            "effective_date": effective_date,
            "sunset_date": None,
            "source_url": source_url,
            "source_type": source_type,
            "source_xpath_or_selector": None,
            "last_fetched": None,
            "version": "1.0.0",
            "change_log": [],
            "consent_rules": consent_rules,
            "processing_rules": processing_rules,
            "transfer_rules": transfer_rules,
            "retention_policies": retention_policies,
            "rights_rules": rights_rules,
            "student_flags": student_flags,
            "requires_pia": requires_pia,
            "requires_dpo": requires_dpo,
            "incident_reporting_days": incident_reporting_days,
            "breach_notification_threshold": breach_notification_threshold,
        }

        rules.setdefault("regulations", []).append(new_entry)

        if not dry_run:
            save_rules_atomic(rules, rules_path)
            print(f"\nSaved! '{regulation_id}' has been added to regulations in {rules_path}.")
        else:
            print(f"\n[DRY RUN] Would have added '{regulation_id}' to regulations (not saved).")

        return 0

    except KeyboardInterrupt:
        print("\nCancelled.")
        return 1


# ---------------------------------------------------------------------------
# Atomic file save
# ---------------------------------------------------------------------------

def save_rules_atomic(rules: Dict[str, Any], path: Path) -> None:
    """
    Write *rules* to *path* atomically by writing a .tmp file first,
    then renaming it over the target.
    """
    tmp_path = path.with_suffix(".json.tmp")
    with tmp_path.open("w", encoding="utf-8") as fh:
        json.dump(rules, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    tmp_path.replace(path)
    log.debug("Saved rules to %s", path)


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def render_report(
    run_at: str,
    results: List[Dict[str, Any]],
    unknown_results: List[Dict[str, Any]],
    use_color: bool,
) -> str:
    """Return the box-formatted summary report string."""
    total = len(results)
    updated = sum(1 for r in results if r["status"] == "updated")
    unchanged = sum(1 for r in results if r["status"] == "unchanged")
    manual_count = sum(1 for r in results if r["status"] == "manual")
    failed = [r for r in results if r["status"] == "source_unavailable"]
    unknown_count = len(unknown_results)

    width = 44

    failed_detail = ""
    if failed:
        detail_parts = [f"{r['regulation_id']}: {r['detail']}" for r in failed]
        failed_detail = "; ".join(detail_parts)
        # Truncate if very long
        if len(failed_detail) > 30:
            failed_detail = failed_detail[:30] + "…"

    def row(label: str, value: str) -> str:
        line = f"║ {label:<11} {value}"
        padding = width - len(line) - 1
        return line + " " * max(padding, 0) + "║"

    lines = [
        "╔" + "═" * (width - 2) + "╗",
        "║" + "   Privacy Rules Update Report            "[:width - 2] + "║",
        "╠" + "═" * (width - 2) + "╣",
        row("Run at:", run_at),
        row("Checked:", f"{total} regulations"),
        row("Updated:", str(updated)),
        row("Unchanged:", str(unchanged)),
        row("Manual:", str(manual_count)),
        row("Failed:", f"{len(failed)}" + (f" ({failed_detail})" if failed_detail else "")),
        row("Unknown:", str(unknown_count)),
        "╚" + "═" * (width - 2) + "╝",
    ]
    report = "\n".join(lines)

    if use_color and updated > 0:
        report = _c("green", report, use_color)
    elif use_color and failed:
        report = _c("yellow", report, use_color)

    return report


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def run_update(
    rules_path: Path,
    dry_run: bool,
    force_update: bool,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Load rules, process all regulations, update metadata, save.

    Returns (regulation_results, unknown_results).
    """
    log.info("Loading rules from %s", rules_path)
    with rules_path.open("r", encoding="utf-8") as fh:
        rules: Dict[str, Any] = json.load(fh)

    # Work on a deep copy for dry-run; mutate in-place otherwise
    working = deepcopy(rules) if dry_run else rules

    session = build_session()
    run_at = utcnow_iso()
    regulation_results: List[Dict[str, Any]] = []

    for regulation in working.get("regulations", []):
        # Skip recently-checked regulations unless --force-update
        if not force_update:
            last_fetched = regulation.get("last_fetched")
            if last_fetched:
                try:
                    last_dt = datetime.fromisoformat(last_fetched.replace("Z", "+00:00"))
                    hours_since = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
                    if hours_since < 12:
                        log.debug(
                            "Skipping %s — checked %.1f hours ago",
                            regulation["regulation_id"],
                            hours_since,
                        )
                        regulation_results.append({
                            "regulation_id": regulation["regulation_id"],
                            "status": "unchanged",
                            "old_version": regulation.get("version"),
                            "new_version": None,
                            "detail": f"recently checked ({hours_since:.1f}h ago)",
                            "found_date": None,
                        })
                        continue
                except (ValueError, TypeError):
                    pass

        try:
            result = process_regulation(regulation, session, dry_run)
        except Exception as exc:  # noqa: BLE001
            log.error(
                "Unexpected error processing %s: %s",
                regulation.get("regulation_id", "?"),
                exc,
                exc_info=True,
            )
            result = {
                "regulation_id": regulation.get("regulation_id", "?"),
                "status": "source_unavailable",
                "old_version": regulation.get("version"),
                "new_version": None,
                "detail": f"unexpected_error: {exc}",
                "found_date": None,
            }
        regulation_results.append(result)

    # Process unknown regulations
    unknown_results = process_unknown_regulations(
        working.get("unknown_regulations", []),
        session,
        dry_run,
    )

    if not dry_run:
        # Update metadata
        working.setdefault("metadata", {})["last_updated"] = run_at
        working["metadata"]["next_update_due"] = first_day_next_month()

        # Append to update_log
        working.setdefault("update_log", []).append({
            "run_at": run_at,
            "regulations_checked": len(regulation_results),
            "updated": sum(1 for r in regulation_results if r["status"] == "updated"),
            "unchanged": sum(1 for r in regulation_results if r["status"] == "unchanged"),
            "manual": sum(1 for r in regulation_results if r["status"] == "manual"),
            "source_unavailable": sum(
                1 for r in regulation_results if r["status"] == "source_unavailable"
            ),
            "unknown_processed": len(unknown_results),
            "dry_run": False,
        })

        save_rules_atomic(working, rules_path)
        log.info("Saved updated rules to %s", rules_path)
    else:
        log.info("[DRY RUN] No changes written to disk.")

    return regulation_results, unknown_results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Peripateticware Privacy Rules Updater\n\n"
            "Flags:\n"
            "  --rules-file PATH      Path to privacy_rules.json\n"
            "  --dry-run              Show what would change without writing\n"
            "  --new-regulation ID    Add a new unknown regulation by ID\n"
            "  --resolve-regulation   Interactive: prompt for source URLs for unknown regs\n"
            "  --add-jurisdiction     Interactive wizard: add a fully-configured jurisdiction\n"
            "  --list                 Print a formatted table of all current regulations\n"
            "  --log-level LEVEL      DEBUG / INFO / WARNING (default: INFO)\n"
            "  --force-update         Force fetch all sources even if recently checked\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--rules-file",
        default="./privacy_rules.json",
        metavar="PATH",
        help="Path to privacy_rules.json (default: ./privacy_rules.json)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing anything",
    )
    parser.add_argument(
        "--new-regulation",
        metavar="ID",
        help="Add a new unknown regulation by ID and print guidance",
    )
    parser.add_argument(
        "--resolve-regulation",
        action="store_true",
        help="Interactive: prompt for source URLs for unknown regulations",
    )
    parser.add_argument(
        "--add-jurisdiction",
        action="store_true",
        help="Interactive wizard: collect details and add a fully-configured jurisdiction",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Print a formatted table of all current regulations and exit",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING"],
        help="Logging verbosity (default: INFO)",
    )
    parser.add_argument(
        "--force-update",
        action="store_true",
        help="Force fetch all sources even if recently checked",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    """
    Entry point.  Returns process exit code (0 = success, 1 = partial failure).
    """
    args = parse_args(argv)
    global log
    log = setup_logging(args.log_level)

    use_color = sys.stdout.isatty()
    rules_path = Path(args.rules_file).resolve()

    if not rules_path.exists():
        log.error("Rules file not found: %s", rules_path)
        return 1

    # --list: print table and exit
    if args.list:
        with rules_path.open("r", encoding="utf-8") as fh:
            rules: Dict[str, Any] = json.load(fh)
        list_regulations(rules)
        return 0

    # --new-regulation: add entry + prompt, then exit (no full update run)
    if args.new_regulation:
        log.info("Adding new regulation: %s", args.new_regulation)
        with rules_path.open("r", encoding="utf-8") as fh:
            rules = json.load(fh)
        add_new_regulation(rules, args.new_regulation)
        if not args.dry_run:
            save_rules_atomic(rules, rules_path)
        return 0

    # --resolve-regulation: interactive source-URL prompt, then exit
    if args.resolve_regulation:
        with rules_path.open("r", encoding="utf-8") as fh:
            rules = json.load(fh)
        resolve_unknown_regulations(rules)
        if not args.dry_run:
            save_rules_atomic(rules, rules_path)
        return 0

    # --add-jurisdiction: interactive wizard, then exit
    if args.add_jurisdiction:
        with rules_path.open("r", encoding="utf-8") as fh:
            rules = json.load(fh)
        return add_jurisdiction_wizard(rules, rules_path, args.dry_run)

    # Normal update run
    run_at = utcnow_iso()
    if args.dry_run:
        log.info("=== DRY RUN — no files will be modified ===")

    try:
        regulation_results, unknown_results = run_update(
            rules_path=rules_path,
            dry_run=args.dry_run,
            force_update=args.force_update,
        )
    except json.JSONDecodeError as exc:
        log.error("Failed to parse %s: %s", rules_path, exc)
        return 1
    except OSError as exc:
        log.error("I/O error: %s", exc)
        return 1

    # Print report
    report = render_report(run_at, regulation_results, unknown_results, use_color)
    print()
    print(report)
    print()

    # Exit code: 1 if any regulation failed
    any_failed = any(r["status"] == "source_unavailable" for r in regulation_results)
    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main())
