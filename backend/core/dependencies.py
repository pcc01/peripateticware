"""Authentication and authorization dependencies"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.security import SecurityManager
from models.database import User, UserRole
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_current_user(
    credentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get authenticated current user"""
    try:
        token = credentials.credentials
        user_id = SecurityManager.extract_user_id_from_token(token)
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Fetch user from database
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        user = result.scalar()
        
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_teacher(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get authenticated teacher user"""
    if current_user.role not in [UserRole.TEACHER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required"
        )
    return current_user


async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get authenticated admin user"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def optional_user(
    credentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current user if authenticated, None otherwise"""
    try:
        token = credentials.credentials if credentials else None
        if not token:
            return None
        
        user_id = SecurityManager.extract_user_id_from_token(token)
        if user_id is None:
            return None
        
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        user = result.scalar()
        
        return user
    except Exception as e:
        logger.debug(f"Optional user auth failed: {e}")
        return None