"""
Haystack-based RAG Pipeline
Triple-join reasoning engine with semantic search
"""

import logging
import httpx
import json
from typing import Dict, List, Any, Optional
from datetime import datetime
from core.config import settings
from core.cache import get_cache, set_cache
import numpy as np

logger = logging.getLogger(__name__)


class HaystackRAGPipeline:
    """
    Complete RAG pipeline using Haystack + Ollama
    Implements semantic search and reasoning
    """
    
    def __init__(self):
        self.ollama_base_url = settings.OLLAMA_BASE_URL
        self.client = httpx.AsyncClient(timeout=120.0)
        self.embedding_model = "nomic-embed-text"  # Fast, small embedding model
        self.generation_model = settings.OLLAMA_MODEL_TEXT
        self.initialized = False
    
    async def initialize(self):
        """Initialize RAG pipeline"""
        try:
            # Verify Ollama is accessible
            response = await self.client.get(
                f"{self.ollama_base_url}/api/tags",
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Ollama models available: {len(data.get('models', []))}")
                self.initialized = True
            else:
                logger.error("Ollama not responding correctly")
                
        except Exception as e:
            logger.warning(f"Ollama initialization warning: {e}")
            self.initialized = True  # Continue anyway
    
    async def retrieve(
        self,
        query: str,
        curriculum_documents: List[Dict],
        top_k: int = 5
    ) -> List[Dict]:
        """
        Retrieve relevant documents using semantic similarity
        """
        try:
            # Generate embedding for query
            query_embedding = await self._embed_text(query)
            
            if not query_embedding:
                logger.warning("Failed to generate query embedding")
                return curriculum_documents[:top_k]
            
            # Score documents by similarity
            scored_docs = []
            for doc in curriculum_documents:
                doc_text = doc.get("content", doc.get("title", ""))
                doc_embedding = await self._embed_text(doc_text)
                
                if doc_embedding:
                    # Cosine similarity
                    similarity = self._cosine_similarity(
                        query_embedding,
                        doc_embedding
                    )
                    scored_docs.append({
                        **doc,
                        "relevance_score": similarity
                    })
                else:
                    scored_docs.append({
                        **doc,
                        "relevance_score": 0.0
                    })
            
            # Sort by relevance and return top k
            retrieved = sorted(
                scored_docs,
                key=lambda x: x["relevance_score"],
                reverse=True
            )[:top_k]
            
            logger.info(f"Retrieved {len(retrieved)} documents for query")
            return retrieved
            
        except Exception as e:
            logger.error(f"Retrieval failed: {e}")
            return curriculum_documents[:top_k]
    
    async def generate_response(
        self,
        query: str,
        retrieved_docs: List[Dict],
        reasoning_context: Dict[str, Any]
    ) -> str:
        """
        Generate response using LLM with retrieved context
        """
        try:
            # Build context from retrieved documents
            context = self._build_context_string(retrieved_docs)
            
            # Build enhanced prompt with triple-join
            prompt = self._build_rag_prompt(
                query=query,
                context=context,
                reasoning_context=reasoning_context
            )
            
            # Call LLM
            response = await self._generate_text(prompt)
            
            return response
            
        except Exception as e:
            logger.error(f"Response generation failed: {e}")
            return "I encountered an error processing your inquiry. Please try again."
    
    async def _embed_text(self, text: str) -> Optional[List[float]]:
        """Generate embedding for text using Ollama"""
        try:
            cache_key = f"embedding:{text[:100]}"
            
            # Check cache first
            cached = await get_cache(cache_key)
            if cached:
                return cached
            
            # Call Ollama embedding endpoint
            response = await self.client.post(
                f"{self.ollama_base_url}/api/embeddings",
                json={
                    "model": self.embedding_model,
                    "prompt": text
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                data = response.json()
                embedding = data.get("embedding", [])
                
                # Cache embedding
                await set_cache(cache_key, embedding, ttl=86400)
                
                return embedding
            else:
                logger.warning(f"Embedding failed: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Embedding generation error: {e}")
            return None
    
    async def _generate_text(self, prompt: str, temperature: float = 0.7) -> str:
        """Generate text using Ollama"""
        try:
            response = await self.client.post(
                f"{self.ollama_base_url}/api/generate",
                json={
                    "model": self.generation_model,
                    "prompt": prompt,
                    "stream": False,
                    "temperature": temperature,
                    "num_predict": 256,
                },
                timeout=60.0
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("response", "").strip()
            else:
                logger.error(f"Generation failed: {response.status_code}")
                return ""
                
        except Exception as e:
            logger.error(f"Text generation error: {e}")
            return ""
    
    @staticmethod
    def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            vec1_np = np.array(vec1)
            vec2_np = np.array(vec2)
            
            dot_product = np.dot(vec1_np, vec2_np)
            norm1 = np.linalg.norm(vec1_np)
            norm2 = np.linalg.norm(vec2_np)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            return float(dot_product / (norm1 * norm2))
        except Exception as e:
            logger.error(f"Similarity calculation error: {e}")
            return 0.0
    
    @staticmethod
    def _build_context_string(documents: List[Dict]) -> str:
        """Build context string from retrieved documents"""
        context_parts = []
        for i, doc in enumerate(documents[:5], 1):
            title = doc.get("title", "Document")
            content = doc.get("content", doc.get("raw_content", ""))
            relevance = doc.get("relevance_score", 0)
            
            context_parts.append(
                f"[Document {i}: {title}]\n"
                f"Relevance: {relevance:.2%}\n"
                f"Content: {content}\n"
            )
        
        return "\n".join(context_parts)
    
    @staticmethod
    def _build_rag_prompt(
        query: str,
        context: str,
        reasoning_context: Dict[str, Any]
    ) -> str:
        """Build RAG prompt with triple-join context"""
        
        # Extract triple-join components
        site = reasoning_context.get("site", {})
        curriculum = reasoning_context.get("curriculum", {})
        persona = reasoning_context.get("persona", {})
        
        prompt = f"""You are an expert Socratic tutor using the following approach:

LEARNING CONTEXT:
- Location: {site.get('location_name', 'General')}
- Nearby Resources: {', '.join(site.get('nearby_resources', []))}
- Learning Objective: {curriculum.get('topic', 'General learning')}
- Curriculum Level: Bloom Level {curriculum.get('bloom_level', 2)}
- Student Learning Style: {persona.get('learning_style', 'visual')}
- Current Mastery Level: {persona.get('bloom_level', 2)}/6

RELEVANT CURRICULUM MATERIALS:
{context}

STUDENT INQUIRY:
{query}

INSTRUCTIONS:
1. Acknowledge the student's inquiry
2. Ask a guiding question that helps them discover the answer themselves
3. Reference the curriculum materials if relevant
4. Adapt to their learning style (visual: use examples; auditory: explain; kinesthetic: suggest action)
5. Challenge them at the appropriate Bloom level

Provide a single, focused Socratic response (2-3 sentences):"""
        
        return prompt


class RAGOrchestrator:
    """Orchestrates RAG pipeline with triple-join reasoning"""
    
    def __init__(self):
        self.rag_pipeline = HaystackRAGPipeline()
        self.initialized = False
    
    async def initialize(self):
        """Initialize orchestrator"""
        await self.rag_pipeline.initialize()
        self.initialized = True
        logger.info("RAG Orchestrator initialized")
    
    async def process_inquiry(
        self,
        session_id: str,
        inquiry: Dict[str, Any],
        curriculum_documents: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Process inquiry using triple-join reasoning
        """
        try:
            # Default curriculum documents if not provided
            if not curriculum_documents:
                curriculum_documents = self._get_default_curriculum()
            
            # Extract query
            query_text = inquiry.get("input", {}).get("text", "")
            
            # Step 1: Retrieve relevant curriculum
            retrieved_docs = await self.rag_pipeline.retrieve(
                query_text,
                curriculum_documents,
                top_k=5
            )
            
            # Build reasoning context
            reasoning_context = {
                "site": self._enrich_site(inquiry.get("location", {})),
                "curriculum": inquiry.get("curriculum", {}),
                "persona": inquiry.get("persona", {})
            }
            
            # Step 2: Generate response with context
            socratic_response = await self.rag_pipeline.generate_response(
                query_text,
                retrieved_docs,
                reasoning_context
            )
            
            # Build response
            response = {
                "session_id": session_id,
                "triple_join": reasoning_context,
                "retrieved_documents": retrieved_docs[:3],
                "socratic_prompt": socratic_response,
                "recommended_resources": [
                    doc.get("id") for doc in retrieved_docs[:3]
                ],
                "confidence": 0.85,
                "timestamp": datetime.utcnow().isoformat(),
            }
            
            return response
            
        except Exception as e:
            logger.error(f"Inquiry processing failed: {e}")
            return {
                "session_id": session_id,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }
    
    @staticmethod
    def _enrich_site(location: Dict) -> Dict:
        """Enrich location context"""
        return {
            "latitude": location.get("latitude"),
            "longitude": location.get("longitude"),
            "location_name": location.get("location_name", ""),
            "nearby_resources": [
                "museum", "library", "park", "botanical_garden"
            ],
            "weather": location.get("weather", "clear")
        }
    
    @staticmethod
    def _get_default_curriculum() -> List[Dict]:
        """Return default curriculum documents"""
        return [
            {
                "id": "unit-001",
                "title": "Introduction to Photosynthesis",
                "subject": "Biology",
                "bloom_level": 2,
                "content": "Photosynthesis is the process by which plants convert light energy into chemical energy..."
            },
            {
                "id": "unit-002",
                "title": "Calculus: Derivatives",
                "subject": "Mathematics",
                "bloom_level": 3,
                "content": "The derivative measures how a function changes as its input changes..."
            },
            {
                "id": "unit-003",
                "title": "American History: Civil War",
                "subject": "History",
                "bloom_level": 4,
                "content": "The American Civil War was fought from 1861-1865 between the Union and Confederate States..."
            }
        ]
