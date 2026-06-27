# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Password Reset Routes — uses SignedURL service for time-limited tokens.
Token TTL: 60 minutes (configurable in services/signed_url.py)
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from core.database import get_db
from models.user import User
from core.encryption import blind_index as _blind_index
from services.signed_url import SignedURL, SignedURLError, SignedURLExpired
from services.email_service import send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/public/password", tags=["password_reset"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ForgotPasswordResponse(BaseModel):
    success: bool
    message: str
    email: EmailStr

class ResetTokenValidation(BaseModel):
    token: str
    valid: bool
    email: Optional[str] = None
    expires_in_minutes: Optional[int] = None

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

class ResetPasswordResponse(BaseModel):
    success: bool
    message: str

class PasswordRequirements(BaseModel):
    min_length: int = 8
    requires_uppercase: bool = True
    requires_lowercase: bool = True
    requires_number: bool = True
    requires_special: bool = True
    special_characters: str = "@$!%*?&"


def _validate_password_strength(password: str) -> list:
    errors = []
    if len(password) < 8:
        errors.append("At least 8 characters")
    if not any(c.isupper() for c in password):
        errors.append("At least one uppercase letter")
    if not any(c.islower() for c in password):
        errors.append("At least one lowercase letter")
    if not any(c.isdigit() for c in password):
        errors.append("At least one number")
    if not any(c in "@$!%*?&" for c in password):
        errors.append("At least one special character (@$!%*?&)")
    return errors


@router.get("/requirements", response_model=PasswordRequirements)
async def get_password_requirements() -> PasswordRequirements:
    return PasswordRequirements()


@router.post("/forgot", response_model=ForgotPasswordResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> ForgotPasswordResponse:
    """Initiate password reset. Always returns success to prevent user enumeration."""
    result = await db.execute(select(User).where(User.email_index == _blind_index(request.email)))
    user = result.scalar_one_or_none()

    if user:
        token = SignedURL.generate(
            purpose="password_reset",
            payload={"user_id": str(user.id), "email": user.email},
        )
        await send_password_reset_email(user.email, token)
        logger.info("Password reset email sent to user %s", user.id)

    return ForgotPasswordResponse(
        success=True,
        message="If an account exists with this email, you will receive a reset link shortly.",
        email=request.email,
    )


@router.get("/reset/{token}", response_model=ResetTokenValidation)
async def validate_reset_token(token: str) -> ResetTokenValidation:
    """Validate a reset token before showing the new-password form."""
    try:
        data = SignedURL.validate(token, purpose="password_reset")
        return ResetTokenValidation(
            token=token,
            valid=True,
            email=data.get("email"),
            expires_in_minutes=SignedURL.expires_in_minutes(token),
        )
    except SignedURLExpired:
        return ResetTokenValidation(token=token, valid=False)
    except SignedURLError:
        raise HTTPException(status_code=400, detail="Invalid token")


@router.post("/reset", response_model=ResetPasswordResponse)
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> ResetPasswordResponse:
    """Reset password using a valid signed token."""
    try:
        data = SignedURL.validate(request.token, purpose="password_reset")
    except SignedURLExpired:
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")
    except SignedURLError:
        raise HTTPException(status_code=400, detail="Invalid or tampered reset token.")

    errors = _validate_password_strength(request.new_password)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    from uuid import UUID
    try:
        user_id = UUID(data["user_id"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user.hashed_password = pwd_context.hash(request.new_password)
    await db.commit()
    logger.info("Password reset for user %s", user_id)

    return ResetPasswordResponse(success=True, message="Password reset successfully. You can now log in.")
