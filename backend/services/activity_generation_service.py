# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

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
        # CLAUDE_API_KEY is a "legacy alias" (core/config.py's own comment)
        # — the real key lives in ANTHROPIC_API_KEY on any deployment set up
        # since then. Found via a real 401 from a live prod test: this had
        # no fallback, unlike agents/provider.py's call_claude(), which
        # already does this same fallback correctly. Pre-existing bug, not
        # introduced by the streaming work that happened to be the first
        # real end-to-end exercise of this code path.
        self.claude_api_key = settings.CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY
    
    async def generate_activity_suggestions(
        self,
        subject: str,
        grade_level: int,
        location_name: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        bloom_level: Optional[int] = None,
        marzano_level: Optional[int] = None,
        dok_level: Optional[int] = None,
        solo_level: Optional[int] = None,
        curriculum_titles: Optional[List[str]] = None,
        additional_context: Optional[str] = None,
        db: Session = None,
        num_suggestions: int = 3
    ) -> Dict[str, Any]:
        """
        Generate activity suggestions. Location is optional — some activities
        are intentionally place-generic ("map your neighborhood", "investigate
        a local wetland"), with the real place captured on-site later rather
        than at creation time. When latitude/longitude are omitted, suggestions
        are generated from subject/grade/taxonomy alone.

        Args:
            subject: Subject (Science, History, etc.)
            grade_level: Grade level (3-12)
            location_name: Name of location (e.g., "Golden Gate Park"), if any
            latitude: Location latitude, if any
            longitude: Location longitude, if any
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
            # Step 1: Fetch location context — only when a location was
            # actually given. Sourced from the same fast, pooled
            # multi_backend_location_service the activity form's location
            # panel uses (routes/privacy_locations.py), not the legacy
            # wikimedia_service — that duplicated this with an unpooled
            # client per call, which is what made this path slow.
            location_context: Dict[str, Any] = {}
            if latitude is not None and longitude is not None:
                logger.info(f"Fetching location context for {location_name}")
                location_context = await self._fetch_location_context(
                    latitude, longitude, location_name
                )

            # Step 2: Build curriculum context string
            curriculum_context = self._build_curriculum_context(
                subject, grade_level, bloom_level, marzano_level,
                dok_level, solo_level, curriculum_titles
            )
            
            # Step 3: Build prompt for LLM
            prompt = self._build_generation_prompt(
                location_name, location_context, subject, grade_level, num_suggestions,
                bloom_level=bloom_level, dok_level=dok_level,
                curriculum_titles=curriculum_titles,
                additional_context=additional_context,
            )
            
            # Step 4: Call LLM (Ollama or Claude)
            logger.info(f"Calling {self.llm_provider} for activity generation")
            if self.llm_provider == "claude":
                suggestions = await self._generate_with_claude(prompt)
            else:
                suggestions = await self._generate_with_ollama(prompt)
            
            # Step 5: Parse and validate suggestions
            activities = self._parse_suggestions(suggestions, location_name)

            return self._build_success_result(
                activities, location_name, latitude, longitude, location_context,
                subject, grade_level, curriculum_titles,
                bloom_level, marzano_level, dok_level, solo_level,
            )

        except Exception as e:
            logger.error(f"Error generating activities: {e}")
            return {
                "success": False,
                "error": str(e),
                "llm_model": self.llm_provider
            }

    def _build_success_result(
        self,
        activities: List[Dict[str, Any]],
        location_name: Optional[str],
        latitude: Optional[float],
        longitude: Optional[float],
        location_context: Dict[str, Any],
        subject: str,
        grade_level: int,
        curriculum_titles: Optional[List[str]],
        bloom_level: Optional[int],
        marzano_level: Optional[int],
        dok_level: Optional[int],
        solo_level: Optional[int],
    ) -> Dict[str, Any]:
        """
        The success-result shape shared by generate_activity_suggestions()
        (non-streaming) and generate_activity_suggestions_stream()'s final
        event — extracted so the two paths can't structurally diverge on
        what counts as a valid result.
        """
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

    async def generate_activity_suggestions_stream(
        self,
        subject: str,
        grade_level: int,
        location_name: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        bloom_level: Optional[int] = None,
        marzano_level: Optional[int] = None,
        dok_level: Optional[int] = None,
        solo_level: Optional[int] = None,
        curriculum_titles: Optional[List[str]] = None,
        additional_context: Optional[str] = None,
        db: Session = None,
        num_suggestions: int = 3
    ):
        """
        Streaming counterpart to generate_activity_suggestions(). Mirrors
        every step of that method exactly — same location-context fetch,
        same curriculum context, same prompt, same _parse_suggestions() and
        _build_success_result() — except step 4 (the LLM call), which
        streams raw text chunks to the caller as they arrive instead of
        awaiting the full response before returning anything.

        Why raw-text streaming rather than incrementally parsing structured
        JSON: the model's response needs to be a complete, valid JSON/text
        block before _parse_suggestions() can extract real activities from
        it — streaming partial JSON and trying to parse it as it arrives is
        real complexity for uncertain benefit. This instead streams the raw
        text for perceived responsiveness (the teacher sees Peri "thinking"
        instead of a static spinner for the full round-trip), then runs the
        existing, unchanged parser once the full text has arrived and emits
        the authoritative structured result as the final event.

        Yields dicts of one of three shapes (the caller — routes/activities.py's
        SSE endpoint — JSON-encodes each one as one `data:` line):
          {"type": "delta", "text": "..."}   — a chunk of raw text as it streams in
          {"type": "done", "result": {...}}  — same shape generate_activity_suggestions() returns
          {"type": "error", "error": "..."}  — on any failure; no more events follow
        """
        try:
            location_context: Dict[str, Any] = {}
            if latitude is not None and longitude is not None:
                logger.info(f"Fetching location context for {location_name}")
                location_context = await self._fetch_location_context(
                    latitude, longitude, location_name
                )

            curriculum_context = self._build_curriculum_context(
                subject, grade_level, bloom_level, marzano_level,
                dok_level, solo_level, curriculum_titles
            )

            prompt = self._build_generation_prompt(
                location_name, location_context, subject, grade_level, num_suggestions,
                bloom_level=bloom_level, dok_level=dok_level,
                curriculum_titles=curriculum_titles,
                additional_context=additional_context,
            )

            logger.info(f"Streaming {self.llm_provider} for activity generation")
            stream_fn = (
                self._generate_with_claude_stream if self.llm_provider == "claude"
                else self._generate_with_ollama_stream
            )

            chunks: List[str] = []
            async for text in stream_fn(prompt):
                chunks.append(text)
                yield {"type": "delta", "text": text}

            full_text = "".join(chunks)
            activities = self._parse_suggestions(full_text, location_name)

            yield {
                "type": "done",
                "result": self._build_success_result(
                    activities, location_name, latitude, longitude, location_context,
                    subject, grade_level, curriculum_titles,
                    bloom_level, marzano_level, dok_level, solo_level,
                ),
            }
        except Exception as e:
            logger.error(f"Error streaming activity generation: {e}")
            yield {"type": "error", "error": str(e)}
    
    async def generate_location_synopsis(
        self,
        location_name: str,
        address: str = "",
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> Optional[str]:
        """
        Fallback synopsis for a place Wikipedia/Wikidata have no entry for
        (a small local site — a watershed restoration project, a school's
        own outdoor classroom). Returns None on failure so the caller can
        leave the description blank rather than show a broken panel.
        """
        from services.prompt_library import build_location_synopsis_prompt

        prompt = build_location_synopsis_prompt(
            location_name=location_name,
            address=address,
            latitude=latitude,
            longitude=longitude,
        )
        try:
            if self.llm_provider == "claude":
                text = await self._generate_with_claude(prompt)
            else:
                text = await self._generate_with_ollama(prompt)
            text = (text or "").strip()
            return text or None
        except Exception as e:
            logger.warning(f"Location synopsis generation failed for '{location_name}': {e}")
            return None

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
    
    async def _fetch_location_context(
        self,
        latitude: float,
        longitude: float,
        location_name: Optional[str],
    ) -> Dict[str, Any]:
        """
        Location context for the generation prompt, sourced from the same
        fast, pooled multi_backend_location_service used by the activity
        form's location panel (routes/privacy_locations.py) — not the
        legacy wikimedia_service, which duplicates this with its own
        unpooled, sequential httpx client per call. Returns a dict shaped
        like the old wikimedia_service response (wikipedia/geographic_features/
        educational_value/success) so the rest of this method — and the
        "location" block in generate_activity_suggestions()'s return value —
        doesn't need to change.
        """
        from services.multi_backend_location_service import get_location_service

        try:
            service = get_location_service()
            results = await service.search_nearby(latitude, longitude, radius_meters=500)
            if not results:
                return {}

            target = results[0]
            if location_name:
                norm = location_name.strip().lower()
                match = next(
                    (r for r in results if r.name and r.name.strip().lower() == norm), None
                )
                if match:
                    target = match

            enriched = await service.enrich_location(target, subject=None)
            return {
                "wikipedia": {
                    "title": enriched.name,
                    "extract": enriched.description or "",
                    "url": enriched.wikipedia_url,
                },
                "geographic_features": {},
                "educational_value": enriched.description,
                "success": bool(enriched.description),
            }
        except Exception as e:
            logger.warning(f"Location context lookup failed for '{location_name}': {e}")
            return {}

    def _build_generation_prompt(
        self,
        location_name: Optional[str],
        location_context: Dict[str, Any],
        subject: str,
        grade_level: int,
        num_suggestions: int,
        bloom_level: Optional[int] = None,
        dok_level: Optional[int] = None,
        curriculum_titles: Optional[List[str]] = None,
        additional_context: Optional[str] = None,
    ) -> str:
        """Build the prompt for LLM activity generation"""

        from services.prompt_library import build_activity_generation_prompt
        # No location given (place-generic activity, e.g. "map your
        # neighborhood") — tell the model that explicitly rather than
        # passing an empty/None name into the "LOCATION\nName: " line.
        resolved_location_name = location_name or (
            "No specific location set — design for a typical local outdoor "
            "or community setting, not a named landmark"
        )
        return build_activity_generation_prompt(
            location_name=resolved_location_name,
            location_description=location_context.get("educational_value", ""),
            wikipedia_extract=location_context.get("wikipedia", {}).get("extract", ""),
            subject=subject,
            grade_level=grade_level,
            taxonomy_levels={
                "bloom_level": bloom_level or 4,
                "dok_level": dok_level or 3,
            },
            learning_objectives=[],   # not currently collected by this service — no source data exists yet; empty list degrades gracefully, do not invent a source
            curriculum_standards=curriculum_titles or [],
            additional_context=additional_context or "",
            num_activities=num_suggestions,
        )
    
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

    async def _generate_with_claude_stream(self, prompt: str):
        """
        Streaming counterpart to _generate_with_claude() — yields raw text
        chunks as Claude's SSE stream produces them, instead of awaiting the
        full response. Anthropic's stream is itself SSE (`data: {...}` lines);
        only `content_block_delta` events with a `text_delta` carry generated
        text — message_start/content_block_start/message_delta/message_stop
        are structural and skipped.
        """
        import json as _json

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self.claude_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": settings.CLAUDE_MODEL,
                        "max_tokens": 2000,
                        "stream": True,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        try:
                            event = _json.loads(line[len("data: "):])
                        except ValueError:
                            continue
                        if event.get("type") != "content_block_delta":
                            continue
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield text
        except Exception as e:
            logger.error(f"Claude streaming generation error: {e}")
            raise

    async def _generate_with_ollama_stream(self, prompt: str):
        """
        Streaming counterpart to _generate_with_ollama() — Ollama's
        streaming format is newline-delimited JSON (not SSE): each line is
        a complete JSON object like {"response": "chunk", "done": false},
        with a final {"done": true, ...} line carrying no new text.
        """
        import json as _json

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    f"{self.ollama_base_url}/api/generate",
                    json={
                        "model": settings.OLLAMA_MODEL_TEXT,
                        "prompt": prompt,
                        "stream": True,
                        "temperature": 0.7,
                        "num_predict": 2000,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = _json.loads(line)
                        except ValueError:
                            continue
                        text = chunk.get("response", "")
                        if text:
                            yield text
        except Exception as e:
            logger.error(f"Ollama streaming generation error: {e}")
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
                    "core_phenomenon": suggestion.get("core_phenomenon", ""),
                    "student_task": suggestion.get("student_task", ""),
                    "evidence_collected": suggestion.get("evidence_collected", ""),
                    "peri_opening_question": suggestion.get("peri_opening_question", ""),
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


