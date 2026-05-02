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
    first_name: str = Field(..., description="User first name")
    last_name: str = Field(..., description="User last name")
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
    """User login request"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password")


class RegisterRequest(BaseModel):
    """User registration request"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password")
    first_name: str = Field(..., min_length=1, description="User first name")
    last_name: str = Field(..., min_length=1, description="User last name")
    role: Optional[str] = Field(default="student", description="User role")


class PasswordChangeRequest(BaseModel):
    """Password change request"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    email: EmailStr = Field(..., description="User email address")


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation"""
    token: str = Field(..., description="Reset token")
    new_password: str = Field(..., min_length=8, description="New password")


class RefreshTokenRequest(BaseModel):
    """Refresh token request"""
    refresh_token: str = Field(..., description="Refresh token")


    
    class Config:
        from_attributes = True