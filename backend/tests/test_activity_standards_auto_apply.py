# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the auto-apply pipeline: routes/activities.py::suggest_standards_for_activity
(the "no button, runs on every save" endpoint) and the shared
services/standards_alignment_service.py::apply_alignments writer it and every
other standards-writing path (manual add, standards-first generation seeding)
goes through.

Zero automated coverage existed for either before this file. Route handlers
are called directly (not through an HTTP client) following the pattern
test_ai_route_providers.py already uses for AI-rate-limited routes — it
sidesteps needing to override `ai_rate_limit`'s dependency chain just to
reach the handler under test.
"""

from __future__ import annotations

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from fastapi import HTTPException

from agents.schemas import AgentResult
from agents.standards_mapping_agent import MappingDecision, StandardsMappingOutput
from services.standards_alignment_service import AlignmentInput, apply_alignments


def _fake_activity(**overrides) -> MagicMock:
    a = MagicMock()
    a.id = overrides.get("id", uuid4())
    a.teacher_id = overrides.get("teacher_id", uuid4())
    a.title = overrides.get("title", "Creek Habitat Study")
    a.description = overrides.get("description", "Visit a local creek and identify organisms.")
    a.learning_objectives = overrides.get("learning_objectives", [])
    a.grade_level = overrides.get("grade_level", 5)
    a.subject = overrides.get("subject", "Science")
    return a


def _fake_user(**overrides) -> MagicMock:
    u = MagicMock()
    u.id = overrides.get("id", uuid4())
    u.role = overrides.get("role", "TEACHER")
    return u


def _scalar_result(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


def _agent_result(mappings: list[MappingDecision], status: str = "success", error: str | None = None) -> AgentResult:
    output = StandardsMappingOutput(mappings=mappings, overall_confidence=0.9) if mappings is not None else None
    return AgentResult(agent_name="standards_mapping", provider="ollama", model="test-model",
                        output=output, status=status, error=error)


# ===========================================================================
# suggest_standards_for_activity
# ===========================================================================

@pytest.mark.asyncio
async def test_suggest_standards_requires_title_or_description():
    """Empty title/description short-circuits before the agent ever runs --
    this is what keeps a save from blocking on an LLM call for a bare-bones
    draft activity."""
    from routes.activities import suggest_standards_for_activity

    activity = _fake_activity(title="", description="", learning_objectives=[])
    teacher = _fake_user(id=activity.teacher_id)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(activity))

    with patch("agents.standards_mapping_agent.StandardsMappingAgent.run_with_retrieval") as mock_run:
        resp = await suggest_standards_for_activity(activity_id=activity.id, current_user=teacher, db=db, org_id=None)

    assert resp.suggestions == []
    assert "title or description" in (resp.error or "")
    mock_run.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_suggest_standards_404_when_activity_missing():
    from routes.activities import suggest_standards_for_activity

    teacher = _fake_user()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(None))

    with pytest.raises(HTTPException) as exc:
        await suggest_standards_for_activity(activity_id=uuid4(), current_user=teacher, db=db, org_id=None)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_suggest_standards_403_when_not_owner():
    from routes.activities import suggest_standards_for_activity

    activity = _fake_activity()
    other_teacher = _fake_user(id=uuid4())  # deliberately not activity.teacher_id
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(activity))

    with pytest.raises(HTTPException) as exc:
        await suggest_standards_for_activity(activity_id=activity.id, current_user=other_teacher, db=db, org_id=None)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_suggest_standards_writes_only_applicable_decisions_with_item_id():
    """Three decisions come back: one 'applies' with a resolved item_id (kept),
    one 'no' (dropped -- not a match), one 'partially' but with item_id=None
    (dropped -- nothing to link content_alignments.item_id to, see
    standards_mapping_agent.py's item_id-from-candidates lookup, which can
    legitimately come back empty)."""
    from routes.activities import suggest_standards_for_activity

    activity = _fake_activity()
    teacher = _fake_user(id=activity.teacher_id)
    item_id = uuid4()

    mappings = [
        MappingDecision(code="SCI.5.LS2.1", title="Ecosystems", decision="applies",
                         rationale="Matches the creek habitat survey", confidence=0.87, item_id=str(item_id)),
        MappingDecision(code="SCI.5.PS1.1", title="Matter", decision="no",
                         rationale="Unrelated", confidence=0.1, item_id=str(uuid4())),
        MappingDecision(code="SCI.5.ESS3.1", title="Weather", decision="partially",
                         rationale="Weak overlap, no resolvable graph node", confidence=0.4, item_id=None),
    ]

    activity_lookup = _scalar_result(activity)
    existing_alignment_lookup = _scalar_result(None)  # apply_alignments' "does one exist" check
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[activity_lookup, existing_alignment_lookup])
    added: list = []
    db.add = MagicMock(side_effect=lambda row: added.append(row))

    with patch("agents.standards_mapping_agent.StandardsMappingAgent.run_with_retrieval",
               new=AsyncMock(return_value=_agent_result(mappings))):
        resp = await suggest_standards_for_activity(activity_id=activity.id, current_user=teacher, db=db, org_id=None)

    assert len(added) == 1
    written = added[0]
    assert written.item_id == item_id
    assert written.method == "ai_suggested"
    assert written.status == "suggested"          # never auto-approved
    assert written.confidence == 0.87
    assert written.rationale == "Matches the creek habitat survey"
    assert written.reviewed_by is None             # no human has looked at it yet
    db.commit.assert_awaited_once()

    assert len(resp.suggestions) == 1
    assert resp.suggestions[0].item_id == str(item_id)
    assert resp.suggestions[0].status == "suggested"
    assert resp.suggestions[0].method == "ai_suggested"


@pytest.mark.asyncio
async def test_suggest_standards_no_applicable_decisions_writes_nothing():
    from routes.activities import suggest_standards_for_activity

    activity = _fake_activity()
    teacher = _fake_user(id=activity.teacher_id)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(activity))

    mappings = [MappingDecision(code="X", title="X", decision="no", rationale="", confidence=0.0, item_id=str(uuid4()))]
    with patch("agents.standards_mapping_agent.StandardsMappingAgent.run_with_retrieval",
               new=AsyncMock(return_value=_agent_result(mappings))):
        resp = await suggest_standards_for_activity(activity_id=activity.id, current_user=teacher, db=db, org_id=None)

    assert resp.suggestions == []
    db.add.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_suggest_standards_never_raises_on_agent_failure():
    """A save must never fail because the AI suggestion pass did -- this is
    the whole point of running it automatically rather than behind a button
    the teacher has to click and can retry."""
    from routes.activities import suggest_standards_for_activity

    activity = _fake_activity()
    teacher = _fake_user(id=activity.teacher_id)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(activity))

    with patch("agents.standards_mapping_agent.StandardsMappingAgent.run_with_retrieval",
               new=AsyncMock(return_value=_agent_result(None, status="error", error="Ollama unreachable"))):
        resp = await suggest_standards_for_activity(activity_id=activity.id, current_user=teacher, db=db, org_id=None)

    assert resp.suggestions == []
    assert resp.error == "Ollama unreachable"
    db.add.assert_not_called()
    db.commit.assert_not_called()


# ===========================================================================
# services/standards_alignment_service.py::apply_alignments
# ===========================================================================

@pytest.mark.asyncio
async def test_apply_alignments_inserts_new_row_with_no_review_fields_when_suggested():
    content_id, item_id = uuid4(), uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(None))
    added: list = []
    db.add = MagicMock(side_effect=lambda row: added.append(row))

    written = await apply_alignments(
        db, content_id=content_id, content_type="activity",
        alignments=[AlignmentInput(item_id=item_id, method="ai_suggested", status="suggested",
                                    confidence=0.6, rationale="auto-suggested")],
    )

    assert len(added) == 1 and written == added
    row = added[0]
    assert row.content_id == content_id and row.item_id == item_id
    assert row.alignment_type == "teaches"
    assert row.status == "suggested" and row.method == "ai_suggested"
    assert row.reviewed_by is None and row.reviewed_at is None
    db.commit.assert_not_called()  # caller's job, not apply_alignments'


@pytest.mark.asyncio
async def test_apply_alignments_manual_approve_sets_reviewer_and_timestamp():
    content_id, item_id, reviewer_id = uuid4(), uuid4(), uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(None))
    added: list = []
    db.add = MagicMock(side_effect=lambda row: added.append(row))

    before = datetime.utcnow()
    written = await apply_alignments(
        db, content_id=content_id, content_type="activity",
        alignments=[AlignmentInput(item_id=item_id, method="manual", status="approved")],
        reviewed_by=reviewer_id,
    )

    row = written[0]
    assert row.method == "manual" and row.status == "approved"
    assert row.reviewed_by == reviewer_id
    assert row.reviewed_at is not None and row.reviewed_at >= before


@pytest.mark.asyncio
async def test_apply_alignments_updates_existing_row_in_place_not_a_duplicate():
    """A re-suggestion for a standard the activity is already linked to
    (same content_id + item_id) must mutate that row, never insert a
    second one -- this is what makes suggest-standards idempotent across
    repeated saves/edits of the same activity."""
    content_id, item_id = uuid4(), uuid4()
    existing = MagicMock()
    existing.status = "rejected"
    existing.method = "ai_suggested"
    existing.confidence = 0.2
    existing.rationale = "old rationale"
    existing.reviewed_by = None
    existing.reviewed_at = None

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(existing))
    db.add = MagicMock()

    written = await apply_alignments(
        db, content_id=content_id, content_type="activity",
        alignments=[AlignmentInput(item_id=item_id, method="ai_suggested", status="suggested",
                                    confidence=0.91, rationale="new, stronger match")],
    )

    db.add.assert_not_called()          # updated the existing object, not inserted
    assert written == [existing]
    assert existing.status == "suggested"
    assert existing.confidence == 0.91
    assert existing.rationale == "new, stronger match"


@pytest.mark.asyncio
async def test_apply_alignments_does_not_touch_rows_it_was_not_given():
    """apply_alignments only ever writes the rows passed in -- it must not
    reach for or delete anything else tied to this content_id. A single
    no-op call (empty alignments list) should not touch the db at all."""
    db = AsyncMock()
    written = await apply_alignments(db, content_id=uuid4(), content_type="activity", alignments=[])
    assert written == []
    db.execute.assert_not_called()
    db.add.assert_not_called()
