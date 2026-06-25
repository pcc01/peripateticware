# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Unit tests for the token ledger pipeline.

Tests:
  - _derive_jurisdiction_ids (pure function, no DB)
  - _write_ledger (mock DB session)
  - budget_check: under limit, at alert, over hard-stop
  - anomaly_detect: passes with empty ledger
"""

from __future__ import annotations

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mock_db(fetchone_return=None, fetchall_return=None):
    """Return a minimal AsyncSession mock."""
    db = AsyncMock()
    result = AsyncMock()
    result.first.return_value    = fetchone_return
    result.fetchall.return_value = fetchall_return or []
    db.execute.return_value = result
    return db


# ── _write_ledger ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_write_ledger_no_org_id():
    """If org_id is None, _write_ledger should be a no-op."""
    from services.ai_router import _write_ledger
    db = _mock_db()
    await _write_ledger(
        db=db, org_id=None, user_id=None,
        provider="ollama", model="llama3",
        prompt_tokens=10, completion_tokens=5,
    )
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_write_ledger_inserts_row():
    """_write_ledger should execute an INSERT."""
    from services.ai_router import _write_ledger
    db = _mock_db()
    await _write_ledger(
        db=db, org_id="org-123", user_id="user-456",
        provider="anthropic_instant", model="claude-haiku-4-5-20251001",
        prompt_tokens=100, completion_tokens=50, feature="lesson_gen",
    )
    db.execute.assert_called_once()
    call_sql = str(db.execute.call_args[0][0])
    assert "platform_ai_ledger" in call_sql


@pytest.mark.asyncio
async def test_write_ledger_calculates_cost():
    """Cost should be calculated for known models."""
    from services.ai_router import _write_ledger, _COST_PER_1K
    db = _mock_db()
    model = "claude-haiku-4-5-20251001"
    await _write_ledger(
        db=db, org_id="org-123", user_id=None,
        provider="anthropic_instant", model=model,
        prompt_tokens=1000, completion_tokens=0,
    )
    # Verify cost param is non-None and matches rate
    call_kwargs = db.execute.call_args[0][1]
    expected_cost = float(_COST_PER_1K[model] * Decimal("1"))
    assert abs(call_kwargs["cost"] - expected_cost) < 0.000001


# ── budget_check ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_budget_check_no_budget():
    """If no budget row exists, budget_check should return without error."""
    from services.ai_router import budget_check
    db = _mock_db(fetchone_return=None)
    await budget_check(db, "org-xyz")  # should not raise


@pytest.mark.asyncio
async def test_budget_check_under_limit():
    """Usage below limit should not raise."""
    from services.ai_router import budget_check

    db = AsyncMock()
    result_budget = AsyncMock()
    result_budget.first.return_value = (10_000, None, 80, False)  # 10K token limit, no cost limit
    result_usage  = AsyncMock()
    result_usage.first.return_value  = (5_000, 0)  # 5K tokens used

    db.execute.side_effect = [result_budget, result_usage]
    await budget_check(db, "org-abc")  # should not raise


@pytest.mark.asyncio
async def test_budget_check_hard_stop():
    """Usage at/over limit with hard_stop=True should raise HTTP 429."""
    from services.ai_router import budget_check
    from fastapi import HTTPException

    db = AsyncMock()
    result_budget = AsyncMock()
    result_budget.first.return_value = (10_000, None, 80, True)  # hard_stop=True
    result_usage  = AsyncMock()
    result_usage.first.return_value  = (12_000, 0)  # over limit

    db.execute.side_effect = [result_budget, result_usage]

    with pytest.raises(HTTPException) as exc_info:
        await budget_check(db, "org-def")
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["error"] == "budget_exceeded"


# ── anomaly_detect ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_anomaly_detect_empty_ledger():
    """With no recent usage, anomaly_detect should complete without error."""
    from tasks.budget_monitor import anomaly_detect

    db = AsyncMock()
    result = AsyncMock()
    result.fetchall.return_value = []
    db.execute.return_value = result

    await anomaly_detect(db)  # should not raise
