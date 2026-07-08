#!/usr/bin/env python3
# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1
"""
Offline crawler-ingestion check.

Proves that every privacy-crawler source produces a rule_definition that the
canonical ingestion schema (schemas/privacy_rule.py) will accept — WITHOUT
needing a database or live network. It reconstructs the exact dict the crawler
builds (baseline_rule + the crawler's overlay fields) and runs it through the
same validator the DB deserialiser and POST /privacy/rules use.

Run from the backend/ directory:

    python scripts/check_crawler_ingestion.py

Exit code 0 = all sources ingestible; 1 = at least one source would be rejected.
"""
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

# Run from backend/ so "services", "schemas" import correctly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Stub the crawler's heavy DB-model imports so we can load SOURCES (pure data)
# without Postgres / pgvector. We only touch data + the pure regex helper.
def _stub(name, **attrs):
    m = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m

_stub("models.compliance", ComplianceRule=object, RuleAuditLog=object)
_stub("services.privacy_engine",
      invalidate_rules_cache=lambda *a, **k: None,
      hash_student_id=lambda x: x)

from services.iapp_privacy_crawler import SOURCES, _extract_last_modified  # noqa: E402
from schemas.privacy_rule import validate_rule_definition                  # noqa: E402
from pydantic import ValidationError                                       # noqa: E402


def _build_rule_def(source, html=None):
    """Reproduce _crawl_source + _upsert_rule rule_definition construction."""
    rd = dict(source.baseline_rule)
    rd["_page_fetched"] = bool(html)
    rd["_page_length"] = len(html) if html else 0
    rd["_crawler_version"] = _extract_last_modified(html, source)
    rd["_crawled_at"] = datetime.now(timezone.utc).isoformat()
    rd["_auto_loaded"] = False
    return rd


def _ingest(jurisdiction, rd):
    """Reproduce _deserialise_jurisdiction's setdefaults, then validate."""
    d = dict(rd)
    d.setdefault("jurisdiction_id", jurisdiction)
    d.setdefault("jurisdiction_name",
                 rd.get("jurisdiction_name", rd.get("regulation_name", jurisdiction)))
    d.setdefault("country_code",
                 rd.get("country_code", (rd.get("country_codes") or ["XX"])[0]))
    return validate_rule_definition(d)


def main() -> int:
    ok = fail = 0
    for s in SOURCES:
        try:
            _ingest(s.jurisdiction, _build_rule_def(s, html="<html>2024-03-01</html>"))
            ok += 1
        except ValidationError as e:
            fail += 1
            errs = "; ".join(
                f"{'.'.join(map(str, er['loc']))}={er['type']}" for er in e.errors()
            )
            print(f"FAIL {s.source_id:18}({s.jurisdiction}): {errs}")
    print(f"\nSOURCES={len(SOURCES)}  INGESTIBLE={ok}  FAILED={fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
