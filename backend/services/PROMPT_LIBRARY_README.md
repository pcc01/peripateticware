# Peripateticware — AI Prompt Library

`services/prompt_library.py` — six prompt-builder functions, one for each AI task.

---

## Where Each Prompt Plugs In

### 1. `build_peri_prompt()` — Aristotelian guiding questions
**Wires into:** `routes/inference.py` → `_call_llm_inference()`

Replace the current minimal prompt with:
```python
from services.prompt_library import build_peri_prompt, SYSTEM_PERI

prompt = build_peri_prompt(
    location_name=location_name,
    subject=subject,
    grade_level=grade_level,
    bloom_level=bloom_level,          # from request.curriculum_context
    inquiry_stage=inquiry_stage,      # "orient"|"observe"|"classify"|"explain"|"connect"|"reflect"
    student_observation=request.text, # what the student just wrote
    learning_objectives=cur_ctx.get("learning_objectives", []),
    prior_questions=per_ctx.get("prior_questions", []),
)
# Claude: pass SYSTEM_PERI as messages[0] role="system"
# Ollama: prepend SYSTEM_PERI + "\n\n" to prompt
```

**Temperature:** 0.65 | **Max tokens:** 180
**Key improvements over current prompt:**
- Peri has a defined character and pedagogy (not just "generate a question")
- Inquiry stage guides the TYPE of question (noticing → classifying → explaining)
- Bloom level constrains cognitive demand
- Prior questions prevent repetition
- Rules prevent yes/no questions, hints, and overly long responses

---

### 2. `build_activity_prompt()` — Teacher AI suggestion button
**Wires into:** `components/teacher/OllamaLessonSuggestions.tsx` → `fetchSuggestions()`

Replace the `prompt` string in `fetchSuggestions()`:
```typescript
body: JSON.stringify({
  student_id: 'teacher-preview',
  session_id: 'activity-builder',
  input_text: buildActivityPromptClient({   // call this helper from a new utils/prompts.ts
    title, description, subject: formData.subject,
    grade_level: formData.grade_level,
    location_name: locationInfo || 'outdoor setting',
    taxonomy_type: taxonomyType,
    taxonomy_level: formData.bloom_level,
    learning_objectives: formData.learning_objectives,
    duration_minutes: formData.estimated_duration_minutes,
    num_suggestions: 3,
  }),
  ...
})
```

Or call from backend — move suggestion fetching to a dedicated endpoint that uses `build_activity_prompt()` server-side (preferred, keeps prompt off the client).

**Temperature:** 0.70 | **Max tokens:** 1200
**Key improvements:**
- Requests structured output with 6 labelled fields per suggestion
- Cites the specific taxonomy level and explains why each suggestion reaches it
- Asks for the "core observable phenomenon" — forces location-specificity
- Includes what evidence the student collects (connects to field journal)
- Includes a Peri opening question for each variation

---

### 3. `build_activity_generation_prompt()` — Full activity generation
**Wires into:** `services/activity_generation_service.py` → `_build_generation_prompt()`

Replace the existing method body:
```python
def _build_generation_prompt(self, location_name, location_context, curriculum_context, subject, grade_level, num_suggestions):
    from services.prompt_library import build_activity_generation_prompt
    return build_activity_generation_prompt(
        location_name=location_name,
        location_description=location_context.get("educational_value", ""),
        wikipedia_extract=location_context.get("wikipedia", {}).get("extract", ""),
        subject=subject,
        grade_level=grade_level,
        taxonomy_levels={
            "bloom_level": curriculum_context.get("bloom_level", 4),
            "dok_level":   curriculum_context.get("dok_level", 3),
        },
        learning_objectives=curriculum_context.get("objectives", []),
        curriculum_standards=curriculum_context.get("standards", []),
        num_activities=num_suggestions,
    )
```

**Temperature:** 0.70 | **Max tokens:** 2500
**Key improvements:**
- Outputs `peri_opening_question` per activity — ready to use immediately in sessions
- Outputs `core_phenomenon` — the observable thing at the location, forces specificity
- `evidence_collected` maps directly to field journal / capture schema
- All four taxonomy scores in one response

---

### 4. `build_standards_extraction_prompt()` — Standards/rubric PDF parser
**Wires into:** `services/standards_parser.py` → `EXTRACTION_PROMPT`

Replace `EXTRACTION_PROMPT`:
```python
# In standards_parser.py, replace EXTRACTION_PROMPT usage:
from services.prompt_library import build_standards_extraction_prompt

prompt = build_standards_extraction_prompt(
    document_text=text,
    document_type=set_type,    # "standards" | "rubric" | "curriculum"
    subject=name,
    max_chars=12000,
)
```

**Temperature:** 0.05 | **Max tokens:** 3000
**Key improvements:**
- Document-type-aware instructions (standards vs rubric vs curriculum)
- Extracts `bloom_level` and `dok_level` per criterion automatically
- Extracts `code` (official standard number) as a separate field
- Extracts `grade_band` so multi-grade documents parse correctly

---

### 5. `build_rubric_alignment_prompt()` — AI rubric builder
**Wires into:** New endpoint (suggested: `POST /api/v1/rubrics/generate`)

```python
from services.prompt_library import build_rubric_alignment_prompt, SYSTEM_STANDARDS_ANALYST

prompt = build_rubric_alignment_prompt(
    activity_title=activity.title,
    activity_description=activity.description,
    learning_objectives=activity.learning_objectives or [],
    subject=activity.subject,
    grade_level=activity.grade_level,
    taxonomy_type="blooms",
    taxonomy_level=activity.bloom_level or "analyze",
)
# Claude system: SYSTEM_STANDARDS_ANALYST
# Ollama: prepend SYSTEM_STANDARDS_ANALYST + "\n\n"
```

**Temperature:** 0.30 | **Max tokens:** 1500
**Key improvements:**
- All four performance level descriptors per criterion (not just a score)
- Level 3 maps directly to the learning objective
- Level 4 requires synthesis/transfer (prevents grade inflation)
- Explicitly prevents cognitive-level mismatch (e.g. recall rubric for analysis task)

---

### 6. `build_taxonomy_classification_prompt()` — Auto-classify any text
**Wires into:** Activity form (classify objectives on the fly), standards import pipeline

```python
from services.prompt_library import build_taxonomy_classification_prompt

prompt = build_taxonomy_classification_prompt(
    text=learning_objective,
    classify_for=["blooms", "dok"],
)
# Returns: {"blooms": {"level": 4, "label": "Analyse", "rationale": "..."}, "dok": {...}}
```

**Temperature:** 0.10 | **Max tokens:** 400
Use this to auto-fill taxonomy fields when a teacher types a learning objective.

---

### 7. `build_standards_alignment_prompt()` — Auto-map activity to standards
**Wires into:** `components/teacher/CurriculumMapper.tsx` backend endpoint

```python
from services.prompt_library import build_standards_alignment_prompt

prompt = build_standards_alignment_prompt(
    activity_title=activity.title,
    activity_description=activity.description,
    learning_objectives=activity.learning_objectives or [],
    subject=activity.subject,
    grade_level=activity.grade_level,
    available_standards=[s.to_dict() for s in standards],
)
# Returns: [{"standard_code": "NGSS-LS1-1", "alignment_strength": "primary", "rationale": "..."}]
```

**Temperature:** 0.15 | **Max tokens:** 800

---

## Model Recommendations

| Task | Ollama model | Claude model | Notes |
|------|-------------|-------------|-------|
| Peri inquiry question | `llama3:8b` or `mistral` | `claude-haiku-4-5-20251001` | Speed matters — student is waiting in the field |
| Activity suggestions | `llama3:8b` | `claude-haiku-4-5-20251001` | Instant mode preferred |
| Full activity generation | `mistral` or `llama3:70b` | `claude-sonnet-4-6` | Batch mode acceptable |
| Standards extraction | `mistral` | `claude-haiku-4-5-20251001` | Low temp critical |
| Rubric generation | `llama3:8b` | `claude-haiku-4-5-20251001` | |
| Taxonomy classification | `mistral` | `claude-haiku-4-5-20251001` | Very fast, low tokens |
| Standards alignment | `mistral` | `claude-haiku-4-5-20251001` | |
