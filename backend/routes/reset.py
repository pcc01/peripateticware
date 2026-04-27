"""
Password Reset Routes - Public password reset flow
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

router = APIRouter(prefix="/api/v1/public/password", tags=["password_reset"])


class ForgotPasswordRequest(BaseModel):
    """Request to start password reset"""
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    """Response to forgot password request"""
    success: bool
    message: str
    email: EmailStr


class ResetTokenValidation(BaseModel):
    """Validate reset token"""
    token: str
    valid: bool
    email: Optional[str] = None
    expires_in_minutes: Optional[int] = None


class ResetPasswordRequest(BaseModel):
    """Request to reset password"""
    token: str
    new_password: str = Field(
        ...,
        min_length=8,
        description="Password must be at least 8 characters with uppercase, lowercase, number, and special character"
    )


class ResetPasswordResponse(BaseModel):
    """Response to password reset"""
    success: bool
    message: str


class PasswordRequirements(BaseModel):
    """Password requirements"""
    min_length: int = 8
    requires_uppercase: bool = True
    requires_lowercase: bool = True
    requires_number: bool = True
    requires_special: bool = True
    special_characters: str = "@$!%*?&"


@router.post("/forgot", response_model=ForgotPasswordResponse)
async def forgot_password(request: ForgotPasswordRequest) -> ForgotPasswordResponse:
    """Start password reset flow"""
    # In production:
    # 1. Check if email exists in database
    # 2. Generate reset token
    # 3. Send email with reset link
    
    print(f"📧 Password reset requested for {request.email}")
    
    return ForgotPasswordResponse(
        success=True,
        message="If an account exists with this email, you will receive a password reset link",
        email=request.email
    )


@router.get("/requirements", response_model=PasswordRequirements)
async def get_password_requirements() -> PasswordRequirements:
    """Get password requirements"""
    return PasswordRequirements()


@router.get("/reset/{token}", response_model=ResetTokenValidation)
async def validate_reset_token(token: str) -> ResetTokenValidation:
    """Validate a reset token"""
    # In production, validate token in database
    
    if not token or len(token) < 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token format"
        )
    
    print(f"🔐 Validating reset token: {token[:20]}...")
    
    # Mock validation (in production, check database)
    is_valid = True
    
    if is_valid:
        return ResetTokenValidation(
            token=token,
            valid=True,
            email="user@example.com",
            expires_in_minutes=45
        )
    else:
        return ResetTokenValidation(
            token=token,
            valid=False
        )


@router.post("/reset", response_model=ResetPasswordResponse)
async def reset_password(request: ResetPasswordRequest) -> ResetPasswordResponse:
    """Reset password with token"""
    # Validate password strength
    password = request.new_password
    
    errors = []
    
    if len(password) < 8:
        errors.append("Password must be at least 8 characters")
    
    if not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")
    
    if not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")
    
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number")
    
    if not any(c in "@$!%*?&" for c in password):
        errors.append("Password must contain at least one special character (@$!%*?&)")
    
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"errors": errors}
        )
    
    # In production:
    # 1. Validate token
    # 2. Hash password
    # 3. Update in database
    # 4. Invalidate all sessions
    # 5. Send confirmation email
    
    print(f"🔐 Resetting password with token: {request.token[:20]}...")
    
    return ResetPasswordResponse(
        success=True,
        message="Password has been reset successfully. Please log in with your new password."
    )
