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
    criteria, error = await extract_criteria(text, set_type="rubric", name="My Rubric")
"""

import json
import logging
import re
from typing import Optional
import uuid

logger = logging.getLogger(__name__)


async def extract_criteria(
    text: str,
    set_type: str = "rubric",
    name: str = "",
    max_chars: int = 12000,
) -> tuple[list[dict], Optional[str]]:
    """
    Use Ollama LLM to extract structured criteria from document text.

    Never raises. Returns (criteria, error) — criteria is [] on failure,
    and error is a short, specific, user-facing reason it's empty (None on
    success or on the legitimate "no text to extract from" case). Callers
    should surface `error` to the user instead of a generic "nothing
    found" message — the previous version discarded this entirely, so a
    dead Ollama connection and "the LLM just found zero criteria" were
    indistinguishable from the UI, and the real cause only ever showed up
    in server logs the user can't see.
    """
    if not text.strip():
        logger.warning("extract_criteria called with empty text")
        return [], None

    # Truncate to avoid context-window overflow
    truncated = text[:max_chars]
    if len(text) > max_chars:
        logger.info("Document text truncated to %d chars for LLM extraction", max_chars)

    from services.prompt_library import build_standards_extraction_prompt
    prompt = build_standards_extraction_prompt(
        document_text=truncated,
        document_type=set_type,
        subject=name,
        max_chars=max_chars,
    )
    raw: str = ""

    try:
        from core.config import settings
        import ollama as _ollama

        model = settings.OLLAMA_MODEL_TEXT or "mistral"
        try:
            response = _ollama.chat(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.1},   # Low temp for structured output
            )
        except Exception as e:
            logger.error("Ollama call failed during criteria extraction (model=%s): %s", model, e, exc_info=True)
            return [], f"AI extraction service unavailable ({type(e).__name__}: {e}). Add criteria manually or retry once it's back."

        raw = response["message"]["content"].strip()

        # Strip markdown code fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)

        try:
            criteria = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("LLM returned invalid JSON: %s | raw: %s", e, raw[:200])
            return [], "The AI's response wasn't valid structured data — this can happen with unusual document formatting. Try a cleaner export of the file, or add criteria manually."

        if not isinstance(criteria, list):
            logger.error("LLM did not return a JSON array (got %s) | raw: %s", type(criteria).__name__, raw[:200])
            return [], "The AI didn't return a list of criteria as expected. Add criteria manually, or try again."

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
        if not cleaned:
            return [], "The AI processed the document but didn't identify any criteria in it. Double-check it's the right file, or add criteria manually."
        return cleaned, None

    except Exception as e:
        logger.error("criteria extraction failed unexpectedly: %s", e, exc_info=True)
        return [], f"Extraction failed unexpectedly ({type(e).__name__}: {e}). Add criteria manually, or try again."


def make_criterion_id(name: str, index: int, prefix: str = "") -> str:
    """Generate a clean kebab-case ID from a criterion name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")
    base = f"{prefix}-{slug}" if prefix else slug
    return f"{base}-{index+1}"
