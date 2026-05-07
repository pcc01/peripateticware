# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
IAPP Privacy Crawler
Automatically fetches new privacy regulations from IAPP and generates JSON configs
Runs weekly by default, can be configured in .env
"""

import logging
import json
import httpx
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from enum import Enum
import hashlib
import asyncio

logger = logging.getLogger(__name__)


class RegulationType(str, Enum):
    """Type of regulation change"""
    NEW = "new"              # New regulation added
    UPDATE = "update"        # Existing regulation updated
    SUNSET = "sunset"        # Regulation expiring/sunset
    CLARIFICATION = "clarification"  # Clarification to existing


class PrivacyRegulation:
    """Parsed privacy regulation"""
    
    def __init__(
        self,
        jurisdiction_id: str,
        jurisdiction_name: str,
        framework: str,
        country_code: str,
        subdivision_code: Optional[str] = None,
        regulation_type: RegulationType = RegulationType.NEW,
        effective_date: Optional[str] = None,
        sunset_date: Optional[str] = None,
        source_url: Optional[str] = None,
        description: Optional[str] = None,
        key_points: Optional[List[str]] = None
    ):
        self.jurisdiction_id = jurisdiction_id
        self.jurisdiction_name = jurisdiction_name
        self.framework = framework
        self.country_code = country_code
        self.subdivision_code = subdivision_code
        self.regulation_type = regulation_type
        self.effective_date = effective_date
        self.sunset_date = sunset_date
        self.source_url = source_url
        self.description = description
        self.key_points = key_points or []
        self.discovered_at = datetime.utcnow().isoformat()
    
    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "jurisdiction_id": self.jurisdiction_id,
            "jurisdiction_name": self.jurisdiction_name,
            "framework": self.framework,
            "country_code": self.country_code,
            "subdivision_code": self.subdivision_code,
            "regulation_type": self.regulation_type.value,
            "effective_date": self.effective_date,
            "sunset_date": self.sunset_date,
            "source_url": self.source_url,
            "description": self.description,
            "key_points": self.key_points,
            "discovered_at": self.discovered_at
        }


class IAPPPrivacyCrawler:
    """Crawls IAPP for new privacy regulations"""
    
    def __init__(self, config_directory: str = "config/jurisdictions"):
        self.config_directory = Path(config_directory)
        self.config_directory.mkdir(parents=True, exist_ok=True)
        
        # Track what we've seen
        self.seen_hashes: Dict[str, str] = {}
        self._load_seen_hashes()
        
        logger.info(f"IAPPPrivacyCrawler initialized at {self.config_directory}")
    
    def _load_seen_hashes(self):
        """Load hashes of previously crawled regulations"""
        hashes_file = self.config_directory / ".crawler_hashes.json"
        if hashes_file.exists():
            try:
                with open(hashes_file, 'r') as f:
                    self.seen_hashes = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load crawler hashes: {e}")
    
    def _save_seen_hashes(self):
        """Save hashes of crawled regulations"""
        hashes_file = self.config_directory / ".crawler_hashes.json"
        try:
            with open(hashes_file, 'w') as f:
                json.dump(self.seen_hashes, f, indent=2)
        except Exception as e:
            logger.error(f"Could not save crawler hashes: {e}")
    
    def _hash_content(self, content: str) -> str:
        """Hash content to detect changes"""
        return hashlib.md5(content.encode()).hexdigest()
    
    async def crawl_iapp_legislation_tracker(self) -> List[PrivacyRegulation]:
        """
        Crawl IAPP Global AI Legislation Tracker
        https://iapp.org/resources/article/global-ai-legislation-tracker
        """
        regulations = []
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://iapp.org/resources/article/global-ai-legislation-tracker",
                    timeout=30,
                    headers={"User-Agent": "PeripateticwarePrivacyCrawler/1.0"}
                )
                
                if response.status_code == 200:
                    # Parse HTML content
                    regulations.extend(
                        self._parse_legislation_tracker(response.text)
                    )
                    logger.info("Successfully crawled IAPP Legislation Tracker")
                else:
                    logger.warning(f"IAPP Tracker returned status {response.status_code}")
        
        except Exception as e:
            logger.error(f"Error crawling IAPP Legislation Tracker: {e}")
        
        return regulations
    
    async def crawl_iapp_privacy_directory(self) -> List[PrivacyRegulation]:
        """
        Crawl IAPP Global Privacy Directory
        https://iapp.org/resources/global-privacy-directory
        """
        regulations = []
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://iapp.org/resources/global-privacy-directory",
                    timeout=30,
                    headers={"User-Agent": "PeripateticwarePrivacyCrawler/1.0"}
                )
                
                if response.status_code == 200:
                    # Parse HTML content
                    regulations.extend(
                        self._parse_privacy_directory(response.text)
                    )
                    logger.info("Successfully crawled IAPP Privacy Directory")
                else:
                    logger.warning(f"IAPP Directory returned status {response.status_code}")
        
        except Exception as e:
            logger.error(f"Error crawling IAPP Privacy Directory: {e}")
        
        return regulations
    
    def _parse_legislation_tracker(self, html: str) -> List[PrivacyRegulation]:
        """
        Parse IAPP Legislation Tracker HTML
        
        This is a simplified parser - actual implementation would use BeautifulSoup
        to extract table rows, jurisdiction info, dates, etc.
        """
        regulations = []
        
        # TODO: Use BeautifulSoup to parse actual HTML
        # For now, return empty list as placeholder
        # Actual parsing would:
        # 1. Find all table rows with jurisdiction data
        # 2. Extract: Jurisdiction, Framework, Effective Date, Status
        # 3. Create PrivacyRegulation objects
        # 4. Return list
        
        logger.info("Legislation Tracker parsing placeholder - implement HTML parsing")
        return regulations
    
    def _parse_privacy_directory(self, html: str) -> List[PrivacyRegulation]:
        """
        Parse IAPP Global Privacy Directory HTML
        
        This is a simplified parser - actual implementation would use BeautifulSoup
        to extract directory entries with jurisdiction info.
        """
        regulations = []
        
        # TODO: Use BeautifulSoup to parse actual HTML
        # For now, return empty list as placeholder
        # Actual parsing would:
        # 1. Find all directory entries
        # 2. Extract: Jurisdiction, Law Name, Effective Date, Link
        # 3. Create PrivacyRegulation objects
        # 4. Return list
        
        logger.info("Privacy Directory parsing placeholder - implement HTML parsing")
        return regulations
    
    async def fetch_all_regulations(self, sources: List[str]) -> List[PrivacyRegulation]:
        """
        Fetch regulations from all configured sources
        
        Args:
            sources: List of source URLs to crawl
            
        Returns:
            List of discovered regulations
        """
        all_regulations = []
        
        for source in sources:
            if "legislation-tracker" in source:
                regulations = await self.crawl_iapp_legislation_tracker()
                all_regulations.extend(regulations)
            elif "privacy-directory" in source:
                regulations = await self.crawl_iapp_privacy_directory()
                all_regulations.extend(regulations)
            elif source.startswith("http"):
                # Custom source - try generic crawl
                logger.info(f"Crawling custom source: {source}")
                # TODO: Implement generic crawling for custom sources
        
        return all_regulations
    
    def detect_changes(self, regulations: List[PrivacyRegulation]) -> Tuple[List[PrivacyRegulation], List[str]]:
        """
        Detect new and updated regulations
        
        Returns:
            (new_regulations, changed_regulation_ids)
        """
        new_regulations = []
        changed_ids = []
        
        for reg in regulations:
            content = json.dumps(reg.to_dict(), sort_keys=True)
            current_hash = self._hash_content(content)
            
            reg_id = reg.jurisdiction_id
            previous_hash = self.seen_hashes.get(reg_id)
            
            if previous_hash is None:
                # New regulation
                new_regulations.append(reg)
                changed_ids.append(f"NEW: {reg_id}")
            elif previous_hash != current_hash:
                # Updated regulation
                new_regulations.append(reg)
                changed_ids.append(f"UPDATED: {reg_id}")
            
            # Update hash
            self.seen_hashes[reg_id] = current_hash
        
        return new_regulations, changed_ids
    
    def generate_json_config(self, regulation: PrivacyRegulation) -> Dict:
        """
        Generate JSON configuration from regulation
        
        Creates a template that can be customized before loading
        """
        return {
            "jurisdiction_id": regulation.jurisdiction_id,
            "jurisdiction_name": regulation.jurisdiction_name,
            "framework": regulation.framework,
            "country_code": regulation.country_code,
            "subdivision_code": regulation.subdivision_code,
            "effective_date": regulation.effective_date,
            "sunset_date": regulation.sunset_date,
            "version": "1.0",
            "metadata": {
                "source": regulation.source_url,
                "description": regulation.description,
                "key_points": regulation.key_points,
                "discovered_at": regulation.discovered_at,
                "status": "pending_review"
            },
            "consent_rules": [
                {
                    "data_categories": ["identity", "contact", "educational"],
                    "age_groups": ["under_13", "under_16", "under_18", "adult"],
                    "consent_type": "explicit",
                    "requires_parental_consent": False,
                    "consent_withdrawal_allowed": True,
                    "transparency_required": True
                }
            ],
            "processing_rules": [],
            "transfer_rules": [],
            "retention_policies": {},
            "rights_rules": [
                {
                    "right_name": "access",
                    "must_comply_within_days": 30,
                    "can_charge": False,
                    "exemptions": []
                }
            ],
            "requires_privacy_impact_assessment": False,
            "requires_data_protection_officer": False,
            "requires_incident_reporting": True,
            "incident_reporting_days": 72,
            "requires_breach_notification": True,
            "breach_notification_threshold": 1,
            "student_data_sharing_allowed": False,
            "third_party_vendors_allowed": [],
            "student_monitoring_allowed": False,
            "student_profiling_allowed": False,
            "student_targeting_allowed": False,
            "notes": "AUTO-GENERATED - REQUIRES MANUAL REVIEW AND CUSTOMIZATION BEFORE LOADING"
        }
    
    async def save_pending_regulations(
        self,
        regulations: List[PrivacyRegulation],
        target_dir: Optional[str] = None
    ) -> List[str]:
        """
        Save regulations to pending folder for review
        
        Returns:
            List of saved file paths
        """
        if target_dir is None:
            target_dir = str(self.config_directory / "pending")
        
        pending_dir = Path(target_dir)
        pending_dir.mkdir(parents=True, exist_ok=True)
        
        saved_files = []
        
        for reg in regulations:
            config = self.generate_json_config(reg)
            
            filename = f"{reg.jurisdiction_id}_pending.json"
            filepath = pending_dir / filename
            
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(config, f, indent=2)
                
                saved_files.append(str(filepath))
                logger.info(f"Saved pending regulation: {filepath}")
            
            except Exception as e:
                logger.error(f"Error saving regulation {reg.jurisdiction_id}: {e}")
        
        # Save hashes
        self._save_seen_hashes()
        
        return saved_files
    
    async def load_regulation(
        self,
        config_dict: Dict,
        auto_load: bool = False
    ) -> bool:
        """
        Load a regulation configuration into active directory
        
        Args:
            config_dict: Configuration dictionary
            auto_load: If True, auto-load after approval
            
        Returns:
            True if successful
        """
        try:
            jurisdiction_id = config_dict.get("jurisdiction_id")
            
            if auto_load:
                filepath = self.config_directory / f"{jurisdiction_id}.json"
            else:
                filepath = self.config_directory / "pending" / f"{jurisdiction_id}_pending.json"
            
            filepath.parent.mkdir(parents=True, exist_ok=True)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(config_dict, f, indent=2)
            
            logger.info(f"Loaded regulation: {filepath}")
            return True
        
        except Exception as e:
            logger.error(f"Error loading regulation: {e}")
            return False


# Async runner for scheduled crawling
async def run_privacy_crawler(
    sources: List[str],
    config_directory: str = "config/jurisdictions",
    auto_load: bool = False,
    notify_callback = None
) -> Dict:
    """
    Run the privacy crawler
    
    Args:
        sources: List of source URLs
        config_directory: Where to save configs
        auto_load: Auto-load regulations after discovery
        notify_callback: Callback function for notifications
        
    Returns:
        Result dictionary with stats
    """
    try:
        crawler = IAPPPrivacyCrawler(config_directory)
        
        # Fetch regulations
        logger.info("Starting privacy crawler...")
        regulations = await crawler.fetch_all_regulations(sources)
        
        if not regulations:
            logger.info("No regulations found")
            return {
                "success": True,
                "new_regulations": 0,
                "updated_regulations": 0,
                "total_regulations": 0,
                "message": "Crawler ran successfully but found no new regulations"
            }
        
        # Detect changes
        new_regs, changed_ids = crawler.detect_changes(regulations)
        
        if new_regs:
            # Save pending
            saved_files = await crawler.save_pending_regulations(new_regs)
            
            # Notify admin
            if notify_callback:
                await notify_callback({
                    "type": "privacy_regulations_found",
                    "count": len(new_regs),
                    "changes": changed_ids,
                    "files": saved_files
                })
            
            logger.info(f"Found {len(new_regs)} new/updated regulations")
            
            return {
                "success": True,
                "new_regulations": sum(1 for c in changed_ids if c.startswith("NEW")),
                "updated_regulations": sum(1 for c in changed_ids if c.startswith("UPDATED")),
                "total_regulations": len(new_regs),
                "changes": changed_ids,
                "saved_files": saved_files,
                "message": f"Found {len(new_regs)} new/updated privacy regulations"
            }
        else:
            logger.info("No new or updated regulations found")
            return {
                "success": True,
                "new_regulations": 0,
                "updated_regulations": 0,
                "total_regulations": 0,
                "message": "No new or updated regulations found"
            }
    
    except Exception as e:
        logger.error(f"Privacy crawler error: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": f"Privacy crawler failed: {e}"
        }


if __name__ == "__main__":
    # Test crawler
    import sys
    
    sources = [
        "https://iapp.org/resources/article/global-ai-legislation-tracker",
        "https://iapp.org/resources/global-privacy-directory"
    ]
    
    result = asyncio.run(run_privacy_crawler(sources))
    print(json.dumps(result, indent=2))
