# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/privacy_engine.py — enforce_on_submission (the rule-
decision logic), enforce_or_raise / audit_submission (the route-facing
gates), and the audit trail they write.

Context: as of a 2026-09 audit, enforce_on_submission() (the privacy
engine's gate) was wired into exactly one write path (student_activities.py's
add_evidence_capture) out of ~9 that persist GPS or free-text student data.
enforce_or_raise()/audit_submission() extract that one route's pattern into
reusable helpers so the other routes (routes/student.py, routes/sessions.py,
routes/phase7_student_initiated.py) could adopt it consistently.

A SECOND, deeper gap was found and fixed in the same audit: ENFORCEMENT_MODE
defaults to "log", under which enforce_on_submission() always returns status
"ALLOWED" even when it internally detected a real violation (populating
`warnings`/`blocking_reason`) — and every one of the 9 call sites discarded
enforce_or_raise()'s return value entirely, so that detection was computed
and immediately thrown away. Only 2 of 9 sites even called audit_submission()
afterward, and even there the audit row's only queryable field
(`compliance_status`) collapsed to "ALLOWED" too, with no trace of what was
actually detected. Confirmed live against prod: a real audio-evidence POST
(a "sensitive" type) returned 201 with zero distinguishing signal anywhere.

The fix: `EnforcementResult.would_block` is now computed independent of
ENFORCEMENT_MODE (true whenever a blocking condition exists, in ANY mode),
and enforce_or_raise()/audit_submission() now ALWAYS write a durable
`rule_audit_log` row (via `_record_enforcement_audit`, an isolated DB
session — never the caller's request-scoped `db`) carrying `would_block`,
`warnings`, and `blocking_reason` in `enforcement_actions`, regardless of
mode or outcome. This is what makes ENFORCEMENT_MODE=log actually useful as
a rollout stage: every request now leaves a real trace of what "block" mode
would have done to it, queryable via GET /privacy/audit-log, without ever
having flipped the switch.

Two test strategies, deliberately kept separate:
  - TestEnforceOrRaise / TestAuditSubmission / TestAuditTrailWriting: the
    route-facing helpers, with enforce_on_submission() mocked (mirrors
    tests/test_gps_consent.py's approach) — these test the WRAPPING
    behavior (raise-on-BLOCKED, audit-write, non-blocking-on-failure,
    session isolation), not the rule logic itself.
  - TestEnforceOnSubmissionDecisionMatrix / TestEdgeCases: exercise
    enforce_on_submission() itself against real JurisdictionConfig fixtures
    with only its DB-lookup collaborators (identify_jurisdiction,
    merge_jurisdictions) mocked — this is what actually proves the
    block/warn logic is correct, independent of whether it's turned on.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from unittest.mock import AsyncMock, patch

from services.privacy_engine import (
    EnforcementResult,
    JurisdictionConfig,
    PrivacyFramework,
    enforce_on_submission,
    enforce_or_raise,
    audit_submission,
)


def _config(**overrides) -> JurisdictionConfig:
    """A permissive baseline jurisdiction config — every test overrides only
    the fields relevant to what it's checking, so intent stays obvious."""
    defaults = dict(
        jurisdiction_id="test_jurisdiction",
        jurisdiction_name="Test Jurisdiction",
        framework=PrivacyFramework.FERPA,
        country_code="US",
        student_data_sharing_allowed=True,
        student_monitoring_allowed=True,
        max_retention_days=365,
        encryption_algorithm="AES-256",
        version="1.0",
    )
    defaults.update(overrides)
    return JurisdictionConfig(**defaults)


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


class FakeAsyncSession:
    """Minimal stand-in for AsyncSession that supports `async with` and
    records whether it (not the caller's real `db`) is what log_access
    actually touched. Deliberately does NOT implement query execution —
    if a test's code path tries to run a real query against this, it should
    raise AttributeError and fail loudly rather than silently no-op."""

    def __init__(self, name: str):
        self.name = name
        self.entered = False
        self.exited = False

    async def __aenter__(self):
        self.entered = True
        return self

    async def __aexit__(self, *exc):
        self.exited = True
        return False


class FakeSessionFactory:
    """Stand-in for the callable async_sessionmaker returns — each call
    produces a fresh FakeAsyncSession, same as the real thing, so a test can
    assert exactly one isolated session was created per audit write."""

    def __init__(self):
        self.created: list[FakeAsyncSession] = []

    def __call__(self):
        s = FakeAsyncSession(name=f"audit-session-{len(self.created)}")
        self.created.append(s)
        return s


class TestAuditTrailIsolation:
    """
    The audit write must use its OWN session — never the request-scoped
    `db` the caller (a route handler) passed in. enforce_or_raise() runs
    BEFORE the caller's own db.add() for the real write at every one of its
    9 call sites (verified by reading each), so sharing that session here
    and having log_access() commit/rollback it would either commit the
    caller's not-yet-validated write early, or wipe out unrelated pending
    state on an audit-write failure.
    """

    @pytest.mark.asyncio
    async def test_enforce_or_raise_never_touches_callers_db(self):
        fake_factory = FakeSessionFactory()
        callers_db = object()  # would raise on any real attribute access
        allowed = EnforcementResult(status="ALLOWED", would_block=False)

        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=allowed)), \
             patch("core.database.get_session_factory", new=lambda: fake_factory), \
             patch("services.privacy_engine.log_access", new=mock_log_access):
            await enforce_or_raise(student_id="s1", data_type="student_notebook", db=callers_db)

        # Exactly one isolated session was created and used for the audit write.
        assert len(fake_factory.created) == 1
        assert fake_factory.created[0].entered and fake_factory.created[0].exited
        mock_log_access.assert_awaited_once()
        _, kwargs = mock_log_access.await_args
        assert kwargs["db"] is fake_factory.created[0]
        assert kwargs["db"] is not callers_db

    @pytest.mark.asyncio
    async def test_skips_audit_write_when_db_is_none(self):
        """A caller passing db=None (no DB context at all) shouldn't try to
        open an isolated session either — nothing to audit against."""
        allowed = EnforcementResult(status="ALLOWED")
        fake_factory = FakeSessionFactory()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=allowed)), \
             patch("core.database.get_session_factory", new=lambda: fake_factory):
            await enforce_or_raise(student_id="s1", data_type="student_notebook", db=None)
        assert len(fake_factory.created) == 0

    @pytest.mark.asyncio
    async def test_audit_write_failure_does_not_block_or_raise(self):
        """An isolated session that itself fails to construct/connect must
        not turn into a 500 for the student, and must not prevent the
        BLOCKED check from still running."""
        blocked = EnforcementResult(status="BLOCKED", blocking_reason="nope")

        def _broken_factory():
            raise ConnectionError("db unreachable")

        from fastapi import HTTPException
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=blocked)), \
             patch("core.database.get_session_factory", new=_broken_factory):
            with pytest.raises(HTTPException) as exc_info:
                await enforce_or_raise(student_id="s1", data_type="student_evidence", db=object())
        # Still blocks correctly even though the audit write itself failed.
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_enforcement_actions_content_matches_result(self):
        """The whole point of the fix: enforcement_actions must carry
        would_block/warnings/blocking_reason/consent_required/evidence_types
        even when `status` itself says ALLOWED (log mode)."""
        result = EnforcementResult(
            status="ALLOWED",  # log mode collapses it, but...
            would_block=True,   # ...this must still say what really happened
            warnings=["Sensitive evidence requires consent under the applicable jurisdiction"],
            blocking_reason="Sensitive evidence requires consent under the applicable jurisdiction",
            consent_required=True,
        )
        fake_factory = FakeSessionFactory()
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=result)), \
             patch("core.database.get_session_factory", new=lambda: fake_factory), \
             patch("services.privacy_engine.log_access", new=mock_log_access), \
             patch("core.config.settings.ENFORCEMENT_MODE", "log"):
            await enforce_or_raise(
                student_id="s1", data_type="student_evidence", db=object(), evidence_types=["audio"],
            )
        _, kwargs = mock_log_access.await_args
        actions = kwargs["enforcement_actions"]
        assert actions["would_block"] is True
        assert actions["consent_required"] is True
        assert actions["blocking_reason"] == result.blocking_reason
        assert actions["warnings"] == result.warnings
        assert actions["evidence_types"] == ["audio"]
        assert actions["mode"] == "log"
        # compliance_status (the queryable/filterable column) stays mode-honest —
        # this request really was allowed through, even though it wouldn't be under block.
        assert kwargs["compliance_status"] == "ALLOWED"

    @pytest.mark.asyncio
    async def test_action_label_defaults_from_data_type(self):
        result = EnforcementResult(status="ALLOWED")
        fake_factory = FakeSessionFactory()
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=result)), \
             patch("core.database.get_session_factory", new=lambda: fake_factory), \
             patch("services.privacy_engine.log_access", new=mock_log_access):
            await enforce_or_raise(student_id="s1", data_type="student_reflection", db=object())
        _, kwargs = mock_log_access.await_args
        assert kwargs["action"] == "ENFORCE_STUDENT_REFLECTION"

    @pytest.mark.asyncio
    async def test_explicit_action_label_overrides_default(self):
        result = EnforcementResult(status="ALLOWED")
        fake_factory = FakeSessionFactory()
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=result)), \
             patch("core.database.get_session_factory", new=lambda: fake_factory), \
             patch("services.privacy_engine.log_access", new=mock_log_access):
            await enforce_or_raise(
                student_id="s1", data_type="student_evidence", db=object(),
                action="EVIDENCE_SUBMIT_GATE", actor_role="teacher_on_behalf",
            )
        _, kwargs = mock_log_access.await_args
        assert kwargs["action"] == "EVIDENCE_SUBMIT_GATE"
        assert kwargs["actor_role"] == "teacher_on_behalf"


class TestEnforceOnSubmissionDecisionMatrix:
    """
    Exercises enforce_on_submission()'s ACTUAL rule logic (not mocked) against
    real JurisdictionConfig fixtures, across every ENFORCEMENT_MODE. This is
    the evidence that the block/warn machinery is correct and safe to turn
    on — independent of whether it's actually on right now.

    identify_jurisdiction()/merge_jurisdictions() are mocked (they need a
    real DB), but they're the ONLY things mocked — the merge/decision logic
    inside enforce_on_submission() itself runs for real.
    """

    def _mock_jurisdiction(self, config: JurisdictionConfig):
        return patch.multiple(
            "services.privacy_engine",
            identify_jurisdiction=AsyncMock(return_value=[config.jurisdiction_id]),
            merge_jurisdictions=AsyncMock(return_value=config),
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("mode", ["log", "warn", "block"])
    async def test_no_violation_always_allowed_regardless_of_mode(self, mode):
        """A fully permissive jurisdiction + non-sensitive evidence must
        stay ALLOWED with would_block=False no matter the mode — turning
        enforcement on must not create false positives."""
        config = _config(student_monitoring_allowed=True, student_data_sharing_allowed=True)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", mode):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_notebook", db=AsyncMock(), evidence_types=None,
            )
        assert result.status == "ALLOWED"
        assert result.would_block is False
        assert result.blocking_reason is None

    @pytest.mark.asyncio
    async def test_sensitive_evidence_monitoring_disallowed_would_block_true_even_in_log_mode(self):
        """THE core fix, proven end-to-end: a jurisdiction that disallows
        student monitoring, given sensitive (audio) evidence, must set
        would_block=True even while ENFORCEMENT_MODE=log keeps status
        ALLOWED — this is the signal that used to be silently discarded."""
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "log"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["audio"],
            )
        assert result.status == "ALLOWED"          # mode=log never blocks the request itself
        assert result.would_block is True          # ...but the engine DID detect a real violation
        assert result.consent_required is True
        assert "consent" in result.blocking_reason.lower()

    @pytest.mark.asyncio
    async def test_same_violation_in_warn_mode_returns_warning_status(self):
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "warn"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["video"],
            )
        assert result.status == "WARNING"
        assert result.would_block is True

    @pytest.mark.asyncio
    async def test_same_violation_in_block_mode_returns_blocked_status(self):
        """Direct proof the "block" path works: this is what would actually
        start rejecting requests the moment ENFORCEMENT_MODE=block ships."""
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["photo"],
            )
        assert result.status == "BLOCKED"
        assert result.would_block is True
        assert result.blocking_reason is not None

    @pytest.mark.asyncio
    async def test_block_mode_end_to_end_via_enforce_or_raise_actually_raises_403(self):
        """Closes the loop: block-mode detection (tested above) really does
        stop the request when routed through the real enforce_or_raise(),
        not just when enforce_on_submission() is called directly."""
        config = _config(student_monitoring_allowed=False)
        from fastapi import HTTPException
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"), \
             patch("core.database.get_session_factory", new=lambda: FakeSessionFactory()), \
             patch("services.privacy_engine.log_access", new=AsyncMock()):
            with pytest.raises(HTTPException) as exc_info:
                await enforce_or_raise(
                    student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["gps"],
                )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_gps_is_treated_as_sensitive(self):
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="learning_session", db=AsyncMock(), evidence_types=["gps"],
            )
        assert result.would_block is True

    @pytest.mark.asyncio
    async def test_non_sensitive_evidence_type_does_not_trigger_monitoring_check(self):
        """"text" isn't in the sensitive set (gps/location/audio/video/photo/
        biometric) — a jurisdiction disallowing monitoring shouldn't block
        plain written evidence."""
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["text"],
            )
        assert result.would_block is False
        assert result.status == "ALLOWED"

    @pytest.mark.asyncio
    async def test_data_sharing_restriction_only_applies_to_scoped_data_types(self):
        """student_data_sharing_allowed=False produces a WARNING-class item
        only for data_type in (student_evidence, learning_session) per the
        current rule — student_notebook (free text) is NOT in that scope.
        This pins the existing scoping so a future edit doesn't silently
        widen or narrow it without a test noticing."""
        config = _config(student_data_sharing_allowed=False, student_monitoring_allowed=True)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "warn"):
            in_scope = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(),
            )
            out_of_scope = await enforce_on_submission(
                student_id="s1", data_type="student_notebook", db=AsyncMock(),
            )
        assert in_scope.status == "WARNING"
        assert out_of_scope.status == "ALLOWED"

    @pytest.mark.asyncio
    async def test_data_sharing_warning_alone_does_not_set_would_block(self):
        """Only the sensitive-evidence/monitoring check produces a BLOCKING
        reason; the data-sharing check only ever produces a (non-blocking)
        warning. This pins that distinction — would_block must track
        blocking_reasons specifically, not the broader warnings list, even
        though a lone warning is still enough to promote `status` to
        WARNING under "warn"/"block" mode (block mode is a superset of
        warn's visibility — it surfaces every warning, not just the ones
        that actually block)."""
        config = _config(student_data_sharing_allowed=False, student_monitoring_allowed=True)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(),
            )
        assert result.would_block is False   # nothing BLOCKING, only a warning
        assert result.status == "WARNING"    # but block mode still surfaces the warning
        assert result.blocking_reason is None
        assert len(result.warnings) == 1

    @pytest.mark.asyncio
    async def test_data_sharing_warning_alone_stays_allowed_in_log_mode(self):
        """The log-mode counterpart of the test above — the same lone
        warning must NOT be promoted to WARNING status when mode=log
        (today's actual prod config), even though would_block correctly
        stays False either way."""
        config = _config(student_data_sharing_allowed=False, student_monitoring_allowed=True)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "log"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(),
            )
        assert result.would_block is False
        assert result.status == "ALLOWED"
        assert len(result.warnings) == 1


class TestEdgeCases:
    """Boundary conditions that a real rollout decision needs confidence on."""

    def _mock_jurisdiction(self, config: JurisdictionConfig):
        return patch.multiple(
            "services.privacy_engine",
            identify_jurisdiction=AsyncMock(return_value=[config.jurisdiction_id]),
            merge_jurisdictions=AsyncMock(return_value=config),
        )

    @pytest.mark.asyncio
    async def test_mode_is_case_insensitive(self):
        """settings.ENFORCEMENT_MODE is read from an env var — someone will
        eventually type BLOCK or Block instead of block."""
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "BLOCK"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["audio"],
            )
        assert result.status == "BLOCKED"

    @pytest.mark.asyncio
    async def test_unknown_mode_value_behaves_like_log(self):
        """A typo'd or unset-default ENFORCEMENT_MODE (e.g. "off", "") must
        fail SAFE to the least disruptive behavior (never blocks), not
        crash and not accidentally block everything."""
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "off"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["audio"],
            )
        assert result.status == "ALLOWED"
        assert result.would_block is True  # still detected and reported, just not enforced

    @pytest.mark.asyncio
    async def test_no_db_means_no_lookup_and_no_violation_possible(self):
        """db=None (some callers pass it conditionally) skips the whole
        config lookup — config stays None, so nothing can ever be flagged.
        This is an existing, deliberate fail-open behavior; pinned here so
        it's a documented tradeoff, not a silent surprise."""
        result = await enforce_on_submission(
            student_id="s1", data_type="student_evidence", db=None, evidence_types=["audio"],
        )
        assert result.status == "ALLOWED"
        assert result.would_block is False

    @pytest.mark.asyncio
    async def test_jurisdiction_lookup_exception_fails_open(self):
        """A DB hiccup during the jurisdiction lookup must not crash the
        request or accidentally block it — logs and proceeds with defaults."""
        with patch("services.privacy_engine.identify_jurisdiction", new=AsyncMock(side_effect=RuntimeError("db down"))), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["audio"],
            )
        assert result.status == "ALLOWED"
        assert result.would_block is False

    @pytest.mark.asyncio
    async def test_empty_evidence_types_list_is_not_sensitive(self):
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=[],
            )
        assert result.would_block is False

    @pytest.mark.asyncio
    async def test_evidence_type_matching_is_case_insensitive(self):
        config = _config(student_monitoring_allowed=False)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["AUDIO"],
            )
        assert result.would_block is True

    @pytest.mark.asyncio
    async def test_multiple_jurisdictions_strictest_wins_still_blocks(self):
        """merge_jurisdictions() is mocked here (its own strictest-wins
        logic is out of scope for this file), but confirms
        enforce_on_submission() correctly acts on whatever merged config it
        gets back — the realistic multi-jurisdiction case."""
        lenient = _config(jurisdiction_id="lenient_state", student_monitoring_allowed=True)
        strict = _config(jurisdiction_id="strict_state", student_monitoring_allowed=False)
        merged = _config(
            jurisdiction_id="lenient_state+strict_state",
            student_monitoring_allowed=lenient.student_monitoring_allowed and strict.student_monitoring_allowed,
        )
        with patch("services.privacy_engine.identify_jurisdiction", new=AsyncMock(return_value=["lenient_state", "strict_state"])), \
             patch("services.privacy_engine.merge_jurisdictions", new=AsyncMock(return_value=merged)), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["photo"],
            )
        assert result.status == "BLOCKED"

    @pytest.mark.asyncio
    async def test_explicit_jurisdiction_id_skips_org_derivation(self):
        """When a caller DOES pass jurisdiction_id explicitly (no current
        caller does, but the parameter is public API), the org-derivation
        path (identify_jurisdiction/merge_jurisdictions) must not run."""
        from services.privacy_engine import JurisdictionConfig as _JC
        config = _config(student_monitoring_allowed=False)
        with patch("services.privacy_engine._get_cached_rules", new=AsyncMock(return_value={"explicit_jid": config})), \
             patch("services.privacy_engine.identify_jurisdiction", new=AsyncMock(side_effect=AssertionError("should not be called"))), \
             patch("services.privacy_engine.resolve_jurisdiction_id", new=lambda jid, configs: "explicit_jid"), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(),
                jurisdiction_id="explicit_jid", evidence_types=["audio"],
            )
        assert result.status == "BLOCKED"
