# Activity Generation Service
# File: backend/services/activity_generation_service.py

"""
Activity generation service that combines:
- WikiLocation data (geographic/historical context)
- Curriculum standards (Bloom's, Marzano, DoK, SOLO)
- Ollama/Claude for activity suggestions
"""

import logging
import json
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from core.config import settings
from services.wikimedia_service import WikimediaLocationService

logger = logging.getLogger(__name__)


class ActivityGenerationService:
    """
    Generates activity suggestions using:
    1. WikiLocation context (from Wikimedia APIs)
    2. Curriculum standards (teacher selected)
    3. Assessment frameworks (Bloom's/Marzano/DoK/SOLO)
    4. Ollama/Claude for activity synthesis
    """
    
    def __init__(self, llm_provider: str = None):
        """Initialize with LLM provider (ollama or claude)"""
        self.llm_provider = llm_provider or settings.LLM_PROVIDER.lower()
        self.ollama_base_url = settings.OLLAMA_BASE_URL
        self.claude_api_key = settings.CLAUDE_API_KEY
    
    async def generate_activity_suggestions(
        self,
        location_name: str,
        latitude: float,
        longitude: float,
        subject: str,
        grade_level: int,
        bloom_level: Optional[int] = None,
        marzano_level: Optional[int] = None,
        dok_level: Optional[int] = None,
        solo_level: Optional[int] = None,
        curriculum_titles: Optional[List[str]] = None,
        db: Session = None,
        num_suggestions: int = 3
    ) -> Dict[str, Any]:
        """
        Generate activity suggestions for a location
        
        Args:
            location_name: Name of location (e.g., "Golden Gate Park")
            latitude: Location latitude
            longitude: Location longitude
            subject: Subject (Science, History, etc.)
            grade_level: Grade level (3-12)
            bloom_level: Bloom's level (1-6) if specified
            marzano_level: Marzano's level (1-4) if specified
            dok_level: Depth of Knowledge (1-4) if specified
            solo_level: SOLO level (1-5) if specified
            curriculum_titles: List of curriculum standards/titles
            db: SQLAlchemy session for caching
            num_suggestions: Number of suggestions to generate
        
        Returns:
            {
                "success": true,
                "location": {
                    "name": "Golden Gate Park",
                    "latitude": 37.7694,
                    "longitude": -122.4862,
                    "wikipedia_extract": "...",
                    "geographic_features": {...},
                    "educational_value": "..."
                },
                "curriculum_context": {
                    "subject": "Science",
                    "grade_level": 6,
                    "standards": ["Ecology", "Ecosystems"],
                    "taxonomies": {"bloom": 3, "marzano": 2, "dok": 2}
                },
                "suggestions": [
                    {
                        "title": "Biodiversity Survey",
                        "description": "Students conduct a species survey...",
                        "learning_objectives": [...],
                        "bloom_level": 4,
                        "marzano_level": 3,
                        "dok_level": 3,
                        "solo_level": 4,
                        "estimated_duration_minutes": 120,
                        "materials_needed": [...],
                        "activity_type": "hands_on",
                        "reasoning": "This activity uses the location's ecosystem..."
                    },
                    ...
                ],
                "location_context": {...},
                "ollama_model": "mistral" or "claude"
            }
        """
        
        try:
            # Step 1: Fetch location context from Wikimedia
            logger.info(f"Fetching location context for {location_name}")
            location_context = await WikimediaLocationService.get_location_context(
                latitude, longitude, location_name, db, use_cache=True
            )
            
            # Step 2: Build curriculum context string
            curriculum_context = self._build_curriculum_context(
                subject, grade_level, bloom_level, marzano_level,
                dok_level, solo_level, curriculum_titles
            )
            
            # Step 3: Build prompt for LLM
            prompt = self._build_generation_prompt(
                location_name, location_context, curriculum_context,
                subject, grade_level, num_suggestions
            )
            
            # Step 4: Call LLM (Ollama or Claude)
            logger.info(f"Calling {self.llm_provider} for activity generation")
            if self.llm_provider == "claude":
                suggestions = await self._generate_with_claude(prompt)
            else:
                suggestions = await self._generate_with_ollama(prompt)
            
            # Step 5: Parse and validate suggestions
            activities = self._parse_suggestions(suggestions, location_name)
            
            return {
                "success": True,
                "location": {
                    "name": location_name,
                    "latitude": latitude,
                    "longitude": longitude,
                    "wikipedia_title": location_context.get("wikipedia", {}).get("title"),
                    "wikipedia_extract": location_context.get("wikipedia", {}).get("extract"),
                    "wikipedia_url": location_context.get("wikipedia", {}).get("url"),
                    "geographic_features": location_context.get("geographic_features"),
                    "educational_value": location_context.get("educational_value")
                },
                "curriculum_context": {
                    "subject": subject,
                    "grade_level": grade_level,
                    "standards": curriculum_titles or [],
                    "taxonomies": self._build_taxonomy_dict(
                        bloom_level, marzano_level, dok_level, solo_level
                    )
                },
                "suggestions": activities,
                "location_context_success": location_context.get("success", False),
                "llm_model": self.llm_provider,
                "generation_timestamp": datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Error generating activities: {e}")
            return {
                "success": False,
                "error": str(e),
                "llm_model": self.llm_provider
            }
    
    def _build_curriculum_context(
        self,
        subject: str,
        grade_level: int,
        bloom_level: Optional[int],
        marzano_level: Optional[int],
        dok_level: Optional[int],
        solo_level: Optional[int],
        curriculum_titles: Optional[List[str]]
    ) -> str:
        """Build curriculum context string for prompt"""
        
        context_parts = [
            f"Subject: {subject}",
            f"Grade Level: {grade_level}"
        ]
        
        # Add taxonomy targets
        taxonomies = []
        if bloom_level:
            bloom_names = {1: "Remember", 2: "Understand", 3: "Apply", 4: "Analyze", 5: "Evaluate", 6: "Create"}
            taxonomies.append(f"Bloom's: Level {bloom_level} ({bloom_names.get(bloom_level)})")
        if marzano_level:
            marzano_names = {1: "Retrieval", 2: "Comprehension", 3: "Analysis", 4: "Knowledge Utilization"}
            taxonomies.append(f"Marzano: Level {marzano_level} ({marzano_names.get(marzano_level)})")
        if dok_level:
            dok_names = {1: "Recall", 2: "Skill/Concept", 3: "Strategic Thinking", 4: "Extended Thinking"}
            taxonomies.append(f"DoK: Level {dok_level} ({dok_names.get(dok_level)})")
        if solo_level:
            solo_names = {1: "Prestructural", 2: "Unistructural", 3: "Multistructural", 4: "Relational", 5: "Extended Abstract"}
            taxonomies.append(f"SOLO: Level {solo_level} ({solo_names.get(solo_level)})")
        
        if taxonomies:
            context_parts.append("Target Taxonomies:")
            context_parts.extend(f"  - {t}" for t in taxonomies)
        
        # Add curriculum standards
        if curriculum_titles:
            context_parts.append(f"Curriculum Standards: {', '.join(curriculum_titles)}")
        
        return "\n".join(context_parts)
    
    def _build_generation_prompt(
        self,
        location_name: str,
        location_context: Dict[str, Any],
        curriculum_context: str,
        subject: str,
        grade_level: int,
        num_suggestions: int
    ) -> str:
        """Build the prompt for LLM activity generation"""
        
        wiki_extract = location_context.get("wikipedia", {}).get("extract", "")
        geographic_features = location_context.get("geographic_features", {})
        educational_value = location_context.get("educational_value", "")
        
        prompt = f"""You are an expert outdoor education curriculum designer creating field-based learning activities.

LOCATION CONTEXT:
Location: {location_name}
Coordinates: {location_context.get('latitude', 'N/A')}, {location_context.get('longitude', 'N/A')}

Wikipedia Context:
{wiki_extract[:500]}...

Geographic Features:
{json.dumps(geographic_features, indent=2)}

Educational Value:
{educational_value}

CURRICULUM REQUIREMENTS:
{curriculum_context}

TASK:
Generate {num_suggestions} creative, field-based learning activities that:
1. Leverage the specific geographic and historical context of {location_name}
2. Align with the curriculum standards and subject
3. Meet the specified taxonomy/cognitive level targets
4. Are authentic and inquiry-based
5. Use the location as an active learning environment (not just a backdrop)

For EACH activity, provide:
- Title (catchy, descriptive)
- Description (2-3 sentences explaining the activity)
- Learning Objectives (2-3 specific, measurable objectives)
- Bloom's Level (1-6)
- Marzano's Level (1-4)
- DoK Level (1-4)
- SOLO Level (1-5)
- Estimated Duration (in minutes)
- Materials Needed (list)
- Activity Type (hands_on, inquiry, discussion, virtual, hybrid)
- Reasoning (1-2 sentences explaining how it uses the location's context)

Format your response as JSON array with objects containing these exact fields.
Only respond with valid JSON, no preamble.

Example format:
[
  {{
    "title": "Activity Title",
    "description": "Description here",
    "learning_objectives": ["Objective 1", "Objective 2"],
    "bloom_level": 4,
    "marzano_level": 3,
    "dok_level": 3,
    "solo_level": 4,
    "estimated_duration_minutes": 120,
    "materials_needed": ["Material 1", "Material 2"],
    "activity_type": "hands_on",
    "reasoning": "How this uses the location..."
  }}
]
"""
        return prompt
    
    async def _generate_with_ollama(self, prompt: str) -> str:
        """Call Ollama for activity generation"""
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{self.ollama_base_url}/api/generate",
                    json={
                        "model": settings.OLLAMA_MODEL_TEXT,
                        "prompt": prompt,
                        "stream": False,
                        "temperature": 0.7,
                        "num_predict": 2000
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response", "")
        except Exception as e:
            logger.error(f"Ollama generation error: {e}")
            raise
    
    async def _generate_with_claude(self, prompt: str) -> str:
        """Call Claude API for activity generation"""
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self.claude_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": settings.CLAUDE_MODEL,
                        "max_tokens": 2000,
                        "messages": [
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ]
                    }
                )
                response.raise_for_status()
                data = response.json()
                content = data.get("content", [{}])[0].get("text", "")
                return content
        except Exception as e:
            logger.error(f"Claude generation error: {e}")
            raise
    
    def _parse_suggestions(
        self,
        raw_suggestions: str,
        location_name: str
    ) -> List[Dict[str, Any]]:
        """
        Parse LLM response into structured activity suggestions
        
        Handles both JSON responses and text that needs parsing
        """
        activities = []
        
        try:
            # Try to parse as JSON first
            # The LLM might wrap it in ```json markers
            json_str = raw_suggestions
            
            # Extract JSON from markdown code blocks
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]
            
            json_str = json_str.strip()
            suggestions = json.loads(json_str)
            
            # Validate and clean each suggestion
            for i, suggestion in enumerate(suggestions[:3]):  # Limit to 3
                activity = {
                    "title": suggestion.get("title", f"Activity {i+1}"),
                    "description": suggestion.get("description", ""),
                    "learning_objectives": suggestion.get("learning_objectives", []),
                    "bloom_level": int(suggestion.get("bloom_level", 3)),
                    "marzano_level": int(suggestion.get("marzano_level", 2)),
                    "dok_level": int(suggestion.get("dok_level", 2)),
                    "solo_level": int(suggestion.get("solo_level", 3)),
                    "estimated_duration_minutes": int(suggestion.get("estimated_duration_minutes", 90)),
                    "materials_needed": suggestion.get("materials_needed", []),
                    "activity_type": suggestion.get("activity_type", "inquiry"),
                    "reasoning": suggestion.get("reasoning", ""),
                    "location_name": location_name
                }
                
                # Validate ranges
                activity["bloom_level"] = max(1, min(6, activity["bloom_level"]))
                activity["marzano_level"] = max(1, min(4, activity["marzano_level"]))
                activity["dok_level"] = max(1, min(4, activity["dok_level"]))
                activity["solo_level"] = max(1, min(5, activity["solo_level"]))
                
                activities.append(activity)
        
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            # Return minimal activity if parsing fails
            activities = [{
                "title": "Activity Suggestion",
                "description": raw_suggestions[:200],
                "learning_objectives": [],
                "bloom_level": 3,
                "marzano_level": 2,
                "dok_level": 2,
                "solo_level": 3,
                "estimated_duration_minutes": 90,
                "materials_needed": [],
                "activity_type": "inquiry",
                "reasoning": "Generated by AI",
                "location_name": location_name
            }]
        
        return activities
    
    @staticmethod
    def _build_taxonomy_dict(
        bloom_level: Optional[int],
        marzano_level: Optional[int],
        dok_level: Optional[int],
        solo_level: Optional[int]
    ) -> Dict[str, int]:
        """Build taxonomy dictionary with only specified levels"""
        taxonomies = {}
        if bloom_level:
            taxonomies["bloom"] = bloom_level
        if marzano_level:
            taxonomies["marzano"] = marzano_level
        if dok_level:
            taxonomies["dok"] = dok_level
        if solo_level:
            taxonomies["solo"] = solo_level
        return taxonomies


