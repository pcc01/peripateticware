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
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, ANY, patch

from services.privacy_engine import (
    EnforcementResult,
    JurisdictionConfig,
    PrivacyFramework,
    ConsentRule,
    DataCategory,
    AgeGroup,
    ConsentType,
    enforce_on_submission,
    enforce_or_raise,
    audit_submission,
    identify_jurisdiction,
    merge_jurisdictions,
    check_activity_compliance_for_org,
    PrivacyComplianceChecker,
    _deserialise_jurisdiction,
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
            activity_id=None,
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

    def _mock_jurisdiction(self, config: JurisdictionConfig, has_consent: bool = False):
        # has_consent defaults False: a bare AsyncMock() db (what every test
        # here passes) would otherwise make the REAL _has_valid_consent()
        # query a Mock whose auto-generated .scalar_one_or_none() is a
        # truthy MagicMock by default -- silently "finding" a fake consent
        # record and breaking every blocking-behavior assertion below.
        # Consent-satisfied behavior gets its own dedicated coverage in
        # TestConsentAwareBypass instead of leaking into this class's
        # jurisdiction/mode decision matrix.
        return patch.multiple(
            "services.privacy_engine",
            identify_jurisdiction=AsyncMock(return_value=[config.jurisdiction_id]),
            merge_jurisdictions=AsyncMock(return_value=config),
            _has_valid_consent=AsyncMock(return_value=has_consent),
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

    def _mock_jurisdiction(self, config: JurisdictionConfig, has_consent: bool = False):
        # has_consent defaults False: a bare AsyncMock() db (what every test
        # here passes) would otherwise make the REAL _has_valid_consent()
        # query a Mock whose auto-generated .scalar_one_or_none() is a
        # truthy MagicMock by default -- silently "finding" a fake consent
        # record and breaking every blocking-behavior assertion below.
        # Consent-satisfied behavior gets its own dedicated coverage in
        # TestConsentAwareBypass instead of leaking into this class's
        # jurisdiction/mode decision matrix.
        return patch.multiple(
            "services.privacy_engine",
            identify_jurisdiction=AsyncMock(return_value=[config.jurisdiction_id]),
            merge_jurisdictions=AsyncMock(return_value=config),
            _has_valid_consent=AsyncMock(return_value=has_consent),
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
             patch("services.privacy_engine._has_valid_consent", new=AsyncMock(return_value=False)), \
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
             patch("services.privacy_engine._has_valid_consent", new=AsyncMock(return_value=False)), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(),
                jurisdiction_id="explicit_jid", evidence_types=["audio"],
            )
        assert result.status == "BLOCKED"


class _FakeUser:
    def __init__(self, org_id=None, age_group=None, requires_parental_consent=False):
        self.org_id = org_id
        self.age_group = age_group
        self.requires_parental_consent = requires_parental_consent


def _db_returning(*values):
    """An AsyncMock db whose .execute() yields each MagicMock result in
    order, mirroring how SQLAlchemy 2.0 async results are consumed
    synchronously (.scalar_one_or_none() etc. on the awaited Result)."""
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(values))
    return db


class TestIdentifyJurisdictionAgeOverride:
    """The dead-code fix (2026-09): identify_jurisdiction() used to check a
    `user.age` attribute that doesn't exist anywhere on the User model
    (only age_group/requires_parental_consent) -- getattr always returned
    None, so this branch never fired. Confirmed live: a FERPA-only or
    unmapped-jurisdiction org got zero blocking on sensitive evidence for a
    real under-13 student. These exercise identify_jurisdiction() directly
    (not mocked), with only its `db` dependency stubbed."""

    @pytest.mark.asyncio
    async def test_under_13_age_group_appends_coppa_us(self):
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = _FakeUser(age_group="under_13")
        result = await identify_jurisdiction("s1", None, _db_returning(user_result))
        assert "coppa_us" in result

    @pytest.mark.asyncio
    async def test_requires_parental_consent_flag_alone_appends_coppa_us(self):
        """requires_parental_consent can be True while age_group is still
        None (both are set together by accept_invite in the real flow, but
        this is defense-in-depth: either signal alone is sufficient)."""
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = _FakeUser(
            age_group=None, requires_parental_consent=True,
        )
        result = await identify_jurisdiction("s1", None, _db_returning(user_result))
        assert "coppa_us" in result

    @pytest.mark.asyncio
    async def test_adult_does_not_append_coppa_us(self):
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = _FakeUser(
            age_group="adult", requires_parental_consent=False,
        )
        result = await identify_jurisdiction("s1", None, _db_returning(user_result))
        assert "coppa_us" not in result

    @pytest.mark.asyncio
    async def test_does_not_duplicate_coppa_us_already_present_from_org(self):
        """An org that ALSO already resolved to coppa_us on its own (e.g.
        has_under_13=True at signup) must not end up with a duplicate
        entry when the per-student override fires too."""
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = _FakeUser(
            org_id="org-1", age_group="under_13",
        )
        org_result = MagicMock()
        org_result.scalar_one_or_none.return_value = ["coppa_us"]  # JSONB column, already a list
        result = await identify_jurisdiction("s1", None, _db_returning(user_result, org_result))
        assert result.count("coppa_us") == 1


class TestConsentAwareBypass:
    """enforce_on_submission() (2026-09 fix) used to block sensitive
    evidence unconditionally whenever monitoring was disallowed --
    consent_required was set but never actually checked against anything,
    so even a family that had genuinely already consented would show
    would_block=True forever. Now it looks for real consent first. Mirrors
    TestEnforceOnSubmissionDecisionMatrix's approach (identify_jurisdiction/
    merge_jurisdictions mocked, everything else real) -- only the DB-level
    consent lookup inside _has_valid_consent is controlled per test here."""

    def _mock_jurisdiction(self, config: JurisdictionConfig):
        return patch.multiple(
            "services.privacy_engine",
            identify_jurisdiction=AsyncMock(return_value=[config.jurisdiction_id]),
            merge_jurisdictions=AsyncMock(return_value=config),
        )

    @pytest.mark.asyncio
    async def test_blocks_when_no_consent_record_exists(self):
        config = _config(student_monitoring_allowed=False)
        no_row = MagicMock()
        no_row.scalar_one_or_none.return_value = None
        db = AsyncMock()
        db.execute = AsyncMock(return_value=no_row)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=db, evidence_types=["audio"],
            )
        assert result.status == "BLOCKED"
        assert result.consent_required is True

    @pytest.mark.asyncio
    async def test_allows_when_active_parental_consent_record_exists(self):
        """The blanket ConsentRecord(consent_type='parental') row that
        routes/privacy.py::record_consent already writes when a parent uses
        the emailed consent link -- previously a one-way "reactivate the
        account" side effect that nothing else ever read."""
        config = _config(student_monitoring_allowed=False)
        found_row = MagicMock()
        found_row.scalar_one_or_none.return_value = "consent-row-id"
        db = AsyncMock()
        db.execute = AsyncMock(return_value=found_row)
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=db, evidence_types=["audio"],
            )
        assert result.status == "ALLOWED"
        assert result.would_block is False
        assert result.blocking_reason is None
        # Still surfaced for audit-trail transparency even though satisfied.
        assert result.consent_required is True

    @pytest.mark.asyncio
    async def test_activity_scoped_gps_consent_uses_shared_helper(self):
        """gps/location evidence with a known activity_id delegates to
        services.gps_consent.check_gps_consent -- the SAME function
        routes/sessions.py's own GPS gate uses, not a separate query
        against a different table."""
        config = _config(student_monitoring_allowed=False)
        mock_check = AsyncMock(return_value=True)
        with self._mock_jurisdiction(config), \
             patch("services.gps_consent.check_gps_consent", new=mock_check), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="learning_session", db=AsyncMock(),
                evidence_types=["gps"], activity_id="act-1",
            )
        mock_check.assert_awaited_once_with(ANY, "s1", "act-1")
        assert result.status == "ALLOWED"
        assert result.would_block is False

    @pytest.mark.asyncio
    async def test_consent_lookup_failure_fails_closed(self):
        """A DB hiccup during the consent lookup must still block -- an
        enforcement gate must never treat an error as "consent granted"."""
        config = _config(student_monitoring_allowed=False)
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=RuntimeError("db exploded"))
        with self._mock_jurisdiction(config), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=db, evidence_types=["photo"],
            )
        assert result.status == "BLOCKED"


class TestDeserialiseJurisdictionConsentRules:
    """PRIVACY_BUGFIX_PLAN.md Bug 2, step 1: _deserialise_jurisdiction() used
    to build JurisdictionConfig(...) without ever passing consent_rules=,
    silently dropping real DB-seeded teen-consent data (GDPR/CCPA's
    age_groups + requires_parental_consent entries) on the floor at the
    exact line that constructs the config the rest of the engine reads."""

    GDPR_SHAPED_RULE_DEF = {
        "jurisdiction_id": "gdpr_eu",
        "jurisdiction_name": "European Union — GDPR",
        "framework": "gdpr",
        "country_code": "EU",
        "consent_rules": [
            {
                "data_categories": ["identity", "contact", "location", "biometric", "health", "special"],
                "age_groups": ["under_16", "adult"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 16,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
            }
        ],
    }

    def test_consent_rules_survive_canonical_schema_deserialisation(self):
        config = _deserialise_jurisdiction("gdpr_eu", self.GDPR_SHAPED_RULE_DEF)
        assert len(config.consent_rules) == 1
        rule = config.consent_rules[0]
        assert rule.requires_parental_consent is True
        assert rule.parental_age_threshold == 16
        assert "under_16" in [str(g) for g in rule.age_groups]
        assert "location" in [str(c) for c in rule.data_categories]

    def test_no_consent_rules_key_yields_empty_list_not_a_crash(self):
        """A jurisdiction with no consent_rules at all (e.g. plain FERPA)
        must not error -- it just has nothing for the age-based check to
        match against."""
        config = _deserialise_jurisdiction("ferpa_us", {
            "jurisdiction_id": "ferpa_us",
            "jurisdiction_name": "United States Federal — FERPA",
            "framework": "ferpa",
            "country_code": "US",
        })
        assert config.consent_rules == []

    @pytest.mark.asyncio
    async def test_merge_jurisdictions_also_preserves_consent_rules(self):
        """merge_jurisdictions()'s own JurisdictionConfig(...) constructor
        call had the SAME omission as _deserialise_jurisdiction() -- and
        since no real caller of enforce_on_submission() passes an explicit
        jurisdiction_id (all go through merge_jurisdictions()), fixing only
        _deserialise_jurisdiction() would leave the age-based check
        permanently dead in production. This proves the merged config
        actually carries the union of consent_rules from every relevant
        jurisdiction."""
        gdpr_config = _deserialise_jurisdiction("gdpr_eu", self.GDPR_SHAPED_RULE_DEF)
        ferpa_config = _deserialise_jurisdiction("ferpa_us", {
            "jurisdiction_id": "ferpa_us", "jurisdiction_name": "FERPA",
            "framework": "ferpa", "country_code": "US",
        })
        with patch(
            "services.privacy_engine._get_cached_rules",
            new=AsyncMock(return_value={"gdpr_eu": gdpr_config, "ferpa_us": ferpa_config}),
        ):
            merged = await merge_jurisdictions(["gdpr_eu", "ferpa_us"], db=AsyncMock())
        assert len(merged.consent_rules) == 1
        assert merged.consent_rules[0].requires_parental_consent is True


class TestDeserialiseRemainingJurisdictionsConsentRules:
    """Coverage for backend/migrations/005_seed_remaining_jurisdictions.py --
    mirrors TestDeserialiseJurisdictionConsentRules's pattern (a representative
    rule_def literal per jurisdiction, fed through the real
    _deserialise_jurisdiction()) for the 5 jurisdictions that had an authored
    config JSON but no compliance_rules row at all before 005:
    pdpa_singapore, privacy_act_au, popia_za, lpdc_mx, aepd_ar.

    Each rule_def below reproduces exactly the consent_rules shape 005 writes
    (see that file's own module docstring for the full per-jurisdiction
    reasoning) -- these are not copies of the source JSON's other sections,
    just enough identity fields plus the consent_rules this test is actually
    about, same minimalism as the existing GDPR_SHAPED_RULE_DEF fixture.
    """

    def test_pdpa_singapore_consent_rules_cover_all_three_minor_bands(self):
        """pdpa_singapore's consent_requirements has parental_consent_required
        = true for BOTH young_child (0-12) and teen (13-17, which spans
        under_16 and under_18 exactly) -- all three minor bands should be
        present, adult excluded."""
        config = _deserialise_jurisdiction("pdpa_singapore", {
            "jurisdiction_id": "pdpa_singapore",
            "jurisdiction_name": "Singapore - Personal Data Protection Act (PDPA)",
            "framework": "pdpa",
            "country_code": "SG",
            "consent_rules": [
                {
                    "data_categories": ["location", "biometric"],
                    "age_groups": ["under_13", "under_16", "under_18"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 18,
                }
            ],
        })
        assert len(config.consent_rules) == 1
        rule = config.consent_rules[0]
        assert rule.requires_parental_consent is True
        assert set(rule.age_groups) == {"under_13", "under_16", "under_18"}
        assert "adult" not in rule.age_groups
        assert set(rule.data_categories) == {"location", "biometric"}

    def test_privacy_act_au_consent_rules_cover_only_under_13(self):
        """privacy_act_au's own child (0-14) / young_adult (15-17, EXPLICITLY
        no parental consent) split does not align with the engine's under_16
        bucket (13-15) -- 005 deliberately includes only the unambiguous
        under_13 band, not under_16, to avoid guessing which way to round
        the 13-14 vs. 15 mismatch."""
        config = _deserialise_jurisdiction("privacy_act_au", {
            "jurisdiction_id": "privacy_act_au",
            "jurisdiction_name": "Australia - Privacy Act 1988 / Australian Privacy Principles (APPs)",
            "framework": "privacy_act_au",
            "country_code": "AU",
            "consent_rules": [
                {
                    "data_categories": ["location", "biometric"],
                    "age_groups": ["under_13"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 15,
                }
            ],
        })
        assert len(config.consent_rules) == 1
        rule = config.consent_rules[0]
        assert rule.age_groups == ["under_13"]
        assert "under_16" not in rule.age_groups
        assert "under_18" not in rule.age_groups

    def test_popia_za_and_lpdc_mx_consent_rules_cover_all_three_minor_bands(self):
        """Both popia_za and lpdc_mx have a single uniform 'child' age
        category (0-17) driven by one explicit child_age_threshold: 18 --
        0-17 exactly equals under_13 union under_16 union under_18, so all
        three engine buckets should be covered by one consent_rules entry."""
        for jid, name in (
            ("popia_za", "POPIA (South Africa)"),
            ("lpdc_mx", "LPDC (Mexico)"),
        ):
            config = _deserialise_jurisdiction(jid, {
                "jurisdiction_id": jid,
                "jurisdiction_name": name,
                "framework": "popia" if jid == "popia_za" else "lfpdppp",
                "country_code": "ZA" if jid == "popia_za" else "MX",
                "consent_rules": [
                    {
                        "data_categories": ["location", "biometric"],
                        "age_groups": ["under_13", "under_16", "under_18"],
                        "consent_type": "explicit",
                        "requires_parental_consent": True,
                        "parental_age_threshold": 18,
                    }
                ],
            })
            assert len(config.consent_rules) == 1, jid
            rule = config.consent_rules[0]
            assert rule.requires_parental_consent is True, jid
            assert set(rule.age_groups) == {"under_13", "under_16", "under_18"}, jid

    def test_aepd_ar_has_two_consent_rules_and_excludes_under_18(self):
        """aepd_ar has the richest signal of the 5: two distinct thresholds
        (child_age_threshold=13 for ALL processing, secondary_age_threshold=16
        for non-essential processing only) that map exactly onto under_13 and
        under_16 respectively -- and teen (16-17) is EXPLICITLY
        parental_consent_required=false ('may consent independently'), so
        under_18 must not appear in either entry."""
        config = _deserialise_jurisdiction("aepd_ar", {
            "jurisdiction_id": "aepd_ar",
            "jurisdiction_name": "PDPA (Argentina)",
            "framework": "pdpa",
            "country_code": "AR",
            "consent_rules": [
                {
                    "data_categories": ["location", "biometric"],
                    "age_groups": ["under_13"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 13,
                },
                {
                    "data_categories": ["location", "biometric"],
                    "age_groups": ["under_16"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 16,
                },
            ],
        })
        assert len(config.consent_rules) == 2
        all_age_groups = {g for rule in config.consent_rules for g in rule.age_groups}
        assert all_age_groups == {"under_13", "under_16"}
        assert "under_18" not in all_age_groups
        assert all(r.requires_parental_consent for r in config.consent_rules)

    @pytest.mark.asyncio
    async def test_merge_jurisdictions_unions_consent_rules_across_new_and_old(self):
        """Sanity check that a new jurisdiction's consent_rules merges
        correctly alongside an existing Stage-1 jurisdiction (aepd_ar +
        ferpa_us), exactly like TestDeserialiseJurisdictionConsentRules's own
        merge test does for gdpr_eu + ferpa_us."""
        aepd_config = _deserialise_jurisdiction("aepd_ar", {
            "jurisdiction_id": "aepd_ar", "jurisdiction_name": "PDPA (Argentina)",
            "framework": "pdpa", "country_code": "AR",
            "consent_rules": [
                {
                    "data_categories": ["location", "biometric"],
                    "age_groups": ["under_13"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                },
            ],
        })
        ferpa_config = _deserialise_jurisdiction("ferpa_us", {
            "jurisdiction_id": "ferpa_us", "jurisdiction_name": "FERPA",
            "framework": "ferpa", "country_code": "US",
        })
        with patch(
            "services.privacy_engine._get_cached_rules",
            new=AsyncMock(return_value={"aepd_ar": aepd_config, "ferpa_us": ferpa_config}),
        ):
            merged = await merge_jurisdictions(["aepd_ar", "ferpa_us"], db=AsyncMock())
        assert len(merged.consent_rules) == 1
        assert merged.consent_rules[0].requires_parental_consent is True
        assert "under_13" in merged.consent_rules[0].age_groups


class TestRulesCacheRoundTripPreservesConsentRules:
    """Caught live 2026-09-13 during the staged log-mode rollout of Bug 2's
    fix: every existing test above mocks _get_cached_rules() itself, which
    bypasses the actual Redis serialise/deserialise round trip entirely --
    exactly why this slipped through. _get_cached_rules()'s own
    `serialisable` dict never included consent_rules, so a genuinely
    under-16 GDPR student got zero age-differentiated warning the moment a
    *different* request had already populated the cache (i.e. on every
    request except the very first cold load in up to an hour). This test
    exercises _get_cached_rules() itself end-to-end, mocking only the
    Redis layer (core.cache.get_cache/set_cache), not the function under
    test."""

    GDPR_RULE_DEF = {
        "jurisdiction_id": "gdpr_eu",
        "jurisdiction_name": "European Union — GDPR",
        "framework": "gdpr",
        "country_code": "EU",
        "consent_rules": [
            {
                "data_categories": ["identity", "contact", "location", "biometric", "health", "special"],
                "age_groups": ["under_16"],
                "consent_type": "explicit",
                "requires_parental_consent": True,
                "parental_age_threshold": 16,
                "consent_withdrawal_allowed": True,
                "transparency_required": True,
            }
        ],
    }

    @pytest.mark.asyncio
    async def test_consent_rules_survive_a_real_cache_round_trip(self):
        from services import privacy_engine as pe

        fake_row = MagicMock(jurisdiction="gdpr_eu", rule_definition=self.GDPR_RULE_DEF)
        fake_result = MagicMock()
        fake_result.scalars.return_value.all.return_value = [fake_row]
        fake_db = AsyncMock()
        fake_db.execute = AsyncMock(return_value=fake_result)

        # In-memory stand-in for Redis: set_cache writes here, get_cache
        # reads from here -- a real round trip through JSON-shaped data,
        # not a mock that just remembers a Python object by reference.
        store: dict = {}

        async def fake_get_cache(key):
            return json.loads(store[key]) if key in store else None

        async def fake_set_cache(key, value, ttl=3600):
            store[key] = json.dumps(value)
            return True

        with patch.object(pe.redis_cache, "get_cache", side_effect=fake_get_cache), \
             patch.object(pe.redis_cache, "set_cache", side_effect=fake_set_cache):
            # Cold load: cache empty, must hit the DB and then populate it.
            cold = await pe._get_cached_rules(fake_db)
            assert len(cold["gdpr_eu"].consent_rules) == 1
            assert "under_16" in cold["gdpr_eu"].consent_rules[0].age_groups

            # Cache hit: must NOT touch the DB again, and must still have
            # consent_rules -- this is the exact call that silently
            # returned an empty list before this fix.
            fake_db.execute.reset_mock()
            warm = await pe._get_cached_rules(fake_db)
            fake_db.execute.assert_not_called()
            assert len(warm["gdpr_eu"].consent_rules) == 1
            assert warm["gdpr_eu"].consent_rules[0].requires_parental_consent is True
            assert "under_16" in warm["gdpr_eu"].consent_rules[0].age_groups


class TestAgeDifferentiatedConsent:
    """PRIVACY_BUGFIX_PLAN.md Bug 2: under_16/under_18 students used to get
    identical enforcement treatment to adults everywhere, even though
    GDPR/CCPA's own seeded consent_rules data specifies an additional
    teen-consent requirement the engine never consulted. This new check must
    be genuinely INDEPENDENT of the existing student_monitoring_allowed
    check -- proven by using student_monitoring_allowed=True (org-level
    check passes) and confirming the age-based rule alone still triggers
    would_block=True."""

    def _gdpr_like_config(self, **overrides) -> JurisdictionConfig:
        defaults = dict(
            jurisdiction_id="gdpr_like",
            jurisdiction_name="GDPR-shaped Test Jurisdiction",
            framework=PrivacyFramework.GDPR,
            country_code="EU",
            student_monitoring_allowed=True,  # org-level check passes
            student_data_sharing_allowed=True,
            consent_rules=[
                ConsentRule(
                    data_categories=[DataCategory.LOCATION],
                    age_groups=[AgeGroup.UNDER_16, AgeGroup.ADULT],
                    consent_type=ConsentType.EXPLICIT,
                    requires_parental_consent=True,
                    parental_age_threshold=16,
                )
            ],
        )
        defaults.update(overrides)
        return JurisdictionConfig(**defaults)

    def _mock_jurisdiction(self, config: JurisdictionConfig, age_group, has_consent: bool = False):
        return patch.multiple(
            "services.privacy_engine",
            identify_jurisdiction=AsyncMock(return_value=[config.jurisdiction_id]),
            merge_jurisdictions=AsyncMock(return_value=config),
            _has_valid_consent=AsyncMock(return_value=has_consent),
            _get_student_age_group=AsyncMock(return_value=age_group),
        )

    @pytest.mark.asyncio
    async def test_under_16_no_consent_would_block_even_though_monitoring_allowed(self):
        """THE core fix: student_monitoring_allowed=True means the
        PRE-EXISTING check would never fire -- this proves the NEW
        age-based check is independently triggerable."""
        config = self._gdpr_like_config()
        with self._mock_jurisdiction(config, age_group="under_16"), \
             patch("core.config.settings.ENFORCEMENT_MODE", "log"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["location"],
            )
        assert result.would_block is True
        assert result.consent_required is True
        assert "age group" in result.blocking_reason.lower()
        assert "under_16" in result.blocking_reason

    @pytest.mark.asyncio
    async def test_under_16_with_valid_consent_does_not_block(self):
        config = self._gdpr_like_config()
        with self._mock_jurisdiction(config, age_group="under_16", has_consent=True), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["location"],
            )
        assert result.would_block is False
        assert result.status == "ALLOWED"

    @pytest.mark.asyncio
    async def test_adult_control_case_unaffected(self):
        """Same org, same evidence, adult student -- the age-based rule's
        age_groups is [under_16, adult]... wait: GDPR's real seed data
        actually lists 'adult' in age_groups too (consent_type=explicit for
        everyone), so use a config whose age-based rule targets under_16
        ONLY, to prove an adult in the exact same org is genuinely
        unaffected by this new check."""
        config = self._gdpr_like_config(
            consent_rules=[
                ConsentRule(
                    data_categories=[DataCategory.LOCATION],
                    age_groups=[AgeGroup.UNDER_16],
                    consent_type=ConsentType.EXPLICIT,
                    requires_parental_consent=True,
                    parental_age_threshold=16,
                )
            ],
        )
        with self._mock_jurisdiction(config, age_group="adult"), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["location"],
            )
        assert result.would_block is False
        assert result.status == "ALLOWED"

    @pytest.mark.asyncio
    async def test_under_16_in_jurisdiction_without_age_differentiated_rule_unaffected(self):
        """A plain FERPA/COPPA-shaped jurisdiction with no age-differentiated
        consent_rules entry at all -- proves the fix is genuinely
        jurisdiction-scoped, not a blanket new under-16 gate everywhere."""
        config = self._gdpr_like_config(consent_rules=[])
        with self._mock_jurisdiction(config, age_group="under_16"), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["location"],
            )
        assert result.would_block is False
        assert result.status == "ALLOWED"

    @pytest.mark.asyncio
    async def test_no_age_group_on_file_does_not_crash_or_block(self):
        """A student with no date_of_birth on file (age_group=None) must not
        match an age-based rule -- None is never a member of any age_groups
        list -- and must not error."""
        config = self._gdpr_like_config()
        with self._mock_jurisdiction(config, age_group=None), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["location"],
            )
        assert result.would_block is False

    @pytest.mark.asyncio
    async def test_evidence_type_with_no_data_category_mapping_does_not_match(self):
        """"audio"/"video"/"photo" are sensitive (trigger the existing
        monitoring check) but have no DataCategory counterpart in the actual
        seed data -- the age-based rule (scoped to 'location' here) must not
        fire for them."""
        config = self._gdpr_like_config()
        with self._mock_jurisdiction(config, age_group="under_16"), \
             patch("core.config.settings.ENFORCEMENT_MODE", "block"):
            result = await enforce_on_submission(
                student_id="s1", data_type="student_evidence", db=AsyncMock(), evidence_types=["audio"],
            )
        assert result.would_block is False


class TestEnforceOrRaiseForceBlock:
    """force_block_on_would_block (2026-09): defaults to False so every
    pre-existing call site is byte-for-byte unaffected -- the block decision
    reduces to exactly `result.status == "BLOCKED"`, same as always. Only
    the 3 new real-time GPS-streaming call sites (location_update,
    live-position, track) pass True, to hard-block immediately rather than
    wait on the global ENFORCEMENT_MODE rollout."""

    @pytest.mark.asyncio
    async def test_default_false_does_not_raise_on_would_block(self):
        would_block_but_allowed = EnforcementResult(status="ALLOWED", would_block=True, blocking_reason="x")
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=would_block_but_allowed)), \
             patch("core.database.get_session_factory", new=lambda: FakeSessionFactory()), \
             patch("services.privacy_engine.log_access", new=AsyncMock()):
            result = await enforce_or_raise(student_id="s1", data_type="student_notebook", db=AsyncMock())
        assert result is would_block_but_allowed  # not raised -- every existing call site unaffected

    @pytest.mark.asyncio
    async def test_force_true_raises_even_in_log_mode_when_would_block(self):
        from fastapi import HTTPException

        would_block_but_allowed = EnforcementResult(
            status="ALLOWED", would_block=True, blocking_reason="region restricted",
        )
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=would_block_but_allowed)), \
             patch("core.database.get_session_factory", new=lambda: FakeSessionFactory()), \
             patch("services.privacy_engine.log_access", new=AsyncMock()):
            with pytest.raises(HTTPException) as exc_info:
                await enforce_or_raise(
                    student_id="s1", data_type="learning_session_event", db=AsyncMock(),
                    force_block_on_would_block=True,
                )
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "region restricted"

    @pytest.mark.asyncio
    async def test_force_true_still_allows_when_would_block_is_false(self):
        allowed = EnforcementResult(status="ALLOWED", would_block=False)
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=allowed)), \
             patch("core.database.get_session_factory", new=lambda: FakeSessionFactory()), \
             patch("services.privacy_engine.log_access", new=mock_log_access):
            result = await enforce_or_raise(
                student_id="s1", data_type="learning_session_event", db=AsyncMock(),
                force_block_on_would_block=True,
            )
        assert result is allowed
        # PRIVACY_BUGFIX_PLAN.md Bug 3 control case: nothing was actually
        # force-blocked here (would_block=False), so no override should be
        # applied -- compliance_status must match result.status unchanged.
        _, kwargs = mock_log_access.await_args
        assert kwargs["compliance_status"] == allowed.status == "ALLOWED"

    @pytest.mark.asyncio
    async def test_default_force_false_leaves_compliance_status_unaffected(self):
        """Bug 3 control case: force_block_on_would_block defaults to False
        (every pre-existing call site) -- compliance_status must be exactly
        result.status, with no override path taken at all."""
        blocked = EnforcementResult(status="BLOCKED", blocking_reason="nope", would_block=True)
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=blocked)), \
             patch("core.database.get_session_factory", new=lambda: FakeSessionFactory()), \
             patch("services.privacy_engine.log_access", new=mock_log_access):
            from fastapi import HTTPException
            with pytest.raises(HTTPException):
                await enforce_or_raise(student_id="s1", data_type="student_evidence", db=AsyncMock())
        _, kwargs = mock_log_access.await_args
        assert kwargs["compliance_status"] == "BLOCKED"

    @pytest.mark.asyncio
    async def test_force_true_in_log_mode_records_blocked_not_allowed(self):
        """THE core fix. Mechanism: enforce_on_submission() computes
        result.status purely from the global ENFORCEMENT_MODE ("log" here ->
        status="ALLOWED" even though blocking_reasons were detected), with no
        knowledge of force_block_on_would_block. should_block folds that flag
        in AFTER result.status was computed, and used to fire the real 403
        AFTER the audit row (recording result.status="ALLOWED" verbatim) had
        already been written. This proves compliance_status now reflects
        what actually happened (a real 403), not the mode-collapsed status."""
        from fastapi import HTTPException

        would_block_but_allowed = EnforcementResult(
            status="ALLOWED", would_block=True, blocking_reason="region restricted",
        )
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=would_block_but_allowed)), \
             patch("core.database.get_session_factory", new=lambda: FakeSessionFactory()), \
             patch("services.privacy_engine.log_access", new=mock_log_access), \
             patch("core.config.settings.ENFORCEMENT_MODE", "log"):
            with pytest.raises(HTTPException) as exc_info:
                await enforce_or_raise(
                    student_id="s1", data_type="learning_session_event", db=AsyncMock(),
                    force_block_on_would_block=True,
                )
        assert exc_info.value.status_code == 403  # the real, actually-applied outcome
        _, kwargs = mock_log_access.await_args
        assert kwargs["compliance_status"] == "BLOCKED"  # not "ALLOWED" -- the pre-fix bug

    @pytest.mark.asyncio
    async def test_force_true_in_warn_mode_records_blocked_not_warning(self):
        """Companion case: mode="warn" would make enforce_on_submission()
        alone produce status="WARNING" -- confirm the override still reports
        "BLOCKED" (what actually happened), not "WARNING" (what
        enforce_on_submission's own mode-driven computation would have said)."""
        from fastapi import HTTPException

        would_block_but_warned = EnforcementResult(
            status="WARNING", would_block=True, blocking_reason="region restricted",
        )
        mock_log_access = AsyncMock()
        with patch("services.privacy_engine.enforce_on_submission", new=AsyncMock(return_value=would_block_but_warned)), \
             patch("core.database.get_session_factory", new=lambda: FakeSessionFactory()), \
             patch("services.privacy_engine.log_access", new=mock_log_access), \
             patch("core.config.settings.ENFORCEMENT_MODE", "warn"):
            with pytest.raises(HTTPException):
                await enforce_or_raise(
                    student_id="s1", data_type="learning_session_event", db=AsyncMock(),
                    force_block_on_would_block=True,
                )
        _, kwargs = mock_log_access.await_args
        assert kwargs["compliance_status"] == "BLOCKED"


class TestCheckActivityComplianceForOrg:
    """PRIVACY_BUGFIX_PLAN.md Bug 1 — publish_activity/check-compliance used
    to check settings.ACTIVE_JURISDICTION (a single process-wide env var)
    instead of the activity's own org/teacher jurisdiction, AND the DB-seeded
    rule_definition never carried student_age_categories/
    prohibited_data_collection/special_restrictions at all, so the gate was
    structurally unable to produce a genuine issue for any org. These tests
    exercise check_activity_compliance_for_org() (the extracted fix) with
    identify_jurisdiction() mocked (it needs a real DB) and real
    JurisdictionConfig/PrivacyComplianceChecker objects otherwise -- same
    strategy as TestEnforceOnSubmissionDecisionMatrix."""

    STRICT_RULE_DEF = {
        "jurisdiction_id": "strict_jid",
        "jurisdiction_name": "Strict Test Jurisdiction",
        "country_code": "XX",
        "framework": "gdpr",
        "student_age_categories": {"minor": {"min_age": 0, "max_age": 17}},
        "prohibited_data_collection": {"minor": ["location"]},
    }
    LENIENT_RULE_DEF = {
        "jurisdiction_id": "lenient_jid",
        "jurisdiction_name": "Lenient Test Jurisdiction",
        "country_code": "XX",
        "framework": "custom",
        "student_age_categories": {"minor": {"min_age": 0, "max_age": 17}},
        "prohibited_data_collection": {},
    }

    def _two_jurisdiction_checker(self) -> PrivacyComplianceChecker:
        checker = PrivacyComplianceChecker()
        checker.register_jurisdiction(_deserialise_jurisdiction("strict_jid", self.STRICT_RULE_DEF))
        checker.register_jurisdiction(_deserialise_jurisdiction("lenient_jid", self.LENIENT_RULE_DEF))
        return checker

    @pytest.mark.asyncio
    async def test_org_resolving_to_strict_jurisdiction_blocks(self):
        """The org's own jurisdiction (strict_jid) bans 'location' for this
        age band. The OLD code would have checked settings.ACTIVE_JURISDICTION
        instead -- set here to the lenient jurisdiction -- and silently
        passed. The fix must catch this."""
        checker = self._two_jurisdiction_checker()
        with patch("services.privacy_engine.identify_jurisdiction", new=AsyncMock(return_value=["strict_jid"])), \
             patch("core.config.settings.ACTIVE_JURISDICTION", "lenient_jid"):
            is_compliant, issues, warnings = await check_activity_compliance_for_org(
                "teacher-1", "activity-1", {"data_collection": ["location"]}, 10, checker, db=AsyncMock(),
            )
        assert is_compliant is False
        assert any("location" in i.lower() for i in issues)

    @pytest.mark.asyncio
    async def test_org_resolving_to_lenient_jurisdiction_allows(self):
        """Mirror case: the org's own jurisdiction is the lenient one, while
        settings.ACTIVE_JURISDICTION happens to be the strict one -- proves
        the fix is genuinely per-org, not just 'always stricter now'."""
        checker = self._two_jurisdiction_checker()
        with patch("services.privacy_engine.identify_jurisdiction", new=AsyncMock(return_value=["lenient_jid"])), \
             patch("core.config.settings.ACTIVE_JURISDICTION", "strict_jid"):
            is_compliant, issues, warnings = await check_activity_compliance_for_org(
                "teacher-2", "activity-2", {"data_collection": ["location"]}, 10, checker, db=AsyncMock(),
            )
        assert is_compliant is True
        assert issues == []

    @pytest.mark.asyncio
    async def test_unresolved_jurisdiction_fails_open(self):
        """A teacher/org whose jurisdiction id isn't seeded at all (no
        compliance_rules row) must not newly hard-block publishing --
        fail-open preserved, mirroring test_publish_activity's plain-publish
        regression expectation from test_activities.py (no jurisdiction data
        configured -> publish still succeeds)."""
        checker = PrivacyComplianceChecker()  # nothing registered
        with patch("services.privacy_engine.identify_jurisdiction", new=AsyncMock(return_value=["nonexistent_jid"])):
            is_compliant, issues, warnings = await check_activity_compliance_for_org(
                "teacher-3", "activity-3", {"data_collection": ["location"]}, 10, checker, db=AsyncMock(),
            )
        assert is_compliant is True
        assert issues == []

    @pytest.mark.asyncio
    async def test_rule_data_gap_fix_prohibited_collection_now_detected(self):
        """The compounding finding: before migration 003 populates
        prohibited_data_collection in the real DB seed, this field was always
        {} for every DB-backed jurisdiction, so check_activity_compliance()
        could never return a genuine issue for any org regardless of which
        jurisdiction was checked. This proves the read path works correctly
        once the field is actually populated (as migration 003 does)."""
        checker = PrivacyComplianceChecker()
        checker.register_jurisdiction(_deserialise_jurisdiction("gdpr_like", {
            "jurisdiction_id": "gdpr_like",
            "jurisdiction_name": "GDPR-shaped Test Jurisdiction",
            "country_code": "EU",
            "framework": "gdpr",
            "student_age_categories": {"child": {"min_age": 0, "max_age": 13}},
            "prohibited_data_collection": {"child": ["behavioral"]},
        }))
        with patch("services.privacy_engine.identify_jurisdiction", new=AsyncMock(return_value=["gdpr_like"])):
            is_compliant, issues, warnings = await check_activity_compliance_for_org(
                "teacher-4", "activity-4", {"data_collection": ["behavioral"]}, 10, checker, db=AsyncMock(),
            )
        assert is_compliant is False
        assert any("behavioral" in i.lower() for i in issues)
