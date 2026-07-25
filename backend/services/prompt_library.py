# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
prompt_library.py — Centralised prompt templates for all AI tasks.

Three prompt families, each tuned for its model and task:

  1. PERI_INQUIRY      — Aristotelian guiding questions for students in the field
  2. ACTIVITY          — Lesson/activity generation for teachers and homeschool parents
  3. STANDARDS_RUBRIC  — Extraction and alignment of standards, rubrics, and taxonomies

Usage:
    from services.prompt_library import build_peri_prompt, build_activity_prompt
    from services.prompt_library import build_standards_extraction_prompt
    from services.prompt_library import build_rubric_alignment_prompt
    from services.prompt_library import build_taxonomy_classification_prompt

All functions return a plain string ready to be sent as the user message.
Pass temperature=0.1 for extraction tasks, 0.7 for generative tasks.
"""

from __future__ import annotations
from typing import Optional

# ──────────────────────────────────────────────────────────────────────────────
# SHARED SYSTEM MESSAGES
# (Pass as the "system" field in Claude messages or prefix for Ollama)
# ──────────────────────────────────────────────────────────────────────────────

SYSTEM_PERI = (
    "You are Peri, the inquiry companion of Peripateticware — a field-based learning platform "
    "for K-12 students. You are a wise, curious crow who guides students through Aristotelian "
    "inquiry: from raw observation, through classification and causal reasoning, to applying "
    "knowledge in new contexts. You never lecture. You never give answers. You ask one "
    "well-crafted question that moves the student one step forward in their thinking. "
    "Your tone is warm, encouraging, and age-appropriate. You speak in plain language "
    "suited to the grade level given. You are rooted in the physical place the student is "
    "standing in right now."
)

SYSTEM_ACTIVITY_DESIGNER = (
    "You are an expert in place-based, outdoor, and inquiry-driven curriculum design. "
    "You understand all major cognitive taxonomies (Bloom's Revised, Webb's DOK, SOLO, "
    "Marzano's New Taxonomy) and how they map to each other. "
    "You design activities that are authentic, location-specific, standards-aligned, "
    "and that position the natural or built environment as the primary text. "
    "Your activities treat students as scientists, historians, artists, or investigators — "
    "not passive recipients of information. Every activity you design has a clear "
    "observable phenomenon at its centre."
)

SYSTEM_STANDARDS_ANALYST = (
    "You are a meticulous educational standards analyst. You extract structured, "
    "machine-readable data from curriculum documents, rubrics, and standards frameworks. "
    "You are precise, consistent, and never invent criteria that are not present in the source text. "
    "You understand the distinction between standards (what to teach), rubrics (how to assess), "
    "and taxonomies (at what cognitive level). You always return valid JSON."
)


# ──────────────────────────────────────────────────────────────────────────────
# 1. PERI INQUIRY PROMPTS
# ──────────────────────────────────────────────────────────────────────────────

# Bloom's → plain language mapping used in prompts
_BLOOM_PLAIN = {
    1: "recall or recognise",
    2: "explain or summarise",
    3: "apply or use",
    4: "analyse, compare, or break down",
    5: "evaluate or judge",
    6: "create, design, or produce",
    "remember":   "recall or recognise",
    "understand": "explain or summarise",
    "apply":      "apply or use",
    "analyze":    "analyse, compare, or break down",
    "evaluate":   "evaluate or judge",
    "create":     "create, design, or produce",
    "dok1":       "recall a fact or procedure",
    "dok2":       "apply a skill or concept",
    "dok3":       "think strategically and make decisions",
    "dok4":       "investigate, connect, and synthesise across disciplines",
}

# Aristotelian inquiry stages
_INQUIRY_STAGE = {
    "orient":   "The student is just arriving and orienting to the place. "
                "Ask a question that prompts careful noticing — something specific they can see, hear, smell, or measure right now.",
    "observe":  "The student has begun observing. Ask a question that pushes them to describe MORE precisely, "
                "to quantify, compare, or distinguish what they see from what they expected.",
    "classify": "The student has observations. Ask a question that prompts sorting, grouping, naming, or "
                "finding patterns across their observations.",
    "explain":  "The student has patterns. Ask a question that challenges them to explain WHY — "
                "causes, mechanisms, or processes behind what they see.",
    "connect":  "The student has an explanation. Ask a question that connects this place to a broader concept, "
                "another location, a historical event, or a real-world application.",
    "reflect":  "The student is wrapping up. Ask a question that prompts them to evaluate the quality of their "
                "evidence, identify gaps, or propose a follow-up investigation.",
}


def build_peri_prompt(
    *,
    location_name: str,
    location_description: str = "",
    subject: str,
    grade_level: int,
    bloom_level: str = "analyze",
    inquiry_stage: str = "observe",
    student_observation: str = "",
    learning_objectives: list[str] | None = None,
    prior_questions: list[str] | None = None,
) -> str:
    """
    Build a Peri guiding-question prompt.

    Wire into: backend/routes/inference.py  _call_llm_inference()
    Temperature: 0.65  (some creativity, still grounded)
    Max tokens: 180
    """
    bloom_plain = _BLOOM_PLAIN.get(bloom_level, "analyse and explain")
    stage_instruction = _INQUIRY_STAGE.get(inquiry_stage, _INQUIRY_STAGE["observe"])
    objectives_text = ""
    if learning_objectives:
        objectives_text = "Learning objectives for this activity:\n" + \
            "\n".join(f"  • {obj}" for obj in learning_objectives)
    prior_text = ""
    if prior_questions:
        last = prior_questions[-3:]  # only last 3 to avoid prompt bloat
        prior_text = "Questions Peri already asked this session (do not repeat):\n" + \
            "\n".join(f"  – {q}" for q in last)
    observation_text = ""
    if student_observation:
        observation_text = f'\nThe student just wrote or said: "{student_observation.strip()}"'

    return f"""CONTEXT
Location: {location_name}
{("Place description: " + location_description) if location_description else ""}
Subject area: {subject}
Grade level: {grade_level}
Cognitive target (Bloom's): {bloom_level} — the question should require the student to {bloom_plain}
Inquiry stage: {inquiry_stage.upper()}
{objectives_text}
{prior_text}
{observation_text}

YOUR TASK
{stage_instruction}

RULES (follow all of them)
• Ask exactly ONE question. No preamble, no explanation after it.
• The question must be answerable through direct observation, measurement, or reasoning from evidence at this location — not from memory or a textbook.
• Match the vocabulary and complexity to Grade {grade_level}.
• Do not include the answer or hint at it.
• Do not ask a yes/no question.
• Do not repeat any prior question.
• Maximum 2 sentences.

RESPOND WITH THE QUESTION ONLY."""


# ──────────────────────────────────────────────────────────────────────────────
# 2. ACTIVITY GENERATION PROMPTS
# ──────────────────────────────────────────────────────────────────────────────

_TAXONOMY_DESCRIPTORS = {
    "blooms": {
        "remember":   "Level 1 — Recall: list, identify, name, recognise",
        "understand": "Level 2 — Understand: explain, summarise, classify, interpret",
        "apply":      "Level 3 — Apply: use, execute, solve, demonstrate",
        "analyze":    "Level 4 — Analyse: compare, differentiate, organise, deconstruct",
        "evaluate":   "Level 5 — Evaluate: justify, critique, argue, assess",
        "create":     "Level 6 — Create: design, construct, produce, invent",
    },
    "dok": {
        "dok1": "Level 1 — Recall & Reproduction: single fact, procedure, or definition",
        "dok2": "Level 2 — Skills & Concepts: multi-step, classify, infer, interpret",
        "dok3": "Level 3 — Strategic Thinking: reason abstractly, plan, justify",
        "dok4": "Level 4 — Extended Thinking: synthesise, investigate, connect across disciplines",
    },
    "solo": {
        "prestructural":   "Pre-structural — no meaningful understanding yet",
        "unistructural":   "Uni-structural — one relevant aspect identified",
        "multistructural": "Multi-structural — several aspects understood independently",
        "relational":      "Relational — aspects integrated into a coherent whole",
        "extended":        "Extended Abstract — generalised beyond the specific context",
    },
    "marzano": {
        "retrieval":              "Level 1 — Retrieval: recall or recognise",
        "comprehension":          "Level 2 — Comprehension: identify details, organise",
        "analysis":               "Level 3 — Analysis: match, classify, generalise, specify",
        "knowledge_utilization":  "Level 4 — Knowledge Utilization: decision making, investigation, experimental inquiry",
    },
}


def build_activity_prompt(
    *,
    title: str,
    description: str,
    subject: str,
    grade_level: int,
    location_name: str,
    location_description: str = "",
    taxonomy_type: str = "blooms",
    taxonomy_level: str = "analyze",
    learning_objectives: list[str] | None = None,
    duration_minutes: int = 60,
    activity_type: str = "outdoor",
    num_suggestions: int = 3,
    location_lat: float | None = None,
    location_lng: float | None = None,
) -> str:
    """
    Build an activity suggestion prompt for the teacher's AI helper.

    Wire into: frontend OllamaLessonSuggestions fetchSuggestions()
               OR backend activity_generation_service._build_generation_prompt()
    Temperature: 0.70
    Max tokens: 1200
    """
    taxonomy_desc = (_TAXONOMY_DESCRIPTORS
                     .get(taxonomy_type, _TAXONOMY_DESCRIPTORS["blooms"])
                     .get(taxonomy_level, ""))
    coords_text = ""
    if location_lat and location_lng:
        coords_text = f"Coordinates: {location_lat:.4f}, {location_lng:.4f}\n"
    objectives_text = ""
    if learning_objectives:
        objectives_text = "Learning objectives already set by the teacher:\n" + \
            "\n".join(f"  • {obj}" for obj in learning_objectives)

    return f"""ACTIVITY CONTEXT
Title: {title}
Description: {description}
Subject: {subject}
Grade level: {grade_level}
Location: {location_name}
{coords_text}{("Place notes: " + location_description + chr(10)) if location_description else ""}Activity type: {activity_type}
Planned duration: {duration_minutes} minutes
Cognitive level — {taxonomy_type.upper()}: {taxonomy_desc}
{objectives_text}

YOUR TASK
Generate {num_suggestions} specific, distinct lesson variations or activity extensions for the above context.
Each variation should leverage what is UNIQUE and OBSERVABLE at {location_name} — not a generic outdoor activity that could happen anywhere.

FOR EACH VARIATION PROVIDE:
1. Title — punchy, 6 words max
2. Cognitive level — state the {taxonomy_type.upper()} level this targets and why this variation reaches that level
3. Core observable/investigable phenomenon — the specific thing at this location the student will examine
4. Student task — what the student does (2 sentences, active verbs, first person: "You will…")
5. Evidence they collect — what goes in their field journal or capture (photo, measurement, sketch, audio)
6. Peri connection — one question Peri might ask to deepen inquiry at this variation's cognitive level

FORMAT: Return a numbered list (1., 2., 3…). Each variation on its own block with the 6 fields labelled.
Be concrete. Name specific features of {location_name} when possible. Avoid vague language like "explore" or "investigate broadly".

IMPORTANT: Every suggestion must be completable in {duration_minutes} minutes or less."""


def build_activity_generation_prompt(
    *,
    location_name: str,
    location_description: str = "",
    wikipedia_extract: str = "",
    subject: str,
    grade_level: int,
    taxonomy_type: str = "blooms",
    taxonomy_levels: dict | None = None,
    learning_objectives: list[str] | None = None,
    curriculum_standards: list[str] | None = None,
    num_activities: int = 3,
    activity_types: list[str] | None = None,
) -> str:
    """
    Full activity generation prompt — for the backend activity_generation_service.
    Replaces _build_generation_prompt() in activity_generation_service.py.

    Temperature: 0.70
    Max tokens: 2500
    Returns JSON array.
    """
    activity_types = activity_types or ["hands_on", "inquiry", "field_observation"]
    taxonomy_levels = taxonomy_levels or {"bloom_level": 4, "dok_level": 3}

    bloom_desc = (_TAXONOMY_DESCRIPTORS["blooms"]
                  .get(str(taxonomy_levels.get("bloom_level", 4)), "Level 4 — Analyse"))
    dok_desc   = (_TAXONOMY_DESCRIPTORS["dok"]
                  .get(f"dok{taxonomy_levels.get('dok_level', 3)}", "Level 3 — Strategic Thinking"))
    solo_desc  = (_TAXONOMY_DESCRIPTORS["solo"]
                  .get(str(taxonomy_levels.get("solo_level", "")), ""))
    marz_desc  = (_TAXONOMY_DESCRIPTORS["marzano"]
                  .get(str(taxonomy_levels.get("marzano_level", "")), ""))

    objectives_block = ""
    if learning_objectives:
        objectives_block = "Teacher's learning objectives:\n" + \
            "\n".join(f"  • {o}" for o in learning_objectives)

    standards_block = ""
    if curriculum_standards:
        standards_block = "Curriculum standards to align with:\n" + \
            "\n".join(f"  • {s}" for s in curriculum_standards[:8])

    desc_line  = f"Description: {location_description}\n" if location_description else ""
    wiki_line  = f"Background (Wikipedia):\n{wikipedia_extract[:600]}\n" if wikipedia_extract else ""
    solo_line  = f"SOLO: {solo_desc}\n" if solo_desc else ""
    marz_line  = f"Marzano: {marz_desc}\n" if marz_desc else ""
    return f"""LOCATION
Name: {location_name}
{desc_line}{wiki_line}CURRICULUM
Subject: {subject}
Grade level: {grade_level}
{objectives_block}
{standards_block}

COGNITIVE TARGETS
Bloom's Revised: {bloom_desc}
Webb's DOK: {dok_desc}
{solo_line}{marz_line}
TASK
Generate {num_activities} field-based learning activities for Grade {grade_level} {subject} at {location_name}.

Each activity must:
• Use {location_name} as an ACTIVE learning environment — not just a backdrop
• Reach the cognitive targets above (not just recall-level tasks)
• Produce tangible student evidence (journal entry, capture, measurement, sketch)
• Be completable in a single field session (90 minutes maximum)
• Have a clear observable phenomenon at its centre

Return ONLY a valid JSON array. No markdown, no preamble. Schema:

[
  {{
    "title": "string — 8 words max",
    "description": "string — 2-3 sentences, active voice",
    "core_phenomenon": "string — the specific observable thing at this location",
    "learning_objectives": ["string", "string"],
    "student_task": "string — what the student does, starting with action verbs",
    "evidence_collected": "string — what goes in their field journal or device",
    "bloom_level": integer 1-6,
    "dok_level": integer 1-4,
    "solo_level": integer 1-5,
    "marzano_level": integer 1-4,
    "estimated_duration_minutes": integer,
    "materials_needed": ["string"],
    "activity_type": "hands_on|inquiry|field_observation|discussion|hybrid",
    "peri_opening_question": "string — the first question Peri asks to launch inquiry"
  }}
]"""


# ──────────────────────────────────────────────────────────────────────────────
# 3. STANDARDS / RUBRIC / TAXONOMY PROMPTS
# ──────────────────────────────────────────────────────────────────────────────

def build_standards_extraction_prompt(
    *,
    document_text: str,
    document_type: str = "standards",   # "standards" | "rubric" | "curriculum"
    subject: str = "",
    grade_band: str = "",
    max_chars: int = 12000,
) -> str:
    """
    Extract structured criteria from a standards, rubric, or curriculum document.
    Replaces EXTRACTION_PROMPT in standards_parser.py.

    Temperature: 0.05  (very low — we want deterministic extraction, not creativity)
    Max tokens: 3000
    Returns JSON array.
    """
    doc_text = document_text[:max_chars]
    context_hints = []
    if subject:
        context_hints.append(f"Subject area: {subject}")
    if grade_band:
        context_hints.append(f"Grade band: {grade_band}")
    context_block = "\n".join(context_hints)

    type_instructions = {
        "standards": (
            "Extract every measurable standard or benchmark. Each standard is a statement of "
            "what a student should KNOW or BE ABLE TO DO. Pay attention to grade-band qualifiers, "
            "domain labels (e.g. 'LS1', 'CCSS.ELA'), and any sub-standards."
        ),
        "rubric": (
            "Extract every assessment criterion and its performance levels. "
            "Each criterion describes what to look for in student work. "
            "If performance descriptors exist (e.g. 4/3/2/1 or Exceeds/Meets/Approaching), "
            "capture the top-level descriptor in the 'description' field."
        ),
        "curriculum": (
            "Extract every learning outcome, competency, or skill statement. "
            "Ignore administrative text, page numbers, and boilerplate. "
            "Focus on sentences that describe student learning."
        ),
    }.get(document_type, "Extract every measurable learning criterion.")

    return f"""DOCUMENT TYPE: {document_type.upper()}
{context_block}

INSTRUCTIONS
{type_instructions}

For every criterion you find, output a JSON object with these exact fields:
  id          — kebab-case unique identifier (e.g. "ngss-ls1-1", "ccss-ela-ri-5-1", "rubric-evidence-3")
  code        — the official alphanumeric code from the document, or "" if none
  name        — concise label, 8 words max
  description — what the student must know or demonstrate; 1-2 sentences
  category    — subject domain or strand (e.g. "Life Science", "Writing", "Mathematical Practice")
  grade_band  — grade range this applies to (e.g. "3-5", "6-8", "K-2"), or "" if not specified
  bloom_level — integer 1-6 (Bloom's Revised) that best matches the cognitive demand; use 0 if unclear
  dok_level   — integer 1-4 (Webb's DOK) that best matches; use 0 if unclear
  required    — true if mandatory, false if optional or enrichment
  weight      — relative importance as float (1.0 = normal; higher = more important if document signals it)

CRITICAL RULES
• Return ONLY a valid JSON array. No markdown fences, no commentary.
• Do not invent criteria. Only extract what is explicitly in the document.
• Do not merge separate standards into one object.
• If two standards share the same code (unusual), give each a distinct id suffix (e.g. "-a", "-b").
• If you find zero criteria, return [].

DOCUMENT TEXT:
---
{doc_text}
---

JSON ARRAY:"""


def build_rubric_alignment_prompt(
    *,
    activity_title: str,
    activity_description: str,
    learning_objectives: list[str],
    subject: str,
    grade_level: int,
    taxonomy_type: str = "blooms",
    taxonomy_level: str = "analyze",
    existing_rubric_criteria: list[dict] | None = None,
) -> str:
    """
    Generate a rubric aligned to an activity's learning objectives and taxonomy level.
    Use for the rubric builder AI assistant.

    Temperature: 0.30
    Max tokens: 1500
    Returns JSON array of rubric criteria with 4-level descriptors.
    """
    taxonomy_desc = (_TAXONOMY_DESCRIPTORS
                     .get(taxonomy_type, _TAXONOMY_DESCRIPTORS["blooms"])
                     .get(taxonomy_level, ""))
    objectives_text = "\n".join(f"  {i+1}. {o}" for i, o in enumerate(learning_objectives))
    existing_text = ""
    if existing_rubric_criteria:
        existing_text = (
            "\nThe teacher has already added these criteria — do NOT duplicate them:\n" +
            "\n".join(f"  • {c.get('name', '')}" for c in existing_rubric_criteria)
        )

    return f"""ACTIVITY
Title: {activity_title}
Description: {activity_description}
Subject: {subject}
Grade level: {grade_level}
Cognitive level — {taxonomy_type.upper()}: {taxonomy_desc}

LEARNING OBJECTIVES
{objectives_text}
{existing_text}

TASK
Generate a rubric for assessing student work on this activity.
Create one criterion per learning objective. Each criterion must reflect the cognitive demand of {taxonomy_level} (not lower).

For each criterion return a JSON object:
{{
  "name": "string — criterion label, 5 words max",
  "description": "string — what the criterion measures (1 sentence)",
  "weight": float,  // 1.0 default; adjust if one objective is clearly primary
  "taxonomy_level": "{taxonomy_level}",
  "levels": {{
    "4": "string — Exceeds: student does all of [level] PLUS shows independent extension or novel application",
    "3": "string — Meets: student fully demonstrates [{taxonomy_level}] as described in the objective",
    "2": "string — Approaching: student shows partial understanding; some {taxonomy_level}-level thinking but gaps remain",
    "1": "string — Beginning: student demonstrates only surface recall or recognition, below the target level"
  }}
}}

RULES
• Each level descriptor must be concrete and observable — a teacher can score it without ambiguity.
• Level 3 should directly map to the learning objective as written.
• Level 4 requires something BEYOND the stated objective — synthesis, transfer, or extension.
• Use plain language suited to Grade {grade_level} teachers.
• Return ONLY a valid JSON array. No markdown, no preamble.

JSON ARRAY:"""


def build_taxonomy_classification_prompt(
    *,
    text: str,
    classify_for: list[str] | None = None,
) -> str:
    """
    Classify a learning objective, standard, or activity description against
    multiple taxonomy frameworks simultaneously.

    classify_for: list from ["blooms", "dok", "solo", "marzano"]
    Temperature: 0.10
    Max tokens: 400
    Returns JSON object.
    """
    frameworks = classify_for or ["blooms", "dok", "solo", "marzano"]

    framework_descriptions = {
        "blooms": "Bloom's Revised Taxonomy (1=Remember, 2=Understand, 3=Apply, 4=Analyse, 5=Evaluate, 6=Create)",
        "dok":    "Webb's Depth of Knowledge (1=Recall, 2=Skill/Concept, 3=Strategic Thinking, 4=Extended Thinking)",
        "solo":   "SOLO Taxonomy (1=Pre-structural, 2=Uni-structural, 3=Multi-structural, 4=Relational, 5=Extended Abstract)",
        "marzano": "Marzano's New Taxonomy (1=Retrieval, 2=Comprehension, 3=Analysis, 4=Knowledge Utilization)",
    }
    selected = {k: v for k, v in framework_descriptions.items() if k in frameworks}
    frameworks_block = "\n".join(f"• {v}" for v in selected.values())

    return f"""Classify the following learning statement against the requested cognitive taxonomy frameworks.

STATEMENT:
"{text}"

FRAMEWORKS TO APPLY:
{frameworks_block}

For each framework, provide:
  - level: integer (the numeric level)
  - label: the level name
  - rationale: one sentence explaining why this level was chosen (cite the verb or cognitive demand in the statement)

Return ONLY a valid JSON object. No markdown, no preamble. Example schema:
{{
  "blooms":  {{"level": 4, "label": "Analyse", "rationale": "..."}},
  "dok":     {{"level": 3, "label": "Strategic Thinking", "rationale": "..."}},
  "solo":    {{"level": 4, "label": "Relational", "rationale": "..."}},
  "marzano": {{"level": 3, "label": "Analysis", "rationale": "..."}}
}}

Include only the frameworks listed above. JSON:"""


def build_standards_alignment_prompt(
    *,
    activity_title: str,
    activity_description: str,
    learning_objectives: list[str],
    subject: str,
    grade_level: int,
    available_standards: list[dict],
) -> str:
    """
    Given an activity and a list of available standards, find the best alignments.
    Use in the CurriculumMapper to auto-suggest standard connections.

    Temperature: 0.15
    Max tokens: 800
    Returns JSON array of alignment objects.
    """
    standards_block = "\n".join(
        f"  [{s.get('code', s.get('id', ''))}] {s.get('name', '')}: {s.get('description', '')[:120]}"
        for s in available_standards[:30]  # cap to avoid context overflow
    )
    objectives_text = "\n".join(f"  • {o}" for o in learning_objectives)

    return f"""ACTIVITY
Title: {activity_title}
Description: {activity_description}
Subject: {subject} | Grade: {grade_level}

Learning objectives:
{objectives_text}

AVAILABLE STANDARDS (code — name: description)
{standards_block}

TASK
Identify which standards this activity aligns to, and how strongly.
Only include standards where there is genuine alignment — do not force connections.

For each aligned standard return:
{{
  "standard_code": "string",
  "standard_name": "string",
  "alignment_strength": "primary" | "supporting" | "incidental",
  "rationale": "string — one sentence explaining the connection"
}}

"primary" = the activity directly and substantially addresses this standard.
"supporting" = the activity partially addresses it or provides a foundation.
"incidental" = the standard is touched lightly; not the activity's focus.

Return ONLY a valid JSON array, ordered by alignment_strength (primary first). No preamble.

JSON ARRAY:"""


# ──────────────────────────────────────────────────────────────────────────────
# PRIVACY JURISDICTION DISCOVERY
# (services/privacy_discovery_service.py — self-service jurisdiction resolver)
# ──────────────────────────────────────────────────────────────────────────────

def build_privacy_jurisdiction_discovery_prompt(
    *,
    location_desc: str,
    country_code: str,
    source_text: str = "",
    validation_errors: str = "",
) -> str:
    """
    Synthesize a structured student-data-privacy rule summary for a
    country/state/region that has no existing config file, compliance_rule,
    or catalog entry.

    Temperature: 0.1  (deterministic extraction, not creativity)
    Max tokens: 1500
    Returns a single JSON object (not an array).

    If source_text is empty, the model must rely on its own training
    knowledge (recall-only) rather than a fetched page — callers should treat
    that result with lower confidence (is_verified=false regardless of the
    model's own "confidence" field).

    Pass validation_errors (from a prior failed schemas.privacy_rule.PrivacyRule
    validation attempt) to retry once with the exact field errors fed back in.
    """
    source_block = (
        f"SOURCE TEXT (fetched from an official government/regulator page):\n---\n{source_text[:8000]}\n---\n"
        if source_text else
        "No source page text is available — answer from your own general knowledge of this "
        "jurisdiction's student-data-privacy and children's-online-privacy law, if any exists. "
        "If you are not confident a specific law exists, say so honestly via a low confidence "
        "value rather than inventing one.\n"
    )

    retry_block = (
        f"\nYOUR PREVIOUS ANSWER FAILED VALIDATION with these errors — fix them exactly:\n{validation_errors}\n"
        if validation_errors else ""
    )

    return f"""You are helping a K-12 education platform determine what student-data-privacy and
children's-online-privacy protections apply for a teacher located in: {location_desc}
(ISO 3166-1 alpha-2 country code: {country_code}).

Interpret {country_code} strictly as an ISO 3166-1 alpha-2 code, not a colloquial abbreviation —
double-check against a well-known confusable before answering (e.g. "SV" is El Salvador, not
"St. Vincent"; "CD" is DR Congo, not Chad; "GE" is Georgia, not Germany). If you are not fully
certain which country a two-letter code refers to, say so via a low confidence value rather than
guessing.

{source_block}
{retry_block}
TASK
Determine whether a relevant national or subnational student-data-privacy / children's-online-privacy
law exists for this location. If one exists, summarize it. If none exists, say so and fall back to
generic child-safety-conscious defaults (do not invent a law that doesn't exist).

Return ONLY a single valid JSON object with exactly these fields:
{{
  "law_exists": true | false,
  "confidence": "high" | "medium" | "low",
  "framework": "short lowercase slug, e.g. 'gdpr', 'coppa', 'custom' if no established name",
  "short_name": "e.g. 'LGPD' or 'No dedicated law found'",
  "full_name": "official law name, or a plain description if none exists",
  "summary": "1-3 sentences a non-lawyer teacher can understand",
  "key_requirements": ["short bullet", "short bullet", "..."],
  "age_threshold": integer or null — the age under which parental consent is specifically required, if any,
  "max_retention_days": integer — a reasonable data-retention cap; use 365 if unknown,
  "encryption_required": true | false,
  "student_data_sharing_allowed": true | false — can student data be shared with third parties by default,
  "student_monitoring_allowed": true | false,
  "student_profiling_allowed": true | false,
  "student_targeting_allowed": true | false — behavioral advertising targeting minors,
  "requires_privacy_impact_assessment": true | false,
  "requires_data_protection_officer": true | false
}}

CRITICAL RULES
• Return ONLY the JSON object. No markdown fences, no commentary.
• Err conservative on booleans when uncertain (false for *_allowed fields, true for encryption_required)
  — a K-12 platform should default to MORE protective, not less.
• Do not fabricate a specific law name or citation you are not reasonably confident exists.

JSON OBJECT:"""
