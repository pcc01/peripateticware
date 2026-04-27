"""
Child Linking Routes - Parent-child account linking with verification codes
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

router = APIRouter(prefix="/api/v1/parent/children", tags=["child_linking"])


class LinkRelationship(str, Enum):
    """Types of parent-child relationships"""
    PARENT = "parent"
    GUARDIAN = "guardian"
    TUTOR = "tutor"
    SCHOOL_ADMIN = "school_admin"


class GenerateLinkCodeRequest(BaseModel):
    """Request to generate link code"""
    child_id: str


class GenerateLinkCodeResponse(BaseModel):
    """Response with generated link code"""
    code: str
    expires_in_hours: int = 24
    created_at: str


class LinkCodeStatus(BaseModel):
    """Status of a link code"""
    code: str
    valid: bool
    status: str  # active, used, expired
    time_remaining_hours: Optional[float] = None
    used_by: Optional[str] = None


class LinkChildRequest(BaseModel):
    """Request to link child"""
    code: str
    relationship: LinkRelationship


class LinkedChild(BaseModel):
    """A linked child"""
    link_id: str
    child_id: str
    child_name: str
    relationship: LinkRelationship
    linked_at: str
    verified: bool


class LinkedChildrenResponse(BaseModel):
    """Response with linked children"""
    parent_id: str
    children: List[LinkedChild]


class UpdateRelationshipRequest(BaseModel):
    """Request to update relationship type"""
    relationship: LinkRelationship


@router.post("/generate-code", response_model=GenerateLinkCodeResponse)
async def generate_link_code(
    parent_id: str,
    request: GenerateLinkCodeRequest
) -> GenerateLinkCodeResponse:
    """Generate a 6-digit code to link child"""
    # In production:
    # 1. Verify parent exists
    # 2. Verify child exists
    # 3. Generate code
    # 4. Store in database
    # 5. Send to teacher's email
    
    code = "123456"  # Mock code
    
    print(f"📋 Generated link code for child {request.child_id}")
    print(f"   Parent: {parent_id}")
    print(f"   Code: {code}")
    
    return GenerateLinkCodeResponse(
        code=code,
        expires_in_hours=24,
        created_at="2026-04-27T10:30:00Z"
    )


@router.post("/link", response_model=LinkedChild)
async def link_child(
    parent_id: str,
    request: LinkChildRequest
) -> LinkedChild:
    """Link a child to parent account"""
    # In production:
    # 1. Validate code
    # 2. Check code hasn't expired
    # 3. Check code hasn't been used
    # 4. Create link in database
    # 5. Mark code as used
    
    if len(request.code) != 6 or not request.code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid code format. Code must be 6 digits."
        )
    
    print(f"✅ Linked child to parent {parent_id}")
    print(f"   Code: {request.code}")
    print(f"   Relationship: {request.relationship}")
    
    return LinkedChild(
        link_id=f"link_{parent_id}_child123",
        child_id="child123",
        child_name="Sample Child",
        relationship=request.relationship,
        linked_at="2026-04-27T10:30:00Z",
        verified=True
    )


@router.get("/", response_model=LinkedChildrenResponse)
async def get_linked_children(parent_id: str) -> LinkedChildrenResponse:
    """Get all children linked to parent"""
    # In production, fetch from database
    
    return LinkedChildrenResponse(
        parent_id=parent_id,
        children=[
            LinkedChild(
                link_id=f"link_{parent_id}_child{i}",
                child_id=f"child{i}",
                child_name=f"Child {i+1}",
                relationship=LinkRelationship.PARENT,
                linked_at="2026-04-20T10:30:00Z",
                verified=True
            )
            for i in range(2)
        ]
    )


@router.get("/{child_id}/status", response_model=LinkedChild)
async def get_child_status(
    parent_id: str,
    child_id: str
) -> LinkedChild:
    """Get status of linked child"""
    # In production, fetch from database
    
    return LinkedChild(
        link_id=f"link_{parent_id}_{child_id}",
        child_id=child_id,
        child_name="Sample Child",
        relationship=LinkRelationship.PARENT,
        linked_at="2026-04-20T10:30:00Z",
        verified=True
    )


@router.put("/{child_id}/relationship", response_model=LinkedChild)
async def update_relationship(
    parent_id: str,
    child_id: str,
    request: UpdateRelationshipRequest
) -> LinkedChild:
    """Update relationship type for linked child"""
    # In production, update in database
    
    print(f"✅ Updated relationship for {child_id}")
    print(f"   New relationship: {request.relationship}")
    
    return LinkedChild(
        link_id=f"link_{parent_id}_{child_id}",
        child_id=child_id,
        child_name="Sample Child",
        relationship=request.relationship,
        linked_at="2026-04-20T10:30:00Z",
        verified=True
    )


@router.delete("/{child_id}")
async def unlink_child(
    parent_id: str,
    child_id: str
) -> dict:
    """Unlink a child from parent account"""
    # In production, delete from database
    
    print(f"❌ Unlinked child {child_id} from parent {parent_id}")
    
    return {
        "success": True,
        "message": f"Child {child_id} has been unlinked",
        "parent_id": parent_id,
        "child_id": child_id
    }


@router.get("/code/{code}/status", response_model=LinkCodeStatus)
async def check_code_status(code: str) -> LinkCodeStatus:
    """Check status of a linking code"""
    # In production, check in database
    
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid code format"
        )
    
    print(f"🔍 Checking status of code: {code}")
    
    return LinkCodeStatus(
        code=code,
        valid=True,
        status="active",
        time_remaining_hours=23.5
    )
