# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Extended Pydantic schemas for Phase 5 activity features:
- AI-powered activity generation (Ollama / Claude)
- Multi-taxonomy alignment (Bloom's, Marzano, DoK, SOLO)
- Discovery / scavenger-hunt mode
- WikiLocation context
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


# ============================================================================
# ENUMS
# ============================================================================

class TaxonomyFramework(str, Enum):
    BLOOMS   = "blooms"
    MARZANO  = "marzano"
    DOK      = "dok"
    SOLO     = "solo"
    CUSTOM   = "custom"


class DiscoveryModeEnum(str, Enum):
    LOCATION_BASED = "location_based"
    TASK_BASED     = "task_based"


# ============================================================================
# TAXONOMY INFO
# ============================================================================

class TaxonomyInfo(BaseModel):
    """Information about a single taxonomy framework level"""
    framework: TaxonomyFramework
    level: int
    label: str
    description: str
    verbs: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ============================================================================
# EXTENDED ACTIVITY BASE
# (adds Phase 5 fields on top of the core ActivityBase)
# ============================================================================

class ActivityBaseExtended(BaseModel):
    """
    Extended activity schema that carries Phase 5 fields.
    Used as the base for generation requests and rich responses.
    """
    # Taxonomy
    marzano_level: Optional[int] = Field(None, ge=1, le=4,
        description="Marzano taxonomy level (1-4)")
    dok_level: Optional[int] = Field(None, ge=1, le=4,
        description="Depth of Knowledge level (1-4)")
    solo_level: Optional[int] = Field(None, ge=1, le=5,
        description="SOLO taxonomy level (1-5)")
    primary_framework: TaxonomyFramework = TaxonomyFramework.BLOOMS
    custom_framework_data: Optional[Dict[str, Any]] = None

    # Discovery mode
    discovery_mode: Optional[DiscoveryModeEnum] = None
    discovery_task_description: Optional[str] = None
    discovery_location_required: bool = False
    discovery_documentation_requirements: Optional[Dict[str, Any]] = None
    discovery_success_criteria: Optional[str] = None
    discovery_difficulty_level: Optional[int] = Field(None, ge=1, le=4)
    discovery_time_limit_minutes: Optional[int] = None

    # Privacy / compliance
    privacy_jurisdiction_id: Optional[str] = None
    privacy_compliant: bool = False
    discovery_location_gps_capture_enabled: bool = True
    discovery_location_sharing_rules: Optional[Dict[str, Any]] = None

    # WikiLocation & rubric links
    location_context_id: Optional[UUID] = None
    rubric_id: Optional[UUID] = None

    class Config:
        from_attributes = True


# ============================================================================
# ACTIVITY GENERATION REQUEST / RESPONSE
# ============================================================================

class ActivityGenerationRequest(BaseModel):
    """
    Request body for POST /api/v1/activities/generate-suggestions

    The AI service uses location + subject + grade to generate contextually
    relevant activity suggestions.
    """
    location_latitude: float
    location_longitude: float
    location_name: str
    subject: str = Field(..., min_length=1, max_length=100)
    grade_level: int = Field(..., ge=3, le=12)
    taxonomy_framework: TaxonomyFramework = TaxonomyFramework.BLOOMS
    desired_taxonomy_level: Optional[int] = Field(None, ge=1, le=6)
    activity_count: int = Field(default=3, ge=1, le=5,
        description="How many activity suggestions to generate")
    include_discovery: bool = Field(default=False,
        description="Include discovery / scavenger-hunt style activities")
    additional_context: Optional[str] = Field(None, max_length=500,
        description="Extra context to pass to the AI (e.g. 'focus on biodiversity')")


class ActivitySuggestion(BaseModel):
    """A single AI-generated activity suggestion"""
    title: str
    description: str
    learning_objectives: List[str]
    estimated_duration_minutes: int
    difficulty_level: int = Field(..., ge=1, le=5)
    bloom_level: int = Field(..., ge=1, le=6)
    marzano_level: Optional[int] = None
    dok_level: Optional[int] = None
    solo_level: Optional[int] = None
    materials_needed: List[str] = Field(default_factory=list)
    discovery_mode: Optional[DiscoveryModeEnum] = None
    discovery_task_description: Optional[str] = None
    location_context_summary: Optional[str] = Field(None,
        description="One-paragraph summary of why this location fits the activity")
    confidence_score: float = Field(default=0.8, ge=0.0, le=1.0)

    class Config:
        from_attributes = True


class ActivityGenerationResponse(BaseModel):
    """Response from the AI activity generation endpoint"""
    suggestions: List[ActivitySuggestion]
    location_name: str
    subject: str
    grade_level: int
    taxonomy_framework: TaxonomyFramework
    provider: str = Field(...,
        description="LLM provider used: 'ollama' or 'claude'")
    model: str = Field(...,
        description="Model identifier used for generation")
    generation_time_ms: Optional[int] = None

    class Config:
        from_attributes = True


# ============================================================================
# LOCATION CONTEXT REQUEST / RESPONSE
# (WikiLocation data enrichment)
# ============================================================================

class LocationContextRequest(BaseModel):
    """Request body for POST /api/v1/activities/location-context"""
    latitude: float
    longitude: float
    location_name: str
    radius_meters: int = Field(default=500, ge=50, le=5000)


class WikiArticleSummary(BaseModel):
    """Brief summary of a Wikipedia article relevant to the location"""
    title: str
    summary: str
    url: Optional[str] = None
    relevance_score: float = Field(default=1.0, ge=0.0, le=1.0)


class LocationContextResponse(BaseModel):
    """
    Response from GET/POST /api/v1/activities/location-context

    Contains Wikimedia-sourced information about the location
    that teachers can use to enrich their activities.
    """
    location_name: str
    latitude: float
    longitude: float
    educational_summary: Optional[str] = None
    wikipedia_articles: List[WikiArticleSummary] = Field(default_factory=list)
    geographic_features: Optional[Dict[str, Any]] = None
    wikidata_entities: Optional[Dict[str, Any]] = None
    cached: bool = False
    cache_expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True
