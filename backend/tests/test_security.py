"""Unit tests for authentication and security"""

import pytest
from datetime import datetime, timedelta
from core.security import SecurityManager
from jose import jwt


class TestSecurityManager:
    """Test suite for SecurityManager"""
    
    def test_hash_password(self):
        """Test password hashing"""
        password = "test_password_123"
        hashed = SecurityManager.hash_password(password)
        
        assert hashed != password
        assert len(hashed) > len(password)
    
    def test_verify_password_success(self):
        """Test password verification with correct password"""
        password = "test_password_123"
        hashed = SecurityManager.hash_password(password)
        
        assert SecurityManager.verify_password(password, hashed) is True
    
    def test_verify_password_failure(self):
        """Test password verification with wrong password"""
        password = "test_password_123"
        wrong_password = "wrong_password"
        hashed = SecurityManager.hash_password(password)
        
        assert SecurityManager.verify_password(wrong_password, hashed) is False
    
    def test_create_access_token(self):
        """Test JWT token creation"""
        data = {"sub": "test-user-id", "email": "test@example.com"}
        token = SecurityManager.create_access_token(data)
        
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_create_access_token_with_expiry(self):
        """Test JWT token creation with custom expiry"""
        data = {"sub": "test-user-id"}
        expires_delta = timedelta(hours=1)
        token = SecurityManager.create_access_token(data, expires_delta)
        
        assert isinstance(token, str)
    
    def test_verify_token_success(self):
        """Test token verification with valid token"""
        data = {"sub": "test-user-id", "email": "test@example.com"}
        token = SecurityManager.create_access_token(data)
        
        decoded = SecurityManager.verify_token(token)
        assert decoded is not None
        assert decoded.get("sub") == "test-user-id"
        assert decoded.get("email") == "test@example.com"
    
    def test_verify_token_failure(self):
        """Test token verification with invalid token"""
        invalid_token = "invalid.token.here"
        decoded = SecurityManager.verify_token(invalid_token)
        
        assert decoded is None
    
    def test_extract_user_id_from_token(self):
        """Test extracting user ID from token"""
        user_id = "test-user-id-12345"
        data = {"sub": user_id}
        token = SecurityManager.create_access_token(data)
        
        extracted_id = SecurityManager.extract_user_id_from_token(token)
        assert extracted_id == user_id
    
    def test_extract_user_id_invalid_token(self):
        """Test extracting user ID from invalid token"""
        invalid_token = "invalid.token"
        extracted_id = SecurityManager.extract_user_id_from_token(invalid_token)
        
        assert extracted_id is None
