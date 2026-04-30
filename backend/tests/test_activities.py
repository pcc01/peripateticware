"""Tests for activity and project endpoints"""

import pytest
from uuid import uuid4
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from main import app
from models import User, UserRole, Activity, ActivityStatus, Project, ProjectStatus
from core.database import Base, engine, get_db


# ============================================================================
# TEST FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
def db():
    """Create test database"""
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db):
    """Create test client"""
    def override_get_db():
        return db
    
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def teacher_user(db):
    """Create a test teacher user"""
    user = User(
        email="teacher@test.com",
        username="testteacher",
        hashed_password="hashed_password",
        role=UserRole.TEACHER,
        full_name="Test Teacher",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, teacher_user, db):
    """Get auth headers for teacher user"""
    # Note: In real tests, you'd need to mock the JWT token or use actual auth
    # For now, we'll assume auth works and return headers
    return {"Authorization": f"Bearer fake_token_for_{teacher_user.id}"}


# ============================================================================
# ACTIVITY ENDPOINT TESTS
# ============================================================================

class TestActivityEndpoints:
    """Test activity CRUD endpoints"""
    
    def test_create_activity_success(self, client, teacher_user, db):
        """Test creating an activity"""
        activity_data = {
            "title": "Forest Field Study",
            "description": "Students explore local forest ecosystem",
            "location_latitude": 47.6062,
            "location_longitude": -122.3321,
            "location_radius_meters": 150,
            "location_name": "Green Lake Park",
            "grade_level": 8,
            "subject": "Biology",
            "difficulty_level": 3,
            "estimated_duration_minutes": 60,
            "learning_objectives": ["Identify local flora", "Understand ecosystems"],
            "curriculum_unit_ids": [],
            "bloom_level": 3,
            "activity_type": "hands_on",
            "materials_needed": ["field guides", "collection bags"],
            "resources": [{"url": "example.com", "title": "Flora Guide"}],
            "is_shareable": False
        }
        
        response = client.post(
            "/api/v1/teacher/activities",
            json=activity_data,
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        # Should succeed (201) or return 200 depending on implementation
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["title"] == "Forest Field Study"
        assert data["teacher_id"] == str(teacher_user.id)
        assert data["status"] == "draft"
    
    def test_create_activity_invalid_title(self, client, teacher_user):
        """Test creating activity with invalid title"""
        activity_data = {
            "title": "ab",  # Too short
            "description": "This is a valid description",
            "location_latitude": 47.6062,
            "location_longitude": -122.3321,
            "location_radius_meters": 150,
            "location_name": "Park",
            "grade_level": 8,
            "subject": "Math",
            "difficulty_level": 3,
            "estimated_duration_minutes": 60,
            "learning_objectives": ["Objective 1"],
            "curriculum_unit_ids": [],
            "bloom_level": 3,
            "activity_type": "inquiry"
        }
        
        response = client.post(
            "/api/v1/teacher/activities",
            json=activity_data,
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 422  # Validation error
    
    def test_list_activities(self, client, teacher_user, db):
        """Test listing activities"""
        # Create test activities
        for i in range(3):
            activity = Activity(
                teacher_id=teacher_user.id,
                title=f"Activity {i}",
                description="Test activity",
                location_latitude=47.6,
                location_longitude=-122.3,
                location_name="Test Location",
                grade_level=8,
                subject="Math",
                estimated_duration_minutes=60,
                learning_objectives=["obj1"],
                bloom_level=3
            )
            db.add(activity)
        db.commit()
        
        response = client.get(
            "/api/v1/teacher/activities",
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3
    
    def test_list_activities_filter_by_subject(self, client, teacher_user, db):
        """Test filtering activities by subject"""
        # Create activities
        activity1 = Activity(
            teacher_id=teacher_user.id,
            title="Math Activity",
            description="Test",
            location_latitude=47.6,
            location_longitude=-122.3,
            location_name="Test",
            grade_level=8,
            subject="Math",
            estimated_duration_minutes=60,
            learning_objectives=["obj1"],
            bloom_level=3
        )
        activity2 = Activity(
            teacher_id=teacher_user.id,
            title="Science Activity",
            description="Test",
            location_latitude=47.6,
            location_longitude=-122.3,
            location_name="Test",
            grade_level=8,
            subject="Science",
            estimated_duration_minutes=60,
            learning_objectives=["obj1"],
            bloom_level=3
        )
        db.add(activity1)
        db.add(activity2)
        db.commit()
        
        response = client.get(
            "/api/v1/teacher/activities?subject=Math",
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["subject"] == "Math"
    
    def test_get_activity_detail(self, client, teacher_user, db):
        """Test getting activity detail"""
        activity = Activity(
            teacher_id=teacher_user.id,
            title="Test Activity",
            description="Test description",
            location_latitude=47.6,
            location_longitude=-122.3,
            location_name="Test Location",
            grade_level=8,
            subject="Math",
            estimated_duration_minutes=60,
            learning_objectives=["obj1"],
            bloom_level=3
        )
        db.add(activity)
        db.commit()
        
        response = client.get(
            f"/api/v1/teacher/activities/{activity.id}",
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(activity.id)
        assert data["title"] == "Test Activity"
    
    def test_update_activity(self, client, teacher_user, db):
        """Test updating activity"""
        activity = Activity(
            teacher_id=teacher_user.id,
            title="Old Title",
            description="Test description",
            location_latitude=47.6,
            location_longitude=-122.3,
            location_name="Test Location",
            grade_level=8,
            subject="Math",
            estimated_duration_minutes=60,
            learning_objectives=["obj1"],
            bloom_level=3
        )
        db.add(activity)
        db.commit()
        
        update_data = {
            "title": "New Title",
            "difficulty_level": 5
        }
        
        response = client.put(
            f"/api/v1/teacher/activities/{activity.id}",
            json=update_data,
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "New Title"
        assert data["difficulty_level"] == 5
    
    def test_delete_activity(self, client, teacher_user, db):
        """Test deleting activity"""
        activity = Activity(
            teacher_id=teacher_user.id,
            title="Test Activity",
            description="Test description",
            location_latitude=47.6,
            location_longitude=-122.3,
            location_name="Test Location",
            grade_level=8,
            subject="Math",
            estimated_duration_minutes=60,
            learning_objectives=["obj1"],
            bloom_level=3
        )
        db.add(activity)
        db.commit()
        activity_id = activity.id
        
        response = client.delete(
            f"/api/v1/teacher/activities/{activity_id}",
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 204
        
        # Verify deleted
        deleted = db.query(Activity).filter(Activity.id == activity_id).first()
        assert deleted is None
    
    def test_publish_activity(self, client, teacher_user, db):
        """Test publishing activity"""
        activity = Activity(
            teacher_id=teacher_user.id,
            title="Test Activity",
            description="Test description",
            location_latitude=47.6,
            location_longitude=-122.3,
            location_name="Test Location",
            grade_level=8,
            subject="Math",
            estimated_duration_minutes=60,
            learning_objectives=["obj1"],
            bloom_level=3,
            status=ActivityStatus.DRAFT
        )
        db.add(activity)
        db.commit()
        
        response = client.post(
            f"/api/v1/teacher/activities/{activity.id}/publish",
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "published"
        assert data["published_at"] is not None


# ============================================================================
# PROJECT ENDPOINT TESTS
# ============================================================================

class TestProjectEndpoints:
    """Test project CRUD endpoints"""
    
    def test_create_project_success(self, client, teacher_user, db):
        """Test creating a project"""
        project_data = {
            "title": "Spring Biology Unit",
            "description": "Comprehensive study of spring ecology",
            "grade_level": 9,
            "subject": "Biology",
            "duration_weeks": 8,
            "start_date": datetime.now().isoformat(),
            "end_date": (datetime.now() + timedelta(weeks=8)).isoformat()
        }
        
        response = client.post(
            "/api/v1/teacher/projects",
            json=project_data,
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["title"] == "Spring Biology Unit"
        assert data["teacher_id"] == str(teacher_user.id)
        assert data["status"] == "planning"
    
    def test_list_projects(self, client, teacher_user, db):
        """Test listing projects"""
        for i in range(3):
            project = Project(
                teacher_id=teacher_user.id,
                title=f"Project {i}",
                description="Test project",
                grade_level=8,
                subject="Math",
                duration_weeks=4,
                start_date=datetime.now()
            )
            db.add(project)
        db.commit()
        
        response = client.get(
            "/api/v1/teacher/projects",
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
    
    def test_get_project_detail(self, client, teacher_user, db):
        """Test getting project detail"""
        project = Project(
            teacher_id=teacher_user.id,
            title="Test Project",
            description="Test description",
            grade_level=8,
            subject="Math",
            duration_weeks=4,
            start_date=datetime.now()
        )
        db.add(project)
        db.commit()
        
        response = client.get(
            f"/api/v1/teacher/projects/{project.id}",
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Test Project"


# ============================================================================
# AUTHORIZATION TESTS
# ============================================================================

class TestAuthorization:
    """Test authorization and permission checks"""
    
    def test_create_activity_non_teacher_forbidden(self, client, db):
        """Test that non-teachers cannot create activities"""
        # Create a student user
        student = User(
            email="student@test.com",
            username="teststudent",
            hashed_password="hashed",
            role=UserRole.STUDENT,
            is_active=True
        )
        db.add(student)
        db.commit()
        
        activity_data = {
            "title": "Test",
            "description": "Test activity",
            "location_latitude": 47.6,
            "location_longitude": -122.3,
            "location_radius_meters": 100,
            "location_name": "Test",
            "grade_level": 8,
            "subject": "Math",
            "difficulty_level": 3,
            "estimated_duration_minutes": 60,
            "learning_objectives": ["obj1"],
            "curriculum_unit_ids": [],
            "bloom_level": 3,
            "activity_type": "inquiry"
        }
        
        response = client.post(
            "/api/v1/teacher/activities",
            json=activity_data,
            headers={"Authorization": f"Bearer {student.id}"}
        )
        
        assert response.status_code == 403
    
    def test_update_others_activity_forbidden(self, client, teacher_user, db):
        """Test that teachers cannot edit others' activities"""
        # Create another teacher
        other_teacher = User(
            email="other@test.com",
            username="otherteacher",
            hashed_password="hashed",
            role=UserRole.TEACHER,
            is_active=True
        )
        db.add(other_teacher)
        db.commit()
        
        # Create activity belonging to other teacher
        activity = Activity(
            teacher_id=other_teacher.id,
            title="Other's Activity",
            description="Test",
            location_latitude=47.6,
            location_longitude=-122.3,
            location_name="Test",
            grade_level=8,
            subject="Math",
            estimated_duration_minutes=60,
            learning_objectives=["obj1"],
            bloom_level=3
        )
        db.add(activity)
        db.commit()
        
        update_data = {"title": "Hacked Title"}
        
        response = client.put(
            f"/api/v1/teacher/activities/{activity.id}",
            json=update_data,
            headers={"Authorization": f"Bearer {teacher_user.id}"}
        )
        
        assert response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
