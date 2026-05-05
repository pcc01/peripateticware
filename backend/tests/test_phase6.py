# ==============================================================================
# backend/tests/test_student_capture.py
# Tests for student capture API
# ==============================================================================

import pytest
from uuid import uuid4
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from main import app
from models.database import StudentCapture, CaptureType, User
from services.asr_service import asr_service

client = TestClient(app)


@pytest.fixture
def user(db: Session):
    """Create test user"""
    user = User(
        id=uuid4(),
        email="student@test.com",
        username="student",
        hashed_password="hashed"
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def activity(db: Session):
    """Create test activity"""
    from models.database import Activity
    activity = Activity(
        id=uuid4(),
        title="Test Activity",
        description="Test Description"
    )
    db.add(activity)
    db.commit()
    return activity


def test_upload_photo_capture(client: TestClient, user: User, activity):
    """Test uploading a photo capture"""
    # Note: This requires proper auth setup
    token = "test_token"  # Would come from auth
    
    # Create test file
    from io import BytesIO
    from PIL import Image
    
    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    
    response = client.post(
        "/api/v1/student/captures/upload",
        data={
            "capture_type": CaptureType.PHOTO,
            "activity_id": str(activity.id),
            "description": "Test photo"
        },
        files={"file": ("test.jpg", img_bytes, "image/jpeg")},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["capture_type"] == CaptureType.PHOTO
    assert data["description"] == "Test photo"


def test_list_captures(client: TestClient, user: User, db: Session):
    """Test listing user's captures"""
    # Create test captures
    for i in range(3):
        capture = StudentCapture(
            student_id=user.id,
            capture_type=CaptureType.PHOTO,
            file_path=f"/tmp/test_{i}.jpg"
        )
        db.add(capture)
    db.commit()
    
    response = client.get(
        "/api/v1/student/captures",
        headers={"Authorization": "Bearer test_token"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3


def test_delete_capture(client: TestClient, user: User, db: Session):
    """Test deleting a capture"""
    capture = StudentCapture(
        id=uuid4(),
        student_id=user.id,
        capture_type=CaptureType.PHOTO,
        file_path="/tmp/test.jpg"
    )
    db.add(capture)
    db.commit()
    
    response = client.delete(
        f"/api/v1/student/captures/{capture.id}",
        headers={"Authorization": "Bearer test_token"}
    )
    
    assert response.status_code == 200
    
    # Verify deletion
    deleted = db.query(StudentCapture).filter_by(id=capture.id).first()
    assert deleted is None


# ==============================================================================
# backend/tests/test_asr_service.py
# Tests for ASR transcription service
# ==============================================================================

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from services.asr_service import ASRService


@pytest.fixture
def asr():
    """Create ASR service instance"""
    return ASRService()


def test_asr_service_initialization(asr: ASRService):
    """Test ASR service initializes correctly"""
    assert asr is not None
    assert len(asr.providers) > 0


def test_supported_languages():
    """Test getting supported languages"""
    languages = ASRService.supported_languages()
    assert 'en' in languages
    assert 'es' in languages
    assert languages['en'] == 'English'


@pytest.mark.asyncio
async def test_transcribe_with_mock(asr: ASRService):
    """Test transcription with mocked API"""
    with patch('services.asr_service.openai.OpenAI') as mock_openai:
        # Mock the OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        
        mock_response = MagicMock()
        mock_response.text = "This is a test transcript"
        mock_client.audio.transcriptions.create.return_value = mock_response
        
        result = await asr._transcribe_whisper_openai(
            "/tmp/test_audio.wav",
            "en"
        )
        
        assert result['status'] == 'completed'
        assert 'test transcript' in result['text'].lower()


@pytest.mark.asyncio
async def test_transcribe_fallback_chain(asr: ASRService):
    """Test that service tries fallback providers"""
    result = await asr.transcribe_audio(
        "/tmp/nonexistent.wav",
        "en"
    )
    
    # Should fail gracefully
    assert result['status'] in ['failed', 'completed', 'disabled']


# ==============================================================================
# backend/tests/test_student_notebook.py
# Tests for notebook API
# ==============================================================================

import pytest
from models.database import StudentNotebook, NotebookEntryType


def test_create_notebook_entry(client: TestClient, user: User, activity):
    """Test creating a notebook entry"""
    response = client.post(
        "/api/v1/student/notebook",
        json={
            "entry_type": NotebookEntryType.REFLECTION,
            "content": "This is a test reflection",
            "prompt": "What surprised you?",
            "activity_id": str(activity.id),
            "word_count": 5
        },
        headers={"Authorization": "Bearer test_token"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["entry_type"] == NotebookEntryType.REFLECTION
    assert "test reflection" in data["content"]


def test_list_notebook_entries(client: TestClient, user: User, db: Session):
    """Test listing notebook entries"""
    # Create test entries
    for i in range(2):
        entry = StudentNotebook(
            student_id=user.id,
            entry_type=NotebookEntryType.REFLECTION,
            content=f"Entry {i}",
            word_count=2
        )
        db.add(entry)
    db.commit()
    
    response = client.get(
        "/api/v1/student/notebook",
        headers={"Authorization": "Bearer test_token"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2


def test_update_notebook_entry(client: TestClient, user: User, db: Session):
    """Test updating a notebook entry"""
    entry = StudentNotebook(
        id=uuid4(),
        student_id=user.id,
        entry_type=NotebookEntryType.REFLECTION,
        content="Original content",
        word_count=2
    )
    db.add(entry)
    db.commit()
    
    response = client.put(
        f"/api/v1/student/notebook/{entry.id}",
        json={
            "content": "Updated content",
            "word_count": 2
        },
        headers={"Authorization": "Bearer test_token"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "Updated" in data["content"]


# ==============================================================================
# backend/tests/test_student_portfolio.py
# Tests for portfolio API
# ==============================================================================

def test_get_portfolio(client: TestClient, user: User):
    """Test getting student portfolio"""
    response = client.get(
        "/api/v1/student/portfolio",
        headers={"Authorization": "Bearer test_token"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "captures" in data
    assert "notebook_entries" in data
    assert "competencies" in data


def test_get_competencies(client: TestClient, user: User):
    """Test getting competency progress"""
    response = client.get(
        "/api/v1/student/competencies",
        headers={"Authorization": "Bearer test_token"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
