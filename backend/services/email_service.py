# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Email Service - Parent Portal Email Digest System
Handles scheduled emails, progress summaries, notifications
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum
import asyncio
from pydantic import BaseModel, EmailStr


class EmailFrequency(str, Enum):
    """Email frequency preferences"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    NEVER = "never"


class EmailType(str, Enum):
    """Types of emails sent"""
    PROGRESS_DIGEST = "progress_digest"
    ACHIEVEMENT = "achievement"
    CONCERN = "concern"
    ACTIVITY_COMPLETE = "activity_complete"
    PASSWORD_RESET = "password_reset"


class EmailRequest(BaseModel):
    """Email request model"""
    to_email: EmailStr
    subject: str
    body: str
    email_type: EmailType
    parent_id: str


class ProgressDigest(BaseModel):
    """Weekly/monthly progress summary"""
    parent_id: str
    child_id: str
    child_name: str
    period: str  # "weekly" or "monthly"
    activities_completed: int
    hours_learned: float
    new_competencies: List[str]
    achievements: List[str]
    concerns: List[str]
    growth_areas: List[str]
    class_average: float
    child_average: float


class EmailService:
    """Handles email sending and scheduling"""
    
    def __init__(self):
        self.smtp_host = "smtp.gmail.com"  # Configure with your SMTP
        self.smtp_port = 587
        self.sender_email = "noreply@peripateticware.com"
        self.scheduled_jobs = {}
        self.email_queue = []
    
    async def send_email(self, request: EmailRequest) -> bool:
        """Send an email"""
        try:
            email_body = self._build_email_body(request)
            
            # In production, use actual SMTP
            # For now, log to console
            print(f"📧 Email sent to {request.to_email}")
            print(f"   Subject: {request.subject}")
            print(f"   Type: {request.email_type}")
            
            return True
        except Exception as e:
            print(f"❌ Error sending email: {e}")
            return False
    
    async def send_progress_digest(self, digest: ProgressDigest) -> bool:
        """Send a progress digest email"""
        subject = f"Weekly Progress Update - {digest.child_name}" if digest.period == "weekly" else f"Monthly Progress Report - {digest.child_name}"
        
        body = self._build_digest_body(digest)
        
        request = EmailRequest(
            to_email=digest.parent_id,  # In production, fetch parent email
            subject=subject,
            body=body,
            email_type=EmailType.PROGRESS_DIGEST,
            parent_id=digest.parent_id
        )
        
        return await self.send_email(request)
    
    async def send_password_reset(self, email: EmailStr, reset_token: str, parent_id: str) -> bool:
        """Send password reset email"""
        reset_link = f"https://peripateticware.com/reset-password?token={reset_token}"
        
        body = f"""
        <h1>Password Reset Request</h1>
        <p>Click the link below to reset your password:</p>
        <a href="{reset_link}">{reset_link}</a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, ignore this email.</p>
        """
        
        request = EmailRequest(
            to_email=email,
            subject="Password Reset - Peripateticware",
            body=body,
            email_type=EmailType.PASSWORD_RESET,
            parent_id=parent_id
        )
        
        return await self.send_email(request)
    
    async def send_achievement(self, email: EmailStr, child_name: str, achievement: str, parent_id: str) -> bool:
        """Send achievement notification email"""
        body = f"""
        <h1>🎉 Achievement Unlocked!</h1>
        <p>{child_name} has achieved: <strong>{achievement}</strong></p>
        <p>Log in to the parent portal to see more details.</p>
        """
        
        request = EmailRequest(
            to_email=email,
            subject=f"Achievement: {child_name} - {achievement}",
            body=body,
            email_type=EmailType.ACHIEVEMENT,
            parent_id=parent_id
        )
        
        return await self.send_email(request)
    
    async def send_concern(self, email: EmailStr, child_name: str, concern: str, parent_id: str) -> bool:
        """Send concern notification email"""
        body = f"""
        <h1>⚠️ Learning Concern</h1>
        <p>We've noticed a concern with {child_name}'s learning:</p>
        <p><strong>{concern}</strong></p>
        <p>Please log in to the parent portal for more details and to contact the teacher.</p>
        """
        
        request = EmailRequest(
            to_email=email,
            subject=f"Learning Concern: {child_name}",
            body=body,
            email_type=EmailType.CONCERN,
            parent_id=parent_id
        )
        
        return await self.send_email(request)
    
    def schedule_digest(self, parent_id: str, frequency: EmailFrequency, time_of_day: str = "09:00") -> bool:
        """Schedule recurring digest emails"""
        if frequency == EmailFrequency.NEVER:
            return False
        
        job_id = f"digest_{parent_id}_{frequency}"
        
        # In production, use APScheduler or Celery
        print(f"📅 Scheduled {frequency} digest for {parent_id} at {time_of_day}")
        self.scheduled_jobs[job_id] = {
            "parent_id": parent_id,
            "frequency": frequency,
            "time": time_of_day,
            "created_at": datetime.utcnow()
        }
        
        return True
    
    def cancel_digest(self, parent_id: str) -> bool:
        """Cancel scheduled digests"""
        job_ids = [jid for jid in self.scheduled_jobs if parent_id in jid]
        
        for job_id in job_ids:
            del self.scheduled_jobs[job_id]
            print(f"❌ Cancelled digest: {job_id}")
        
        return len(job_ids) > 0
    
    def _build_email_body(self, request: EmailRequest) -> str:
        """Build email HTML body"""
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; }}
                .container {{ max-width: 600px; margin: 0 auto; }}
                .header {{ background-color: #007bff; color: white; padding: 20px; }}
                .content {{ padding: 20px; }}
                .footer {{ background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>{request.subject}</h1>
                </div>
                <div class="content">
                    {request.body}
                </div>
                <div class="footer">
                    <p>Peripateticware - Contextual AI Learning</p>
                    <p><a href="https://peripateticware.com/settings">Manage Email Preferences</a></p>
                </div>
            </div>
        </body>
        </html>
        """
    
    def _build_digest_body(self, digest: ProgressDigest) -> str:
        """Build progress digest email body"""
        period_text = "This Week" if digest.period == "weekly" else "This Month"
        
        return f"""
        <h2>{period_text}'s Progress for {digest.child_name}</h2>
        
        <h3>📊 Summary</h3>
        <ul>
            <li>Activities Completed: <strong>{digest.activities_completed}</strong></li>
            <li>Hours of Learning: <strong>{digest.hours_learned:.1f}</strong></li>
            <li>Your Average: <strong>{digest.child_average:.1f}%</strong></li>
            <li>Class Average: <strong>{digest.class_average:.1f}%</strong></li>
        </ul>
        
        <h3>🎯 New Competencies</h3>
        <ul>
            {chr(10).join([f"<li>{c}</li>" for c in digest.new_competencies])}
        </ul>
        
        <h3>🏆 Achievements</h3>
        <ul>
            {chr(10).join([f"<li>{a}</li>" for a in digest.achievements])}
        </ul>
        
        <h3>📈 Growth Areas</h3>
        <ul>
            {chr(10).join([f"<li>{g}</li>" for g in digest.growth_areas])}
        </ul>
        
        {f'<h3>⚠️ Concerns</h3><ul>{chr(10).join([f"<li>{c}</li>" for c in digest.concerns])}</ul>' if digest.concerns else ''}
        
        <p><a href="https://peripateticware.com/dashboard">View Full Dashboard</a></p>
        """


# Global email service instance
email_service = EmailService()
