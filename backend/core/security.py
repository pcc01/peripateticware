# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Security utilities - JWT token management and password hashing
âœ… FIXED: Better bcrypt handling, proper error messages
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# IMPORTS - Settings Configuration
# ============================================================================
try:
    from core.config import settings
    SECRET_KEY = settings.SECRET_KEY
    ALGORITHM = settings.ALGORITHM
    ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    logger.info("âœ… Settings loaded from core.config")
except ImportError as e:
    logger.warning(f"âš ï¸  Could not import settings from core.config: {e}")
    logger.warning("âš ï¸  Using fallback environment variables")
    import os
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# ============================================================================
# PASSWORD HASHING - Try passlib first, fallback to bcrypt
# ============================================================================

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    logger.info("âœ… Using passlib for password hashing")
    HAS_PASSLIB = True
except ImportError:
    logger.warning("âš ï¸  passlib not available, using bcrypt directly")
    import bcrypt
    HAS_PASSLIB = False


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    try:
        if HAS_PASSLIB:
            return pwd_context.hash(password)
        else:
            salt = bcrypt.gensalt()
            return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    except Exception as e:
        logger.error(f"âŒ Password hashing error: {e}")
        raise


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash
    Handles both passlib and bcrypt
    """
    if not plain_password or not hashed_password:
        logger.warning("âŒ Empty password or hash provided")
        return False
    
    try:
        logger.debug(f"Verifying password: plain={bool(plain_password)}, hash_len={len(hashed_password)}")
        
        if HAS_PASSLIB:
            result = pwd_context.verify(plain_password, hashed_password)
            logger.debug(f"Passlib verify result: {result}")
            return result
        else:
            # Direct bcrypt verification
            result = bcrypt.checkpw(
                plain_password.encode('utf-8'),
                hashed_password.encode('utf-8')
            )
            logger.debug(f"Bcrypt verify result: {result}")
            return result
            
    except ValueError as e:
        logger.error(f"âŒ Invalid hash format: {e}")
        return False
    except Exception as e:
        logger.error(f"âŒ Password verification error: {e}", exc_info=True)
        return False

# ============================================================================
# JWT TOKEN MANAGEMENT
# ============================================================================

def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create JWT access token
    
    Args:
        data: Dictionary of data to encode in token (e.g., {"sub": user_id})
        expires_delta: Optional custom expiration time
        
    Returns:
        Encoded JWT token string
        
    Raises:
        Exception: If token creation fails
    """
    if not SECRET_KEY or SECRET_KEY == "dev-secret-key":
        logger.warning("âš ï¸  WARNING: Using default SECRET_KEY - change for production!")
    
    try:
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(
                minutes=ACCESS_TOKEN_EXPIRE_MINUTES
            )
        
        to_encode.update({"exp": expire})
        
        encoded_jwt = jwt.encode(
            to_encode,
            SECRET_KEY,
            algorithm=ALGORITHM
        )
        
        logger.debug(f"âœ… Token created successfully, expires at {expire}")
        return encoded_jwt
        
    except Exception as e:
        logger.error(f"âŒ Failed to create access token: {e}")
        raise


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify and decode JWT token
    
    Args:
        token: JWT token string to verify
        
    Returns:
        Decoded token payload as dictionary, or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        logger.debug("âœ… Token verified successfully")
        return payload
        
    except JWTError as e:
        logger.warning(f"âŒ Token verification failed: {e}")
        return None
    except Exception as e:
        logger.error(f"âŒ Unexpected error during token verification: {e}")
        return None


def extract_user_id_from_token(token: str) -> Optional[str]:
    """
    Extract user ID from token
    
    Args:
        token: JWT token string
        
    Returns:
        User ID string, or None if token is invalid
    """
    try:
        payload = verify_token(token)
        if payload is None:
            return None
        
        user_id: str = payload.get("sub")
        if user_id is None:
            logger.warning("âš ï¸  Token missing 'sub' claim (user_id)")
            return None
        
        return user_id
        
    except Exception as e:
        logger.error(f"âŒ Failed to extract user ID from token: {e}")
        return None


# ============================================================================
# SECURITY MANAGER CLASS (Legacy - kept for backward compatibility)
# ============================================================================

class SecurityManager:
    """Centralized security management"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password"""
        return hash_password(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password"""
        return verify_password(plain_password, hashed_password)
    
    @staticmethod
    def create_access_token(data: dict = None, user_id: str = None, expires_delta: Optional[timedelta] = None) -> str:
        """
        Create JWT token
        
        Supports both:
        - create_access_token(data={"sub": user_id})
        - create_access_token(user_id="...")
        """
        if data is None:
            if user_id is None:
                raise ValueError("Either 'data' or 'user_id' must be provided")
            data = {"sub": user_id}
        
        return create_access_token(data, expires_delta)
    
    @staticmethod
    def verify_token(token: str) -> Optional[dict]:
        """Verify JWT token"""
        return verify_token(token)
    
    @staticmethod
    def extract_user_id_from_token(token: str) -> Optional[str]:
        """Extract user ID from token"""
        return extract_user_id_from_token(token)


# ============================================================================
# INITIALIZATION
# ============================================================================

logger.info(f"âœ… Security module initialized")
logger.info(f"   Algorithm: {ALGORITHM}")
logger.info(f"   Token expiration: {ACCESS_TOKEN_EXPIRE_MINUTES} minutes ({ACCESS_TOKEN_EXPIRE_MINUTES // 60} hours)")
logger.info(f"   Secret key length: {len(SECRET_KEY)} characters")
logger.info(f"   Password hashing: {'passlib' if HAS_PASSLIB else 'bcrypt'}")

