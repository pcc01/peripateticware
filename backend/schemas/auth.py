# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Authentication-related Pydantic schemas
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class UserResponse(BaseModel):
    """User information response"""
    id: str = Field(..., description="User ID")
    email: str = Field(..., description="User email")
    username: str = Field(..., description="Username")
    full_name: str = Field(..., description="User full name")
    role: str = Field(..., description="User role")
    is_active: bool = Field(default=True, description="Whether user is active")
    created_at: Optional[str] = Field(None, description="User creation timestamp")
    
class TokenResponse(BaseModel):
    """JWT token response after successful authentication"""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration time in seconds")
    user: "UserResponse" = Field(..., description="User information")


class TokenData(BaseModel):
    """Data contained in JWT token"""
    sub: str = Field(..., description="Subject (user ID)")
    email: Optional[str] = Field(None, description="User email")
    exp: Optional[int] = Field(None, description="Expiration timestamp")


class LoginRequest(BaseModel):
    """User login request - UPDATED TO USE USERNAME"""
    username: str = Field(..., description="Username or email address")
    password: str = Field(..., min_length=6, description="User password")


class RegisterRequest(BaseModel):
    """User registration request"""
    email: EmailStr = Field(..., description="User email address")
    username: str = Field(..., min_length=3, description="Username")
    password: str = Field(..., min_length=6, description="User password")
    full_name: str = Field(..., min_length=1, description="User full name")
    role: Optional[str] = Field(default="STUDENT", description="User role")


class PasswordChangeRequest(BaseModel):
    """Password change request"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=6, description="New password")


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    email: EmailStr = Field(..., description="User email address")


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation"""
    token: str = Field(..., description="Reset token")
    new_password: str = Field(..., min_length=6, description="New password")


class RefreshTokenRequest(BaseModel):
    """Refresh token request"""
    refresh_token: str = Field(..., description="Refresh token")

    class Config:
        from_attributes = True