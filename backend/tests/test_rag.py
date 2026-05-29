# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Tests for RAG pipeline functionality"""

import pytest
from services.rag_orchestrator import HaystackRAGPipeline, RAGOrchestrator
import numpy as np


class TestHaystackRAGPipeline:
    """Test suite for RAG pipeline"""
    
    @pytest.fixture
    def pipeline(self):
        """Create RAG pipeline instance"""
        return HaystackRAGPipeline()
    
    def test_cosine_similarity_identical_vectors(self, pipeline):
        """Test cosine similarity with identical vectors"""
        vec1 = [1.0, 2.0, 3.0]
        vec2 = [1.0, 2.0, 3.0]
        
        similarity = pipeline._cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(1.0)
    
    def test_cosine_similarity_orthogonal_vectors(self, pipeline):
        """Test cosine similarity with orthogonal vectors"""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [0.0, 1.0, 0.0]
        
        similarity = pipeline._cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(0.0)
    
    def test_cosine_similarity_opposite_vectors(self, pipeline):
        """Test cosine similarity with opposite vectors"""
        vec1 = [1.0, 2.0, 3.0]
        vec2 = [-1.0, -2.0, -3.0]
        
        similarity = pipeline._cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(-1.0)
    
    def test_build_context_string(self, pipeline):
        """Test context string building"""
        documents = [
            {
                "title": "Document 1",
                "content": "This is content for document 1",
                "relevance_score": 0.95
            },
            {
                "title": "Document 2",
                "content": "This is content for document 2",
                "relevance_score": 0.85
            }
        ]
        
        context = pipeline._build_context_string(documents)
        
        assert "Document 1" in context
        assert "Document 2" in context
        assert "95%" in context or "0.95" in context
    
    def test_build_rag_prompt(self, pipeline):
        """Test RAG prompt building"""
        reasoning_context = {
            "site": {
                "location_name": "Central Park",
                "nearby_resources": ["museum", "library"]
            },
            "curriculum": {
                "topic": "Biology",
                "bloom_level": 2
            },
            "persona": {
                "learning_style": "visual",
                "bloom_level": 2
            }
        }
        
        prompt = pipeline._build_rag_prompt(
            query="How do plants grow?",
            context="Plant content here",
            reasoning_context=reasoning_context
        )
        
        assert "Central Park" in prompt
        assert "Biology" in prompt
        assert "How do plants grow?" in prompt
        assert "visual" in prompt


class TestRAGOrchestrator:
    """Test suite for RAG Orchestrator"""
    
    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator instance"""
        return RAGOrchestrator()
    
    def test_enrich_site(self, orchestrator):
        """Test site enrichment"""
        location = {
            "latitude": 40.7128,
            "longitude": -74.0060,
            "location_name": "New York City"
        }
        
        enriched = orchestrator._enrich_site(location)
        
        assert enriched["location_name"] == "New York City"
        assert enriched["latitude"] == 40.7128
        assert enriched["longitude"] == -74.0060
        assert len(enriched["nearby_resources"]) > 0
    
    def test_get_default_curriculum(self, orchestrator):
        """Test default curriculum retrieval"""
        curriculum = orchestrator._get_default_curriculum()
        
        assert isinstance(curriculum, list)
        assert len(curriculum) >= 3
        assert all("id" in doc and "title" in doc for doc in curriculum)
    
    @pytest.mark.asyncio
    async def test_process_inquiry_basic(self, orchestrator):
        """Test basic inquiry processing"""
        inquiry = {
            "input": {
                "text": "How do plants grow?"
            },
            "location": {
                "latitude": 40.7128,
                "longitude": -74.0060,
                "location_name": "New York"
            },
            "curriculum": {
                "topic": "Biology",
                "bloom_level": 2
            },
            "persona": {
                "learning_style": "visual",
                "bloom_level": 2
            }
        }
        
        response = await orchestrator.process_inquiry(
            session_id="test-session-123",
            inquiry=inquiry
        )
        
        assert response["session_id"] == "test-session-123"
        assert "timestamp" in response
        # May have error if Ollama not available, but structure should be valid
        assert isinstance(response, dict)
