# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Phase 2 Integration Tests - Child Linking Service
Tests all child linking and verification code functionality
"""

import pytest
from datetime import datetime, timedelta
from services.child_linking_service import (
    ChildLinkingService, LinkRelationship, LinkCodeStatus,
    LinkCode, LinkRequest, ChildLink
)


class TestChildLinkingService:
    """Child linking service integration tests"""

    @pytest.fixture
    def linking_service(self):
        """Create child linking service instance"""
        return ChildLinkingService()

    # Test Code Generation
    def test_generate_link_code(self, linking_service):
        """Test 6-digit code generation"""
        code = linking_service.generate_link_code(
            child_id="child1",
            teacher_id="teacher1"
        )
        
        assert code is not None
        assert len(code) == 6
        assert code.isdigit()

    def test_generate_multiple_codes(self, linking_service):
        """Test generating multiple codes"""
        codes = [
            linking_service.generate_link_code(f"child{i}", f"teacher{i}")
            for i in range(5)
        ]
        
        assert len(codes) == 5
        assert len(set(codes)) == 5  # All unique

    def test_code_stored_correctly(self, linking_service):
        """Test code is stored in service"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        assert code in linking_service.active_codes
        assert linking_service.active_codes[code].status.value == "active"

    # Test Code Validation
    def test_validate_active_code(self, linking_service):
        """Test validating an active code"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        result = linking_service.validate_code(code)
        assert result is not None
        assert result.status.value == "active"

    def test_validate_invalid_code(self, linking_service):
        """Test validating an invalid code"""
        result = linking_service.validate_code("999999")
        assert result is None

    def test_validate_expired_code(self, linking_service):
        """Test validating an expired code"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        # Manually expire the code
        link_code = linking_service.active_codes[code]
        link_code.expires_at = datetime.utcnow() - timedelta(hours=1)
        
        result = linking_service.validate_code(code)
        assert result is None

    def test_validate_used_code(self, linking_service):
        """Test validating a used code"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        # Link child to mark code as used
        linking_service.link_child("parent1", code, LinkRelationship.PARENT)
        
        # Try to validate again
        result = linking_service.validate_code(code)
        assert result is None

    # Test Child Linking
    def test_link_child_as_parent(self, linking_service):
        """Test linking child as parent"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        link = linking_service.link_child(
            parent_id="parent1",
            code=code,
            relationship=LinkRelationship.PARENT
        )
        
        assert link is not None
        assert link.parent_id == "parent1"
        assert link.child_id == "child1"
        assert link.relationship == LinkRelationship.PARENT
        assert link.verified is True

    def test_link_child_as_guardian(self, linking_service):
        """Test linking child as guardian"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        link = linking_service.link_child(
            parent_id="guardian1",
            code=code,
            relationship=LinkRelationship.GUARDIAN
        )
        
        assert link.relationship == LinkRelationship.GUARDIAN

    def test_link_child_as_tutor(self, linking_service):
        """Test linking child as tutor"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        link = linking_service.link_child(
            parent_id="tutor1",
            code=code,
            relationship=LinkRelationship.TUTOR
        )
        
        assert link.relationship == LinkRelationship.TUTOR

    def test_link_child_with_invalid_code(self, linking_service):
        """Test linking with invalid code"""
        link = linking_service.link_child(
            parent_id="parent1",
            code="999999",
            relationship=LinkRelationship.PARENT
        )
        
        assert link is None

    def test_link_child_marks_code_used(self, linking_service):
        """Test that linking marks code as used"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        linking_service.link_child(
            parent_id="parent1",
            code=code,
            relationship=LinkRelationship.PARENT
        )
        
        link_code = linking_service.active_codes[code]
        assert link_code.status.value == "used"
        assert link_code.used_by == "parent1"

    # Test Get Parent Children
    def test_get_parent_children(self, linking_service):
        """Test retrieving children for parent"""
        # Link multiple children
        for i in range(3):
            code = linking_service.generate_link_code(f"child{i}", f"teacher{i}")
            linking_service.link_child(
                parent_id="parent1",
                code=code,
                relationship=LinkRelationship.PARENT
            )
        
        children = linking_service.get_parent_children("parent1")
        assert len(children) == 3

    def test_get_parent_children_empty(self, linking_service):
        """Test getting children for parent with no links"""
        children = linking_service.get_parent_children("nonexistent")
        assert len(children) == 0

    # Test Unlink Child
    def test_unlink_child(self, linking_service):
        """Test unlinking a child"""
        code = linking_service.generate_link_code("child1", "teacher1")
        linking_service.link_child(
            parent_id="parent1",
            code=code,
            relationship=LinkRelationship.PARENT
        )
        
        result = linking_service.unlink_child("parent1", "child1")
        assert result is True

    def test_unlink_nonexistent_child(self, linking_service):
        """Test unlinking non-existent child"""
        result = linking_service.unlink_child("parent1", "child999")
        assert result is False

    # Test Update Relationship
    def test_update_relationship(self, linking_service):
        """Test updating relationship type"""
        code = linking_service.generate_link_code("child1", "teacher1")
        linking_service.link_child(
            parent_id="parent1",
            code=code,
            relationship=LinkRelationship.PARENT
        )
        
        result = linking_service.update_relationship(
            parent_id="parent1",
            child_id="child1",
            new_relationship=LinkRelationship.GUARDIAN
        )
        
        assert result is True
        
        children = linking_service.get_parent_children("parent1")
        assert children[0].relationship == LinkRelationship.GUARDIAN

    def test_update_relationship_nonexistent(self, linking_service):
        """Test updating relationship for non-existent link"""
        result = linking_service.update_relationship(
            parent_id="parent1",
            child_id="child999",
            new_relationship=LinkRelationship.TUTOR
        )
        
        assert result is False

    # Test Code Status
    def test_get_code_status(self, linking_service):
        """Test getting code status"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        status = linking_service.get_link_status(code)
        assert status is not None
        assert status["code"] == code
        assert status["status"] == "active"
        assert status["time_remaining_hours"] > 0

    def test_get_code_status_after_use(self, linking_service):
        """Test getting code status after being used"""
        code = linking_service.generate_link_code("child1", "teacher1")
        
        linking_service.link_child(
            parent_id="parent1",
            code=code,
            relationship=LinkRelationship.PARENT
        )
        
        status = linking_service.get_link_status(code)
        assert status["status"] == "used"
        assert status["used_by"] == "parent1"

    # Test Cleanup
    def test_cleanup_expired_codes(self, linking_service):
        """Test cleaning up expired codes"""
        # Generate codes
        for i in range(5):
            linking_service.generate_link_code(f"child{i}", f"teacher{i}")
        
        # Expire some codes
        codes = list(linking_service.active_codes.keys())
        for code in codes[:2]:
            linking_service.active_codes[code].expires_at = \
                datetime.utcnow() - timedelta(hours=1)
        
        # Cleanup
        removed = linking_service.cleanup_expired_codes()
        assert removed == 2

    # Test Multiple Parents, Same Child
    def test_multiple_parents_same_child(self, linking_service):
        """Test multiple parents linking same child"""
        code1 = linking_service.generate_link_code("child1", "teacher1")
        code2 = linking_service.generate_link_code("child1", "teacher2")
        
        link1 = linking_service.link_child(
            parent_id="parent1",
            code=code1,
            relationship=LinkRelationship.PARENT
        )
        
        link2 = linking_service.link_child(
            parent_id="parent2",
            code=code2,
            relationship=LinkRelationship.GUARDIAN
        )
        
        assert link1 is not None
        assert link2 is not None
        assert link1.parent_id != link2.parent_id

    # Test All Relationship Types
    def test_all_relationship_types(self, linking_service):
        """Test all relationship types"""
        for i, relationship in enumerate(LinkRelationship):
            code = linking_service.generate_link_code(f"child{i}", f"teacher{i}")
            
            link = linking_service.link_child(
                parent_id=f"parent{i}",
                code=code,
                relationship=relationship
            )
            
            assert link.relationship == relationship


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
