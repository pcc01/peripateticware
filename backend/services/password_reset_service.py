"""
Password Reset Service - Secure password reset flow
Handles reset tokens, validation, and new password setting
"""

from datetime import datetime, timedelta
from typing import Optional
from enum import Enum
import secrets
from pydantic import BaseModel, EmailStr, Field


class TokenStatus(str, Enum):
    """Status of a reset token"""
    ACTIVE = "active"
    USED = "used"
    EXPIRED = "expired"


class ResetToken(BaseModel):
    """Password reset token"""
    token: str
    parent_id: str
    email: EmailStr
    created_at: datetime
    expires_at: datetime
    status: TokenStatus
    used_at: Optional[datetime] = None


class PasswordResetRequest(BaseModel):
    """Request to reset password"""
    email: EmailStr


class PasswordResetVerify(BaseModel):
    """Verify reset token"""
    token: str
    new_password: str = Field(..., min_length=8, pattern=r"(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])")


class PasswordResetResponse(BaseModel):
    """Response to password reset"""
    success: bool
    message: str
    token: Optional[str] = None


class PasswordResetService:
    """Manages password reset flow"""
    
    def __init__(self):
        self.reset_tokens = {}  # token -> ResetToken
        self.token_expiry_hours = 1  # Tokens valid for 1 hour
        self.max_reset_requests = 5  # Max 5 resets per hour
        self.reset_attempts = {}  # parent_id -> List[datetime]
    
    def create_reset_token(self, parent_id: str, email: EmailStr) -> Optional[str]:
        """Create a password reset token"""
        # Check rate limiting
        if not self._check_rate_limit(parent_id):
            print(f"❌ Too many reset requests for {parent_id}")
            return None
        
        # Generate secure token
        token = secrets.token_urlsafe(32)
        
        # Create reset token object
        reset_token = ResetToken(
            token=token,
            parent_id=parent_id,
            email=email,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=self.token_expiry_hours),
            status=TokenStatus.ACTIVE
        )
        
        # Store token
        self.reset_tokens[token] = reset_token
        
        # Log reset attempt
        if parent_id not in self.reset_attempts:
            self.reset_attempts[parent_id] = []
        self.reset_attempts[parent_id].append(datetime.utcnow())
        
        print(f"📧 Created reset token for {email}")
        print(f"   Token: {token[:20]}...")
        print(f"   Expires at: {reset_token.expires_at}")
        
        return token
    
    def validate_reset_token(self, token: str) -> Optional[ResetToken]:
        """Validate a reset token"""
        if token not in self.reset_tokens:
            print(f"❌ Invalid reset token")
            return None
        
        reset_token = self.reset_tokens[token]
        
        # Check if expired
        if datetime.utcnow() > reset_token.expires_at:
            reset_token.status = TokenStatus.EXPIRED
            print(f"❌ Reset token expired")
            return None
        
        # Check if already used
        if reset_token.status == TokenStatus.USED:
            print(f"❌ Reset token already used")
            return None
        
        return reset_token
    
    def reset_password(self, token: str, new_password: str) -> bool:
        """Reset password using token"""
        # Validate token
        reset_token = self.validate_reset_token(token)
        if not reset_token:
            return False
        
        # Validate password strength
        if not self._validate_password(new_password):
            print(f"❌ Password does not meet requirements")
            return False
        
        # In production:
        # 1. Hash the password with bcrypt
        # 2. Update parent in database
        # 3. Invalidate all other active sessions
        
        # Mark token as used
        reset_token.status = TokenStatus.USED
        reset_token.used_at = datetime.utcnow()
        
        print(f"✅ Password reset successful for {reset_token.email}")
        print(f"   Parent: {reset_token.parent_id}")
        
        return True
    
    def get_token_status(self, token: str) -> Optional[dict]:
        """Get status of a reset token"""
        if token not in self.reset_tokens:
            return None
        
        reset_token = self.reset_tokens[token]
        
        return {
            "email": reset_token.email,
            "status": reset_token.status,
            "created_at": reset_token.created_at.isoformat(),
            "expires_at": reset_token.expires_at.isoformat(),
            "time_remaining_minutes": max(0, (reset_token.expires_at - datetime.utcnow()).seconds / 60),
            "used_at": reset_token.used_at.isoformat() if reset_token.used_at else None
        }
    
    def cleanup_expired_tokens(self) -> int:
        """Remove expired tokens"""
        expired = []
        
        for token, reset_token in list(self.reset_tokens.items()):
            if datetime.utcnow() > reset_token.expires_at and reset_token.status != TokenStatus.USED:
                expired.append(token)
                del self.reset_tokens[token]
        
        print(f"🧹 Cleaned up {len(expired)} expired reset tokens")
        return len(expired)
    
    def _check_rate_limit(self, parent_id: str) -> bool:
        """Check if parent has exceeded reset requests"""
        if parent_id not in self.reset_attempts:
            return True
        
        # Remove attempts older than 1 hour
        now = datetime.utcnow()
        self.reset_attempts[parent_id] = [
            attempt for attempt in self.reset_attempts[parent_id]
            if now - attempt < timedelta(hours=1)
        ]
        
        # Check if too many attempts
        if len(self.reset_attempts[parent_id]) >= self.max_reset_requests:
            return False
        
        return True
    
    def _validate_password(self, password: str) -> bool:
        """Validate password meets requirements"""
        requirements = {
            "min_length": len(password) >= 8,
            "has_uppercase": any(c.isupper() for c in password),
            "has_lowercase": any(c.islower() for c in password),
            "has_digit": any(c.isdigit() for c in password),
            "has_special": any(c in "@$!%*?&" for c in password)
        }
        
        all_met = all(requirements.values())
        
        if not all_met:
            print(f"❌ Password validation failed:")
            for req, met in requirements.items():
                print(f"   {req}: {'✅' if met else '❌'}")
        
        return all_met


# Global password reset service instance
password_reset_service = PasswordResetService()
