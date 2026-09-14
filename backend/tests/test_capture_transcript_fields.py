# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the 2026-09-13 move to on-device transcription:
  - routes/student.py::_audio_transcript_fields() — what upload_capture
    stores for transcript/transcript_status given a capture's type and
    whatever transcript text (if any) the client submitted.
  - The now-deleted server-side ASR pipeline (services/asr_service.py,
    _transcribe_audio_background) must actually be gone, not just unused.

Strategy
--------
_audio_transcript_fields() is a small pure function with no DB/HTTP
dependencies, extracted specifically so this logic doesn't require the
ORM-object/response-model plumbing a full upload_capture() HTTP test would
need (StudentCapture.id/captured_at are only populated by a real DB flush,
which a mocked db session doesn't provide) — see git history for why this
was pulled out rather than tested through the route.
"""

from __future__ import annotations

import importlib

import pytest


def test_non_audio_capture_never_gets_a_transcript():
    from routes.student import _audio_transcript_fields

    transcript, status = _audio_transcript_fields(False, "some text a caller passed anyway")
    assert transcript is None
    assert status is None


def test_audio_with_client_transcript_is_completed():
    from routes.student import _audio_transcript_fields
    from models.database import TranscriptStatus

    transcript, status = _audio_transcript_fields(True, "hello world")
    assert transcript == "hello world"
    assert status == TranscriptStatus.COMPLETED


@pytest.mark.parametrize("empty_transcript", [None, ""])
def test_audio_without_client_transcript_is_unavailable_not_pending(empty_transcript):
    """No server-side ASR step exists to fall back to any more — a missing
    transcript at upload time is a final state, not a placeholder for a
    background job that will fill it in later."""
    from routes.student import _audio_transcript_fields
    from models.database import TranscriptStatus

    transcript, status = _audio_transcript_fields(True, empty_transcript)
    assert transcript is None
    assert status == TranscriptStatus.UNAVAILABLE
    assert status != TranscriptStatus.PENDING


def test_asr_service_module_is_actually_deleted():
    """Regression guard: the whole point of this change was to stop calling
    Ollama/OpenAI/Claude for audio transcription. Guards against someone
    re-adding services/asr_service.py (or a route re-importing it) without
    noticing this test exists."""
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("services.asr_service")


def test_upload_capture_no_longer_references_background_asr():
    """Regression guard for the specific functions this change removed."""
    import routes.student as student_module

    assert not hasattr(student_module, "_transcribe_audio_background")
    assert not hasattr(student_module, "_set_transcript_status")
