# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
SQLAlchemy ORM models for platform-level AI usage tracking.

Tables:
  platform_ai_ledger   — per-request token spend (immutable append-only)
  platform_ai_budgets  — per-org monthly budget caps
  platform_audit_log   — immutable audit trail for platform admin actions

These are read by platform super-admin endpoints; writes go through
_write_ledger() in services/ai_router.py and budget_monitor.py tasks.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Integer, Numeric,
    String, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class PlatformAILedger(Base):
    __tablename__ = "platform_ai_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    model:    Mapped[str] = mapped_column(String(120), nullable=False)
    provider: Mapped[str] = mapped_column(String(40),  nullable=False)  # anthropic|ollama|openai
    prompt_tokens:     Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    total_tokens:      Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    cost_usd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 8), nullable=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    feature:    Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class PlatformAIBudget(Base):
    __tablename__ = "platform_ai_budgets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, unique=True
    )
    monthly_token_limit:    Mapped[Optional[int]] = mapped_column(BigInteger(), nullable=True)
    monthly_cost_limit_usd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    alert_threshold_pct:    Mapped[int] = mapped_column(Integer(), nullable=False, default=80)
    hard_stop:  Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class PlatformAuditLog(Base):
    __tablename__ = "platform_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    actor_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action:      Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    target_id:   Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    detail:      Mapped[Optional[dict]] = mapped_column(JSONB(), nullable=True)
    ip_address:  Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
