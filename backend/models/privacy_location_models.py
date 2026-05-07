# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
ADDITIONS TO database.py FOR PRIVACY ENGINE AND LOCATION CACHING
Add these models to your existing database.py file
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, ForeignKey, Text, JSON, Index, Enum
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime
import uuid
import enum


# ============================================================================
# LOCATION SYSTEM MODELS (NEW)
# ============================================================================

class CachedLocation(Base):
    """
    Cached location from geographic search (OSM, Nominatim, etc.)
    Pre-fetched for fast reuse
    """
    __tablename__ = "cached_locations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Location info
    name = Column(String(255), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_type = Column(String(100), index=True)  # museum, park, statue, historic, etc.
    address = Column(String(512))
    place_id = Column(String(255), unique=True, index=True)  # OSM/Google ID
    
    # Metadata
    rating = Column(Float, nullable=True)
    user_ratings_total = Column(Integer, nullable=True)
    source = Column(String(50), index=True)  # osm, nominatim, wikidata, google, etc.
    
    # Search context
    search_region = Column(String(255), index=True)
    search_latitude = Column(Float, index=True)
    search_longitude = Column(Float, index=True)
    search_radius_meters = Column(Integer)
    
    # Caching
    cached_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_accessed = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    access_count = Column(Integer, default=1)
    
    # Relationships
    enriched_data = relationship("EnrichedLocation", uselist=False, back_populates="cached_location")
    activities_using = relationship("Activity", secondary="activity_locations", back_populates="cached_locations")
    
    __table_args__ = (
        Index('idx_cached_locations_geo', 'latitude', 'longitude'),
        Index('idx_cached_locations_type', 'location_type'),
    )


class EnrichedLocation(Base):
    """
    Location enriched with educational data
    Added subjects, learning opportunities, images, etc. from Wikipedia/Wikidata
    """
    __tablename__ = "enriched_locations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cached_location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"), unique=True)
    
    # Educational enrichment
    subjects = Column(ARRAY(String), default=list)
    keywords = Column(ARRAY(String), default=list)
    learning_opportunities = Column(ARRAY(String), default=list)
    grade_levels = Column(ARRAY(Integer), default=list)
    best_for_subjects = Column(ARRAY(String), default=list)
    
    # Practical info
    safety_considerations = Column(ARRAY(String), default=list)
    accessibility = Column(JSONB, default={})
    nearby_attractions = Column(ARRAY(String), default=list)
    
    # Rich data
    description = Column(Text, nullable=True)
    image_url = Column(String(512), nullable=True)
    wikipedia_url = Column(String(512), nullable=True)
    wikidata_id = Column(String(100), nullable=True)
    architect_or_artist = Column(String(255), nullable=True)
    construction_date = Column(String(100), nullable=True)
    historical_significance = Column(Text, nullable=True)
    
    # Enrichment metadata
    enriched_at = Column(DateTime, default=datetime.utcnow, index=True)
    enrichment_source = Column(String(50))  # rag, llm, heuristics
    enrichment_quality = Column(Float, default=0.0)
    teacher_rating = Column(Float, nullable=True)
    
    # Usage tracking
    usage_count = Column(Integer, default=0)
    last_used = Column(DateTime, nullable=True)
    created_lessons = Column(Integer, default=0)
    
    # Relationships
    cached_location = relationship("CachedLocation", back_populates="enriched_data")
    
    __table_args__ = (
        Index('idx_enriched_locations_subjects', 'subjects'),
        Index('idx_enriched_locations_usage', 'usage_count'),
    )


class LocationSearchHistory(Base):
    """
    Track location searches for analytics and popular destinations
    """
    __tablename__ = "location_search_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Search parameters
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_meters = Column(Integer, default=5000)
    search_query = Column(String(255), nullable=True)
    
    # Results
    results_count = Column(Integer, default=0)
    cached_count = Column(Integer, default=0)
    enriched_count = Column(Integer, default=0)
    
    # Metadata
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    __table_args__ = (
        Index('idx_location_search_geo', 'latitude', 'longitude'),
        Index('idx_location_search_timestamp', 'timestamp'),
        Index('idx_location_search_teacher', 'teacher_id'),
    )


class PopularDestinations(Base):
    """
    Materialized view of popular locations
    Updated periodically, helps identify frequently used spots
    """
    __tablename__ = "popular_destinations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enriched_location_id = Column(UUID(as_uuid=True), ForeignKey("enriched_locations.id"), unique=True)
    
    # Region tracking
    region = Column(String(255), index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    
    # Popularity metrics
    total_searches = Column(Integer, default=0)
    total_lessons_generated = Column(Integer, default=0)
    unique_teachers = Column(Integer, default=0)
    
    # Quality metrics
    avg_teacher_rating = Column(Float, default=0.0)
    avg_lesson_quality = Column(Float, default=0.0)
    
    # Recency
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    last_used = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index('idx_popular_region', 'region'),
        Index('idx_popular_metrics', 'total_lessons_generated'),
    )


class LocationEnrichmentQueue(Base):
    """
    Background job queue for enriching locations
    Prioritized by usage/popularity
    """
    __tablename__ = "location_enrichment_queue"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cached_location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"), unique=True)
    
    # Priority (higher = process first)
    priority = Column(Integer, default=0)
    search_count = Column(Integer, default=1)
    
    # Processing
    status = Column(String(50), default='pending')  # pending, processing, completed, failed
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    last_error = Column(Text, nullable=True)
    
    # Scheduling
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    scheduled_for = Column(DateTime, index=True)
    processed_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index('idx_enrichment_queue_status', 'status'),
        Index('idx_enrichment_queue_priority', 'priority'),
    )


# ============================================================================
# PRIVACY ENGINE MODELS (NEW)
# ============================================================================

class PrivacyFramework(str, enum.Enum):
    """Supported privacy frameworks"""
    GDPR = "gdpr"
    CCPA = "ccpa"
    COPPA = "coppa"
    PIPEDA = "pipeda"
    LGPD = "lgpd"
    PDPA = "pdpa"
    CUSTOM = "custom"


class ComplianceCheck(Base):
    """
    Record of privacy compliance checks performed
    Audit trail for regulatory compliance
    """
    __tablename__ = "compliance_checks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    
    # Check details
    jurisdiction_id = Column(String(100), index=True)
    framework = Column(Enum(PrivacyFramework))
    student_age = Column(Integer)
    
    # Results
    is_compliant = Column(Boolean, default=False)
    issues = Column(ARRAY(String), default=list)
    warnings = Column(ARRAY(String), default=list)
    required_actions = Column(JSONB, default={})
    
    # Data collected in activity
    data_collection = Column(ARRAY(String), default=list)
    third_parties = Column(ARRAY(String), default=list)
    activity_purpose = Column(String(255))
    
    # Metadata
    checked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    __table_args__ = (
        Index('idx_compliance_activity', 'activity_id'),
        Index('idx_compliance_jurisdiction', 'jurisdiction_id'),
        Index('idx_compliance_timestamp', 'timestamp'),
    )


class ConsentLog(Base):
    """
    Track student/parent consent
    Required for privacy compliance
    """
    __tablename__ = "consent_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True, nullable=True)
    
    # Consent details
    consent_type = Column(String(50))  # explicit, implied, parental, etc.
    data_categories = Column(ARRAY(String), default=list)
    purpose = Column(String(255))
    jurisdiction_id = Column(String(100), index=True)
    
    # Approval
    given_by_student = Column(Boolean, default=False)
    given_by_parent = Column(Boolean, default=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Timeline
    consent_given_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    withdrawn_at = Column(DateTime, nullable=True)
    
    # Metadata
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(512), nullable=True)
    
    __table_args__ = (
        Index('idx_consent_student', 'student_id'),
        Index('idx_consent_activity', 'activity_id'),
        Index('idx_consent_jurisdiction', 'jurisdiction_id'),
    )


class DataRetentionPolicy(Base):
    """
    Define how long each type of data is retained
    Automated deletion/anonymization
    """
    __tablename__ = "data_retention_policies"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    jurisdiction_id = Column(String(100), index=True)
    
    # Data categories
    data_category = Column(String(100))  # identity, contact, behavioral, location, etc.
    
    # Retention rules
    retention_days = Column(Integer, nullable=False)
    purpose = Column(String(255))
    deletion_method = Column(String(50))  # delete, anonymize, archive, etc.
    can_archive = Column(Boolean, default=False)
    archive_duration_days = Column(Integer, nullable=True)
    
    # Metadata
    effective_date = Column(DateTime, default=datetime.utcnow)
    deletion_scheduled_for = Column(DateTime, nullable=True)
    deletion_completed_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index('idx_retention_activity', 'activity_id'),
        Index('idx_retention_jurisdiction', 'jurisdiction_id'),
        Index('idx_retention_scheduled', 'deletion_scheduled_for'),
    )


class PrivacyConfiguration(Base):
    """
    Loaded privacy configurations for jurisdictions
    Auto-updated from IAPP crawler
    """
    __tablename__ = "privacy_configurations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jurisdiction_id = Column(String(100), unique=True, index=True)
    jurisdiction_name = Column(String(255))
    framework = Column(Enum(PrivacyFramework))
    country_code = Column(String(2), index=True)
    subdivision_code = Column(String(10), nullable=True)
    
    # Configuration
    config_json = Column(JSONB, nullable=False)
    
    # Versioning
    version = Column(String(20))
    effective_date = Column(DateTime, nullable=False)
    sunset_date = Column(DateTime, nullable=True)
    
    # Metadata
    source_url = Column(String(512), nullable=True)
    auto_discovered = Column(Boolean, default=False)
    loaded_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_privacy_config_framework', 'framework'),
        Index('idx_privacy_config_country', 'country_code'),
    )


# ============================================================================
# UPDATE TO EXISTING Activity MODEL
# ============================================================================

# Add these columns to the existing Activity model:
# 
# enriched_location_id = Column(UUID(as_uuid=True), ForeignKey("enriched_locations.id"), nullable=True)
# location_source = Column(String(50))  # Track where location came from: osm, nominatim, wikidata, google
# privacy_jurisdiction_id = Column(String(100), index=True)  # For privacy compliance tracking
# privacy_compliant = Column(Boolean, default=False)  # Last known compliance status
# last_compliance_check = Column(DateTime, nullable=True)  # When last checked
#
# # New relationships
# cached_locations = relationship("CachedLocation", secondary="activity_locations", back_populates="activities_using")
# compliance_checks = relationship("ComplianceCheck", back_populates="activity")
# consent_logs = relationship("ConsentLog", back_populates="activity")
# retention_policies = relationship("DataRetentionPolicy", back_populates="activity")

# ============================================================================
# JUNCTION TABLES
# ============================================================================

class ActivityLocations(Base):
    """
    Junction table: Activities using cached locations
    Tracks which locations teachers use for lessons
    """
    __tablename__ = "activity_locations"
    
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), primary_key=True)
    cached_location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"), primary_key=True)
    
    # Usage info
    selected_at = Column(DateTime, default=datetime.utcnow)
    lesson_generated = Column(Boolean, default=False)
