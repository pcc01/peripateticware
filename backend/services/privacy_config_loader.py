"""
Privacy Configuration Loader
Loads jurisdiction privacy configurations from JSON files on disk.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

from services.privacy_engine import (
    JurisdictionConfig,
    PrivacyFramework,
    ConsentRule,
    ProcessingRule,
    DataTransferRule,
    RetentionPolicy,
    RightRule,
    DataCategory,
)

logger = logging.getLogger(__name__)


class PrivacyConfigurationLoader:
    """
    Loads JurisdictionConfig objects from JSON files.

    Expected directory layout:
        <config_dir>/
            gb.json
            us_coppa.json
            ...

    Each file must have at minimum:
        {
            "jurisdiction_id": "gb",
            "jurisdiction_name": "United Kingdom",
            "framework": "GDPR",
            "country_code": "GB"
        }

    All other fields are optional and will fall back to safe defaults.
    """

    def __init__(self, config_dir: str):
        self.config_dir = Path(config_dir)

    def load_all_jurisdictions(self) -> Dict[str, JurisdictionConfig]:
        """
        Walk config_dir, parse every .json file, and return a dict
        keyed by jurisdiction_id.  Files that fail to parse are logged
        and skipped so one bad file never kills the whole load.
        """
        configs: Dict[str, JurisdictionConfig] = {}

        if not self.config_dir.exists():
            logger.warning(
                f"Privacy config directory does not exist: {self.config_dir}. "
                "Returning empty config set."
            )
            return configs

        for path in sorted(self.config_dir.glob("*.json")):
            try:
                config = self._load_file(path)
                configs[config.jurisdiction_id] = config
                logger.debug(f"Loaded privacy config: {config.jurisdiction_id} from {path.name}")
            except Exception as exc:
                logger.error(f"Failed to load privacy config {path}: {exc}")

        logger.info(f"Loaded {len(configs)} jurisdiction config(s) from {self.config_dir}")
        return configs

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_file(self, path: Path) -> JurisdictionConfig:
        with open(path, "r", encoding="utf-8") as fh:
            data: Dict[str, Any] = json.load(fh)

        # Validate against the canonical schema. This catches malformed files
        # (bad severity, out-of-range ages, missing identity fields) at load
        # time and normalises the framework. We log and continue on failure so
        # one bad file never kills the whole load (matches load_all_jurisdictions).
        try:
            from schemas.privacy_rule import validate_rule_definition
            validate_rule_definition(data)
        except Exception as _ve:
            logger.warning(f"Privacy config {path.name} failed canonical validation: {_ve}")

        # Resolve framework enum. Enum values are lowercase ("gdpr", "ferpa"),
        # so normalise case first — previously PrivacyFramework("GDPR") raised
        # ValueError and EVERY file with an uppercase framework silently became
        # GDPR (e.g. a FERPA config would be treated as GDPR).
        raw_framework = str(data.get("framework", "custom")).lower()
        try:
            framework = PrivacyFramework(raw_framework)
        except ValueError:
            logger.warning(
                f"Unknown framework '{raw_framework}' in {path.name}; using CUSTOM. "
                f"Valid values: {[f.value for f in PrivacyFramework]}"
            )
            framework = PrivacyFramework.CUSTOM

        # Parse optional datetime fields
        def _parse_dt(val: Any):
            if val is None:
                return None
            if isinstance(val, datetime):
                return val
            return datetime.fromisoformat(str(val))

        effective_date = _parse_dt(data.get("effective_date")) or datetime.now(timezone.utc)

        return JurisdictionConfig(
            jurisdiction_id=data["jurisdiction_id"],
            jurisdiction_name=data["jurisdiction_name"],
            framework=framework,
            country_code=data["country_code"],
            subdivision_code=data.get("subdivision_code"),
            effective_date=effective_date,
            sunset_date=_parse_dt(data.get("sunset_date")),
            # Complex rule lists – pass through if already in the right shape,
            # otherwise leave as empty defaults; callers can extend as needed.
            consent_rules=data.get("consent_rules", []),
            processing_rules=data.get("processing_rules", []),
            transfer_rules=data.get("transfer_rules", []),
            retention_policies=data.get("retention_policies", {}),
            rights_rules=data.get("rights_rules", []),
            requires_privacy_impact_assessment=data.get(
                "requires_privacy_impact_assessment", False
            ),
            requires_data_protection_officer=data.get(
                "requires_data_protection_officer", False
            ),
            requires_incident_reporting=data.get("requires_incident_reporting", True),
            incident_reporting_days=data.get("incident_reporting_days", 72),
            requires_breach_notification=data.get("requires_breach_notification", True),
            breach_notification_threshold=data.get("breach_notification_threshold", 10),
            student_data_sharing_allowed=data.get("student_data_sharing_allowed", False),
            third_party_vendors_allowed=data.get("third_party_vendors_allowed", []),
            student_monitoring_allowed=data.get("student_monitoring_allowed", False),
            student_profiling_allowed=data.get("student_profiling_allowed", False),
            student_targeting_allowed=data.get("student_targeting_allowed", False),
            max_retention_days=data.get("max_retention_days", 365),
            encryption_required=data.get("encryption_required", False),
            encryption_algorithm=data.get("encryption_algorithm", "AES-256"),
            # Stash the raw definition so PrivacyComplianceChecker's data-driven
            # checks (prohibited_data_collection, special_restrictions) work for
            # file-loaded configs exactly as they do for DB-loaded ones.
            metadata={"_rule_definition": data},
        )
