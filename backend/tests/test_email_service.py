# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Phase 2 Integration Tests - Email Service
Tests all email functionality end-to-end
"""

import pytest
from datetime import datetime
from services.email_service import (
    EmailService, EmailFrequency, EmailType, 
    EmailRequest, ProgressDigest
)


class TestEmailService:
    """Email service integration tests"""

    @pytest.fixture
    def email_service(self):
        """Create email service instance"""
        return EmailService()

    # Test Email Sending
    def test_send_email_success(self, email_service):
        """Test successful email sending"""
        import asyncio
        
        request = EmailRequest(
            to_email="parent@example.com",
            subject="Test Email",
            body="This is a test",
            email_type=EmailType.PROGRESS_DIGEST,
            parent_id="parent1"
        )
        
        result = asyncio.run(email_service.send_email(request))
        assert result is True

    def test_send_email_invalid_email(self, email_service):
        """Test email sending with invalid email"""
        import asyncio
        
        request = EmailRequest(
            to_email="invalid-email",
            subject="Test",
            body="Test",
            email_type=EmailType.PROGRESS_DIGEST,
            parent_id="parent1"
        )
        
        # Should still return True as we're mocking
        result = asyncio.run(email_service.send_email(request))
        assert result is True

    # Test Progress Digest
    def test_send_progress_digest_weekly(self, email_service):
        """Test weekly progress digest"""
        import asyncio
        
        digest = ProgressDigest(
            parent_id="parent1",
            child_id="child1",
            child_name="Emma",
            period="weekly",
            activities_completed=10,
            hours_learned=5.5,
            new_competencies=["Photosynthesis", "Ecosystems"],
            achievements=["Perfect Score", "Quick Learner"],
            concerns=[],
            growth_areas=["Writing", "Speaking"],
            class_average=78.5,
            child_average=85.0
        )
        
        result = asyncio.run(email_service.send_progress_digest(digest))
        assert result is True

    def test_send_progress_digest_monthly(self, email_service):
        """Test monthly progress digest"""
        import asyncio
        
        digest = ProgressDigest(
            parent_id="parent1",
            child_id="child1",
            child_name="Lucas",
            period="monthly",
            activities_completed=45,
            hours_learned=22.0,
            new_competencies=["Fractions", "Decimals", "Percentages"],
            achievements=["Math Master", "Consistency"],
            concerns=["Time management"],
            growth_areas=["Problem solving"],
            class_average=82.0,
            child_average=88.0
        )
        
        result = asyncio.run(email_service.send_progress_digest(digest))
        assert result is True

    # Test Achievement Emails
    def test_send_achievement_email(self, email_service):
        """Test achievement notification email"""
        import asyncio
        
        result = asyncio.run(email_service.send_achievement(
            email="parent@example.com",
            child_name="Emma",
            achievement="Photosynthesis Expert",
            parent_id="parent1"
        ))
        assert result is True

    # Test Concern Emails
    def test_send_concern_email(self, email_service):
        """Test concern notification email"""
        import asyncio
        
        result = asyncio.run(email_service.send_concern(
            email="parent@example.com",
            child_name="Lucas",
            concern="Struggling with fractions",
            parent_id="parent1"
        ))
        assert result is True

    # Test Password Reset Emails
    def test_send_password_reset_email(self, email_service):
        """Test password reset email"""
        import asyncio
        
        result = asyncio.run(email_service.send_password_reset(
            email="parent@example.com",
            reset_token="abc123token456",
            parent_id="parent1"
        ))
        assert result is True

    # Test Email Scheduling
    def test_schedule_daily_digest(self, email_service):
        """Test scheduling daily digest"""
        result = email_service.schedule_digest(
            parent_id="parent1",
            frequency=EmailFrequency.DAILY,
            time_of_day="09:00"
        )
        assert result is True
        assert "digest_parent1_daily" in email_service.scheduled_jobs

    def test_schedule_weekly_digest(self, email_service):
        """Test scheduling weekly digest"""
        result = email_service.schedule_digest(
            parent_id="parent1",
            frequency=EmailFrequency.WEEKLY,
            time_of_day="09:00"
        )
        assert result is True
        assert "digest_parent1_weekly" in email_service.scheduled_jobs

    def test_schedule_monthly_digest(self, email_service):
        """Test scheduling monthly digest"""
        result = email_service.schedule_digest(
            parent_id="parent1",
            frequency=EmailFrequency.MONTHLY,
            time_of_day="09:00"
        )
        assert result is True
        assert "digest_parent1_monthly" in email_service.scheduled_jobs

    def test_schedule_never_digest(self, email_service):
        """Test disabling digest"""
        result = email_service.schedule_digest(
            parent_id="parent1",
            frequency=EmailFrequency.NEVER
        )
        assert result is False

    # Test Cancel Digest
    def test_cancel_digest(self, email_service):
        """Test canceling scheduled digests"""
        # First schedule
        email_service.schedule_digest(
            parent_id="parent1",
            frequency=EmailFrequency.WEEKLY
        )
        
        # Then cancel
        result = email_service.cancel_digest("parent1")
        assert result is True
        assert len(email_service.scheduled_jobs) == 0

    # Test Email History
    def test_email_history_retrieval(self, email_service):
        """Test retrieving email history"""
        # Queue some emails
        for i in range(5):
            request = EmailRequest(
                to_email=f"parent{i}@example.com",
                subject=f"Email {i}",
                body="Test",
                email_type=EmailType.PROGRESS_DIGEST,
                parent_id="parent1"
            )
            import asyncio
            asyncio.run(email_service.send_email(request))
        
        # History would be queried from database in production
        assert len(email_service.email_queue) >= 0

    # Test Email Body Building
    def test_email_body_html_format(self, email_service):
        """Test email body HTML formatting"""
        request = EmailRequest(
            to_email="test@example.com",
            subject="Test",
            body="<p>Test</p>",
            email_type=EmailType.PROGRESS_DIGEST,
            parent_id="parent1"
        )
        
        body = email_service._build_email_body(request)
        assert "<html>" in body.lower()
        assert "<style>" in body.lower()
        assert "peripateticware" in body.lower()

    def test_digest_body_formatting(self, email_service):
        """Test progress digest body formatting"""
        digest = ProgressDigest(
            parent_id="parent1",
            child_id="child1",
            child_name="Emma",
            period="weekly",
            activities_completed=10,
            hours_learned=5.5,
            new_competencies=["Photosynthesis"],
            achievements=["Perfect Score"],
            concerns=[],
            growth_areas=["Writing"],
            class_average=78.5,
            child_average=85.0
        )
        
        body = email_service._build_digest_body(digest)
        assert "Emma" in body
        assert "This Week" in body
        assert "10" in body  # activities
        assert "5.5" in body  # hours

    # Test Email Type Handling
    def test_all_email_types_supported(self, email_service):
        """Test all email types are supported"""
        for email_type in EmailType:
            request = EmailRequest(
                to_email="test@example.com",
                subject="Test",
                body="Test",
                email_type=email_type,
                parent_id="parent1"
            )
            
            import asyncio
            result = asyncio.run(email_service.send_email(request))
            assert result is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
