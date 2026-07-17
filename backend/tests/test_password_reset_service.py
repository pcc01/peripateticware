# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Phase 2 Integration Tests - Password Reset Service
Tests all password reset functionality including tokens and validation
"""

import pytest
from datetime import datetime, timedelta
from services.password_reset_service import (
    PasswordResetService, TokenStatus, ResetToken
)


class TestPasswordResetService:
    """Password reset service integration tests"""

    @pytest.fixture
    def reset_service(self):
        """Create password reset service instance"""
        return PasswordResetService()

    # Test Token Creation
    def test_create_reset_token(self, reset_service):
        """Test creating a reset token"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        assert token is not None
        assert len(token) > 20  # URL-safe tokens are longer
        assert token in reset_service.reset_tokens

    def test_token_has_expiry(self, reset_service):
        """Test token has correct expiry time"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        reset_token = reset_service.reset_tokens[token]
        assert reset_token.expires_at > datetime.utcnow()

    def test_token_expiry_is_one_hour(self, reset_service):
        """Test token expires in approximately 1 hour"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        reset_token = reset_service.reset_tokens[token]
        time_diff = (reset_token.expires_at - datetime.utcnow()).total_seconds() / 3600
        
        assert 0.95 < time_diff < 1.05  # Allow 3 minute variance

    # Test Token Validation
    def test_validate_valid_token(self, reset_service):
        """Test validating a valid token"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        result = reset_service.validate_reset_token(token)
        assert result is not None
        assert result.token == token
        assert result.status == TokenStatus.ACTIVE

    def test_validate_invalid_token(self, reset_service):
        """Test validating an invalid token"""
        result = reset_service.validate_reset_token("invalid_token_123")
        assert result is None

    def test_validate_expired_token(self, reset_service):
        """Test validating an expired token"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        # Manually expire the token
        reset_token = reset_service.reset_tokens[token]
        reset_token.expires_at = datetime.utcnow() - timedelta(hours=1)
        
        result = reset_service.validate_reset_token(token)
        assert result is None

    def test_validate_used_token(self, reset_service):
        """Test validating a used token"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        # Use the token
        reset_service.reset_password(token, "NewPassword123!")
        
        # Try to validate again
        result = reset_service.validate_reset_token(token)
        assert result is None

    # Test Password Reset
    def test_reset_password_success(self, reset_service):
        """Test successful password reset"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        result = reset_service.reset_password(token, "NewPassword123!")
        assert result is True

    def test_reset_password_marks_token_used(self, reset_service):
        """Test reset marks token as used"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        reset_service.reset_password(token, "NewPassword123!")
        
        reset_token = reset_service.reset_tokens[token]
        assert reset_token.status == TokenStatus.USED
        assert reset_token.used_at is not None

    def test_reset_password_invalid_token(self, reset_service):
        """Test password reset with invalid token"""
        result = reset_service.reset_password("invalid_token", "NewPassword123!")
        assert result is False

    # Test Password Validation
    def test_password_too_short(self, reset_service):
        """Test password that is too short"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        result = reset_service.reset_password(token, "Short1!")
        assert result is False

    def test_password_missing_uppercase(self, reset_service):
        """Test password missing uppercase letter"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        result = reset_service.reset_password(token, "password123!")
        assert result is False

    def test_password_missing_lowercase(self, reset_service):
        """Test password missing lowercase letter"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        result = reset_service.reset_password(token, "PASSWORD123!")
        assert result is False

    def test_password_missing_number(self, reset_service):
        """Test password missing number"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        result = reset_service.reset_password(token, "Password!")
        assert result is False

    def test_password_missing_special_char(self, reset_service):
        """Test password missing special character"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        result = reset_service.reset_password(token, "Password123")
        assert result is False

    def test_password_meets_all_requirements(self, reset_service):
        """Test password meeting all requirements"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        valid_passwords = [
            "Password123!",
            "SecurePass456@",
            "MyNewPass789$",
            "ComplexPass1%"
        ]
        
        for password in valid_passwords:
            token = reset_service.create_reset_token(
                parent_id=f"parent{valid_passwords.index(password)}",
                email=f"parent{valid_passwords.index(password)}@example.com"
            )
            result = reset_service.reset_password(token, password)
            assert result is True

    # Test Token Status
    def test_get_token_status(self, reset_service):
        """Test getting token status"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        status = reset_service.get_token_status(token)
        assert status is not None
        assert status["email"] == "parent@example.com"
        assert status["status"] == "active"
        assert status["time_remaining_minutes"] > 0

    def test_get_token_status_after_reset(self, reset_service):
        """Test getting token status after reset"""
        token = reset_service.create_reset_token(
            parent_id="parent1",
            email="parent@example.com"
        )
        
        reset_service.reset_password(token, "NewPassword123!")
        
        status = reset_service.get_token_status(token)
        assert status["status"] == "used"
        assert status["used_at"] is not None

    # Test Rate Limiting
    def test_rate_limiting_less_than_max(self, reset_service):
        """Test rate limiting allows requests under limit"""
        for i in range(3):
            token = reset_service.create_reset_token(
                parent_id="parent1",
                email="parent@example.com"
            )
            assert token is not None

    def test_rate_limiting_exceeds_max(self, reset_service):
        """Test rate limiting blocks excessive requests"""
        parent_id = "parent1"
        
        # Make max requests
        for i in range(reset_service.max_reset_requests):
            token = reset_service.create_reset_token(
                parent_id=parent_id,
                email="parent@example.com"
            )
            assert token is not None
        
        # Next request should fail
        token = reset_service.create_reset_token(
            parent_id=parent_id,
            email="parent@example.com"
        )
        assert token is None

    def test_rate_limit_resets_after_hour(self, reset_service):
        """Test rate limit resets after 1 hour"""
        parent_id = "parent1"
        
        # Max out the rate limit
        for i in range(reset_service.max_reset_requests):
            reset_service.create_reset_token(
                parent_id=parent_id,
                email="parent@example.com"
            )
        
        # Should fail
        token = reset_service.create_reset_token(
            parent_id=parent_id,
            email="parent@example.com"
        )
        assert token is None
        
        # Manually advance time
        reset_service.reset_attempts[parent_id] = [
            datetime.utcnow() - timedelta(hours=2)
        ]
        
        # Should now succeed
        token = reset_service.create_reset_token(
            parent_id=parent_id,
            email="parent@example.com"
        )
        assert token is not None

    # Test Cleanup
    def test_cleanup_expired_tokens(self, reset_service):
        """Test cleaning up expired tokens"""
        # Create tokens
        for i in range(5):
            reset_service.create_reset_token(
                parent_id=f"parent{i}",
                email=f"parent{i}@example.com"
            )
        
        # Expire some
        tokens = list(reset_service.reset_tokens.keys())
        for token in tokens[:2]:
            reset_service.reset_tokens[token].expires_at = \
                datetime.utcnow() - timedelta(hours=2)
        
        # Cleanup
        removed = reset_service.cleanup_expired_tokens()
        assert removed == 2

    # Test Multiple Reset Requests
    def test_multiple_reset_requests_for_parent(self, reset_service):
        """Test parent can request multiple resets"""
        tokens = []
        
        for i in range(3):
            token = reset_service.create_reset_token(
                parent_id="parent1",
                email="parent@example.com"
            )
            tokens.append(token)
        
        assert len(tokens) == 3
        assert len(set(tokens)) == 3  # All unique


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
