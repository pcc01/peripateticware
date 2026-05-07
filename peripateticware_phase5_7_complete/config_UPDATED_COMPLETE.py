# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Configuration management for Peripateticware"""

from pydantic_settings import BaseSettings
from typing import Optional
import os
import json


class Settings(BaseSettings):
    """Application settings"""
    
    # ========================================================================
    # APP CONFIGURATION
    # ========================================================================
    
    APP_NAME: str = "Peripateticware"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # ========================================================================
    # DATABASE & PERSISTENCE
    # ========================================================================
    
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@postgres:5432/peripateticware"
    )
    
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # ========================================================================
    # LLM PROVIDER SELECTION
    # ========================================================================
    
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")  # "ollama" or "claude"
    
    # Ollama inference (for backwards compatibility)
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL_TEXT: str = os.getenv("OLLAMA_MODEL_TEXT", "llama2")
    OLLAMA_MODEL_VISION: str = os.getenv("OLLAMA_MODEL_VISION", "llava")
    OLLAMA_MODEL_AUDIO: str = os.getenv("OLLAMA_MODEL_AUDIO", "whisper")
    
    # Claude inference
    CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "")
    CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
    CLAUDE_MAX_TOKENS: int = int(os.getenv("CLAUDE_MAX_TOKENS", "2048"))
    
    # ========================================================================
    # API CONFIGURATION
    # ========================================================================
    
    API_PORT: int = 8010
    API_HOST: str = "0.0.0.0"
    ALLOWED_HOSTS: list = ["*"]
    
    # ========================================================================
    # SECURITY
    # ========================================================================
    
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # CORS - Default includes localhost:5173 for development
    CORS_ORIGINS_STR: str = os.getenv(
        "CORS_ORIGINS", 
        '["http://localhost:5173", "http://localhost:3000", "*"]'
    )
    
    # ========================================================================
    # VECTOR DB & RAG
    # ========================================================================
    
    VECTOR_DIMENSION: int = 384  # For sentence-transformers/all-MiniLM-L6-v2
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128
    TOP_K_RETRIEVAL: int = 5
    
    # ========================================================================
    # OBSERVABILITY
    # ========================================================================
    
    ENABLE_METRICS: bool = True
    PROMETHEUS_PORT: int = 8001
    
    # ========================================================================
    # PRIVACY ENGINE CONFIGURATION (Phase 5)
    # ========================================================================
    
    # Privacy configuration directory
    PRIVACY_CONFIG_DIR: str = os.getenv(
        "PRIVACY_CONFIG_DIR",
        "./backend/config/jurisdictions"
    )
    
    # Active jurisdiction (default)
    ACTIVE_JURISDICTION: str = os.getenv("ACTIVE_JURISDICTION", "gdpr_eu")
    
    # Privacy checking
    ENABLE_PRIVACY_CHECKS: bool = os.getenv("ENABLE_PRIVACY_CHECKS", "true").lower() == "true"
    BLOCK_NON_COMPLIANT_ACTIVITIES: bool = os.getenv("BLOCK_NON_COMPLIANT_ACTIVITIES", "false").lower() == "true"
    
    # Privacy notifications to admin
    PRIVACY_NOTIFICATION_ENABLED: bool = os.getenv("PRIVACY_NOTIFICATION_ENABLED", "true").lower() == "true"
    PRIVACY_NOTIFICATION_EMAIL: str = os.getenv("PRIVACY_NOTIFICATION_EMAIL", "admin@peripateticware.local")
    
    # Consent & data retention
    AUTO_DELETE_EXPIRED_DATA: bool = os.getenv("AUTO_DELETE_EXPIRED_DATA", "true").lower() == "true"
    
    # ========================================================================
    # IAPP PRIVACY CRAWLER CONFIGURATION
    # ========================================================================
    
    IAPP_CRAWLER_ENABLED: bool = os.getenv("IAPP_CRAWLER_ENABLED", "true").lower() == "true"
    IAPP_CRAWLER_SCHEDULE: str = os.getenv("IAPP_CRAWLER_SCHEDULE", "0 2 * * 0")  # Weekly Sunday 2 AM
    
    # IAPP crawler sources (comma-separated)
    IAPP_CRAWLER_SOURCES_STR: str = os.getenv(
        "IAPP_CRAWLER_SOURCES",
        "legislation_tracker,privacy_directory,privacy_updates"
    )
    
    # Auto-load new regulations from crawler
    PRIVACY_AUTO_LOAD: bool = os.getenv("PRIVACY_AUTO_LOAD", "false").lower() == "true"
    
    # ========================================================================
    # LOCATION SERVICE CONFIGURATION (Phase 5)
    # ========================================================================
    
    # Location backends (comma-separated, processed in order)
    LOCATION_BACKEND_STR: str = os.getenv(
        "LOCATION_BACKEND",
        "openstreetmap,nominatim,wikidata,wikipedia"
    )
    
    # Google Maps API key (optional fallback)
    GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")
    
    # Location caching
    ENABLE_LOCATION_CACHE: bool = os.getenv("ENABLE_LOCATION_CACHE", "true").lower() == "true"
    LOCATION_CACHE_TTL_HOURS: int = int(os.getenv("LOCATION_CACHE_TTL_HOURS", "168"))  # 1 week
    LOCATION_CACHE_SIZE_MB: int = int(os.getenv("LOCATION_CACHE_SIZE_MB", "100"))
    
    # Location enrichment
    ENABLE_LOCATION_ENRICHMENT: bool = os.getenv("ENABLE_LOCATION_ENRICHMENT", "true").lower() == "true"
    WIKIPEDIA_ENABLED: bool = os.getenv("WIKIPEDIA_ENABLED", "true").lower() == "true"
    WIKIDATA_ENABLED: bool = os.getenv("WIKIDATA_ENABLED", "true").lower() == "true"
    
    # Location search parameters
    LOCATION_SEARCH_RADIUS_DEFAULT: int = int(os.getenv("LOCATION_SEARCH_RADIUS_DEFAULT", "5000"))  # meters
    LOCATION_SEARCH_RESULTS_LIMIT: int = int(os.getenv("LOCATION_SEARCH_RESULTS_LIMIT", "20"))
    
    # Background enrichment queue
    ENRICHMENT_QUEUE_ENABLED: bool = os.getenv("ENRICHMENT_QUEUE_ENABLED", "true").lower() == "true"
    ENRICHMENT_WORKER_COUNT: int = int(os.getenv("ENRICHMENT_WORKER_COUNT", "2"))
    ENRICHMENT_BATCH_SIZE: int = int(os.getenv("ENRICHMENT_BATCH_SIZE", "10"))
    
    # Custom location sources
    CUSTOM_LOCATION_SOURCES_STR: str = os.getenv("CUSTOM_LOCATION_SOURCES", "")
    
    # ========================================================================
    # LESSON GENERATION WITH LOCATION & PRIVACY (Phase 5)
    # ========================================================================
    
    ENABLE_LOCATION_BASED_LESSONS: bool = os.getenv("ENABLE_LOCATION_BASED_LESSONS", "true").lower() == "true"
    
    # ========================================================================
    # PROPERTY METHODS
    # ========================================================================
    
    @property
    def CORS_ORIGINS(self) -> list:
        """Parse CORS_ORIGINS from string to list"""
        try:
            origins = json.loads(self.CORS_ORIGINS_STR)
            # Ensure list format
            if isinstance(origins, str):
                return [origins]
            return origins if isinstance(origins, list) else ["*"]
        except (json.JSONDecodeError, TypeError):
            return ["http://localhost:5173", "http://localhost:3000", "*"]
    
    @property
    def IAPP_CRAWLER_SOURCES_LIST(self) -> list:
        """Parse IAPP crawler sources from string to list"""
        sources = [s.strip() for s in self.IAPP_CRAWLER_SOURCES_STR.split(",")]
        return [s for s in sources if s]
    
    @property
    def LOCATION_BACKEND_LIST(self) -> list:
        """Parse location backends from string to list"""
        backends = [b.strip() for b in self.LOCATION_BACKEND_STR.split(",")]
        return [b for b in backends if b]
    
    @property
    def CUSTOM_LOCATION_SOURCES_LIST(self) -> list:
        """Parse custom location sources from string to list"""
        if not self.CUSTOM_LOCATION_SOURCES_STR:
            return []
        sources = [s.strip() for s in self.CUSTOM_LOCATION_SOURCES_STR.split(",")]
        return [s for s in sources if s]
    
    class Config:
        case_sensitive = True


settings = Settings()
