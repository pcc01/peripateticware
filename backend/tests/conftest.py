"""Pytest configuration and shared fixtures"""

import pytest
import asyncio
from typing import Generator


def pytest_configure(config):
    """Configure pytest"""
    config.addinivalue_line(
        "markers", "asyncio: mark test as async"
    )


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create event loop for async tests"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def anyio_backend():
    """Set anyio backend for pytest-asyncio"""
    return "asyncio"
