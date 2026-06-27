# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for GDPR Art. 33/34 breach notification system.

Covers:
  - BreachIncident model: defaults, severity/status enums, repr, column presence
  - POST /breach/incidents: admin creates incident (201)
  - POST /breach/incidents: non-admin gets 403
  - GET  /breach/incidents: list returns {incidents: [...]}
  - check_overdue_dpa_notifications scheduler job (zero and non-zero cases)
  - send_dpa_breach_notification / send_user_breach_notification in dry-run mode

NOTE: routes/breach.py and check_overdue_dpa_notifications do not exist yet —
those test classes are skipped with pytest.mark.skipif until the build agent
delivers those modules.
"""
import sys
import os
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

_BACKEND = "/sessions/serene-brave-volta/mnt/peripateticware/backend"
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)


# ---------------------------------------------------------------------------
# Availability guards
# ---------------------------------------------------------------------------

def _breach_routes_available() -> bool:
    try:
        import routes.breach  # noqa: F401
        return True
    except ImportError:
        return False


def _overdue_checker_available() -> bool:
    try:
        from tasks.retention_cleanup import check_overdue_dpa_notifications  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# BreachIncident model — models/compliance.py already ships this
# ---------------------------------------------------------------------------

class TestBreachIncidentModel:
    """Unit tests for BreachIncident ORM model."""

    def test_imports(self):
        from models.compliance import BreachIncident, BreachSeverity, BreachStatus
        assert BreachIncident.__tablename__ == "breach_incidents"

    def test_severity_enum(self):
        from models.compliance import BreachSeverity
        values = [s.value for s in BreachSeverity]
        assert "low" in values
        assert "critical" in values

    def test_status_enum(self):
        from models.compliance import BreachStatus
        values = [s.value for s in BreachStatus]
        assert "discovered" in values
        assert "closed" in values

    def test_status_enum_full_lifecycle(self):
        from models.compliance import BreachStatus
        values = [s.value for s in BreachStatus]
        for expected in ("discovered", "investigating", "contained", "closed"):
            assert expected in values, f"Missing status: {expected}"

    def test_severity_enum_all_levels(self):
        from models.compliance import BreachSeverity
        values = [s.value for s in BreachSeverity]
        for expected in ("low", "medium", "high", "critical"):
            assert expected in values, f"Missing severity: {expected}"

    def test_incident_defaults(self):
        """All column defaults are SQLAlchemy ColumnDefault — they fire at DB flush,
        not at Python __init__ time.  Verify via mapper column metadata."""
        from models.compliance import BreachIncident, BreachStatus
        from sqlalchemy import inspect as sa_inspect

        mapper = sa_inspect(BreachIncident)
        col_map = {
            list(attr.columns)[0].name: list(attr.columns)[0]
            for attr in mapper.mapper.column_attrs
        }
        assert col_map["status"].default.arg == BreachStatus.DISCOVERED
        assert col_map["dpa_notification_required"].default.arg is True
        assert col_map["user_notification_required"].default.arg is False

    def test_incident_default_severity(self):
        """Column-level default for severity is BreachSeverity.MEDIUM in the schema."""
        from models.compliance import BreachIncident, BreachSeverity
        from sqlalchemy import inspect as sa_inspect

        mapper = sa_inspect(BreachIncident)
        col_map = {
            list(attr.columns)[0].name: list(attr.columns)[0]
            for attr in mapper.mapper.column_attrs
        }
        severity_default = col_map["severity"].default.arg
        assert severity_default == BreachSeverity.MEDIUM

    def test_repr(self):
        from models.compliance import BreachIncident
        i = BreachIncident(reported_by="a", description="b", severity="high")
        r = repr(i)
        assert "BreachIncident" in r
        assert "high" in r

    def test_all_key_columns_present(self):
        """Spot-check that the GDPR-required columns exist on the mapper."""
        from models.compliance import BreachIncident
        from sqlalchemy import inspect
        mapper = inspect(BreachIncident)
        col_names = {c.key for c in mapper.columns}
        required = (
            "id", "discovered_at", "reported_by", "description",
            "severity", "status", "data_categories", "jurisdictions",
            "dpa_notification_required", "dpa_deadline", "dpa_notified_at",
            "user_notification_required", "users_notified_at", "users_notified_count",
        )
        for col in required:
            assert col in col_names, f"Missing column on BreachIncident: {col}"


# ---------------------------------------------------------------------------
# Route tests — skipped until routes/breach.py is merged
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not _breach_routes_available(),
    reason="routes/breach.py not yet available — build agent still running",
)
class TestBreachRoutes:
    """Integration-style tests using a minimal in-process FastAPI app."""

    def setup_method(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from models.user import UserRole

        app = FastAPI()

        self.mock_user = MagicMock()
        self.mock_user.id = "00000000-0000-0000-0000-000000000001"
        self.mock_user.email = "admin@example.com"
        self.mock_user.role = UserRole.ADMIN

        self.mock_non_admin = MagicMock()
        self.mock_non_admin.id = "00000000-0000-0000-0000-000000000002"
        self.mock_non_admin.email = "teacher@example.com"
        self.mock_non_admin.role = UserRole.TEACHER

        self.mock_db = AsyncMock()
        self.mock_db.execute = AsyncMock()
        self.mock_db.flush = AsyncMock()
        self.mock_db.commit = AsyncMock()

        import routes.breach as breach_mod
        from core.dependencies import get_current_user
        from core.database import get_db

        app.include_router(breach_mod.router, prefix="/api/v1")

        async def override_user():
            return self.mock_user

        async def override_db():
            yield self.mock_db

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db] = override_db
        self.app = app
        self.client = TestClient(app)

    def test_log_incident_admin_201(self):
        self.mock_db.add = MagicMock()
        with patch("routes.breach.BreachIncident") as MockIncident:
            inst = MagicMock()
            inst.id = "00000000-0000-0000-0000-000000000099"
            inst.status = "discovered"
            inst.severity = "medium"
            inst.dpa_deadline = datetime.utcnow() + timedelta(hours=72)
            MockIncident.return_value = inst
            resp = self.client.post("/api/v1/breach/incidents", json={
                "description": "Test breach",
                "severity": "medium",
                "data_categories": ["email", "location"],
                "jurisdictions": ["gdpr_eu"],
            })
        assert resp.status_code == 201
        data = resp.json()
        assert "dpa_deadline" in data
        assert data["hours_remaining"] == 72

    def test_log_incident_non_admin_403(self):
        from core.dependencies import get_current_user

        async def override_non_admin():
            return self.mock_non_admin

        self.app.dependency_overrides[get_current_user] = override_non_admin
        resp = self.client.post("/api/v1/breach/incidents", json={
            "description": "Test",
            "severity": "low",
            "data_categories": ["email"],
            "jurisdictions": ["gdpr_eu"],
        })
        assert resp.status_code == 403

    def test_list_incidents_admin(self):
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        self.mock_db.execute.return_value = mock_result
        resp = self.client.get("/api/v1/breach/incidents")
        assert resp.status_code == 200
        assert "incidents" in resp.json()


# ---------------------------------------------------------------------------
# Overdue DPA checker — skipped until check_overdue_dpa_notifications is added
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not _overdue_checker_available(),
    reason="check_overdue_dpa_notifications not yet in tasks/retention_cleanup",
)
class TestOverdueChecker:
    """Unit tests for the check_overdue_dpa_notifications scheduler job."""

    @pytest.mark.asyncio
    async def test_no_overdue_returns_zero(self):
        from tasks.retention_cleanup import check_overdue_dpa_notifications
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        db.execute.return_value = mock_result
        count = await check_overdue_dpa_notifications(db)
        assert count == 0

    @pytest.mark.asyncio
    async def test_overdue_sends_alert(self):
        from tasks.retention_cleanup import check_overdue_dpa_notifications
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            (
                "some-uuid",
                datetime.utcnow() - timedelta(hours=80),   # discovered_at
                datetime.utcnow() - timedelta(hours=8),    # dpa_deadline (8h overdue)
                "high",
                "Test breach",
            )
        ]
        db.execute.return_value = mock_result

        # send_notification is imported locally inside check_overdue_dpa_notifications,
        # so it must be patched at its definition site in services.email_service.
        with patch(
            "services.email_service.send_notification", new_callable=AsyncMock
        ) as mock_send:
            mock_send.return_value = True
            count = await check_overdue_dpa_notifications(db)
        assert count == 1


# ---------------------------------------------------------------------------
# Email functions — services/email_service.py already has both
# ---------------------------------------------------------------------------

class TestEmailFunctions:
    """Test DPA and user breach notification emails in dry-run mode."""

    @pytest.mark.asyncio
    async def test_dpa_email_dry_run(self):
        with patch.dict(os.environ, {"EMAIL_DRY_RUN": "true"}):
            from services.email_service import send_dpa_breach_notification
            result = await send_dpa_breach_notification(
                dpa_email="dpa@example.com",
                incident_id="test-id-1234",
                discovered_at="2026-06-27T00:00:00",
                severity="medium",
                description="A test breach occurred",
                data_categories=["email", "full_name"],
                affected_count=42,
                jurisdictions=["gdpr_eu"],
            )
            # dry-run logs the email and returns True without sending
            assert result is True

    @pytest.mark.asyncio
    async def test_user_email_dry_run(self):
        with patch.dict(os.environ, {"EMAIL_DRY_RUN": "true"}):
            from services.email_service import send_user_breach_notification
            result = await send_user_breach_notification(
                to="user@example.com",
                incident_id="test-id-5678",
                data_categories=["email"],
                description_for_users="We identified a breach affecting email addresses.",
                recommended_actions=["Change your password", "Monitor your accounts"],
            )
            assert result is True

    @pytest.mark.asyncio
    async def test_dpa_email_none_affected_count(self):
        """affected_count=None renders 'Under investigation' — must not crash."""
        with patch.dict(os.environ, {"EMAIL_DRY_RUN": "true"}):
            from services.email_service import send_dpa_breach_notification
            result = await send_dpa_breach_notification(
                dpa_email="dpa@example.com",
                incident_id="test-id-no-count",
                discovered_at="2026-06-27T00:00:00",
                severity="low",
                description="Breach with unknown affected count",
                data_categories=["location"],
                affected_count=None,
                jurisdictions=["ccpa"],
            )
            assert result is True

    @pytest.mark.asyncio
    async def test_user_email_no_recommended_actions(self):
        """recommended_actions=None must not crash."""
        with patch.dict(os.environ, {"EMAIL_DRY_RUN": "true"}):
            from services.email_service import send_user_breach_notification
            result = await send_user_breach_notification(
                to="user@example.com",
                incident_id="test-id-no-actions",
                data_categories=["full_name", "email"],
                description_for_users="We identified a security incident.",
                recommended_actions=None,
            )
            assert result is True
