# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Configuration settings for Parent Portal
"""

import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings"""
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://parent_portal_user:parent_portal_secure_password_dev@postgres-parent:5432/peripateticware_parent_portal"
    )
    
    # Redis Cache
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis-parent:6379")
    
    # Main app database (read-only access for student data)
    MAIN_DB_URL: str = os.getenv(
        "MAIN_DB_URL",
        "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware"
    )
    
    # JWT Authentication
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRATION_HOURS: int = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))
    
    # OAuth2 (GitHub, Google)
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    
    # LLM Integration
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    
    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:5174",
        "http://localhost:3001",
        "http://localhost:3000",
        "https://yourdomain.com"
    ]
    ALLOWED_HOSTS: list = ["*"]
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    DEBUG: bool = os.getenv("ENVIRONMENT", "development") == "development"
    
    # API
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    
    # Email/SMTP
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    
    # Parent Portal Settings
    PARENT_NOTIFICATION_ENABLED: bool = os.getenv("PARENT_NOTIFICATION_ENABLED", "true").lower() == "true"
    PARENT_NOTIFICATION_FREQUENCY: str = os.getenv("PARENT_NOTIFICATION_FREQUENCY", "weekly")
    PARENT_DATA_RETENTION_DAYS: int = int(os.getenv("PARENT_DATA_RETENTION_DAYS", "365"))
    GDPR_ENABLED: bool = os.getenv("GDPR_ENABLED", "true").lower() == "true"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
