"""
Child Linking Service - Parent-Child Account Linking
Handles 6-digit verification codes and relationship management
"""

from datetime import datetime, timedelta
from typing import Optional, List
from enum import Enum
import random
import string
from pydantic import BaseModel


class LinkRelationship(str, Enum):
    """Types of parent-child relationships"""
    PARENT = "parent"
    GUARDIAN = "guardian"
    TUTOR = "tutor"
    SCHOOL_ADMIN = "school_admin"


class LinkCodeStatus(str, Enum):
    """Status of a linking code"""
    ACTIVE = "active"
    USED = "used"
    EXPIRED = "expired"


class LinkCode(BaseModel):
    """Linking verification code"""
    code: str
    child_id: str
    teacher_id: str
    created_at: datetime
    expires_at: datetime
    status: LinkCodeStatus
    used_by: Optional[str] = None
    used_at: Optional[datetime] = None


class LinkRequest(BaseModel):
    """Request to link child account"""
    code: str
    relationship: LinkRelationship


class ChildLink(BaseModel):
    """Active child-parent link"""
    id: str
    parent_id: str
    child_id: str
    child_name: str
    relationship: LinkRelationship
    linked_at: datetime
    verified: bool = True


class ChildLinkingService:
    """Manages parent-child account linking"""
    
    def __init__(self):
        self.active_codes = {}  # code -> LinkCode
        self.active_links = {}  # parent_id -> List[ChildLink]
        self.code_expiry_hours = 24
    
    def generate_link_code(self, child_id: str, teacher_id: str) -> str:
        """Generate a 6-digit verification code for linking"""
        # Generate random 6-digit code
        code = ''.join(random.choices(string.digits, k=6))
        
        # Store the code
        link_code = LinkCode(
            code=code,
            child_id=child_id,
            teacher_id=teacher_id,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=self.code_expiry_hours),
            status=LinkCodeStatus.ACTIVE
        )
        
        self.active_codes[code] = link_code
        print(f"📋 Generated link code: {code} for child {child_id}")
        
        return code
    
    def validate_code(self, code: str) -> Optional[LinkCode]:
        """Validate a linking code"""
        if code not in self.active_codes:
            print(f"❌ Invalid code: {code}")
            return None
        
        link_code = self.active_codes[code]
        
        # Check if expired
        if datetime.utcnow() > link_code.expires_at:
            link_code.status = LinkCodeStatus.EXPIRED
            print(f"❌ Code expired: {code}")
            return None
        
        # Check if already used
        if link_code.status == LinkCodeStatus.USED:
            print(f"❌ Code already used: {code}")
            return None
        
        return link_code
    
    def link_child(self, parent_id: str, code: str, relationship: LinkRelationship) -> Optional[ChildLink]:
        """Link a child to a parent account"""
        # Validate code
        link_code = self.validate_code(code)
        if not link_code:
            return None
        
        # Create link
        child_link = ChildLink(
            id=f"link_{parent_id}_{link_code.child_id}",
            parent_id=parent_id,
            child_id=link_code.child_id,
            child_name=f"Child_{link_code.child_id[:8]}",  # In production, fetch actual name
            relationship=relationship,
            linked_at=datetime.utcnow(),
            verified=True
        )
        
        # Mark code as used
        link_code.status = LinkCodeStatus.USED
        link_code.used_by = parent_id
        link_code.used_at = datetime.utcnow()
        
        # Store link
        if parent_id not in self.active_links:
            self.active_links[parent_id] = []
        self.active_links[parent_id].append(child_link)
        
        print(f"✅ Linked child {link_code.child_id} to parent {parent_id} as {relationship}")
        
        return child_link
    
    def get_parent_children(self, parent_id: str) -> List[ChildLink]:
        """Get all children linked to a parent"""
        return self.active_links.get(parent_id, [])
    
    def unlink_child(self, parent_id: str, child_id: str) -> bool:
        """Unlink a child from parent account"""
        if parent_id not in self.active_links:
            return False
        
        links = self.active_links[parent_id]
        original_count = len(links)
        
        # Remove the link
        self.active_links[parent_id] = [
            link for link in links 
            if link.child_id != child_id
        ]
        
        removed = original_count > len(self.active_links[parent_id])
        
        if removed:
            print(f"✅ Unlinked child {child_id} from parent {parent_id}")
        else:
            print(f"❌ Could not find link for child {child_id} and parent {parent_id}")
        
        return removed
    
    def update_relationship(self, parent_id: str, child_id: str, new_relationship: LinkRelationship) -> bool:
        """Update the relationship type"""
        if parent_id not in self.active_links:
            return False
        
        for link in self.active_links[parent_id]:
            if link.child_id == child_id:
                link.relationship = new_relationship
                print(f"✅ Updated relationship for {child_id} to {new_relationship}")
                return True
        
        return False
    
    def get_link_status(self, code: str) -> Optional[dict]:
        """Get status of a linking code"""
        if code not in self.active_codes:
            return None
        
        link_code = self.active_codes[code]
        
        return {
            "code": code,
            "status": link_code.status,
            "created_at": link_code.created_at.isoformat(),
            "expires_at": link_code.expires_at.isoformat(),
            "time_remaining_hours": max(0, (link_code.expires_at - datetime.utcnow()).seconds / 3600),
            "used_by": link_code.used_by,
            "used_at": link_code.used_at.isoformat() if link_code.used_at else None
        }
    
    def cleanup_expired_codes(self) -> int:
        """Remove expired codes"""
        expired = []
        
        for code, link_code in list(self.active_codes.items()):
            if datetime.utcnow() > link_code.expires_at:
                expired.append(code)
                del self.active_codes[code]
        
        print(f"🧹 Cleaned up {len(expired)} expired codes")
        return len(expired)


# Global child linking service instance
child_linking_service = ChildLinkingService()
