# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Input normalization service for multimodal data preprocessing"""

import logging
import io
from typing import Dict, Optional, Union
from PIL import Image
import mimetypes

logger = logging.getLogger(__name__)


class InputNormalizationService:
    """Normalize and preprocess multimodal inputs"""
    
    # Supported formats
    SUPPORTED_IMAGE_FORMATS = {"jpg", "jpeg", "png", "webp", "gif"}
    SUPPORTED_AUDIO_FORMATS = {"wav", "mp3", "m4a", "ogg", "flac"}
    MAX_IMAGE_SIZE_MB = 10
    MAX_AUDIO_SIZE_MB = 50
    
    @staticmethod
    async def normalize_input(
        input_type: str,
        raw_input: Union[bytes, str],
        metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Normalize multimodal input
        
        Args:
            input_type: "text", "image", "audio"
            raw_input: Raw input bytes or text
            metadata: Optional metadata about input
            
        Returns:
            {
                "type": "image",
                "data": bytes,
                "format": "jpg",
                "size_bytes": 12345,
                "normalized": True,
                "metadata": {...}
            }
        """
        if input_type == "text":
            return await InputNormalizationService._normalize_text(
                raw_input,
                metadata
            )
        elif input_type == "image":
            return await InputNormalizationService._normalize_image(
                raw_input,
                metadata
            )
        elif input_type == "audio":
            return await InputNormalizationService._normalize_audio(
                raw_input,
                metadata
            )
        else:
            return {
                "type": input_type,
                "data": None,
                "normalized": False,
                "error": f"Unsupported input type: {input_type}"
            }
    
    @staticmethod
    async def _normalize_text(text: str, metadata: Optional[Dict]) -> Dict:
        """Normalize text input"""
        try:
            if not isinstance(text, str):
                text = str(text)
            
            # Clean text
            text_normalized = text.strip()
            
            # Enforce maximum length (2000 chars for safety)
            if len(text_normalized) > 2000:
                text_normalized = text_normalized[:2000]
                logger.warning("Text truncated to 2000 characters")
            
            return {
                "type": "text",
                "data": text_normalized,
                "character_count": len(text_normalized),
                "normalized": True,
                "metadata": metadata or {}
            }
        
        except Exception as e:
            logger.error(f"Text normalization error: {e}")
            return {
                "type": "text",
                "data": None,
                "normalized": False,
                "error": str(e)
            }
    
    @staticmethod
    async def _normalize_image(image_bytes: bytes, metadata: Optional[Dict]) -> Dict:
        """
        Normalize image input
        
        - Validate format
        - Resize if needed
        - Convert to standard format
        - Extract image properties
        """
        try:
            if not image_bytes:
                return {
                    "type": "image",
                    "data": None,
                    "normalized": False,
                    "error": "No image data provided"
                }
            
            # Check size
            size_mb = len(image_bytes) / (1024 * 1024)
            if size_mb > InputNormalizationService.MAX_IMAGE_SIZE_MB:
                return {
                    "type": "image",
                    "data": None,
                    "normalized": False,
                    "error": f"Image too large: {size_mb:.1f}MB "
                            f"(max {InputNormalizationService.MAX_IMAGE_SIZE_MB}MB)"
                }
            
            # Open and validate image
            try:
                img = Image.open(io.BytesIO(image_bytes))
            except Exception as e:
                return {
                    "type": "image",
                    "data": None,
                    "normalized": False,
                    "error": f"Invalid image format: {e}"
                }
            
            # Get image properties
            original_format = img.format.lower() if img.format else "unknown"
            width, height = img.size
            
            # Normalize to supported format
            target_format = original_format if original_format in InputNormalizationService.SUPPORTED_IMAGE_FORMATS else "jpg"
            
            # Resize if image is very large (optimization)
            MAX_DIMENSION = 2048
            if width > MAX_DIMENSION or height > MAX_DIMENSION:
                ratio = MIN_DIMENSION / max(width, height)
                new_size = (int(width * ratio), int(height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
                logger.info(f"Image resized from {width}x{height} to {new_size}")
            
            # Convert to RGB if necessary (for JPEG compatibility)
            if target_format == "jpg" and img.mode in ("RGBA", "LA", "P"):
                # Create white background
                rgb_img = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                rgb_img.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                img = rgb_img
            
            # Save to bytes
            output = io.BytesIO()
            img.save(output, format=target_format.upper())
            normalized_bytes = output.getvalue()
            
            logger.info(
                f"Image normalized: {original_format} → {target_format}, "
                f"size {width}x{height}, {len(normalized_bytes)} bytes"
            )
            
            return {
                "type": "image",
                "data": normalized_bytes,
                "format": target_format,
                "size_bytes": len(normalized_bytes),
                "width": width,
                "height": height,
                "normalized": True,
                "metadata": {
                    **(metadata or {}),
                    "original_format": original_format,
                    "original_size_bytes": len(image_bytes)
                }
            }
        
        except Exception as e:
            logger.error(f"Image normalization error: {e}")
            return {
                "type": "image",
                "data": None,
                "normalized": False,
                "error": str(e)
            }
    
    @staticmethod
    async def _normalize_audio(audio_bytes: bytes, metadata: Optional[Dict]) -> Dict:
        """
        Normalize audio input
        
        - Validate format
        - Check file size
        - Extract properties
        """
        try:
            if not audio_bytes:
                return {
                    "type": "audio",
                    "data": None,
                    "normalized": False,
                    "error": "No audio data provided"
                }
            
            # Check size
            size_mb = len(audio_bytes) / (1024 * 1024)
            if size_mb > InputNormalizationService.MAX_AUDIO_SIZE_MB:
                return {
                    "type": "audio",
                    "data": None,
                    "normalized": False,
                    "error": f"Audio too large: {size_mb:.1f}MB "
                            f"(max {InputNormalizationService.MAX_AUDIO_SIZE_MB}MB)"
                }
            
            # Detect audio format from magic bytes
            audio_format = _detect_audio_format(audio_bytes)
            
            if audio_format not in InputNormalizationService.SUPPORTED_AUDIO_FORMATS:
                return {
                    "type": "audio",
                    "data": None,
                    "normalized": False,
                    "error": f"Unsupported audio format: {audio_format}"
                }
            
            logger.info(
                f"Audio normalized: {audio_format}, {len(audio_bytes)} bytes"
            )
            
            return {
                "type": "audio",
                "data": audio_bytes,
                "format": audio_format,
                "size_bytes": len(audio_bytes),
                "normalized": True,
                "metadata": {
                    **(metadata or {}),
                    "format": audio_format
                }
            }
        
        except Exception as e:
            logger.error(f"Audio normalization error: {e}")
            return {
                "type": "audio",
                "data": None,
                "normalized": False,
                "error": str(e)
            }


def _detect_audio_format(audio_bytes: bytes) -> str:
    """Detect audio format from magic bytes (file signatures)"""
    if len(audio_bytes) < 4:
        return "unknown"
    
    # Check magic bytes
    magic = audio_bytes[:4]
    
    # WAV: RIFF....WAVE
    if magic[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
        return "wav"
    
    # MP3: FF FB or FF FA (MPEG frame sync)
    if magic[:2] == b"\xff\xfb" or magic[:2] == b"\xff\xfa":
        return "mp3"
    
    # M4A: ftyp (ISO Base Media File Format)
    if magic[4:8] == b"ftyp":
        return "m4a"
    
    # OGG: OggS
    if magic[:4] == b"OggS":
        return "ogg"
    
    # FLAC: fLaC
    if magic[:4] == b"fLaC":
        return "flac"
    
    # Try using mimetypes
    for ext in InputNormalizationService.SUPPORTED_AUDIO_FORMATS:
        if mimetypes.guess_extension(f"audio/{ext}"):
            return ext
    
    return "unknown"


# Constants for image normalization
MIN_DIMENSION = 512  # Minimum dimension after resize


async def normalize_input(
    input_type: str,
    raw_input: Union[bytes, str],
    metadata: Optional[Dict] = None
) -> Dict:
    """Public API for input normalization"""
    return await InputNormalizationService.normalize_input(
        input_type,
        raw_input,
        metadata
    )
