# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Security utilities - JWT token management and password hashing
âœ… FIXED: Better bcrypt handling, proper error messages
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, ExpiredSignatureError, jwt
import logging
import uuid

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
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))  # 1 hour

# ============================================================================
# PASSWORD HASHING - Try passlib first, fallback to bcrypt
# ============================================================================

# Always import bcrypt directly — passlib 1.7.4 raises AttributeError (not ImportError)
# when initialised against bcrypt >= 4.0; the old except ImportError fallback never fired.
import bcrypt as _bcrypt

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    # Probe: passlib 1.7.4 + bcrypt >= 4.0 initialises fine but .verify() raises
    # ValueError("hash could not be identified") at runtime because passlib's bcrypt
    # backend can't register against bcrypt 4.x internals.  Catch that here so the
    # fallback fires, rather than silently returning False on every login.
    _probe_hash = pwd_context.hash("_passlib_probe_")
    if not pwd_context.verify("_passlib_probe_", _probe_hash):
        raise ValueError("passlib verify returned False for known-good probe hash")
    logger.info("✅ Using passlib for password hashing")
    HAS_PASSLIB = True
except Exception as _passlib_err:
    # passlib 1.7.4 incompatible with bcrypt >= 4.0 at init or verify time.
    logger.warning(f"⚠️  passlib unavailable or incompatible — using bcrypt directly ({_passlib_err!r})")
    HAS_PASSLIB = False


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    try:
        if HAS_PASSLIB:
            return pwd_context.hash(password)
        else:
            salt = _bcrypt.gensalt()
            return _bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
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
            result = _bcrypt.checkpw(
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
    if not SECRET_KEY or SECRET_KEY in ("dev-secret-key", "dev-secret-key-change-in-production"):
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
        # Unique per-token ID so a specific token (not just "all tokens for
        # this user") can be revoked on logout or superseded on refresh —
        # see core/cache.py revoke_token()/is_token_revoked() and their use
        # in core/dependencies.py + routes/auth.py /logout and /refresh.
        to_encode.setdefault("jti", uuid.uuid4().hex)
        
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


# Sentinel returned by verify_token() when the JWT signature is valid but the
# token is past its exp claim. Lets callers emit HTTP 401 "Token expired" rather
# than the generic "Invalid credentials", so the frontend can trigger a clean
# logout with reason=expired (matching the useSessionSecurity hook).
TOKEN_EXPIRED: Dict[str, Any] = {"__token_expired__": True}


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify and decode JWT token.

    Returns:
        - dict payload on success
        - TOKEN_EXPIRED sentinel when the token is past its ``exp`` claim
          (python-jose raises ExpiredSignatureError in this case)
        - None for any other invalid token (bad signature, malformed, etc.)

    Callers that need to distinguish expiry from a bad token can check:
        payload = verify_token(token)
        if payload is TOKEN_EXPIRED: raise HTTP 401 "Token expired"
        if payload is None:          raise HTTP 401 "Invalid credentials"
    """
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        logger.debug("Token verified successfully")
        return payload

    except ExpiredSignatureError:
        # Token was well-formed and correctly signed, but exp is in the past.
        # Return the sentinel so callers can emit "Token expired" rather than
        # the generic "Invalid credentials" — the frontend useSessionSecurity
        # hook uses this to trigger a clean logout with reason=expired.
        logger.info("JWT token has expired")
        return TOKEN_EXPIRED

    except JWTError as e:
        logger.warning(f"Token verification failed (invalid): {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {e}")
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
        """Hash password — delegates to module-level hash_password()."""
        return hash_password(password)  # not recursive; calls module-level fn

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password — delegates to module-level verify_password()."""
        return verify_password(plain_password, hashed_password)  # not recursive

    @staticmethod
    def create_access_token(
        data: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        expires_delta: Optional[timedelta] = None,
    ) -> str:
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
