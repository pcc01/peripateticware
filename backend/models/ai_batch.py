# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
ORM models for the AI routing layer.

ai_task_config   — per-task provider settings (hot-reloaded, admin-editable)
ai_batch_queue   — one row per item queued for Anthropic Batch API processing
ai_api_keys      — encrypted storage for provider API keys set via Admin UI
"""

from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
from datetime import datetime, timezone
import enum
from core.database import Base


class TaskType(str, enum.Enum):
    ACTIVITY_SUGGESTIONS  = "activity_suggestions"
    STANDARDS_MAPPING     = "standards_mapping"
    RUBRIC_MAPPING        = "rubric_mapping"
    TAXONOMY_MAPPING      = "taxonomy_mapping"
    SUBMISSION_ASSESSMENT = "submission_assessment"


class AIProvider(str, enum.Enum):
    OLLAMA            = "ollama"
    ANTHROPIC_INSTANT = "anthropic_instant"
    ANTHROPIC_BATCH   = "anthropic_batch"   # only valid for submission_assessment
    OPENAI            = "openai"            # GPT-4o-mini / GPT-4o


class BatchStatus(str, enum.Enum):
    PENDING    = "pending"     # queued locally, not yet sent to Anthropic
    SUBMITTED  = "submitted"   # sent to Anthropic Batch API, awaiting results
    COMPLETED  = "completed"   # results written back
    FAILED     = "failed"      # Anthropic error or fallback used


# ── ai_task_config ─────────────────────────────────────────────────────────────

class AiTaskConfig(Base):
    """One row per task type. Admin UI reads/writes this at runtime."""
    __tablename__ = "ai_task_config"
    __table_args__ = {"extend_existing": True}

    task_type    = Column(String(64), primary_key=True)   # TaskType value
    provider     = Column(String(32), nullable=False, default="ollama")
    model        = Column(String(128), nullable=True)     # override per-task model; NULL = use global default
    enabled      = Column(Boolean, default=True)
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by   = Column(String(128), nullable=True)     # admin user email


# ── ai_batch_queue ─────────────────────────────────────────────────────────────

class AiBatchQueue(Base):
    """One row per item queued for Anthropic Batch API processing."""
    __tablename__ = "ai_batch_queue"
    __table_args__ = {"extend_existing": True}

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    task_type           = Column(String(64), nullable=False, index=True)
    entity_type         = Column(String(64), nullable=False)   # e.g. "submission", "activity"
    entity_id           = Column(String(64), nullable=False, index=True)
    prompt              = Column(Text, nullable=False)
    status              = Column(String(32), nullable=False, default=BatchStatus.PENDING, index=True)
    anthropic_batch_id  = Column(String(128), nullable=True, index=True)
    anthropic_request_id= Column(String(128), nullable=True)   # custom_id sent to Anthropic
    result              = Column(JSONB, nullable=True)          # parsed result written back on completion
    error_message       = Column(Text, nullable=True)
    fallback_used       = Column(Boolean, default=False)        # True if Ollama fallback was used
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    submitted_at        = Column(DateTime(timezone=True), nullable=True)
    processed_at        = Column(DateTime(timezone=True), nullable=True)
    notified            = Column(Boolean, default=False)        # teacher notification sent


# ── ai_api_keys ────────────────────────────────────────────────────────────────

class AiApiKey(Base):
    """Encrypted storage for provider API keys entered via Admin UI.
    Key is encrypted with Fernet using the app SECRET_KEY."""
    __tablename__ = "ai_api_keys"
    __table_args__ = {"extend_existing": True}

    provider     = Column(String(64), primary_key=True)   # e.g. "anthropic"
    encrypted_key= Column(Text, nullable=False)
    model        = Column(String(128), nullable=True)      # default model for this provider
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by   = Column(String(128), nullable=True)

# ── org_api_keys ────────────────────────────────────────────────────────────────

# Tiers eligible to set their own provider key.
# Presence of a row in org_api_keys is the actual gate; this list controls
# who is allowed to submit one via the /org/ai-key endpoint.
BYOK_ELIGIBLE_TIERS = {
    "school", "school_byok",
    "district", "district_byok",
    "enterprise",
    "homeschool_family", "homeschool_coop",
}


class OrgApiKey(Base):
    """
    Per-org encrypted API key storage.
    When an org has a row here, ai_router uses their own key instead of the
    platform key — and the platform imposes no budget cap on that org.
    """
    __tablename__ = "org_api_keys"
    __table_args__ = {"extend_existing": True}

    org_id        = Column(UUID(as_uuid=True), primary_key=True)
    provider      = Column(String(64), primary_key=True, default="anthropic")
    encrypted_key = Column(Text, nullable=False)
    model         = Column(String(128), nullable=True)   # override model (optional)
    verified_at   = Column(DateTime(timezone=True), nullable=True)
    updated_at    = Column(DateTime(timezone=True),
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))
    updated_by    = Column(String(255), nullable=True)   # email of the teacher who set it

    def __repr__(self) -> str:
        return f"<OrgApiKey org={self.org_id} provider={self.provider}>"

