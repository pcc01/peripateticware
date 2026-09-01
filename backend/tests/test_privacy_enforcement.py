# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/privacy_engine.py::enforce_or_raise / audit_submission.

Context: as of a 2026-09 audit, enforce_on_submission() (the privacy engine's
gate) was wired into exactly one write path (student_activities.py's
add_evidence_capture) out of ~8 that persist GPS or free-text student data.
enforce_or_raise()/audit_submission() extract that one route's pattern into
reusable helpers so the other routes (routes/student.py, routes/sessions.py,
routes/phase7_student_initiated.py) could adopt it consistently. These tests
cover the helpers directly (not each call site — the call sites are thin
one-line wrappers around these) with enforce_on_submission() mocked, since it
needs a real jurisdiction-config DB lookup to do anything interesting.

Strategy mirrors tests/test_gps_consent.py: mock the one collaborator
function and call the helper directly, no real DB/app needed.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from services.privacy_engine import EnforcementResult, enforce_or_raise, audit_submission


class TestEnforceOrRaise:
    @pytest.mark.asyncio
    async def test_allowed_returns_result_without_raising(self):
        allowed = EnforcementResult(status="ALLOWED", rules_applied=[{"jurisdiction": "ferpa_us", "version": "1"}])
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=allowed)):
            result = await enforce_or_raise(student_id="s1", data_type="student_notebook", db=object())
        assert result is allowed

    @pytest.mark.asyncio
    async def test_warning_does_not_raise(self):
        """WARNING mode never blocks — only "block" mode with an actual
        blocking reason does. A route wired to this helper today (mode=log,
        the default) must keep working exactly as before."""
        warned = EnforcementResult(status="WARNING", warnings=["restricts student data sharing"])
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=warned)):
            result = await enforce_or_raise(student_id="s1", data_type="student_capture", db=object())
        assert result.status == "WARNING"

    @pytest.mark.asyncio
    async def test_blocked_raises_403_with_reason(self):
        from fastapi import HTTPException

        blocked = EnforcementResult(
            status="BLOCKED",
            blocking_reason="Sensitive evidence requires consent under the applicable jurisdiction",
        )
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=blocked)):
            with pytest.raises(HTTPException) as exc_info:
                await enforce_or_raise(
                    student_id="s1", data_type="student_field_note", db=object(), evidence_types=["gps"],
                )
        assert exc_info.value.status_code == 403
        assert "consent" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_lookup_failure_fails_open_not_closed(self):
        """Matches add_evidence_capture's original behaviour: a privacy-engine
        error (bad DB connection, bug, whatever) must not turn into a 500 for
        the student's whole request — log and allow, same as before this
        helper existed."""
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(side_effect=RuntimeError("boom"))):
            result = await enforce_or_raise(student_id="s1", data_type="student_capture", db=object())
        assert result is None  # no exception propagated

    @pytest.mark.asyncio
    async def test_passes_evidence_types_through(self):
        """The whole point of evidence_types is triggering the
        sensitive-evidence branch in enforce_on_submission for gps/photo/
        audio/video — confirm callers' evidence_types actually reach it."""
        fake_db = object()
        mock_enforce = AsyncMock(return_value=EnforcementResult(status="ALLOWED"))
        with patch("services.privacy_engine.enforce_on_submission", new=mock_enforce):
            await enforce_or_raise(
                student_id="s1", data_type="student_peer_project_capture", db=fake_db, evidence_types=["photo"],
            )
        mock_enforce.assert_awaited_once_with(
            student_id="s1", data_type="student_peer_project_capture", evidence_types=["photo"], db=fake_db,
        )


class TestAuditSubmission:
    @pytest.mark.asyncio
    async def test_writes_audit_row_with_enforcement_result(self):
        result = EnforcementResult(status="ALLOWED", rules_applied=[{"jurisdiction": "coppa_us", "version": "2"}])
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=result)), \
             patch("services.privacy_engine.log_access", new=mock_log_access):
            await audit_submission(
                student_id="s1", actor_role="student", action="REFLECTION_SUBMIT",
                data_type="student_reflection", db=object(), notes="session=abc",
            )
        mock_log_access.assert_awaited_once()
        _, kwargs = mock_log_access.await_args
        assert kwargs["compliance_status"] == "ALLOWED"
        assert kwargs["rules_applied"] == [{"jurisdiction": "coppa_us", "version": "2"}]
        assert kwargs["notes"] == "session=abc"

    @pytest.mark.asyncio
    async def test_never_raises_even_on_failure(self):
        """This runs AFTER the write already committed (see
        add_evidence_capture / add_reflection) — a failure here must never
        surface as an error to a student whose data was already saved."""
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(side_effect=RuntimeError("boom"))):
            await audit_submission(
                student_id="s1", actor_role="student", action="EVIDENCE_SUBMIT",
                data_type="student_evidence", db=object(),
            )  # must not raise
