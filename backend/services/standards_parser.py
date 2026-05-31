# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Standards Parser Service
========================
Takes parsed document text (from document_parser.py) and uses the Ollama
LLM to extract structured criteria — the same format used by rubrics,
curriculum standards, and homeschool state requirements.

Output schema per criterion:
  {
    "id":          "unique slug, e.g. 'math-grade3-operations-1'",
    "name":        "Short criterion name",
    "description": "Full description of what this criterion measures",
    "category":    "Subject area or domain",
    "required":    true/false,
    "weight":      1.0   (relative importance, default 1.0)
  }

Usage:
    from services.standards_parser import extract_criteria
    criteria = await extract_criteria(text, set_type="rubric", name="My Rubric")
"""

import json
import logging
import re
from typing import Optional
import uuid

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are an expert at reading educational standards, rubrics, and curriculum documents.

Extract ALL measurable criteria from the text below. For each criterion output a JSON object with:
  - id: a short kebab-case unique identifier (no spaces, lowercase, e.g. "science-grade5-observation-1")
  - name: a concise name (5 words max)
  - description: what a student must demonstrate to meet this criterion (1-2 sentences)
  - category: the subject area or domain this belongs to
  - required: true if mandatory, false if optional
  - weight: relative importance as a float (default 1.0, higher = more important)

Return ONLY a valid JSON array of criterion objects. No commentary, no markdown fences, no explanation.
If you cannot find any criteria, return an empty array [].

Document text:
---
{text}
---

JSON array:"""


async def extract_criteria(
    text: str,
    set_type: str = "rubric",
    name: str = "",
    max_chars: int = 12000,
) -> list[dict]:
    """
    Use Ollama LLM to extract structured criteria from document text.
    Returns a list of criterion dicts. Never raises — returns [] on failure.
    """
    if not text.strip():
        logger.warning("extract_criteria called with empty text")
        return []

    # Truncate to avoid context-window overflow
    truncated = text[:max_chars]
    if len(text) > max_chars:
        logger.info("Document text truncated to %d chars for LLM extraction", max_chars)

    prompt = EXTRACTION_PROMPT.format(text=truncated)

    try:
        from core.config import settings
        import ollama as _ollama

        model = settings.OLLAMA_MODEL_TEXT or "mistral"
        response = _ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.1},   # Low temp for structured output
        )
        raw = response["message"]["content"].strip()

        # Strip markdown code fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)

        criteria = json.loads(raw)
        if not isinstance(criteria, list):
            raise ValueError("LLM did not return a JSON array")

        # Validate and sanitise each item
        cleaned = []
        for i, c in enumerate(criteria):
            if not isinstance(c, dict):
                continue
            cleaned.append({
                "id":          str(c.get("id") or f"{set_type}-criterion-{i+1}"),
                "name":        str(c.get("name") or f"Criterion {i+1}")[:100],
                "description": str(c.get("description") or "")[:500],
                "category":    str(c.get("category") or "General")[:100],
                "required":    bool(c.get("required", True)),
                "weight":      float(c.get("weight") or 1.0),
            })

        logger.info("Extracted %d criteria from document (type=%s, name=%s)", len(cleaned), set_type, name)
        return cleaned

    except json.JSONDecodeError as e:
        logger.error("LLM returned invalid JSON: %s | raw: %s", e, raw[:200])
        return []
    except Exception as e:
        logger.error("criteria extraction failed: %s", e)
        return []


def make_criterion_id(name: str, index: int, prefix: str = "") -> str:
    """Generate a clean kebab-case ID from a criterion name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")
    base = f"{prefix}-{slug}" if prefix else slug
    return f"{base}-{index+1}"
