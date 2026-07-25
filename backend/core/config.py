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
    # Opt-in to seed the customer-facing demo accounts (teacher/student/parent/
    # homeschool @example.com + the homeschool demo family) on a non-development
    # environment, e.g. a public beta site that wants "try it yourself" logins.
    # Deliberately separate from ENVIRONMENT: flipping ENVIRONMENT to
    # "production" turns on real security hardening (locked API docs,
    # fatal-on-boot checks for un-rotated secrets — see
    # startup.py::check_config_warnings) that has nothing to do with whether
    # you also want demo logins. Never seeds ADMIN-role accounts regardless of
    # this flag — see seed_demo_admin_account(), which stays dev-only.
    ENABLE_DEMO_SEED_ACCOUNTS: bool = os.getenv("ENABLE_DEMO_SEED_ACCOUNTS", "false").lower() == "true"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware"
    )
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    

    # ── Cloudflare R2 Object Storage ──────────────────────────────────────────
    CF_R2_ACCOUNT_ID: str = os.getenv("CF_R2_ACCOUNT_ID", "")
    CF_R2_ACCESS_KEY_ID: str = os.getenv("CF_R2_ACCESS_KEY_ID", "")
    CF_R2_SECRET_ACCESS_KEY: str = os.getenv("CF_R2_SECRET_ACCESS_KEY", "")
    CF_R2_BUCKET_NAME: str = os.getenv("CF_R2_BUCKET_NAME", "peripateticware-uploads")
    CF_R2_PUBLIC_URL: str = os.getenv("CF_R2_PUBLIC_URL", "")  # e.g. https://pub-xxx.r2.dev
    # Local-disk fallback for student captures (routes/student.py's
    # upload_capture) when R2 isn't configured. "/app/uploads" is only a
    # real, writable path inside the Docker image (docker-compose.yml mounts
    # a volume there) — it was never an actual Settings field before, so
    # routes/student.py's getattr(settings, "UPLOAD_DIR", "/app/uploads")
    # always silently fell through to that hardcoded default in every
    # environment, Docker or not. Anywhere the backend runs directly
    # (bare uvicorn, e.g. CI or local dev outside Docker), "/app" doesn't
    # exist and isn't creatable without root, so every capture upload 500'd.
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/app/uploads")
    # ── LLM Provider Selection (legacy — per-task routing now via ai_task_config table) ──
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")

    # ── Ollama ────────────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    OLLAMA_MODEL_TEXT: str = os.getenv("OLLAMA_MODEL_TEXT", "llama3.2")
    OLLAMA_MODEL_VISION: str = os.getenv("OLLAMA_MODEL_VISION", "llava")
    OLLAMA_MODEL_AUDIO: str = os.getenv("OLLAMA_MODEL_AUDIO", "karanchopda333/whisper:latest")

    # ── Anthropic (Claude Haiku) ──────────────────────────────────────────────
    # Key can be set in .env OR via Admin UI (stored encrypted in DB — DB takes precedence).
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "")          # legacy alias
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
    CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")  # legacy alias
    CLAUDE_MAX_TOKENS: int = int(os.getenv("CLAUDE_MAX_TOKENS", "1024"))

    # ── AI Batch Processing ───────────────────────────────────────────────────
    AI_BATCH_CRON: str = os.getenv("AI_BATCH_CRON", "0 1 * * *")   # default: 1 AM UTC

    # ── Per-task AI provider defaults (seed values for ai_task_config table) ──
    # Override via Admin UI at runtime — these only apply on first boot.
    # Valid values: ollama | anthropic_instant | anthropic_batch (batch: submission_assessment only)
    AI_DEFAULT_ACTIVITY_SUGGESTIONS:  str = os.getenv("AI_DEFAULT_ACTIVITY_SUGGESTIONS",  "ollama")
    AI_DEFAULT_STANDARDS_MAPPING:     str = os.getenv("AI_DEFAULT_STANDARDS_MAPPING",     "ollama")
    AI_DEFAULT_RUBRIC_MAPPING:        str = os.getenv("AI_DEFAULT_RUBRIC_MAPPING",        "ollama")
    AI_DEFAULT_TAXONOMY_MAPPING:      str = os.getenv("AI_DEFAULT_TAXONOMY_MAPPING",      "ollama")
    AI_DEFAULT_SUBMISSION_ASSESSMENT: str = os.getenv("AI_DEFAULT_SUBMISSION_ASSESSMENT", "ollama")
    
    # API Configuration
    API_PORT: int = 8010
    API_HOST: str = "0.0.0.0"
    ALLOWED_HOSTS: list = ["*"]
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    # 1 hour. Short-lived access tokens limit the blast radius of a leaked token
    # on shared/school devices; the frontend silently refreshes via
    # POST /auth/refresh (which now enforces revocation + is_active).
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    # Privacy Engine — audit log anonymisation
    # SHA-256(student_id + AUDIT_HASH_SALT) is stored in rule_audit_log.student_id_hash
    # MUST be set to a cryptographically random value in production
    AUDIT_HASH_SALT: str = os.getenv("AUDIT_HASH_SALT", "dev-audit-salt-change-in-production")

    # ── Field-Level Encryption ────────────────────────────────────────────────
    # Fernet key for encrypting PII columns (email, full_name, GPS coords, messages).
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Leave blank in development — encryption is disabled and plaintext is stored.
    # MUST be set before first production deployment. Rotating requires re-running
    # backend/scripts/encrypt_existing_data.py with the new key.
    FIELD_ENCRYPTION_KEY: str = os.getenv("FIELD_ENCRYPTION_KEY", "")
    
    # CORS - Store as string, parse as needed
    # SECURITY: fail closed. Combined with allow_credentials=True in main.py,
    # a wildcard default here would let any site read authenticated API
    # responses via cross-origin XHR. CORS_ORIGINS must be explicitly set;
    # an unset/missing value now allows nothing rather than everything.
    CORS_ORIGINS_STR: str = os.getenv("CORS_ORIGINS", '[]')
    
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
    # Enforcement mode for enforce_on_submission():
    #   "log"   — record signals, always ALLOW (default, safe rollout)
    #   "warn"  — return WARNING status with reasons, but still ALLOW the write
    #   "block" — return BLOCKED and callers must refuse the write
    # Start in "log", move to "warn" once dashboards look right, then "block".
    ENFORCEMENT_MODE: str = os.getenv("ENFORCEMENT_MODE", "log").lower()
    PRIVACY_NOTIFICATION_ENABLED: bool = os.getenv("PRIVACY_NOTIFICATION_ENABLED", "true").lower() == "true"

    # ── Phase 5: IAPP Crawler ─────────────────────────────────────────────────
    IAPP_CRAWLER_ENABLED: bool = os.getenv("IAPP_CRAWLER_ENABLED", "false").lower() == "true"
    IAPP_CRAWLER_SCHEDULE: str = os.getenv("IAPP_CRAWLER_SCHEDULE", "0 2 * * 0")
    IAPP_CRAWLER_SOURCES_STR: str = os.getenv("IAPP_CRAWLER_SOURCES", "iapp,gdpr.eu,ico.org.uk")

    # ── Privacy jurisdiction catalog auto-renew (self-service resolver) ─────
    # Off by default -- opt in once the discovery pipeline's AI cost/accuracy
    # profile has been reviewed. Default cron: 1st of month, 03:00 UTC.
    # Defaults to on: promotions require explicit admin approval (see
    # scripts/apply_promotion.py) before anything is written, so the worst
    # case of running unattended is an email you can ignore -- not a silent
    # bad DB change. Verified end-to-end (real Ollama run + full approval
    # path) before flipping this default.
    PRIVACY_AUTO_RENEW_ENABLED: bool = os.getenv("PRIVACY_AUTO_RENEW_ENABLED", "true").lower() == "true"
    PRIVACY_AUTO_RENEW_SCHEDULE: str = os.getenv("PRIVACY_AUTO_RENEW_SCHEDULE", "0 3 1 * *")
    # Extra recipient for the monthly privacy auto-renew report, alongside
    # ADMIN_EMAIL -- a genuinely separate mail provider, not just a second
    # address on the same inbox, since Gmail (or whatever admin@peripatetic
    # ware.com forwards to) can silently deduplicate mail that looks
    # self-sent (confirmed via a real Cloudflare Email Routing notice).
    PRIVACY_REPORT_CC_EMAIL: str = os.getenv("PRIVACY_REPORT_CC_EMAIL", "pcerda@outlook.com")

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
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")  # platform admin alert recipient; falls back to EMAIL_FROM if empty
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "Peripateticware")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    # Set EMAIL_DRY_RUN=false in production to send real emails
    EMAIL_DRY_RUN: bool = os.getenv("EMAIL_DRY_RUN", "true").lower() == "true"

    # ── Beta / Signup Gating ──────────────────────────────────────────────────
    # "open"        — today's behaviour: anyone can self-signup as TEACHER/
    #                 PARENT/HOMESCHOOL (students always need a classroom invite).
    # "invite_only" — self-signup requires a code in BETA_INVITE_CODES; the
    #                 frontend shows a "Request Beta Access" form instead of the
    #                 signup form unless a valid ?invite=CODE is present.
    # Flip this one value to switch modes — no other code changes needed.
    SIGNUP_MODE: str = os.getenv("SIGNUP_MODE", "open").lower()
    # Comma-separated list of valid invite codes, e.g. "beta-2026-a,beta-2026-b"
    BETA_INVITE_CODES: str = os.getenv("BETA_INVITE_CODES", "")

    # ── Beta Request → Google Sheet ───────────────────────────────────────────
    # Path to a Google Cloud service-account JSON key file (mounted into the
    # container) with edit access to BETA_SIGNUP_SHEET_ID. Leave blank to skip
    # writing to Sheets (request is still emailed to BETA_NOTIFY_EMAIL).
    GOOGLE_SERVICE_ACCOUNT_FILE: str = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "")
    # The Sheet ID from its URL: docs.google.com/spreadsheets/d/<THIS_PART>/edit
    BETA_SIGNUP_SHEET_ID: str = os.getenv("BETA_SIGNUP_SHEET_ID", "")
    # Sheet tab name to append rows to
    BETA_SIGNUP_SHEET_TAB: str = os.getenv("BETA_SIGNUP_SHEET_TAB", "Requests")
    # Who gets emailed when a new beta request comes in (falls back to ADMIN_EMAIL)
    BETA_NOTIFY_EMAIL: str = os.getenv("BETA_NOTIFY_EMAIL", "")

    # ── Platform Admin Security ──────────────────────────────────────────────────
    # Static secret required in X-Platform-Secret header on all /platform/* routes.
    # Separate from JWT auth — provides a second factor that never goes through the
    # user auth flow.  Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    # Leave blank in development to skip the check.
    PLATFORM_API_SECRET: str = os.getenv("PLATFORM_API_SECRET", "")

    # ── API Docs Lock (production only) ─────────────────────────────────────────
    # /docs, /redoc, /openapi.json are disabled by default in production and
    # re-mounted behind HTTP Basic Auth (see main.py). This is a second layer
    # under Cloudflare Access on admin.peripateticware.com — the docs stay
    # closed even if the Access policy is ever misconfigured or bypassed.
    # Generate a password with: python -c "import secrets; print(secrets.token_urlsafe(24))"
    DOCS_USERNAME: str = os.getenv("DOCS_USERNAME", "admin")
    DOCS_PASSWORD: str = os.getenv("DOCS_PASSWORD", "")

    # ── Paddle Billing ───────────────────────────────────────────────────────────
    # Get these from your Paddle dashboard → Developer Tools → Authentication
    PADDLE_API_KEY:         str = os.getenv("PADDLE_API_KEY", "")
    PADDLE_WEBHOOK_SECRET:  str = os.getenv("PADDLE_WEBHOOK_SECRET", "")
    # Comma-separated price_id:tier mappings, e.g.:
    # "pri_starter:starter,pri_school:school,pri_district:district"
    PADDLE_PRICE_MAP_STR:   str = os.getenv("PADDLE_PRICE_MAP", "")
    # Paddle environment: "sandbox" or "production"
    PADDLE_ENV:             str = os.getenv("PADDLE_ENV", "sandbox")

    @property
    def PADDLE_PRICE_MAP(self) -> dict:
        """Return dict mapping Paddle price_id → internal license_tier."""
        result = {}
        for pair in self.PADDLE_PRICE_MAP_STR.split(","):
            pair = pair.strip()
            if ":" in pair:
                price_id, tier = pair.split(":", 1)
                result[price_id.strip()] = tier.strip()
        return result

    @property
    def PADDLE_API_URL(self) -> str:
        base = "sandbox-api" if self.PADDLE_ENV == "sandbox" else "api"
        return f"https://{base}.paddle.com"

    # ── Phase 7: Student-Initiated Activities ─────────────────────────────────
    FIELD_NOTES_ENABLED: bool = os.getenv("FIELD_NOTES_ENABLED", "true").lower() == "true"
    PEER_PROJECTS_ENABLED: bool = os.getenv("PEER_PROJECTS_ENABLED", "true").lower() == "true"
    DEFAULT_PEER_PROJECT_APPROVAL_MODE: str = os.getenv("DEFAULT_PEER_PROJECT_APPROVAL_MODE", "teacher_gate")

    # ── Agent Layer ───────────────────────────────────────────────────────────
    # Per-agent provider overrides. Blank = inherit LLM_PROVIDER. "ollama" | "claude".
    AGENT_STANDARDS_INGESTION_PROVIDER: str = os.getenv("AGENT_STANDARDS_INGESTION_PROVIDER", "")
    AGENT_STANDARDS_MAPPING_PROVIDER: str = os.getenv("AGENT_STANDARDS_MAPPING_PROVIDER", "")
    AGENT_RUBRIC_SCORING_PROVIDER: str = os.getenv("AGENT_RUBRIC_SCORING_PROVIDER", "")
    AGENT_ACTIVITY_REVIEW_PROVIDER: str = os.getenv("AGENT_ACTIVITY_REVIEW_PROVIDER", "")
    AGENT_COMPLIANCE_PROVIDER: str = os.getenv("AGENT_COMPLIANCE_PROVIDER", "claude")

    # Per-agent model overrides (blank = use provider default)
    AGENT_OLLAMA_MODEL: str = os.getenv("AGENT_OLLAMA_MODEL", "")
    AGENT_CLAUDE_MODEL: str = os.getenv("AGENT_CLAUDE_MODEL", "")

    # Agent run safety limits
    AGENT_MAX_RETRIES: int = int(os.getenv("AGENT_MAX_RETRIES", "2"))
    AGENT_TIMEOUT_SECONDS: int = int(os.getenv("AGENT_TIMEOUT_SECONDS", "120"))
    AGENT_AUDIT_ENABLED: bool = os.getenv("AGENT_AUDIT_ENABLED", "true").lower() == "true"

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
        """Parse CORS_ORIGINS from string to list.

        SECURITY: fail CLOSED. A malformed CORS_ORIGINS value must yield an
        empty allowlist, never ["*"] — with allow_credentials=True a wildcard
        would let any website read authenticated API responses cross-origin.
        """
        try:
            parsed = json.loads(self.CORS_ORIGINS_STR)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    class Config:
        case_sensitive = True


settings = Settings()
# NOTE: keep this module import-safe — it is imported at startup by core.security.
