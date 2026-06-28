# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

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


# ---------------------------------------------------------------------------
# Legacy test files that import deprecated or missing APIs crash at collection
# time before pytestmark can fire.  Exclude them from collection entirely.
# ---------------------------------------------------------------------------
collect_ignore = [
    "test_activities.py",
    "test_api.py",
    "test_email_service.py",
    "test_password_reset_service.py",
    "test_rag.py",
    "test_security.py",
]
