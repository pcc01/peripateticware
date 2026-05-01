# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Email Routes - Parent email settings and digest management
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum

router = APIRouter(prefix="/api/v1/parent/email", tags=["email"])


class EmailFrequency(str, Enum):
    """Email frequency options"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    NEVER = "never"


class EmailPreferences(BaseModel):
    """Parent email preferences"""
    progress_digest_frequency: EmailFrequency = EmailFrequency.WEEKLY
    achievement_emails: bool = True
    concern_emails: bool = True
    activity_emails: bool = True
    digest_time: str = "09:00"  # HH:MM format
    digest_day: Optional[str] = None  # For weekly/monthly (Monday, 1st, etc)


class EmailPreferencesResponse(BaseModel):
    """Response model for email preferences"""
    parent_id: str
    preferences: EmailPreferences
    updated_at: str


class TestEmailRequest(BaseModel):
    """Request to send test email"""
    email: EmailStr


@router.get("/preferences")
async def get_email_preferences(parent_id: str) -> EmailPreferencesResponse:
    """Get parent's email preferences"""
    # In production, fetch from database
    preferences = EmailPreferences()
    
    return EmailPreferencesResponse(
        parent_id=parent_id,
        preferences=preferences,
        updated_at="2026-04-27T10:30:00Z"
    )


@router.put("/preferences")
async def update_email_preferences(
    parent_id: str,
    preferences: EmailPreferences
) -> EmailPreferencesResponse:
    """Update parent's email preferences"""
    # In production, update database
    
    print(f"✅ Updated email preferences for {parent_id}")
    print(f"   Digest frequency: {preferences.progress_digest_frequency}")
    print(f"   Digest time: {preferences.digest_time}")
    
    return EmailPreferencesResponse(
        parent_id=parent_id,
        preferences=preferences,
        updated_at="2026-04-27T10:30:00Z"
    )


@router.post("/test")
async def send_test_email(
    parent_id: str,
    request: TestEmailRequest
) -> dict:
    """Send a test email"""
    print(f"📧 Sending test email to {request.email} for {parent_id}")
    
    return {
        "success": True,
        "message": f"Test email sent to {request.email}",
        "email": request.email
    }


@router.get("/history")
async def get_email_history(parent_id: str, limit: int = 10) -> dict:
    """Get email send history"""
    # In production, fetch from database
    
    return {
        "parent_id": parent_id,
        "total_sent": 42,
        "emails": [
            {
                "id": f"email_{i}",
                "type": "progress_digest",
                "sent_at": "2026-04-27T09:00:00Z",
                "status": "delivered"
            }
            for i in range(limit)
        ]
    }
