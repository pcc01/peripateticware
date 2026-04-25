"""Integration tests for API endpoints"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from core.database import Base, get_db
from main import app
from core.config import settings


# Test database URL (use SQLite in-memory for tests)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_db():
    """Create test database session"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False}
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    TestingSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async def override_get_db():
        async with TestingSessionLocal() as session:
            yield session
    
    app.dependency_overrides[get_db] = override_get_db
    
    yield TestingSessionLocal
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest_asyncio.fixture
async def client(test_db):
    """Create async test client"""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


class TestHealth:
    """Test health endpoints"""
    
    @pytest.mark.asyncio
    async def test_health_check(self, client):
        """Test health check endpoint"""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "peripateticware-api"
    
    @pytest.mark.asyncio
    async def test_root_endpoint(self, client):
        """Test root endpoint"""
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Peripateticware"
        assert "documentation" in data


class TestAuthentication:
    """Test authentication endpoints"""
    
    @pytest.mark.asyncio
    async def test_register_user(self, client):
        """Test user registration"""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "username": "newuser",
                "password": "secure_password_123",
                "full_name": "New User",
                "role": "student"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["username"] == "newuser"
        assert "user_id" in data
    
    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client):
        """Test registration with duplicate email"""
        # First registration
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": "duplicate@example.com",
                "username": "user1",
                "password": "password123",
                "full_name": "User One",
                "role": "student"
            }
        )
        
        # Attempt duplicate registration
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "duplicate@example.com",
                "username": "user2",
                "password": "password123",
                "full_name": "User Two",
                "role": "student"
            }
        )
        
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"]
    
    @pytest.mark.asyncio
    async def test_login_success(self, client):
        """Test successful login"""
        # Register user
        register_response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "testuser@example.com",
                "username": "testuser",
                "password": "testpass123",
                "full_name": "Test User",
                "role": "student"
            }
        )
        
        # Login
        login_response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "testuser@example.com",
                "password": "testpass123"
            }
        )
        
        assert login_response.status_code == 200
        data = login_response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 86400
    
    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self, client):
        """Test login with invalid credentials"""
        # Register user
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": "user@example.com",
                "username": "user",
                "password": "password123",
                "full_name": "User",
                "role": "student"
            }
        )
        
        # Attempt login with wrong password
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "user@example.com",
                "password": "wrongpassword"
            }
        )
        
        assert response.status_code == 401
        assert "Invalid credentials" in response.json()["detail"]


class TestObservability:
    """Test observability endpoints"""
    
    @pytest.mark.asyncio
    async def test_system_health(self, client):
        """Test system health endpoint"""
        response = await client.get("/api/v1/observability/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "components" in data
    
    @pytest.mark.asyncio
    async def test_latency_metrics(self, client):
        """Test latency metrics endpoint"""
        response = await client.get("/api/v1/observability/metrics/latency?hours=24")
        assert response.status_code == 200
        data = response.json()
        assert "metrics" in data
        assert "p50_latency_ms" in data["metrics"]
    
    @pytest.mark.asyncio
    async def test_error_rate_metrics(self, client):
        """Test error rate metrics endpoint"""
        response = await client.get("/api/v1/observability/metrics/error-rate?hours=24")
        assert response.status_code == 200
        data = response.json()
        assert "error_rate" in data
        assert "total_requests" in data
