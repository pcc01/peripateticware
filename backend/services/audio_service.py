# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Audio transcription service using Ollama Whisper or OpenAI API"""

import logging
import tempfile
import subprocess
import os
from typing import Dict, Optional
import httpx
from core.config import settings

logger = logging.getLogger(__name__)


class AudioTranscriptionService:
    """Handle audio transcription with Whisper"""
    
    @staticmethod
    async def transcribe_audio(
        audio_bytes: bytes,
        audio_format: str = "wav"
    ) -> Dict:
        """
        Transcribe audio using configured provider (Ollama Whisper or OpenAI)
        
        Args:
            audio_bytes: Raw audio file bytes
            audio_format: Audio format (wav, mp3, m4a, etc.)
            
        Returns:
            {
                "text": "transcribed text",
                "confidence": 0.92,
                "model": "whisper",
                "duration_ms": 2500
            }
        """
        if not audio_bytes:
            return {
                "text": "",
                "confidence": 0.0,
                "error": "No audio data provided"
            }
        
        # Try Ollama Whisper first (local, free)
        result = await AudioTranscriptionService._transcribe_with_ollama(
            audio_bytes,
            audio_format
        )
        
        # Fall back to OpenAI if configured and Ollama fails
        if not result.get("text") and os.getenv("OPENAI_API_KEY"):
            result = await AudioTranscriptionService._transcribe_with_openai(
                audio_bytes,
                audio_format
            )
        
        return result
    
    @staticmethod
    async def _transcribe_with_ollama(
        audio_bytes: bytes,
        audio_format: str
    ) -> Dict:
        """Transcribe using Ollama Whisper (local, free)"""
        try:
            # Save to temp file
            with tempfile.NamedTemporaryFile(
                suffix=f".{audio_format}",
                delete=False
            ) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            
            try:
                # Call Ollama Whisper
                result = subprocess.run(
                    ["ollama", "run", settings.OLLAMA_MODEL_AUDIO, tmp_path],
                    capture_output=True,
                    text=True,
                    timeout=120  # Whisper can take a while
                )
                
                if result.returncode == 0:
                    transcribed_text = result.stdout.strip()
                    logger.info(
                        f"Audio transcribed with Ollama: "
                        f"{len(transcribed_text)} chars"
                    )
                    
                    return {
                        "text": transcribed_text,
                        "confidence": 0.92,
                        "model": settings.OLLAMA_MODEL_AUDIO,
                        "provider": "ollama"
                    }
                else:
                    logger.warning(
                        f"Ollama Whisper error: {result.stderr}"
                    )
                    return {
                        "text": "",
                        "confidence": 0.0,
                        "error": result.stderr,
                        "provider": "ollama"
                    }
            
            finally:
                # Clean up temp file
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
        
        except subprocess.TimeoutExpired:
            logger.warning("Ollama Whisper transcription timed out")
            return {
                "text": "",
                "confidence": 0.0,
                "error": "Transcription timeout",
                "provider": "ollama"
            }
        
        except FileNotFoundError:
            logger.warning(
                "Ollama not found in PATH. "
                "Install Ollama: https://ollama.ai"
            )
            return {
                "text": "",
                "confidence": 0.0,
                "error": "Ollama not installed",
                "provider": "ollama"
            }
        
        except Exception as e:
            logger.error(f"Ollama transcription error: {e}")
            return {
                "text": "",
                "confidence": 0.0,
                "error": str(e),
                "provider": "ollama"
            }
    
    @staticmethod
    async def _transcribe_with_openai(
        audio_bytes: bytes,
        audio_format: str
    ) -> Dict:
        """Transcribe using OpenAI Whisper API (cloud, paid)"""
        try:
            from io import BytesIO
            
            # Prepare audio file
            audio_file = BytesIO(audio_bytes)
            audio_file.name = f"audio.{audio_format}"
            
            # Call OpenAI Whisper API
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={
                        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"
                    },
                    files={
                        "file": (audio_file.name, audio_bytes),
                        "model": (None, "whisper-1")
                    }
                )
            
            if response.status_code == 200:
                data = response.json()
                transcribed_text = data.get("text", "")
                
                logger.info(
                    f"Audio transcribed with OpenAI: "
                    f"{len(transcribed_text)} chars"
                )
                
                return {
                    "text": transcribed_text,
                    "confidence": 0.95,
                    "model": "whisper-1",
                    "provider": "openai"
                }
            else:
                logger.error(
                    f"OpenAI API error: {response.status_code}"
                )
                return {
                    "text": "",
                    "confidence": 0.0,
                    "error": f"OpenAI error: {response.status_code}",
                    "provider": "openai"
                }
        
        except Exception as e:
            logger.error(f"OpenAI transcription error: {e}")
            return {
                "text": "",
                "confidence": 0.0,
                "error": str(e),
                "provider": "openai"
            }


async def transcribe_audio(audio_bytes: bytes, audio_format: str = "wav") -> Dict:
    """Public API for audio transcription"""
    return await AudioTranscriptionService.transcribe_audio(
        audio_bytes,
        audio_format
    )
