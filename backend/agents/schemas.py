# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Shared Pydantic schemas for the agent layer."""

from __future__ import annotations

import uuid
from typing import Any, Optional
from pydantic import BaseModel, Field


class AgentResult(BaseModel):
    """Envelope returned by every BaseAgent.run() call."""

    run_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    agent_name: str
    provider: str
    model: str
    output: Any                          # validated OutputModel instance
    confidence: Optional[float] = None  # 0-1 where the agent produces one
    latency_ms: Optional[int] = None
    token_usage: Optional[dict] = None  # {"input": n, "output": n} when available
    status: str = "success"             # "success" | "error"
    error: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True
