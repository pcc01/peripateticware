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
        os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@postgres:5432/peripateticware")
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
    
    # CORS - Default includes localhost:5173 for development
    CORS_ORIGINS_STR: str = os.getenv(
        "CORS_ORIGINS", 
        '["http://localhost:5173", "http://localhost:3000", "*"]'
    )
    
    # Vector DB
    VECTOR_DIMENSION: int = 384  # For sentence-transformers/all-MiniLM-L6-v2
    
    # RAG Configuration
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128
    TOP_K_RETRIEVAL: int = 5
    
    # Observability
    ENABLE_METRICS: bool = True
    PROMETHEUS_PORT: int = 8001
    
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
    
    class Config:
        case_sensitive = True


settings = Settings()