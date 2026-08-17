# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""AgentRun ORM model — audit log for every agent execution."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from core.database import Base


class AgentRun(Base):
    """
    One row per agent invocation.

    Supports the project's radical-transparency and FERPA-style provenance
    requirements.  No raw student PII is stored here; reference by subject_id.
    """
    __tablename__ = "agent_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_name = Column(String(100), nullable=False, index=True)
    provider = Column(String(20), nullable=False)   # "ollama" | "claude"
    model = Column(String(120), nullable=False)

    # Who triggered the run — nullable (e.g. system/background jobs)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # What the run was about — no PII, only references
    subject_type = Column(String(60), nullable=True)    # "activity_submission" | "notebook" | ...
    subject_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Short, non-PII description for ops/debugging
    input_summary = Column(Text, nullable=True)
    # Where the result was persisted (if applicable)
    output_ref = Column(String(255), nullable=True)

    confidence = Column(Float, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    token_usage = Column(JSONB, nullable=True)   # {"input": n, "output": n}

    status = Column(String(20), nullable=False, default="success")  # "success" | "error"
    error = Column(Text, nullable=True)

    # naive UTC, matching this codebase's convention everywhere else (see
    # e.g. every `default=datetime.utcnow` in models/database.py) and the
    # actual DB column (`TIMESTAMP WITHOUT TIME ZONE`, migration
    # 20260612_add_agent_runs.py) — the previous timezone-aware default
    # (`datetime.now(timezone.utc)`) made every single insert here fail
    # with an asyncpg "can't subtract offset-naive and offset-aware
    # datetimes" error, silently swallowed by _audit()'s non-fatal
    # try/except in agents/base_agent.py, so every agent run's audit
    # record was quietly never written.
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        index=True,
    )

    __table_args__ = (
        Index("ix_agent_runs_agent_name", "agent_name"),
        Index("ix_agent_runs_user_id", "user_id"),
        Index("ix_agent_runs_subject_id", "subject_id"),
        Index("ix_agent_runs_created_at", "created_at"),
    )
