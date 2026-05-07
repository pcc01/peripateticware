# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Configuration Loader
Dynamically loads and manages jurisdiction configurations from JSON/XML
Supports hot-reloading without restart
"""

import json
import os
import logging
from typing import Dict, Optional, List
from datetime import datetime
from pathlib import Path
import hashlib

from services.privacy_engine import (
    PrivacyComplianceChecker,
    JurisdictionConfig,
    ConsentRule,
    ProcessingRule,
    DataTransferRule,
    RetentionPolicy,
    RightRule,
    PrivacyFramework,
    DataCategory,
    ConsentType,
    AgeGroup
)

logger = logging.getLogger(__name__)


class PrivacyConfigurationLoader:
    """Loads and manages privacy configurations from JSON files"""
    
    def __init__(self, config_directory: str = "config/jurisdictions"):
        self.config_directory = Path(config_directory)
        self.configs: Dict[str, JurisdictionConfig] = {}
        self.config_hashes: Dict[str, str] = {}  # For detecting changes
        self.last_load_time: Optional[datetime] = None
        
        # Create directory if it doesn't exist
        self.config_directory.mkdir(parents=True, exist_ok=True)
        logger.info(f"PrivacyConfigurationLoader initialized at {self.config_directory}")
    
    def load_all_jurisdictions(self) -> Dict[str, JurisdictionConfig]:
        """Load all jurisdiction configurations from directory"""
        self.configs.clear()
        
        json_files = self.config_directory.glob("*.json")
        xml_files = self.config_directory.glob("*.xml")
        
        loaded_count = 0
        
        for json_file in json_files:
            try:
                config = self.load_from_json(json_file)
                self.configs[config.jurisdiction_id] = config
                loaded_count += 1
                logger.info(f"Loaded jurisdiction: {config.jurisdiction_id}")
            except Exception as e:
                logger.error(f"Error loading {json_file}: {e}")
        
        for xml_file in xml_files:
            try:
                config = self.load_from_xml(xml_file)
                self.configs[config.jurisdiction_id] = config
                loaded_count += 1
                logger.info(f"Loaded jurisdiction: {config.jurisdiction_id}")
            except Exception as e:
                logger.error(f"Error loading {xml_file}: {e}")
        
        self.last_load_time = datetime.utcnow()
        logger.info(f"Loaded {loaded_count} jurisdiction configurations")
        
        return self.configs
    
    def load_from_json(self, file_path: Path) -> JurisdictionConfig:
        """Load jurisdiction configuration from JSON file"""
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return self._parse_jurisdiction_config(data)
    
    def load_from_xml(self, file_path: Path) -> JurisdictionConfig:
        """Load jurisdiction configuration from XML file"""
        # TODO: Implement XML parsing
        # For now, log that XML is not yet implemented
        logger.warning(f"XML loading not yet implemented: {file_path}")
        raise NotImplementedError("XML loading coming soon")
    
    def reload_if_changed(self) -> bool:
        """
        Check if any configuration files have changed and reload if needed
        Returns True if any changes detected
        """
        changed = False
        
        for json_file in self.config_directory.glob("*.json"):
            if self._file_changed(json_file):
                try:
                    config = self.load_from_json(json_file)
                    self.configs[config.jurisdiction_id] = config
                    changed = True
                    logger.info(f"Reloaded changed jurisdiction: {config.jurisdiction_id}")
                except Exception as e:
                    logger.error(f"Error reloading {json_file}: {e}")
        
        if changed:
            self.last_load_time = datetime.utcnow()
            logger.info("Configuration reloaded due to file changes")
        
        return changed
    
    def _file_changed(self, file_path: Path) -> bool:
        """Check if file has changed since last load"""
        try:
            with open(file_path, 'rb') as f:
                current_hash = hashlib.md5(f.read()).hexdigest()
            
            previous_hash = self.config_hashes.get(file_path.name)
            
            if previous_hash != current_hash:
                self.config_hashes[file_path.name] = current_hash
                return True
            
            return False
        except Exception as e:
            logger.error(f"Error checking file changes: {e}")
            return False
    
    def save_jurisdiction(
        self,
        jurisdiction_id: str,
        config: JurisdictionConfig,
        format: str = "json"
    ) -> bool:
        """
        Save jurisdiction configuration to file
        
        Args:
            jurisdiction_id: ID of jurisdiction
            config: Configuration object
            format: 'json' or 'xml'
            
        Returns:
            True if successful
        """
        try:
            if format == "json":
                return self._save_as_json(jurisdiction_id, config)
            elif format == "xml":
                return self._save_as_xml(jurisdiction_id, config)
            else:
                logger.error(f"Unknown format: {format}")
                return False
        except Exception as e:
            logger.error(f"Error saving jurisdiction {jurisdiction_id}: {e}")
            return False
    
    def _save_as_json(self, jurisdiction_id: str, config: JurisdictionConfig) -> bool:
        """Save configuration as JSON"""
        file_path = self.config_directory / f"{jurisdiction_id}.json"
        
        config_dict = self._config_to_dict(config)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(config_dict, f, indent=2, default=str)
        
        logger.info(f"Saved jurisdiction {jurisdiction_id} to {file_path}")
        return True
    
    def _save_as_xml(self, jurisdiction_id: str, config: JurisdictionConfig) -> bool:
        """Save configuration as XML"""
        # TODO: Implement XML serialization
        logger.warning("XML saving not yet implemented")
        raise NotImplementedError("XML saving coming soon")
    
    def _parse_jurisdiction_config(self, data: Dict) -> JurisdictionConfig:
        """Parse jurisdiction configuration from dict"""
        
        # Parse consent rules
        consent_rules = []
        for rule_data in data.get("consent_rules", []):
            rule = ConsentRule(
                data_categories=[DataCategory[cat.upper()] for cat in rule_data.get("data_categories", [])],
                age_groups=[AgeGroup[group.upper()] for group in rule_data.get("age_groups", [])],
                consent_type=ConsentType[rule_data.get("consent_type", "explicit").upper()],
                requires_parental_consent=rule_data.get("requires_parental_consent", False),
                parental_age_threshold=rule_data.get("parental_age_threshold", 16),
                consent_withdrawal_allowed=rule_data.get("consent_withdrawal_allowed", True),
                transparency_required=rule_data.get("transparency_required", True)
            )
            consent_rules.append(rule)
        
        # Parse processing rules
        processing_rules = []
        for rule_data in data.get("processing_rules", []):
            rule = ProcessingRule(
                data_categories=[DataCategory[cat.upper()] for cat in rule_data.get("data_categories", [])],
                allowed_purposes=rule_data.get("allowed_purposes", []),
                forbidden_purposes=rule_data.get("forbidden_purposes", []),
                requires_explicit_purpose=rule_data.get("requires_explicit_purpose", False),
                data_minimization=rule_data.get("data_minimization", True),
                purpose_limitation=rule_data.get("purpose_limitation", True),
                max_processors=rule_data.get("max_processors", 1)
            )
            processing_rules.append(rule)
        
        # Parse transfer rules
        transfer_rules = []
        for rule_data in data.get("transfer_rules", []):
            rule = DataTransferRule(
                allowed_destinations=rule_data.get("allowed_destinations", []),
                requires_model_clauses=rule_data.get("requires_model_clauses", False),
                requires_adequacy_decision=rule_data.get("requires_adequacy_decision", False),
                requires_consent=rule_data.get("requires_consent", False),
                anonymization_required=rule_data.get("anonymization_required", False)
            )
            transfer_rules.append(rule)
        
        # Parse retention policies
        retention_policies = {}
        for data_cat_str, policy_data in data.get("retention_policies", {}).items():
            try:
                data_cat = DataCategory[data_cat_str.upper()]
                policy = RetentionPolicy(
                    duration_days=policy_data.get("duration_days", 365),
                    purpose=policy_data.get("purpose", ""),
                    deletion_method=policy_data.get("deletion_method", "delete"),
                    can_archive=policy_data.get("can_archive", False),
                    archive_duration_days=policy_data.get("archive_duration_days")
                )
                retention_policies[data_cat] = policy
            except KeyError:
                logger.warning(f"Unknown data category: {data_cat_str}")
        
        # Parse rights rules
        rights_rules = []
        for rule_data in data.get("rights_rules", []):
            rule = RightRule(
                right_name=rule_data.get("right_name", ""),
                must_comply_within_days=rule_data.get("must_comply_within_days", 30),
                can_charge=rule_data.get("can_charge", False),
                charge_amount=rule_data.get("charge_amount"),
                exemptions=rule_data.get("exemptions", [])
            )
            rights_rules.append(rule)
        
        # Create jurisdiction config
        config = JurisdictionConfig(
            jurisdiction_id=data.get("jurisdiction_id"),
            jurisdiction_name=data.get("jurisdiction_name"),
            framework=PrivacyFramework[data.get("framework", "custom").upper()],
            country_code=data.get("country_code"),
            subdivision_code=data.get("subdivision_code"),
            effective_date=datetime.fromisoformat(data.get("effective_date", datetime.utcnow().isoformat())),
            sunset_date=datetime.fromisoformat(data["sunset_date"]) if data.get("sunset_date") else None,
            consent_rules=consent_rules,
            processing_rules=processing_rules,
            transfer_rules=transfer_rules,
            retention_policies=retention_policies,
            rights_rules=rights_rules,
            requires_privacy_impact_assessment=data.get("requires_privacy_impact_assessment", False),
            requires_data_protection_officer=data.get("requires_data_protection_officer", False),
            requires_incident_reporting=data.get("requires_incident_reporting", True),
            incident_reporting_days=data.get("incident_reporting_days", 72),
            requires_breach_notification=data.get("requires_breach_notification", True),
            breach_notification_threshold=data.get("breach_notification_threshold", 10),
            student_data_sharing_allowed=data.get("student_data_sharing_allowed", False),
            third_party_vendors_allowed=data.get("third_party_vendors_allowed", []),
            student_monitoring_allowed=data.get("student_monitoring_allowed", False),
            student_profiling_allowed=data.get("student_profiling_allowed", False),
            student_targeting_allowed=data.get("student_targeting_allowed", False),
            version=data.get("version", "1.0"),
            metadata=data.get("metadata", {})
        )
        
        return config
    
    def _config_to_dict(self, config: JurisdictionConfig) -> Dict:
        """Convert configuration to dictionary for serialization"""
        return {
            "jurisdiction_id": config.jurisdiction_id,
            "jurisdiction_name": config.jurisdiction_name,
            "framework": config.framework.value,
            "country_code": config.country_code,
            "subdivision_code": config.subdivision_code,
            "effective_date": config.effective_date.isoformat(),
            "sunset_date": config.sunset_date.isoformat() if config.sunset_date else None,
            "version": config.version,
            "metadata": config.metadata,
            "requires_privacy_impact_assessment": config.requires_privacy_impact_assessment,
            "requires_data_protection_officer": config.requires_data_protection_officer,
            "requires_incident_reporting": config.requires_incident_reporting,
            "incident_reporting_days": config.incident_reporting_days,
            "requires_breach_notification": config.requires_breach_notification,
            "breach_notification_threshold": config.breach_notification_threshold,
            "student_data_sharing_allowed": config.student_data_sharing_allowed,
            "third_party_vendors_allowed": config.third_party_vendors_allowed,
            "student_monitoring_allowed": config.student_monitoring_allowed,
            "student_profiling_allowed": config.student_profiling_allowed,
            "student_targeting_allowed": config.student_targeting_allowed,
            "consent_rules": [
                {
                    "data_categories": [cat.value for cat in rule.data_categories],
                    "age_groups": [group.value for group in rule.age_groups],
                    "consent_type": rule.consent_type.value,
                    "requires_parental_consent": rule.requires_parental_consent,
                    "parental_age_threshold": rule.parental_age_threshold,
                    "consent_withdrawal_allowed": rule.consent_withdrawal_allowed,
                    "transparency_required": rule.transparency_required
                }
                for rule in config.consent_rules
            ],
            "processing_rules": [
                {
                    "data_categories": [cat.value for cat in rule.data_categories],
                    "allowed_purposes": rule.allowed_purposes,
                    "forbidden_purposes": rule.forbidden_purposes,
                    "requires_explicit_purpose": rule.requires_explicit_purpose,
                    "data_minimization": rule.data_minimization,
                    "purpose_limitation": rule.purpose_limitation,
                    "max_processors": rule.max_processors
                }
                for rule in config.processing_rules
            ],
            "transfer_rules": [
                {
                    "allowed_destinations": rule.allowed_destinations,
                    "requires_model_clauses": rule.requires_model_clauses,
                    "requires_adequacy_decision": rule.requires_adequacy_decision,
                    "requires_consent": rule.requires_consent,
                    "anonymization_required": rule.anonymization_required
                }
                for rule in config.transfer_rules
            ],
            "retention_policies": {
                cat.value: {
                    "duration_days": policy.duration_days,
                    "purpose": policy.purpose,
                    "deletion_method": policy.deletion_method,
                    "can_archive": policy.can_archive,
                    "archive_duration_days": policy.archive_duration_days
                }
                for cat, policy in config.retention_policies.items()
            },
            "rights_rules": [
                {
                    "right_name": rule.right_name,
                    "must_comply_within_days": rule.must_comply_within_days,
                    "can_charge": rule.can_charge,
                    "charge_amount": rule.charge_amount,
                    "exemptions": rule.exemptions
                }
                for rule in config.rights_rules
            ]
        }
