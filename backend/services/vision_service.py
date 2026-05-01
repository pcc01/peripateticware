# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Vision service for image analysis using Llava or Claude Vision"""

import logging
import base64
from typing import Dict, Optional
import httpx
from core.config import settings

logger = logging.getLogger(__name__)


class VisionService:
    """Handle image analysis with Llava (Ollama) or Claude Vision"""
    
    @staticmethod
    async def analyze_image(
        image_bytes: bytes,
        image_format: str = "jpg",
        analysis_prompt: Optional[str] = None
    ) -> Dict:
        """
        Analyze image using configured provider (Ollama Llava or Claude Vision)
        
        Args:
            image_bytes: Raw image file bytes
            image_format: Image format (jpg, png, webp)
            analysis_prompt: Custom prompt for image analysis
            
        Returns:
            {
                "text": "image analysis description",
                "objects": ["object1", "object2"],
                "confidence": 0.85,
                "model": "llava",
                "provider": "ollama"
            }
        """
        if not image_bytes:
            return {
                "text": "",
                "objects": [],
                "confidence": 0.0,
                "error": "No image data provided"
            }
        
        # Use default analysis prompt if none provided
        if not analysis_prompt:
            analysis_prompt = (
                "Analyze this image from a student learning perspective. "
                "Identify: 1) Main objects/organisms present, "
                "2) Key features or characteristics, "
                "3) Potential educational value. "
                "Be concise and educational."
            )
        
        # Try Ollama Llava first (local, free)
        if settings.LLM_PROVIDER.lower() == "ollama":
            result = await VisionService._analyze_with_ollama(
                image_bytes,
                image_format,
                analysis_prompt
            )
            
            # Fall back to Claude if Ollama fails
            if not result.get("text"):
                result = await VisionService._analyze_with_claude(
                    image_bytes,
                    image_format,
                    analysis_prompt
                )
        else:
            # Use Claude Vision (cloud, requires API key)
            result = await VisionService._analyze_with_claude(
                image_bytes,
                image_format,
                analysis_prompt
            )
        
        return result
    
    @staticmethod
    async def _analyze_with_ollama(
        image_bytes: bytes,
        image_format: str,
        analysis_prompt: str
    ) -> Dict:
        """Analyze image using Ollama Llava (local, free)"""
        try:
            # Encode image as base64 for Ollama API
            image_base64 = base64.b64encode(image_bytes).decode("utf-8")
            
            # Call Ollama Llava API
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": settings.OLLAMA_MODEL_VISION,
                        "prompt": analysis_prompt,
                        "images": [image_base64],
                        "stream": False
                    }
                )
            
            if response.status_code == 200:
                data = response.json()
                analysis_text = data.get("response", "").strip()
                
                logger.info(
                    f"Image analyzed with Ollama Llava: "
                    f"{len(analysis_text)} chars"
                )
                
                # Extract objects from analysis (simple approach)
                objects = _extract_objects_from_text(analysis_text)
                
                return {
                    "text": analysis_text,
                    "objects": objects,
                    "confidence": 0.85,
                    "model": settings.OLLAMA_MODEL_VISION,
                    "provider": "ollama"
                }
            else:
                logger.warning(
                    f"Ollama Llava error: {response.status_code}"
                )
                return {
                    "text": "",
                    "objects": [],
                    "confidence": 0.0,
                    "error": f"Ollama error: {response.status_code}",
                    "provider": "ollama"
                }
        
        except Exception as e:
            logger.error(f"Ollama vision analysis error: {e}")
            return {
                "text": "",
                "objects": [],
                "confidence": 0.0,
                "error": str(e),
                "provider": "ollama"
            }
    
    @staticmethod
    async def _analyze_with_claude(
        image_bytes: bytes,
        image_format: str,
        analysis_prompt: str
    ) -> Dict:
        """Analyze image using Claude Vision API (cloud, paid)"""
        try:
            if not settings.CLAUDE_API_KEY:
                return {
                    "text": "",
                    "objects": [],
                    "confidence": 0.0,
                    "error": "Claude API key not configured",
                    "provider": "claude"
                }
            
            # Encode image as base64
            image_base64 = base64.b64encode(image_bytes).decode("utf-8")
            
            # Determine media type
            media_type_map = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp"
            }
            media_type = media_type_map.get(image_format.lower(), "image/jpeg")
            
            # Call Claude API with vision
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": settings.CLAUDE_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": settings.CLAUDE_MODEL,
                        "max_tokens": 1024,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": media_type,
                                            "data": image_base64
                                        }
                                    },
                                    {
                                        "type": "text",
                                        "text": analysis_prompt
                                    }
                                ]
                            }
                        ]
                    }
                )
            
            if response.status_code == 200:
                data = response.json()
                analysis_text = data["content"][0]["text"] if data.get("content") else ""
                
                logger.info(
                    f"Image analyzed with Claude: {len(analysis_text)} chars"
                )
                
                # Extract objects from analysis
                objects = _extract_objects_from_text(analysis_text)
                
                return {
                    "text": analysis_text,
                    "objects": objects,
                    "confidence": 0.90,
                    "model": settings.CLAUDE_MODEL,
                    "provider": "claude"
                }
            else:
                logger.error(f"Claude API error: {response.status_code}")
                return {
                    "text": "",
                    "objects": [],
                    "confidence": 0.0,
                    "error": f"Claude error: {response.status_code}",
                    "provider": "claude"
                }
        
        except Exception as e:
            logger.error(f"Claude vision analysis error: {e}")
            return {
                "text": "",
                "objects": [],
                "confidence": 0.0,
                "error": str(e),
                "provider": "claude"
            }


def _extract_objects_from_text(text: str) -> list:
    """
    Simple object extraction from analysis text.
    In production, use NER (Named Entity Recognition) model.
    """
    if not text:
        return []
    
    # Keywords that often precede object names
    keywords = ["shows", "depicts", "contains", "includes", "has", "visible"]
    objects = []
    
    # Very simple extraction - split by common delimiters
    for line in text.split("\n"):
        line = line.strip()
        # Look for bullet points or numbered items
        if line.startswith(("- ", "* ", "• ")):
            obj = line.lstrip("- *•").strip().split(",")[0]
            if obj and len(obj) < 50:  # Reasonable length
                objects.append(obj)
    
    return list(set(objects))[:10]  # Return top 10 unique objects


async def analyze_image(
    image_bytes: bytes,
    image_format: str = "jpg",
    analysis_prompt: Optional[str] = None
) -> Dict:
    """Public API for image analysis"""
    return await VisionService.analyze_image(
        image_bytes,
        image_format,
        analysis_prompt
    )
