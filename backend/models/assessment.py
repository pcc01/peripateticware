# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Assessment models for taxonomies, rubrics, and location context"""

from datetime import datetime
from uuid import uuid4
import enum
from sqlalchemy import (
    Column, String, Integer, Text, DateTime, Boolean, Enum as SQLEnum,
    ForeignKey, Float,  UUID, Float, Index, Date, Time
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import relationship
from core.database import Base


# Enums for assessment frameworks
class AssessmentFramework(str, enum.Enum):
    """Assessment framework types"""
    BLOOMS = "blooms"
    MARZANO = "marzano"
    DOK = "dok"
    SOLO = "solo"
    CUSTOM = "custom"


class BloomsLevel(int, enum.Enum):
    """Bloom's Taxonomy levels (1-6)"""
    REMEMBER = 1
    UNDERSTAND = 2
    APPLY = 3
    ANALYZE = 4
    EVALUATE = 5
    CREATE = 6


class MarzanoLevel(int, enum.Enum):
    """Marzano's Taxonomy levels (1-4)"""
    RETRIEVAL = 1
    COMPREHENSION = 2
    ANALYSIS = 3
    KNOWLEDGE_UTILIZATION = 4


class DokLevel(int, enum.Enum):
    """Depth of Knowledge levels (1-4)"""
    RECALL = 1
    SKILL_CONCEPT = 2
    STRATEGIC_THINKING = 3
    EXTENDED_THINKING = 4


class SoloLevel(int, enum.Enum):
    """SOLO Taxonomy levels (1-5)"""
    PRESTRUCTURAL = 1
    UNISTRUCTURAL = 2
    MULTISTRUCTURAL = 3
    RELATIONAL = 4
    EXTENDED_ABSTRACT = 5


class LocationContext(Base):
    """
    Cached location context data from Wikimedia
    Stores Wikipedia + Wikidata information about a location
    """
    
    __tablename__ = "location_contexts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    
    # Location identifiers
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    location_name = Column(String(255), nullable=False, index=True)
    
    # Wikimedia data
    wikipedia_articles = Column(JSONB, nullable=True)
    # Format: [
    #   {
    #     "title": "Golden Gate Bridge",
    #     "pageid": 12345,
    #     "extract": "The Golden Gate Bridge is...",
    #     "image_url": "https://...",
    #     "distance_km": 0.5
    #   }
    # ]
    
    wikidata_entities = Column(JSONB, nullable=True)
    # Format: {
    #   "Q123456": {
    #     "label": "Golden Gate Bridge",
    #     "description": "suspension bridge",
    #     "claims": {...}
    #   }
    # }
    
    geographic_features = Column(JSONB, nullable=True)
    # Format: {
    #   "rivers": ["Golden Gate Strait"],
    #   "mountains": [],
    #   "buildings": ["Golden Gate Bridge"],
    #   "natural_features": []
    # }
    
    educational_summary = Column(Text, nullable=True)
    # AI-generated summary of educational value
    
    # Cache control
    cache_expires_at = Column(DateTime, nullable=True)
    # 30-day TTL default
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        Index('ix_location_contexts_lat_lng', 'latitude', 'longitude'),
        Index('ix_location_contexts_location_name', 'location_name'),
    )


class AssessmentRubric(Base):
    """
    Teacher-created assessment rubrics for grading activities
    """
    
    __tablename__ = "assessment_rubrics"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Rubric metadata
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Framework
    framework = Column(SQLEnum(AssessmentFramework), default=AssessmentFramework.BLOOMS, nullable=False)
    
    # Rubric criteria and levels
    criteria = Column(JSONB, nullable=False)
    # Format: [
    #   {
    #     "id": "criterion_1",
    #     "name": "Understanding",
    #     "description": "Student demonstrates...",
    #     "max_points": 25,
    #     "levels": [
    #       {
    #         "level": 1,
    #         "name": "Beginning",
    #         "points": 5,
    #         "description": "..."
    #       },
    #       ...
    #     ]
    #   }
    # ]
    
    total_points = Column(Integer, default=100, nullable=False)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        Index('ix_assessment_rubrics_teacher_id', 'teacher_id'),
    )


class ActivityCurriculum(Base):
    """
    Junction table: Activities can map to multiple curriculum units
    """
    
    __tablename__ = "activity_curriculum"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), nullable=False, index=True)
    curriculum_unit_id = Column(UUID(as_uuid=True), ForeignKey("curriculum_units.id"), nullable=False, index=True)
    
    # Alignment strength
    alignment_strength = Column(Integer, default=100)  # 0-100%
    
    # Notes
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        Index('ix_activity_curriculum_activity_id', 'activity_id'),
        Index('ix_activity_curriculum_curriculum_id', 'curriculum_unit_id'),
    )


# Taxonomy descriptions with colors
TAXONOMY_DESCRIPTIONS = {
    "blooms": {
        "name": "Bloom's Taxonomy",
        "levels": {
            1: {"name": "Remember", "color": "#E8F4F8", "description": "Recall facts and basic concepts"},
            2: {"name": "Understand", "color": "#B3E5FC", "description": "Explain ideas or concepts"},
            3: {"name": "Apply", "color": "#81D4FA", "description": "Use information in a new situation"},
            4: {"name": "Analyze", "color": "#4FC3F7", "description": "Draw connections among ideas"},
            5: {"name": "Evaluate", "color": "#29B6F6", "description": "Justify a stand or decision"},
            6: {"name": "Create", "color": "#039BE5", "description": "Produce new or original work"},
        }
    },
    "marzano": {
        "name": "Marzano's Taxonomy",
        "levels": {
            1: {"name": "Retrieval", "color": "#F3E5F5", "description": "Recall and recognize information"},
            2: {"name": "Comprehension", "color": "#E1BEE7", "description": "Understand and explain concepts"},
            3: {"name": "Analysis", "color": "#CE93D8", "description": "Compare, classify, and organize"},
            4: {"name": "Knowledge Utilization", "color": "#BA68C8", "description": "Apply and solve problems"},
        }
    },
    "dok": {
        "name": "Depth of Knowledge",
        "levels": {
            1: {"name": "Recall", "color": "#FFF3E0", "description": "Simple recall of facts"},
            2: {"name": "Skill/Concept", "color": "#FFE0B2", "description": "Use of concepts and procedures"},
            3: {"name": "Strategic Thinking", "color": "#FFCC80", "description": "Complex reasoning and planning"},
            4: {"name": "Extended Thinking", "color": "#FFB74D", "description": "Investigate and evaluate"},
        }
    },
    "solo": {
        "name": "SOLO Taxonomy",
        "levels": {
            1: {"name": "Prestructural", "color": "#F1F8E9", "description": "Irrelevant or missing information"},
            2: {"name": "Unistructural", "color": "#DCEDC8", "description": "Simple and isolated facts"},
            3: {"name": "Multistructural", "color": "#C5E1A5", "description": "Multiple facts but disconnected"},
            4: {"name": "Relational", "color": "#AED581", "description": "Connected understanding of concepts"},
            5: {"name": "Extended Abstract", "color": "#9CCC65", "description": "Transfer to new domains"},
        }
    }
}

