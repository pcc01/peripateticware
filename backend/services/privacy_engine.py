# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Engine v1.0
Configurable, jurisdiction-aware privacy compliance system
Rules updateable via JSON/XML without code changes
Supports GDPR, CCPA, COPPA, PIPEDA, and custom jurisdictions
"""

from typing import Dict, List, Optional, Any, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum
import logging
import json
from datetime import datetime
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class PrivacyFramework(str, Enum):
    """Supported privacy frameworks"""
    GDPR = "gdpr"           # EU General Data Protection Regulation
    CCPA = "ccpa"           # California Consumer Privacy Act
    COPPA = "coppa"         # Children's Online Privacy Protection Act (US)
    PIPEDA = "pipeda"       # Personal Information Protection and Electronic Documents Act (Canada)
    LGPD = "lgpd"           # Lei Geral de Proteção de Dados (Brazil)
    PDPA = "pdpa"           # Personal Data Protection Act (Singapore)
    CUSTOM = "custom"       # Custom jurisdiction


class DataCategory(str, Enum):
    """Categories of personal data"""
    IDENTITY = "identity"           # Name, ID numbers
    CONTACT = "contact"             # Email, phone, address
    EDUCATIONAL = "educational"     # School, grades, learning data
    BEHAVIORAL = "behavioral"       # Activity tracking, engagement
    LOCATION = "location"           # GPS, geographic data
    BIOMETRIC = "biometric"         # Fingerprint, facial recognition
    HEALTH = "health"               # Medical, disability info
    SPECIAL = "special"             # Sensitive data (ethnicity, religion, etc.)
    FINANCIAL = "financial"         # Payment info, billing


class ConsentType(str, Enum):
    """Types of consent"""
    EXPLICIT = "explicit"           # Must ask and get yes
    IMPLIED = "implied"             # Can proceed unless opted out
    NONE_REQUIRED = "none_required" # No consent needed


class AgeGroup(str, Enum):
    """Age groups for compliance"""
    UNDER_13 = "under_13"     # Children (COPPA applies in US)
    UNDER_16 = "under_16"     # Minors (GDPR requires parental consent)
    UNDER_18 = "under_18"     # Minors (CCPA definition)
    ADULT = "adult"           # 18+


@dataclass
class RetentionPolicy:
    """How long data can be retained"""
    duration_days: int          # How many days to keep
    purpose: str               # Why we're keeping it
    deletion_method: str       # How to delete (anonymize, purge, etc.)
    can_archive: bool          # Can be archived after retention?
    archive_duration_days: Optional[int] = None  # How long if archived


@dataclass
class ConsentRule:
    """Rule for when consent is required"""
    data_categories: List[DataCategory]
    age_groups: List[AgeGroup]
    consent_type: ConsentType
    requires_parental_consent: bool = False
    parental_age_threshold: int = 16  # Age at which parental consent needed
    consent_withdrawal_allowed: bool = True
    transparency_required: bool = True


@dataclass
class ProcessingRule:
    """Rules for how data can be processed"""
    data_categories: List[DataCategory]
    allowed_purposes: List[str]  # e.g., "lesson_delivery", "grading", "analytics"
    forbidden_purposes: List[str]
    requires_explicit_purpose: bool  # Must state purpose before collecting
    data_minimization: bool  # Only collect necessary data
    purpose_limitation: bool  # Can't use for other purposes
    max_processors: int = 1  # Max number of processors


@dataclass
class DataTransferRule:
    """Rules for transferring data to other services"""
    allowed_destinations: List[str]  # Countries, services
    requires_model_clauses: bool  # EU Standard Contractual Clauses
    requires_adequacy_decision: bool
    requires_consent: bool
    anonymization_required: bool


@dataclass
class RightRule:
    """Rules for data subject rights"""
    right_name: str  # e.g., "access", "deletion", "portability"
    must_comply_within_days: int
    can_charge: bool = False
    charge_amount: Optional[float] = None
    exemptions: List[str] = field(default_factory=list)


@dataclass
class JurisdictionConfig:
    """Complete privacy configuration for a jurisdiction"""
    jurisdiction_id: str          # "us_california", "eu", "ca_ontario"
    jurisdiction_name: str        # "California, USA"
    framework: PrivacyFramework
    country_code: str            # ISO 3166-1 alpha-2
    subdivision_code: Optional[str] = None  # State/province code
    effective_date: datetime = field(default_factory=datetime.utcnow)
    sunset_date: Optional[datetime] = None
    
    # Rules
    consent_rules: List[ConsentRule] = field(default_factory=list)
    processing_rules: List[ProcessingRule] = field(default_factory=list)
    transfer_rules: List[DataTransferRule] = field(default_factory=list)
    retention_policies: Dict[DataCategory, RetentionPolicy] = field(default_factory=dict)
    rights_rules: List[RightRule] = field(default_factory=list)
    
    # Additional requirements
    requires_privacy_impact_assessment: bool = False
    requires_data_protection_officer: bool = False
    requires_incident_reporting: bool = True
    incident_reporting_days: int = 72  # GDPR default
    requires_breach_notification: bool = True
    breach_notification_threshold: int = 10  # Minimum records
    
    # Student-specific rules
    student_data_sharing_allowed: bool = False
    third_party_vendors_allowed: List[str] = field(default_factory=list)
    student_monitoring_allowed: bool = False
    student_profiling_allowed: bool = False
    student_targeting_allowed: bool = False
    
    version: str = "1.0"
    last_updated: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


class PrivacyComplianceChecker:
    """Checks if activities/lessons comply with privacy rules"""
    
    def __init__(self):
        self.configurations: Dict[str, JurisdictionConfig] = {}
        self.active_jurisdiction: Optional[str] = None
        logger.info("PrivacyComplianceChecker initialized")
    
    def register_jurisdiction(self, config: JurisdictionConfig):
        """Register a jurisdiction configuration"""
        self.configurations[config.jurisdiction_id] = config
        logger.info(f"Registered jurisdiction: {config.jurisdiction_id}")
    
    def set_active_jurisdiction(self, jurisdiction_id: str):
        """Set the active jurisdiction for checks"""
        if jurisdiction_id not in self.configurations:
            raise ValueError(f"Unknown jurisdiction: {jurisdiction_id}")
        self.active_jurisdiction = jurisdiction_id
        logger.info(f"Set active jurisdiction: {jurisdiction_id}")
    
    def check_activity_compliance(
        self,
        activity_id: str,
        activity_data: Dict[str, Any],
        student_age: int,
        jurisdiction_id: Optional[str] = None
    ) -> Tuple[bool, List[str], List[str]]:
        """
        Check if activity complies with privacy rules
        
        Args:
            activity_id: ID of activity
            activity_data: Activity data (uses data_collection, third_parties, etc.)
            student_age: Age of student
            jurisdiction_id: Jurisdiction to check against (uses active if not specified)
            
        Returns:
            (is_compliant, issues, warnings)
        """
        jurisdiction_id = jurisdiction_id or self.active_jurisdiction
        if not jurisdiction_id:
            return False, ["No jurisdiction configured"], []
        
        config = self.configurations.get(jurisdiction_id)
        if not config:
            return False, [f"Unknown jurisdiction: {jurisdiction_id}"], []
        
        issues = []
        warnings = []
        
        # Check data collection compliance
        collected_data = activity_data.get("data_collection", [])
        consent_issues, consent_warnings = self._check_consent(
            collected_data, student_age, config
        )
        issues.extend(consent_issues)
        warnings.extend(consent_warnings)
        
        # Check data processing
        processing_issues = self._check_processing(activity_data, config)
        issues.extend(processing_issues)
        
        # Check third-party compliance
        third_parties = activity_data.get("third_parties", [])
        transfer_issues = self._check_transfers(third_parties, config)
        issues.extend(transfer_issues)
        
        # Check age-specific rules
        age_issues = self._check_age_compliance(student_age, collected_data, config)
        issues.extend(age_issues)
        
        is_compliant = len(issues) == 0
        
        logger.info(
            f"Compliance check for {activity_id}: "
            f"compliant={is_compliant}, issues={len(issues)}, warnings={len(warnings)}"
        )
        
        return is_compliant, issues, warnings
    
    def _check_consent(
        self,
        data_categories: List[str],
        student_age: int,
        config: JurisdictionConfig
    ) -> Tuple[List[str], List[str]]:
        """Check consent requirements"""
        issues = []
        warnings = []
        
        for rule in config.consent_rules:
            # Check if any collected data matches this rule
            for data_cat in data_categories:
                try:
                    data_enum = DataCategory[data_cat.upper()]
                    if data_enum in rule.data_categories:
                        age_group = self._get_age_group(student_age)
                        
                        if age_group in rule.age_groups:
                            # This rule applies
                            if rule.consent_type == ConsentType.EXPLICIT:
                                issues.append(
                                    f"Explicit consent required for {data_cat} "
                                    f"from {age_group} students"
                                )
                            
                            if rule.requires_parental_consent and student_age < rule.parental_age_threshold:
                                issues.append(
                                    f"Parental consent required for {data_cat} "
                                    f"from students under {rule.parental_age_threshold}"
                                )
                            
                            if rule.transparency_required:
                                warnings.append(
                                    f"Transparency statement required for {data_cat}"
                                )
                except KeyError:
                    warnings.append(f"Unknown data category: {data_cat}")
        
        return issues, warnings
    
    def _check_processing(
        self,
        activity_data: Dict[str, Any],
        config: JurisdictionConfig
    ) -> List[str]:
        """Check data processing rules"""
        issues = []
        
        activity_purpose = activity_data.get("purpose", "unknown")
        
        for rule in config.processing_rules:
            collected_data = activity_data.get("data_collection", [])
            
            for data_cat in collected_data:
                try:
                    data_enum = DataCategory[data_cat.upper()]
                    if data_enum in rule.data_categories:
                        # Check if purpose is allowed
                        if activity_purpose in rule.forbidden_purposes:
                            issues.append(
                                f"Purpose '{activity_purpose}' is forbidden "
                                f"for {data_cat} data"
                            )
                        
                        if rule.requires_explicit_purpose and not activity_purpose:
                            issues.append(
                                f"Explicit purpose required for {data_cat} data"
                            )
                except KeyError:
                    pass
        
        return issues
    
    def _check_transfers(
        self,
        third_parties: List[str],
        config: JurisdictionConfig
    ) -> List[str]:
        """Check data transfer rules"""
        issues = []
        
        for rule in config.transfer_rules:
            for vendor in third_parties:
                if vendor not in rule.allowed_destinations:
                    if rule.requires_consent:
                        issues.append(
                            f"Explicit consent required to share data with {vendor}"
                        )
                    if rule.requires_model_clauses:
                        issues.append(
                            f"Standard Contractual Clauses required for {vendor}"
                        )
        
        return issues
    
    def _check_age_compliance(
        self,
        student_age: int,
        data_categories: List[str],
        config: JurisdictionConfig
    ) -> List[str]:
        """Check age-specific compliance"""
        issues = []
        
        # COPPA: Under 13 in US
        if student_age < 13 and config.framework == PrivacyFramework.COPPA:
            if "BEHAVIORAL" in data_categories or "LOCATION" in data_categories:
                issues.append("COPPA: Cannot collect behavioral/location data from under-13 students")
        
        # GDPR: Under 16 in EU (some countries 13-14)
        if student_age < 16 and config.framework == PrivacyFramework.GDPR:
            if "SPECIAL" in data_categories:
                issues.append("GDPR: Cannot process special category data from under-16 students without parental consent")
        
        return issues
    
    def _get_age_group(self, age: int) -> AgeGroup:
        """Get age group for student"""
        if age < 13:
            return AgeGroup.UNDER_13
        elif age < 16:
            return AgeGroup.UNDER_16
        elif age < 18:
            return AgeGroup.UNDER_18
        else:
            return AgeGroup.ADULT
    
    def get_applicable_rules(
        self,
        jurisdiction_id: Optional[str] = None
    ) -> JurisdictionConfig:
        """Get applicable rules for jurisdiction"""
        jurisdiction_id = jurisdiction_id or self.active_jurisdiction
        if not jurisdiction_id:
            raise ValueError("No jurisdiction configured")
        return self.configurations[jurisdiction_id]
    
    def generate_privacy_report(
        self,
        activity_id: str,
        activity_data: Dict[str, Any],
        student_age: int,
        jurisdiction_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate detailed privacy compliance report"""
        jurisdiction_id = jurisdiction_id or self.active_jurisdiction
        config = self.configurations.get(jurisdiction_id)
        
        is_compliant, issues, warnings = self.check_activity_compliance(
            activity_id, activity_data, student_age, jurisdiction_id
        )
        
        return {
            "activity_id": activity_id,
            "jurisdiction": jurisdiction_id,
            "framework": config.framework.value if config else None,
            "student_age": student_age,
            "timestamp": datetime.utcnow().isoformat(),
            "is_compliant": is_compliant,
            "issues": issues,
            "warnings": warnings,
            "required_actions": self._get_required_actions(issues),
            "data_retention": self._get_retention_info(activity_data, config),
            "consent_requirements": self._get_consent_requirements(activity_data, config, student_age)
        }
    
    def _get_required_actions(self, issues: List[str]) -> List[Dict[str, str]]:
        """Get required actions to become compliant"""
        actions = []
        for issue in issues:
            if "consent required" in issue.lower():
                actions.append({
                    "action": "obtain_consent",
                    "description": issue
                })
            elif "cannot collect" in issue.lower():
                actions.append({
                    "action": "remove_data_collection",
                    "description": issue
                })
        return actions
    
    def _get_retention_info(
        self,
        activity_data: Dict[str, Any],
        config: JurisdictionConfig
    ) -> Dict[str, Any]:
        """Get data retention information"""
        if not config:
            return {}
        
        retention_info = {}
        for data_cat_str in activity_data.get("data_collection", []):
            try:
                data_cat = DataCategory[data_cat_str.upper()]
                if data_cat in config.retention_policies:
                    policy = config.retention_policies[data_cat]
                    retention_info[data_cat_str] = {
                        "days": policy.duration_days,
                        "purpose": policy.purpose,
                        "deletion_method": policy.deletion_method
                    }
            except KeyError:
                pass
        
        return retention_info
    
    def _get_consent_requirements(
        self,
        activity_data: Dict[str, Any],
        config: JurisdictionConfig,
        student_age: int
    ) -> List[Dict[str, Any]]:
        """Get consent requirements for activity"""
        if not config:
            return []
        
        requirements = []
        data_categories = activity_data.get("data_collection", [])
        age_group = self._get_age_group(student_age)
        
        for rule in config.consent_rules:
            for data_cat_str in data_categories:
                try:
                    data_cat = DataCategory[data_cat_str.upper()]
                    if data_cat in rule.data_categories and age_group in rule.age_groups:
                        requirements.append({
                            "data_category": data_cat_str,
                            "consent_type": rule.consent_type.value,
                            "parental_consent": rule.requires_parental_consent,
                            "can_withdraw": rule.consent_withdrawal_allowed
                        })
                except KeyError:
                    pass
        
        return requirements


# Singleton instance
_privacy_checker: Optional[PrivacyComplianceChecker] = None


def get_privacy_checker() -> PrivacyComplianceChecker:
    """Get or create privacy checker singleton"""
    global _privacy_checker
    if _privacy_checker is None:
        _privacy_checker = PrivacyComplianceChecker()
    return _privacy_checker
