"""Text embedding service for RAG and semantic search"""

import logging
from typing import List, Dict
import httpx
from core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Generate embeddings for text using Ollama or Claude"""
    
    EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Standard 384-dim embedding model
    
    @staticmethod
    async def embed_text(text: str) -> Dict:
        """
        Generate embedding for text
        
        Args:
            text: Text to embed
            
        Returns:
            {
                "text": "input text",
                "embedding": [0.1, 0.2, ...],  # 384 dimensions
                "dimension": 384,
                "model": "all-MiniLM-L6-v2"
            }
        """
        if not text or not text.strip():
            return {
                "text": "",
                "embedding": [0.0] * settings.VECTOR_DIMENSION,
                "dimension": settings.VECTOR_DIMENSION,
                "error": "Empty text"
            }
        
        # Clean text (truncate if needed)
        text_cleaned = text.strip()[:512]
        
        try:
            # Try using Ollama embed endpoint (if available)
            result = await EmbeddingService._embed_with_ollama(text_cleaned)
            
            # Fall back to mock if needed (for testing)
            if not result.get("embedding"):
                result = await EmbeddingService._embed_mock(text_cleaned)
            
            return result
        
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return {
                "text": text_cleaned,
                "embedding": [0.0] * settings.VECTOR_DIMENSION,
                "dimension": settings.VECTOR_DIMENSION,
                "error": str(e)
            }
    
    @staticmethod
    async def embed_texts(texts: List[str]) -> List[Dict]:
        """
        Generate embeddings for multiple texts
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding results
        """
        embeddings = []
        
        for text in texts:
            embedding = await EmbeddingService.embed_text(text)
            embeddings.append(embedding)
        
        return embeddings
    
    @staticmethod
    async def _embed_with_ollama(text: str) -> Dict:
        """Generate embedding using Ollama embed endpoint"""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/embed",
                    json={
                        "model": EmbeddingService.EMBEDDING_MODEL,
                        "input": text
                    }
                )
            
            if response.status_code == 200:
                data = response.json()
                embeddings = data.get("embeddings", [])
                
                if embeddings:
                    # Return first embedding if multiple returned
                    embedding = embeddings[0] if isinstance(embeddings[0], list) else embeddings
                    
                    logger.info(
                        f"Text embedded with Ollama: "
                        f"dim={len(embedding)}"
                    )
                    
                    return {
                        "text": text,
                        "embedding": embedding,
                        "dimension": len(embedding),
                        "model": EmbeddingService.EMBEDDING_MODEL,
                        "provider": "ollama"
                    }
            
            logger.warning(f"Ollama embed error: {response.status_code}")
            return {
                "text": text,
                "embedding": None,
                "error": f"Status {response.status_code}"
            }
        
        except Exception as e:
            logger.warning(f"Ollama embedding error: {e}")
            return {
                "text": text,
                "embedding": None,
                "error": str(e)
            }
    
    @staticmethod
    async def _embed_mock(text: str) -> Dict:
        """
        Generate mock embedding (for testing without Ollama)
        
        In production, replace with actual embedding model.
        This uses a simple hash-based approach for deterministic testing.
        """
        import hashlib
        
        # Create deterministic mock embedding based on text hash
        text_hash = hashlib.md5(text.encode()).hexdigest()
        
        # Convert hash to float values in [-1, 1]
        mock_embedding = []
        for i in range(settings.VECTOR_DIMENSION):
            # Use different bytes of hash for each dimension
            byte_val = int(text_hash[(i * 2) % 32:(i * 2 + 2) % 32 + 1], 16)
            # Normalize to [-1, 1]
            normalized = (byte_val / 127.5) - 1.0
            mock_embedding.append(normalized)
        
        logger.info(
            f"Generated mock embedding: dim={len(mock_embedding)}"
        )
        
        return {
            "text": text,
            "embedding": mock_embedding,
            "dimension": len(mock_embedding),
            "model": "mock-embedding",
            "provider": "mock"
        }


async def embed_text(text: str) -> Dict:
    """Public API for embedding single text"""
    return await EmbeddingService.embed_text(text)


async def embed_texts(texts: List[str]) -> List[Dict]:
    """Public API for embedding multiple texts"""
    return await EmbeddingService.embed_texts(texts)
