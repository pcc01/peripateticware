# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Password Reset Routes — uses SignedURL service for time-limited tokens.
Token TTL: 60 minutes (configurable in services/signed_url.py)
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from core.database import get_db
from models.user import User
from core.encryption import blind_index as _blind_index
from services.signed_url import SignedURL, SignedURLError, SignedURLExpired
from services.email_service import send_password_reset_email
from core.http_rate_limiter import limiter

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


async def _resettable_user(db: AsyncSession, user_id_str: Optional[str]) -> Optional[User]:
    """Look up a user by id for the reset flow — missing, inactive, and
    soft-deleted accounts all resolve to None (treated identically by
    callers) so neither response distinguishes "no such account" from
    "account exists but is disabled"."""
    if not user_id_str:
        return None
    from uuid import UUID
    try:
        user_id = UUID(user_id_str)
    except (TypeError, ValueError):
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or user.deleted_at is not None:
        return None
    return user


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
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> ForgotPasswordResponse:
    """Initiate password reset. Always returns success to prevent user enumeration."""
    result = await db.execute(select(User).where(User.email_index == _blind_index(body.email)))
    user = result.scalar_one_or_none()

    if user and user.is_active and user.deleted_at is None:
        token = SignedURL.generate(
            purpose="password_reset",
            payload={"user_id": str(user.id), "email": user.email},
        )
        await send_password_reset_email(user.email, token)
        logger.info("Password reset email sent to user %s", user.id)
    elif user:
        # Deactivated/soft-deleted account — deliberately not sent a reset
        # email (they have no business getting back into a disabled
        # account), but the response below stays identical either way so
        # this doesn't become a side channel for "is this account active?"
        logger.info("Password reset requested for inactive/deleted user %s — skipped", user.id)

    return ForgotPasswordResponse(
        success=True,
        message="If an account exists with this email, you will receive a reset link shortly.",
        email=body.email,
    )


@router.get("/reset/{token}", response_model=ResetTokenValidation)
async def validate_reset_token(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> ResetTokenValidation:
    """Validate a reset token before showing the new-password form."""
    try:
        data = await SignedURL.validate(token, purpose="password_reset")  # preview only — do not consume
    except SignedURLExpired:
        return ResetTokenValidation(token=token, valid=False)
    except SignedURLError:
        raise HTTPException(status_code=400, detail="Invalid token")

    # A token can be well-formed and unexpired but still point at an
    # account that's since been deactivated/deleted (or, in principle, one
    # that no longer exists) — same "invalid" response as an expired
    # token, not a distinct message, so this preview endpoint can't be
    # used to probe an account's active/deleted status.
    if not await _resettable_user(db, data.get("user_id")):
        return ResetTokenValidation(token=token, valid=False)

    return ResetTokenValidation(
        token=token,
        valid=True,
        email=data.get("email"),
        expires_in_minutes=SignedURL.expires_in_minutes(token),
    )


@router.post("/reset", response_model=ResetPasswordResponse)
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> ResetPasswordResponse:
    """Reset password using a valid signed token."""
    try:
        data = await SignedURL.validate(body.token, purpose="password_reset", consume=True)
    except SignedURLExpired:
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")
    except SignedURLError:
        raise HTTPException(status_code=400, detail="Invalid or tampered reset token.")

    errors = _validate_password_strength(body.new_password)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    from uuid import UUID
    try:
        UUID(data["user_id"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid token payload")

    # Covers both "no such user" and "user has since been deactivated /
    # soft-deleted" — same message as the expired/tampered branches above,
    # so this can't be used to confirm an account's active status. Note
    # the token was already consumed by SignedURL.validate(consume=True)
    # above, so even a retry with the same token can't be used to keep
    # probing this account.
    user = await _resettable_user(db, data.get("user_id"))
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is no longer valid. Please request a new one.")

    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user.hashed_password = pwd_context.hash(body.new_password)
    await db.commit()
    logger.info("Password reset for user %s", user.id)

    return ResetPasswordResponse(success=True, message="Password reset successfully. You can now log in.")
