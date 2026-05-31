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
    
    # App configuration
    APP_NAME: str = "Peripateticware"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware"
    )
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # LLM Provider Selection
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")  # "ollama" or "claude"
    
    # Ollama inference (for backwards compatibility)
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL_TEXT: str = "llama2"
    OLLAMA_MODEL_VISION: str = "llava"
    OLLAMA_MODEL_AUDIO: str = "whisper"
    
    # Claude inference
    CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "")
    CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
    CLAUDE_MAX_TOKENS: int = int(os.getenv("CLAUDE_MAX_TOKENS", "2048"))
    
    # API Configuration
    API_PORT: int = 8010
    API_HOST: str = "0.0.0.0"
    ALLOWED_HOSTS: list = ["*"]
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Privacy Engine — audit log anonymisation
    # SHA-256(student_id + AUDIT_HASH_SALT) is stored in rule_audit_log.student_id_hash
    # MUST be set to a cryptographically random value in production
    AUDIT_HASH_SALT: str = os.getenv("AUDIT_HASH_SALT", "dev-audit-salt-change-in-production")
    
    # CORS - Store as string, parse as needed
    CORS_ORIGINS_STR: str = os.getenv("CORS_ORIGINS", '["*"]')
    
    # Vector DB
    VECTOR_DIMENSION: int = 384  # For sentence-transformers/all-MiniLM-L6-v2
    
    # RAG Configuration
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128
    TOP_K_RETRIEVAL: int = 5
    
    # Observability
    ENABLE_METRICS: bool = True
    PROMETHEUS_PORT: int = 8001

    # ── Phase 5: Privacy Engine ───────────────────────────────────────────────
    PRIVACY_CONFIG_DIR: str = os.getenv("PRIVACY_CONFIG_DIR", "./backend/config/jurisdictions")
    ACTIVE_JURISDICTION: str = os.getenv("ACTIVE_JURISDICTION", "gdpr_eu")
    ENABLE_PRIVACY_CHECKS: bool = os.getenv("ENABLE_PRIVACY_CHECKS", "true").lower() == "true"
    PRIVACY_NOTIFICATION_ENABLED: bool = os.getenv("PRIVACY_NOTIFICATION_ENABLED", "true").lower() == "true"

    # ── Phase 5: IAPP Crawler ─────────────────────────────────────────────────
    IAPP_CRAWLER_ENABLED: bool = os.getenv("IAPP_CRAWLER_ENABLED", "false").lower() == "true"
    IAPP_CRAWLER_SCHEDULE: str = os.getenv("IAPP_CRAWLER_SCHEDULE", "0 2 * * 0")
    IAPP_CRAWLER_SOURCES_STR: str = os.getenv("IAPP_CRAWLER_SOURCES", "iapp,gdpr.eu,ico.org.uk")

    # ── Phase 5: Location Service ─────────────────────────────────────────────
    LOCATION_BACKEND_STR: str = os.getenv("LOCATION_BACKEND", "openstreetmap,nominatim,wikidata,wikipedia")
    GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")
    ENABLE_LOCATION_CACHE: bool = os.getenv("ENABLE_LOCATION_CACHE", "true").lower() == "true"
    LOCATION_CACHE_TTL_HOURS: int = int(os.getenv("LOCATION_CACHE_TTL_HOURS", "168"))
    LOCATION_ENRICHMENT_ENABLED: bool = os.getenv("LOCATION_ENRICHMENT_ENABLED", "true").lower() == "true"
    NOMINATIM_USER_AGENT: str = os.getenv("NOMINATIM_USER_AGENT", "Peripateticware/1.0")
    WIKIDATA_SPARQL_URL: str = os.getenv("WIKIDATA_SPARQL_URL", "https://query.wikidata.org/sparql")
    WIKIPEDIA_API_URL: str = os.getenv("WIKIPEDIA_API_URL", "https://en.wikipedia.org/w/api.php")

    # ── Phase 7: Audio ────────────────────────────────────────────────────────
    AUDIO_ENABLED: bool = os.getenv("AUDIO_ENABLED", "true").lower() == "true"
    AUDIO_MAX_DURATION_SECONDS: int = int(os.getenv("AUDIO_MAX_DURATION_SECONDS", "300"))
    AUDIO_MAX_FILE_SIZE_MB: int = int(os.getenv("AUDIO_MAX_FILE_SIZE_MB", "50"))
    AUDIO_ALLOWED_FORMATS_STR: str = os.getenv("AUDIO_ALLOWED_FORMATS", "audio/webm,audio/ogg,audio/mp4")

    # ── Phase 7: ASR ──────────────────────────────────────────────────────────
    ASR_ENABLED: bool = os.getenv("ASR_ENABLED", "false").lower() == "true"
    ASSEMBLYAI_API_KEY: str = os.getenv("ASSEMBLYAI_API_KEY", "")

    # ── Email / SMTP ──────────────────────────────────────────────────────────
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "noreply@peripateticware.com")
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "Peripateticware")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    # Set EMAIL_DRY_RUN=false in production to send real emails
    EMAIL_DRY_RUN: bool = os.getenv("EMAIL_DRY_RUN", "true").lower() == "true"

    # ── Phase 7: Student-Initiated Activities ─────────────────────────────────
    FIELD_NOTES_ENABLED: bool = os.getenv("FIELD_NOTES_ENABLED", "true").lower() == "true"
    PEER_PROJECTS_ENABLED: bool = os.getenv("PEER_PROJECTS_ENABLED", "true").lower() == "true"
    DEFAULT_PEER_PROJECT_APPROVAL_MODE: str = os.getenv("DEFAULT_PEER_PROJECT_APPROVAL_MODE", "teacher_gate")

    @property
    def LOCATION_BACKENDS(self) -> list:
        return [s.strip() for s in self.LOCATION_BACKEND_STR.split(",") if s.strip()]

    @property
    def IAPP_CRAWLER_SOURCES(self) -> list:
        return [s.strip() for s in self.IAPP_CRAWLER_SOURCES_STR.split(",") if s.strip()]

    @property
    def AUDIO_ALLOWED_FORMATS(self) -> list:
        return [s.strip() for s in self.AUDIO_ALLOWED_FORMATS_STR.split(",") if s.strip()]

    @property
    def CORS_ORIGINS(self) -> list:
        """Parse CORS_ORIGINS from string to list"""
        try:
            return json.loads(self.CORS_ORIGINS_STR)
        except (json.JSONDecodeError, TypeError):
            return ["*"]

    class Config:
        case_sensitive = True


settings = Settings()
