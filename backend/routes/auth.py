# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Authentication routes - Login, signup, token management
âœ… FIXED: Uses SecurityManager from core.security, proper error handling
âœ… NEW: Supports login with both email AND uid
âœ… FIXED: Removed duplicate /api/v1/auth prefix (added in main.py)
âœ… FIXED: Correct create_access_token calls
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
import uuid
from datetime import timedelta
import time as _time
from core.cache import revoke_token
from services.signed_url import SignedURL
from services.email_service import send_verification_email, send_welcome_email
from core.config import settings as _settings

# Token lifetime in seconds, derived from the single source of truth in config.
_EXPIRES_IN_SECONDS = _settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

# Fixed bcrypt hash of a random string, used ONLY to burn ~constant CPU time on
# a "user not found" login so response timing doesn't reveal which emails exist.
_DUMMY_BCRYPT_HASH = "$2b$12$kbGP3qW.EsCoUuJCsTgdC.dt/hUWrpdn3aTSULvWhppa3LMuCyJrK"

# Rate limiting handled by the global app-level limiter (registered in main.py).
# Per-route limiters are disabled here to avoid the standalone Limiter instance
# not being attached to app.state, which causes 500s.
def _rate_limit(rate: str):
    """No-op — global rate limiting via app.state.limiter in main.py."""
    def noop(fn):
        return fn
    return noop

logger = logging.getLogger(__name__)

# ============================================================================
# IMPORTS - Core modules
# ============================================================================
try:
    from core.database import get_db
    from core.security import SecurityManager, create_access_token, TOKEN_EXPIRED
    from models.user import User
    from core.encryption import blind_index as _blind_index
    logger.info("âœ… Auth routes: All imports successful")
except ImportError as e:
    logger.error(f"âŒ Auth routes: Import failed: {e}")
    raise

# ============================================================================
# ROUTER SETUP
# ============================================================================
# NOTE: Prefix is NOT included here because main.py adds it:
#       app.include_router(auth_router, prefix="/api/v1/auth")
router = APIRouter(
    tags=["authentication"],
    responses={
        401: {"description": "Unauthorized"},
        400: {"description": "Bad request"},
        500: {"description": "Internal server error"}
    }
)

# ============================================================================
# SCHEMAS (Pydantic Models)
# ============================================================================

class LoginRequest(BaseModel):
    """Login request - supports email OR id"""
    # NOTE: intentionally `str`, not `EmailStr`. EmailStr's email-validator
    # rejects RFC 6761 special-use domains (.local, .test, .example, .invalid),
    # which breaks login for @test.local E2E/Detox/Maestro seed accounts.
    # Strict format validation belongs on SignupRequest/RegisterRequest (where
    # we're creating a real account); at login we're just looking up an
    # existing string against the DB — a non-matching value simply fails with
    # 401 invalid credentials, so there's no security reason to 422 here.
    email: Optional[str] = None
    id: Optional[str] = None
    password: str
    
    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "summary": "Login with email",
                    "value": {
                        "email": "student@example.com",
                        "password": "SecurePassword123"
                    }
                },
                {
                    "summary": "Login with user id",
                    "value": {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "password": "SecurePassword123"
                    }
                }
            ]
        }


class SignupRequest(BaseModel):
    """Signup request with user details"""
    email: EmailStr
    password: str
    password_confirm: str
    first_name: str
    last_name: str
    # username is optional — auto-generated from email prefix if absent
    username: Optional[str] = None
    # role is optional — defaults to STUDENT; frontend may pass 'teacher', 'parent', etc.
    role: Optional[str] = "STUDENT"
    # invite_token — REQUIRED for STUDENT role (students must join via classroom invite).
    # TEACHER / HOMESCHOOL / PARENT: not required — org is auto-created on first signup.
    invite_token: Optional[str] = None
    # school_name — used to name the auto-created org for teachers
    school_name: Optional[str] = None
    # ── Location / privacy fields (Teaching Context step — sprint 2C) ─────────
    country_code:     Optional[str] = None   # ISO-3166-1 alpha-2, from /geo/hint or picker
    subdivision_code: Optional[str] = None   # e.g. 'US-CA'
    has_under_13:     Optional[bool] = True  # default safe: assume under-13 students
    org_type_v2:      Optional[str] = None   # individual_teacher | homeschool_family | …
    ip_country_hint:  Optional[str] = None   # raw value from /geo/hint (audit only)

    class Config:
        json_schema_extra = {
            "example": {
                "email": "newuser@example.com",
                "password": "SecurePassword123",
                "password_confirm": "SecurePassword123",
                "first_name": "John",
                "last_name": "Doe",
                "role": "STUDENT"
            }
        }


class TokenResponse(BaseModel):
    """Successful authentication response"""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    role: str
    org_id: Optional[str] = None
    expires_in: int
    is_active: Optional[bool] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "user_id": "550e8400-e29b-41d4-a716-446655440000",
                "email": "student@example.com",
                "role": "STUDENT",
                "expires_in": 3600
            }
        }


class UserResponse(BaseModel):
    """User information response"""
    id: str
    email: str
    username: str
    first_name: str
    last_name: str
    full_name: str
    role: str
    is_active: bool
    
    class Config:
        from_attributes = True


class LogoutResponse(BaseModel):
    """Logout response"""
    message: str


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
async def auth_health():
    """Check if auth service is available"""
    return {
        "status": "ok",
        "service": "authentication",
        "version": "1.0"
    }

# ============================================================================
# LOGIN ENDPOINT
# ============================================================================

@router.post("/login", response_model=TokenResponse, status_code=200)
@_rate_limit("5/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email or id and password
    
    Returns JWT access token on success
    
    Accepts either:
    - {"email": "student@example.com", "password": "SecurePassword123"}
    - {"id": "550e8400-e29b-41d4-a716-446655440000", "password": "SecurePassword123"}
    """
    
    # Validate input
    if not body.email and not body.id:
        logger.warning("ðŸ” Login attempt with no email or id")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either email or id"
        )
    
    if not body.password:
        logger.warning("ðŸ” Login attempt with no password")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password required"
        )
    
    identifier = body.email or body.id
    logger.info(f"ðŸ” Login attempt: {identifier}")
    
    try:
        user = None

        # `email` doubles as "email or username" -- the login form's copy has
        # long promised this ("Please enter a valid email or username") but
        # the lookup itself never actually checked username, so a username
        # always 401'd. Only try the email-index lookup when the value looks
        # email-shaped; either way, fall back to an exact username match.
        if body.email:
            if "@" in body.email:
                result = await db.execute(
                    select(User).where(User.email_index == _blind_index(body.email.lower()))
                )
                user = result.scalar_one_or_none()
            if not user:
                result = await db.execute(
                    select(User).where(User.username == body.email)
                )
                user = result.scalar_one_or_none()

        # Try id if email didn't work (if provided) — cast to UUID so asyncpg accepts it
        if not user and body.id:
            try:
                user_uuid = uuid.UUID(body.id)
            except ValueError:
                user_uuid = None
            if user_uuid:
                result = await db.execute(
                    select(User).where(User.id == user_uuid)
                )
                user = result.scalar_one_or_none()
        
        # User not found
        if not user:
            logger.warning(f"âŒ Login failed: User not found: {identifier}")
            # Timing-attack defense: verify against a dummy hash so
            # "user not found" costs ~the same as "wrong password" (prevents
            # user enumeration via response latency).
            SecurityManager.verify_password(body.password, _DUMMY_BCRYPT_HASH)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/id or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify password
        logger.debug(f"Checking password for user: {user.email}")
        if not SecurityManager.verify_password(body.password, user.hashed_password):
            logger.warning(f"âŒ Login failed: Wrong password for {user.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/id or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if user is active
        if not user.is_active:
            logger.warning(f"âŒ Login failed: User inactive {user.email}")
            if getattr(user, 'requires_parental_consent', False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="parental_consent_required",
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive",
            )
        
        # Create JWT token - FIXED: use data= parameter
        token = create_access_token(
            data={"sub": str(user.id), "is_platform_admin": bool(getattr(user, "is_platform_admin", False)), "is_content_admin": bool(getattr(user, "is_content_admin", False))}
        )
        
        logger.info(f"âœ… Login successful: {user.email} ({user.role})")
        
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user_id=str(user.id),
            email=user.email,
            role=user.role,
            org_id=str(user.org_id) if user.org_id else None,
            expires_in=_EXPIRES_IN_SECONDS
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"âŒ Login error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to server error"
        )

# ============================================================================
# SIGNUP ENDPOINT
# ============================================================================

@router.post("/signup", response_model=TokenResponse, status_code=201)
@_rate_limit("10/minute")
async def signup(
    request: Request,
    body: SignupRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register new user and return JWT token
    
    Passwords must match and meet minimum length requirements
    """
    logger.info(f"ðŸ“ Signup attempt: {body.email}")
    
    try:
        # Validate passwords match
        if body.password != body.password_confirm:
            logger.warning(f"âŒ Signup failed: Passwords don't match for {body.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match",
            )
        
        # Validate password strength
        pw = body.password
        pw_errors = []
        if len(pw) < 8:
            pw_errors.append("at least 8 characters")
        if not any(c.isupper() for c in pw):
            pw_errors.append("at least one uppercase letter")
        if not any(c.islower() for c in pw):
            pw_errors.append("at least one lowercase letter")
        if not any(c.isdigit() for c in pw):
            pw_errors.append("at least one number")
        if not any(c in "@$!%*?&" for c in pw):
            pw_errors.append("at least one special character (@$!%*?&)")
        if pw_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Password must have: {', '.join(pw_errors)}",
            )
        
        # Check if email already exists
        result = await db.execute(
            select(User).where(User.email_index == _blind_index(body.email.lower()))
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            logger.warning(f"âŒ Signup failed: Email already registered {body.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        
        role_upper = (body.role or "TEACHER").upper()

        # ── Student guard: students must use an invite link, not free signup ──
        if role_upper == "STUDENT":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Students must join via a classroom invite link from their teacher. "
                    "Ask your teacher to send you an invite."
                ),
            )

        # ── SECURITY: public self-signup may only grant these roles. ──────────
        # ADMIN (org admin) and any other value must never be settable by the
        # client — org admin is granted separately (e.g. by an existing admin
        # via PUT /admin/users/{id}), and platform admin only via the
        # is_platform_admin DB flag (backend/scripts/set_platform_admin.py).
        # Without this allowlist, POST /auth/signup {"role":"ADMIN"} would
        # grant full org-admin access, including bypassing org-scoping checks
        # in require_owns_resource()/require_same_org().
        _SELF_SIGNUP_ROLES = {"TEACHER", "PARENT", "HOMESCHOOL"}
        if role_upper not in _SELF_SIGNUP_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role. Must be one of: teacher, parent, homeschool.",
            )

        # ── Beta gate: when SIGNUP_MODE=invite_only, self-signup for TEACHER/
        # PARENT/HOMESCHOOL also requires a valid invite code (students are
        # already gated above). Config-driven — flip SIGNUP_MODE back to "open"
        # in .env to fully restore today's open signup with no code changes.
        from core.config import settings as _signup_cfg
        # Anyone who clears this gate is, by definition, a beta signup — flows
        # into SignupData.is_beta below, which grants the new org a full-access
        # 'beta' license tier for settings.BETA_TRIAL_DAYS (see signup_service.py).
        is_beta_signup = False
        if _signup_cfg.SIGNUP_MODE == "invite_only":
            _valid_codes = {c.strip() for c in _signup_cfg.BETA_INVITE_CODES.split(",") if c.strip()}
            if not body.invite_token or body.invite_token not in _valid_codes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "Peripateticware is currently invite-only. Please request beta "
                        "access, or enter the invite code you were given."
                    ),
                )
            is_beta_signup = True

        # Create new user with uuid
        from sqlalchemy import text as _text
        new_user_id = uuid.uuid4()

        # In development (EMAIL_DRY_RUN=true), auto-activate so users can log in
        # immediately without waiting for an email that never sends.
        # In production (EMAIL_DRY_RUN=false), keep is_active=False until verified.
        from core.config import settings as _cfg
        auto_activate = _cfg.EMAIL_DRY_RUN or (_cfg.ENVIRONMENT.lower() == "development")

        # Build a unique username — email prefix with numeric suffix on collision
        _username_base = (body.username or body.email.lower().split("@")[0]).lower()
        _username = _username_base
        for _n in range(1, 101):
            _ucheck = await db.execute(
                select(User).where(User.username == _username)
            )
            if not _ucheck.scalar_one_or_none():
                break
            _username = f"{_username_base}{_n}"

        new_user = User(
            id=new_user_id,
            email=body.email.lower(),
            email_index=_blind_index(body.email.lower()),
            username=_username,
            hashed_password=SecurityManager.hash_password(body.password),
            first_name=body.first_name,
            last_name=body.last_name,
            full_name=f"{body.first_name} {body.last_name}",
            role=role_upper,
            is_active=auto_activate  # True in dev; False in prod (requires email verify)
        )

        db.add(new_user)
        await db.flush()  # get the ID without committing

        # ── Auto-create org + seed privacy jurisdictions ─────────────────────
        from services.signup_service import SignupData, create_user_and_org as _create_org
        _signup_data = SignupData(
            email=body.email, password=body.password, password_confirm=body.password_confirm,
            first_name=body.first_name, last_name=body.last_name,
            username=body.username, role=body.role, invite_token=body.invite_token,
            school_name=body.school_name,
            country_code=getattr(body, 'country_code', None),
            subdivision_code=getattr(body, 'subdivision_code', None),
            has_under_13=getattr(body, 'has_under_13', True),
            org_type_v2=getattr(body, 'org_type_v2', None),
            ip_country_hint=getattr(body, 'ip_country_hint', None),
            is_beta=is_beta_signup,
        )
        org_id = await _create_org(db, _signup_data, new_user_id=new_user_id)

        await db.commit()
        await db.refresh(new_user)

        # Send verification email
        try:
            ver_token = SignedURL.generate(
                purpose="email_verification",
                payload={"user_id": str(new_user.id), "email": new_user.email},
            )
            await send_verification_email(new_user.email, ver_token)
        except Exception as _e:
            logger.warning("Verification email failed (non-blocking): %s", _e)

        token = create_access_token(data={"sub": str(new_user.id), "is_platform_admin": False, "is_content_admin": False})
        
        logger.info(f"âœ… Signup successful: {body.email}")
        
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user_id=str(new_user.id),
            email=new_user.email,
            role=new_user.role,
            org_id=str(new_user.org_id) if new_user.org_id else None,
            expires_in=_EXPIRES_IN_SECONDS,
            is_active=new_user.is_active,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"âŒ Signup error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Signup failed due to server error"
        )

# ============================================================================
# ME ENDPOINT  (called by frontend checkAuth on every app mount)
# ============================================================================

class MeResponse(BaseModel):
    user_id: str
    email: str
    role: str
    org_id: Optional[str] = None

@router.get("/me", response_model=MeResponse)
async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user from the JWT token. Used by frontend checkAuth."""
    from core.security import extract_user_id_from_token

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1]
    user_id = extract_user_id_from_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return MeResponse(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
        org_id=str(user.org_id) if user.org_id else None,
    )


# ============================================================================
# LOGOUT ENDPOINT
# ============================================================================

@router.post("/logout", response_model=LogoutResponse)
async def logout(authorization: Optional[str] = Header(None)):
    """
    Logout endpoint.

    Previously this only told the frontend to delete its local copy of the
    token — the JWT itself stayed valid server-side until it naturally
    expired (up to 24h later), so a stolen/leaked token kept working after
    the legitimate user "logged out". Now the presented token's jti is
    added to the revocation denylist for the rest of its natural life, so
    it stops working immediately everywhere.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        payload = SecurityManager.verify_token(token)
        if payload and payload is not TOKEN_EXPIRED:
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                ttl = int(exp - _time.time())
                await revoke_token(jti, ttl)
    logger.info("ðŸ‘‹ User logged out")
    return LogoutResponse(message="Logged out successfully")

# ============================================================================
# TOKEN REFRESH ENDPOINT (Optional)
# ============================================================================

@router.post("/refresh", response_model=TokenResponse)
@_rate_limit("20/minute")
async def refresh_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh JWT token (optional - useful for long sessions)
    
    Header: Authorization: Bearer <token>
    """
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid authorization header"
            )
        
        token = authorization.replace("Bearer ", "")
        
        # Verify current token and extract user_id
        payload = SecurityManager.verify_token(token)
        if not payload or payload is TOKEN_EXPIRED:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )

        # SECURITY: a revoked token (logout / already-rotated) must NOT be
        # exchangeable for a fresh one — otherwise logout is meaningless:
        # a stolen token could be "refreshed" back to life after the victim
        # logs out.
        from core.cache import is_token_revoked
        if await is_token_revoked(payload.get("jti")):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked"
            )

        user_id = payload.get("sub")

        # Get user from database
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # SECURITY: deactivated/soft-deleted accounts must not mint new tokens.
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        # Create new token - FIXED: use data= parameter
        new_token = create_access_token(
            data={"sub": str(user.id), "is_platform_admin": bool(getattr(user, "is_platform_admin", False)), "is_content_admin": bool(getattr(user, "is_content_admin", False))}
        )

        # Rotation: revoke the OLD token now that a new one exists, so a
        # refreshed-away token can't keep being replayed/refreshed again —
        # closes the "stolen token refreshed indefinitely" gap.
        old_jti = payload.get("jti")
        old_exp = payload.get("exp")
        if old_jti and old_exp:
            old_ttl = int(old_exp - _time.time())
            await revoke_token(old_jti, old_ttl)
        
        logger.info(f"âœ… Token refreshed for user {user.email}")
        
        return TokenResponse(
            access_token=new_token,
            token_type="bearer",
            user_id=str(user.id),
            email=user.email,
            role=user.role,
            expires_in=_EXPIRES_IN_SECONDS
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Token refresh failed")


# =============================================================================
# EMAIL VERIFICATION
# =============================================================================

@router.get("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Activate account from the link emailed after signup.
    Frontend: GET /verify-email?token=<signed_token>

    Returns JSON — this is called via `fetch()` from the SPA's VerifyEmailPage,
    not navigated to directly, so it must NOT redirect. A 3xx here gets
    silently followed by fetch and previously made every outcome (success,
    expired, invalid) look like success to the frontend.
    """
    from services.signed_url import SignedURL, SignedURLError, SignedURLExpired
    from fastapi.responses import JSONResponse

    try:
        data = await SignedURL.validate(token, purpose="email_verification", consume=True)
    except SignedURLExpired:
        return JSONResponse(status_code=410, content={"detail": "Verification link expired"})
    except SignedURLError:
        return JSONResponse(status_code=400, content={"detail": "Invalid verification link"})

    import uuid as _uuid
    try:
        user_id = _uuid.UUID(data["user_id"])
    except (KeyError, ValueError):
        return JSONResponse(status_code=400, content={"detail": "Invalid verification link"})

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return JSONResponse(status_code=400, content={"detail": "Invalid verification link"})

    if user.is_active:
        # Already verified — treat as success so a re-click of an old link is harmless
        return JSONResponse(status_code=200, content={"email": user.email, "message": "Already verified"})

    user.is_active = True
    await db.commit()
    logger.info("Email verified for user %s", user_id)

    # Send welcome email (non-blocking)
    try:
        await send_welcome_email(user.email, user.full_name or user.email, user.role)
    except Exception as _e:
        logger.warning("Welcome email failed: %s", _e)

    return JSONResponse(status_code=200, content={"email": user.email, "message": "Email verified"})


@router.post("/resend-verification")
async def resend_verification(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Resend verification email. Accepts {"email": "..."}.
    Always returns success to prevent enumeration.
    Rate limiting handled by slowapi on the router.
    """
    from services.signed_url import SignedURL
    email = body.get("email", "").lower().strip()
    if email:
        result = await db.execute(
            select(User).where(User.email_index == _blind_index(email))
        )
        user = result.scalar_one_or_none()
        if user and not user.is_active:
            try:
                ver_token = SignedURL.generate(
                    purpose="email_verification",
                    payload={"user_id": str(user.id), "email": user.email},
                )
                from services.email_service import send_verification_email
                await send_verification_email(user.email, ver_token)
            except Exception as _e:
                logger.warning("Resend verification email failed: %s", _e)
    return {"success": True, "message": "If an account with that email exists and is unverified, a new link has been sent."}