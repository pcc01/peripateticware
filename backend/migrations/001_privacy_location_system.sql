-- Copyright (c) 2026 Paul Christopher Cerda
-- This source code is licensed under the Business Source License 1.1
-- found in the LICENSE.md file in the root directory of this source tree.

-- Database Migration: Add Privacy Engine and Location System Tables
-- Run this after updating your models in database.py

-- ============================================================================
-- LOCATION SYSTEM TABLES
-- ============================================================================

-- CachedLocation table
CREATE TABLE IF NOT EXISTS cached_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    location_type VARCHAR(100),
    address VARCHAR(512),
    place_id VARCHAR(255) UNIQUE,
    rating FLOAT,
    user_ratings_total INTEGER,
    source VARCHAR(50),
    search_region VARCHAR(255),
    search_latitude FLOAT,
    search_longitude FLOAT,
    search_radius_meters INTEGER,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 1,
    CONSTRAINT fk_cached_location_valid CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_cached_locations_name ON cached_locations(name);
CREATE INDEX idx_cached_locations_type ON cached_locations(location_type);
CREATE INDEX idx_cached_locations_place ON cached_locations(place_id);
CREATE INDEX idx_cached_locations_region ON cached_locations(search_region);
CREATE INDEX idx_cached_locations_accessed ON cached_locations(last_accessed);
CREATE INDEX idx_cached_locations_geo ON cached_locations(latitude, longitude);


-- EnrichedLocation table
CREATE TABLE IF NOT EXISTS enriched_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cached_location_id UUID UNIQUE,
    subjects TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    learning_opportunities TEXT[] DEFAULT '{}',
    grade_levels INTEGER[] DEFAULT '{}',
    best_for_subjects TEXT[] DEFAULT '{}',
    safety_considerations TEXT[] DEFAULT '{}',
    accessibility JSONB DEFAULT '{}',
    nearby_attractions TEXT[] DEFAULT '{}',
    description TEXT,
    image_url VARCHAR(512),
    wikipedia_url VARCHAR(512),
    wikidata_id VARCHAR(100),
    architect_or_artist VARCHAR(255),
    construction_date VARCHAR(100),
    historical_significance TEXT,
    enriched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enrichment_source VARCHAR(50),
    enrichment_quality FLOAT DEFAULT 0.0,
    teacher_rating FLOAT,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    created_lessons INTEGER DEFAULT 0,
    FOREIGN KEY (cached_location_id) REFERENCES cached_locations(id) ON DELETE CASCADE
);

CREATE INDEX idx_enriched_locations_cached ON enriched_locations(cached_location_id);
CREATE INDEX idx_enriched_locations_enriched_at ON enriched_locations(enriched_at);
CREATE INDEX idx_enriched_locations_quality ON enriched_locations(enrichment_quality);
CREATE INDEX idx_enriched_locations_usage ON enriched_locations(usage_count);
CREATE INDEX idx_enriched_locations_subjects ON enriched_locations USING GIN(subjects);


-- LocationSearchHistory table
CREATE TABLE IF NOT EXISTS location_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    radius_meters INTEGER DEFAULT 5000,
    search_query VARCHAR(255),
    results_count INTEGER DEFAULT 0,
    cached_count INTEGER DEFAULT 0,
    enriched_count INTEGER DEFAULT 0,
    teacher_id UUID,
    activity_id UUID,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL
);

CREATE INDEX idx_location_search_geo ON location_search_history(latitude, longitude);
CREATE INDEX idx_location_search_timestamp ON location_search_history(timestamp);
CREATE INDEX idx_location_search_teacher ON location_search_history(teacher_id);
CREATE INDEX idx_location_search_activity ON location_search_history(activity_id);


-- PopularDestinations table (materialized view backing)
CREATE TABLE IF NOT EXISTS popular_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enriched_location_id UUID UNIQUE,
    region VARCHAR(255),
    latitude FLOAT,
    longitude FLOAT,
    total_searches INTEGER DEFAULT 0,
    total_lessons_generated INTEGER DEFAULT 0,
    unique_teachers INTEGER DEFAULT 0,
    avg_teacher_rating FLOAT DEFAULT 0.0,
    avg_lesson_quality FLOAT DEFAULT 0.0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    FOREIGN KEY (enriched_location_id) REFERENCES enriched_locations(id) ON DELETE CASCADE
);

CREATE INDEX idx_popular_region ON popular_destinations(region);
CREATE INDEX idx_popular_updated ON popular_destinations(last_updated);
CREATE INDEX idx_popular_lessons ON popular_destinations(total_lessons_generated);


-- LocationEnrichmentQueue table
CREATE TABLE IF NOT EXISTS location_enrichment_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cached_location_id UUID UNIQUE,
    priority INTEGER DEFAULT 0,
    search_count INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_for TIMESTAMP,
    processed_at TIMESTAMP,
    FOREIGN KEY (cached_location_id) REFERENCES cached_locations(id) ON DELETE CASCADE
);

CREATE INDEX idx_enrichment_queue_status ON location_enrichment_queue(status);
CREATE INDEX idx_enrichment_queue_priority ON location_enrichment_queue(priority DESC);
CREATE INDEX idx_enrichment_queue_scheduled ON location_enrichment_queue(scheduled_for);


-- ActivityLocations junction table
CREATE TABLE IF NOT EXISTS activity_locations (
    activity_id UUID NOT NULL,
    cached_location_id UUID NOT NULL,
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lesson_generated BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (activity_id, cached_location_id),
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    FOREIGN KEY (cached_location_id) REFERENCES cached_locations(id) ON DELETE CASCADE
);

CREATE INDEX idx_activity_locations_activity ON activity_locations(activity_id);
CREATE INDEX idx_activity_locations_location ON activity_locations(cached_location_id);


-- ============================================================================
-- PRIVACY ENGINE TABLES
-- ============================================================================

-- ComplianceCheck table
CREATE TABLE IF NOT EXISTS compliance_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID,
    jurisdiction_id VARCHAR(100),
    framework VARCHAR(50),
    student_age INTEGER,
    is_compliant BOOLEAN DEFAULT FALSE,
    issues TEXT[] DEFAULT '{}',
    warnings TEXT[] DEFAULT '{}',
    required_actions JSONB DEFAULT '{}',
    data_collection TEXT[] DEFAULT '{}',
    third_parties TEXT[] DEFAULT '{}',
    activity_purpose VARCHAR(255),
    checked_by_user_id UUID,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_compliance_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    CONSTRAINT fk_compliance_user FOREIGN KEY (checked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_compliance_activity ON compliance_checks(activity_id);
CREATE INDEX idx_compliance_jurisdiction ON compliance_checks(jurisdiction_id);
CREATE INDEX idx_compliance_timestamp ON compliance_checks(timestamp);


-- ConsentLog table
CREATE TABLE IF NOT EXISTS consent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    activity_id UUID,
    consent_type VARCHAR(50),
    data_categories TEXT[] DEFAULT '{}',
    purpose VARCHAR(255),
    jurisdiction_id VARCHAR(100),
    given_by_student BOOLEAN DEFAULT FALSE,
    given_by_parent BOOLEAN DEFAULT FALSE,
    parent_id UUID,
    consent_given_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    withdrawn_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent VARCHAR(512),
    CONSTRAINT fk_consent_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_consent_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL,
    CONSTRAINT fk_consent_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_consent_student ON consent_logs(student_id);
CREATE INDEX idx_consent_activity ON consent_logs(activity_id);
CREATE INDEX idx_consent_jurisdiction ON consent_logs(jurisdiction_id);
CREATE INDEX idx_consent_timestamp ON consent_logs(consent_given_at);


-- DataRetentionPolicy table
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID,
    jurisdiction_id VARCHAR(100),
    data_category VARCHAR(100),
    retention_days INTEGER NOT NULL,
    purpose VARCHAR(255),
    deletion_method VARCHAR(50),
    can_archive BOOLEAN DEFAULT FALSE,
    archive_duration_days INTEGER,
    effective_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deletion_scheduled_for TIMESTAMP,
    deletion_completed_at TIMESTAMP,
    CONSTRAINT fk_retention_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
);

CREATE INDEX idx_retention_activity ON data_retention_policies(activity_id);
CREATE INDEX idx_retention_jurisdiction ON data_retention_policies(jurisdiction_id);
CREATE INDEX idx_retention_scheduled ON data_retention_policies(deletion_scheduled_for);


-- PrivacyConfiguration table
CREATE TABLE IF NOT EXISTS privacy_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id VARCHAR(100) UNIQUE,
    jurisdiction_name VARCHAR(255),
    framework VARCHAR(50),
    country_code VARCHAR(2),
    subdivision_code VARCHAR(10),
    config_json JSONB NOT NULL,
    version VARCHAR(20),
    effective_date TIMESTAMP NOT NULL,
    sunset_date TIMESTAMP,
    source_url VARCHAR(512),
    auto_discovered BOOLEAN DEFAULT FALSE,
    loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_privacy_config_jurisdiction ON privacy_configurations(jurisdiction_id);
CREATE INDEX idx_privacy_config_framework ON privacy_configurations(framework);
CREATE INDEX idx_privacy_config_country ON privacy_configurations(country_code);


-- ============================================================================
-- UPDATES TO EXISTING TABLES
-- ============================================================================

-- Add columns to activities table if they don't exist
ALTER TABLE activities ADD COLUMN IF NOT EXISTS enriched_location_id UUID;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_source VARCHAR(50);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS privacy_jurisdiction_id VARCHAR(100);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS privacy_compliant BOOLEAN DEFAULT FALSE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS last_compliance_check TIMESTAMP;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_activities_location ON activities(enriched_location_id);
CREATE INDEX IF NOT EXISTS idx_activities_jurisdiction ON activities(privacy_jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_activities_compliance ON activities(privacy_compliant);

-- Add foreign key if not exists (this might fail if constraint already exists - that's OK)
DO $$
BEGIN
    ALTER TABLE activities 
    ADD CONSTRAINT fk_activities_enriched_location 
    FOREIGN KEY (enriched_location_id) REFERENCES enriched_locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
    -- Constraint already exists
    NULL;
END
$$;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Verify all tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'cached_locations', 'enriched_locations', 'location_search_history',
    'popular_destinations', 'location_enrichment_queue', 'activity_locations',
    'compliance_checks', 'consent_logs', 'data_retention_policies',
    'privacy_configurations'
)
ORDER BY table_name;
