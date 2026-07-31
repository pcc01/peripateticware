# PRD / Technical Spec — Standards Alignment Engine

**Product:** Peripateticware
**Component:** Standards Alignment Engine (US K-12)
**Author:** Paul (drafted with Claude) | **Date:** 2026-07-31 | **Status:** Draft — ready for dev-agent implementation
**One-liner:** Map Peripateticware learning content to authoritative, machine-readable US state academic standards and state graduation requirements, with automated polling of state sources so alignments stay current as standards change.

---

## 1. Problem statement

Peripateticware content (location-based learning experiences) currently has no formal mapping to state academic standards or graduation requirements. Schools, districts, and homeschool families evaluate edtech by standards coverage; without alignment metadata, the product can't answer "which 4th-grade Ohio science standards does this quest satisfy?" or "does this course sequence count toward graduation?"

Standards also *change*. Any static mapping rots. The system must treat state sources as pollable upstreams with change detection, not as one-time imports.

## 2. Key domain insight (read this first)

There are **two separate content domains** with different source families. Do not merge them into one table family:

| Domain | What it is | Authoritative source | Machine-readable? |
|---|---|---|---|
| **Content standards** | What students learn, per grade/subject (e.g., "CCSS.MATH.4.NF.A.1") | State education agencies via the **CASE ecosystem** (1EdTech CASE spec) | Yes — CASE JSON APIs with stable GUIDs |
| **Graduation requirements** | Credits, required courses, diploma pathways, exit exams | **State statute / administrative code / board rules**; ECS 50-State Comparison as index | No — statute + agency web pages; needs structured manual/AI-assisted ingestion with citation tracking |

### CASE ecosystem facts the implementation depends on

- CASE (Competencies and Academic Standards Exchange, 1EdTech) is the machine-readable spec. Core objects: `CFDocument` (a framework), `CFItem` (an individual standard), `CFAssociation` (relationships, e.g., `isChildOf`).
- Every CFItem carries a **globally unique GUID (`identifier`)** that persists across revisions. **Alignments must key on the GUID, never on the human-readable code or text.**
- Central aggregator: **Satchel Rosetta Exchange** (Common Good Learning Tools), formerly "CASE Network 2." Public browse at `casenetwork.1edtech.org`; API/JSON export requires Registered Access (nominal annual fee for commercial edtech suppliers; free for non-commercial). Covers core four subjects (math, ELA, science, social studies) for all 50 states.
- Some states run their **own CASE servers** (e.g., Georgia "SuitCASE", Texas). For those, poll the state endpoint directly as source of truth; use Rosetta Exchange as mirror/fallback for the rest.
- CASE API surface (per CASE 1.0/1.1 spec): `getAllCFDocuments`, `getCFDocument/{id}`, `getCFPackage/{id}` (full framework: document + items + associations), `getCFItem/{id}`. Items include `lastChangeDateTime` — use it plus a content hash for change detection.

### Graduation requirements facts the implementation depends on

- Index source: **Education Commission of the States (ECS) 50-State Comparison: High School Graduation Requirements** (`ecs.org` / `reports.ecs.org`). Compiled from statute, regulation, and agency guidance. Not an API — periodic manual/AI-assisted re-scrape.
- Definitive record per state = **statute/regulation citation + state DOE graduation page URL**. Store both; re-poll the DOE page.
- Structural edge cases the schema MUST support:
  1. **Locally determined states** — Colorado, Massachusetts, Pennsylvania have no statewide credit minimum (districts decide).
  2. **Floor vs. practice** — CA, ME, WY have low statutory floors (11–13 credits); districts commonly require 22–24. Model state minimums only; flag as `is_state_minimum`.
  3. **Non-course requirements** — exit exams, civics/naturalization test, portfolios, FAFSA completion, competency-based alternatives to Carnegie units.
  4. **Multiple diploma pathways/endorsements** per state (21+ states define multiple pathways).
- **Matriculation (college entrance) is a third, out-of-scope-for-MVP domain** (e.g., California UC/CSU A-G course lists have their own portal). Reserved in schema via `requirement_context` enum, not implemented in Phase 1.

## 3. Goals & success metrics

| Goal | Metric | Target |
|---|---|---|
| Content is discoverable by standard | % of published quests/experiences with ≥1 reviewed alignment | 90% (pilot states) |
| Alignments stay current | Time from upstream standard change → flagged for review | < 7 days |
| Coverage answerable per learner | "Coverage report" renders for any (state, grade, subject) in pilot states | 100% of pilot frameworks ingested |
| Trustworthy provenance | % of alignments and grad requirements with source GUID or statute citation | 100% (hard requirement) |

## 4. Non-goals (Phase 1)

- College matriculation / A-G eligibility mapping.
- District-level requirement overrides (state level only).
- Authoring or publishing our own CASE frameworks.
- Non-US standards (but see §6 note on the international privacy table pattern — schema should not hard-code US assumptions where cheap to avoid).

## 5. Users & personas

- **Educator/parent (primary):** filters and evaluates Peripateticware content by state + grade + subject standards; views coverage reports.
- **Learner:** sees progress toward grade-level standards and (HS) graduation-relevant coverage.
- **Paul / content admin (internal):** reviews AI-suggested alignments, approves/rejects, monitors upstream change queue.
- **The system itself:** RAG pipeline uses standards text as retrieval corpus for alignment suggestions and content generation prompts.

## 6. Architecture overview

Follows the same pattern as the existing **international-users privacy table**: a region-keyed requirements registry + pollable upstream sources + change log. Reuse conventions from that component (naming, audit columns, admin review flow) wherever they fit.

```
┌────────────────────────────┐     ┌──────────────────────────────┐
│  Upstream sources           │     │  Sync service (FastAPI bg     │
│  - State CASE servers       │────▶│  tasks or APScheduler/cron)   │
│  - Satchel Rosetta Exchange │     │  - poll per source_registry   │
│  - State DOE grad pages     │     │  - diff via hash + timestamps │
│  - ECS 50-state comparison  │     │  - write revisions + queue    │
└────────────────────────────┘     └──────────────┬───────────────┘
                                                   ▼
                                    Postgres (schemas below)
                                                   ▼
                    ┌──────────────────────────────┴───────────────┐
                    ▼                                              ▼
        Embedding pipeline (pgvector)                  Alignment engine
        standards item text → vectors                  (Ollama local / Claude API,
                    │                                  same LLM_PROVIDER switch)
                    ▼                                              │
        RAG retrieval for suggestions ◀────────────────────────────┘
                                                   ▼
                              React admin review UI + learner-facing coverage UI
```

## 7. Data model (Postgres)

Use `uuid` PKs, `created_at`/`updated_at` audit columns per existing house style. Suggested DDL sketch — dev agent should adapt to existing migration tooling (Alembic assumed).

### 7.1 Source registry & polling

```sql
CREATE TABLE standards_sources (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,                 -- 'Georgia SuitCASE', 'Satchel Rosetta Exchange', 'Ohio DOE grad reqs page'
    source_type     text NOT NULL CHECK (source_type IN ('case_api','html_page','pdf','ecs_index')),
    base_url        text NOT NULL,
    state_code      char(2),                       -- NULL for national aggregators
    auth_config     jsonb,                         -- API key ref etc. (secrets stay in env/vault, store key *name* only)
    poll_frequency  interval NOT NULL DEFAULT '7 days',
    is_authoritative boolean NOT NULL DEFAULT false, -- state-run source of truth vs mirror
    last_polled_at  timestamptz,
    last_changed_at timestamptz,
    last_status     text,                          -- 'ok' | 'error:<detail>'
    content_hash    text                           -- hash of last fetched payload (page sources)
);
```

### 7.2 Content standards (CASE-shaped)

Mirror CASE naming so ingest is a near-passthrough:

```sql
CREATE TABLE standards_frameworks (            -- CASE CFDocument
    id              uuid PRIMARY KEY,          -- = CASE identifier GUID (do NOT generate locally)
    source_id       uuid NOT NULL REFERENCES standards_sources(id),
    state_code      char(2),                   -- NULL for national frameworks (CCSS, NGSS)
    title           text NOT NULL,
    subject         text,                      -- normalize to enum: math, ela, science, social_studies, ...
    version         text,
    adoption_status text,                      -- CASE adoptionStatus
    official_source_url text NOT NULL,         -- CASE officialSourceURL — the state's citable page
    case_uri        text,                      -- CFDocument URI for re-fetch
    last_change_datetime timestamptz,          -- from CASE
    raw             jsonb NOT NULL             -- full CFDocument for forward-compat
);

CREATE TABLE standards_items (                 -- CASE CFItem
    id              uuid PRIMARY KEY,          -- = CASE GUID. Alignment key. Never re-mint.
    framework_id    uuid NOT NULL REFERENCES standards_frameworks(id) ON DELETE CASCADE,
    human_coding_scheme text,                  -- 'CCSS.MATH.4.NF.A.1'
    full_statement  text NOT NULL,
    education_levels text[],                   -- CASE educationLevel: ['04'] or ['09','10','11','12']
    item_type       text,                      -- 'Standard', 'Cluster', 'Domain', ...
    parent_id       uuid REFERENCES standards_items(id),  -- denormalized from isChildOf
    list_enumeration text,                     -- ordering within parent
    last_change_datetime timestamptz,
    is_retired      boolean NOT NULL DEFAULT false,  -- soft-delete; never hard-delete a GUID with alignments
    raw             jsonb NOT NULL
);
CREATE INDEX ON standards_items (framework_id);
CREATE INDEX ON standards_items USING gin (education_levels);

CREATE TABLE standards_associations (          -- CASE CFAssociation (beyond isChildOf)
    id              uuid PRIMARY KEY,
    framework_id    uuid NOT NULL REFERENCES standards_frameworks(id) ON DELETE CASCADE,
    origin_item_id  uuid NOT NULL,
    destination_item_id uuid NOT NULL,
    association_type text NOT NULL,            -- isChildOf, exactMatchOf, isRelatedTo, precedes, ...
    raw             jsonb
);

CREATE TABLE standards_item_revisions (        -- change log feeding the review queue
    id              bigserial PRIMARY KEY,
    item_id         uuid NOT NULL REFERENCES standards_items(id),
    detected_at     timestamptz NOT NULL DEFAULT now(),
    change_type     text NOT NULL CHECK (change_type IN ('added','text_changed','moved','retired')),
    old_value       jsonb,
    new_value       jsonb,
    review_status   text NOT NULL DEFAULT 'pending'  -- pending | acknowledged | realigned
);
```

### 7.3 Content ↔ standards alignments

```sql
CREATE TABLE content_alignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id      uuid NOT NULL,             -- FK to existing content/quest/experience table
    content_type    text NOT NULL,             -- if content is polymorphic; else drop
    item_id         uuid NOT NULL REFERENCES standards_items(id),
    alignment_type  text NOT NULL DEFAULT 'teaches' CHECK (alignment_type IN ('teaches','assesses','requires','extends')),
    method          text NOT NULL CHECK (method IN ('ai_suggested','manual')),
    confidence      real,                      -- model confidence for ai_suggested
    status          text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','approved','rejected')),
    reviewed_by     uuid,                      -- FK users
    reviewed_at     timestamptz,
    rationale       text,                      -- model or reviewer explanation, shown in admin UI
    UNIQUE (content_id, item_id, alignment_type)
);
CREATE INDEX ON content_alignments (item_id) WHERE status = 'approved';
```

Learner-facing surfaces read **only `status = 'approved'`**.

### 7.4 Graduation requirements (statute-backed, mirrors the privacy-table pattern)

```sql
CREATE TABLE diploma_pathways (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state_code      char(2) NOT NULL,
    name            text NOT NULL,             -- 'Standard Diploma', 'STEM Endorsement', ...
    pathway_type    text NOT NULL CHECK (pathway_type IN ('standard','advanced','endorsement','cte','alternative')),
    is_default      boolean NOT NULL DEFAULT false,
    effective_from  date,
    effective_to    date,                      -- versioned rows, don't overwrite
    is_locally_determined boolean NOT NULL DEFAULT false,  -- CO / MA / PA case
    statute_citation text,                     -- 'WAC 180-51-210'
    source_url      text NOT NULL,             -- state DOE page (registered in standards_sources)
    source_id       uuid REFERENCES standards_sources(id),
    notes           text
);

CREATE TABLE graduation_course_requirements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pathway_id      uuid NOT NULL REFERENCES diploma_pathways(id) ON DELETE CASCADE,
    subject         text NOT NULL,             -- same subject enum as frameworks
    credits         numeric(4,2),
    is_state_minimum boolean NOT NULL DEFAULT true,   -- floor-vs-practice flag
    specific_courses jsonb,                    -- e.g. {"must_include": ["Algebra I"], "options": [...]}
    notes           text
);

CREATE TABLE graduation_noncourse_requirements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pathway_id      uuid NOT NULL REFERENCES diploma_pathways(id) ON DELETE CASCADE,
    requirement_type text NOT NULL CHECK (requirement_type IN
        ('exit_exam','civics_test','portfolio','service_hours','fafsa','gpa_minimum','competency_alternative','other')),
    description     text NOT NULL,
    statute_citation text,
    notes           text
);
```

`requirement_context` reserved for Phase 3: add a column/table distinguishing `graduation` vs `college_matriculation` (A-G etc.) when that lands — do not build now.

### 7.5 Embeddings (RAG)

Add `standards_items` to the existing pgvector corpus. Either a column on `standards_items` or the existing embeddings table with `(source_table='standards_items', source_id=item.id)` — match current RAG conventions. Embed `human_coding_scheme + full_statement + ancestor path` (parent chain gives crucial context for terse standards).

## 8. Services & jobs

1. **CASE ingest job** (per `standards_sources` row of type `case_api`):
   - `getAllCFDocuments` → filter to subscribed frameworks → `getCFPackage` per framework.
   - Upsert by GUID. Diff `full_statement`/`education_levels`/parent against stored row → write `standards_item_revisions`, mark `text_changed`/`moved`; GUIDs absent from new package → `retired` (soft).
   - On any revision touching an item with approved alignments → flag those alignments back to `status='suggested'`? **No** — keep approved but enqueue for re-review (revision row does this). Never silently drop learner-visible alignments.
   - Re-embed changed items.
2. **Grad-requirements watch job** (per `html_page` source): fetch DOE page, hash, compare; on change, snapshot old/new and open a review task. Optionally pipe old/new text through the LLM to draft a structured diff for the admin.
3. **Alignment suggestion pipeline**: for new/updated content → RAG retrieve top-k standards items (filtered by target state/grade/subject) → LLM (existing `LLM_PROVIDER` switch: Ollama local or Claude API) scores each candidate, emits `alignment_type`, `confidence`, `rationale` → insert as `ai_suggested`/`suggested`.
4. **Scheduler**: reuse whatever the backup system / existing jobs use (cron or APScheduler in FastAPI); one job runner reading `standards_sources.poll_frequency`.

## 9. API endpoints (FastAPI)

- `GET /standards/frameworks?state=&subject=&grade=` — browse frameworks
- `GET /standards/items?framework_id=&grade=&q=` — browse/search items
- `GET /content/{id}/alignments` — approved alignments (public); `?include=suggested` (admin)
- `POST /admin/alignments/{id}/review` — approve/reject with reviewer id
- `GET /admin/alignments/suggestions?status=suggested` — review queue
- `GET /admin/standards/revisions?status=pending` — upstream-change queue
- `GET /coverage?state=&grade=&subject=` — coverage report: items in framework vs items with ≥1 approved alignment
- `GET /graduation-requirements/{state}?pathway=` — pathway + course + non-course requirements
- `POST /admin/sources/{id}/poll` — manual trigger

## 10. React frontend

**Admin (Phase 1):**
- Alignment review queue: content on left, suggested standard (code, statement, ancestor breadcrumb, confidence, rationale) on right; approve/reject/edit; keyboard-driven.
- Upstream changes queue: revision diffs with affected-alignment counts.
- Source health panel: last poll, status, next poll per source.

**Learner/educator (Phase 2):**
- State/grade picker (persisted per profile) → content browse filtered by standards.
- Per-content "Aligned to" chips (human coding scheme, tooltip = full statement + official source link).
- Coverage dashboard per (state, grade, subject).
- HS: pathway requirement checklist view (data from §7.4).

## 11. Non-functional requirements

- **Provenance is a hard invariant:** every learner-visible alignment traces to a CASE GUID + `official_source_url`; every grad requirement carries `statute_citation` + `source_url`.
- **Idempotent ingest:** re-running a poll with unchanged upstream produces zero writes.
- **Never hard-delete** standards items or frameworks that have alignments; retire.
- Rosetta Exchange API auth: commercial Registered Access — key in env/secrets, name-referenced from `auth_config`. Respect their rate limits; polls are weekly, not real-time. **Deferred for Phase 1** — see §13 #3.
- Ingest must tolerate CASE 1.0 vs 1.1 payload differences (store `raw`, parse defensively).
- **Validated finding (2026-07-31 spike, `scripts/ingest_state_standards.py` against the real WA math standards PDF, 123 pages):** chunked document-based extraction works and finds real content, but is not reliably clean — one chunk produced ~10 near-duplicate degenerate entries (an LLM repetition-loop failure on a cross-cutting "Standards for Mathematical Practice" section), not caught by any automated check. This is exactly the failure mode §17 step 4's "human gate is non-negotiable" already anticipates for the international pipeline — the same rule must apply to the US document-based path (any state without a direct CASE server, i.e. likely 4 of the 6 pilot states) even though it's simpler than the international case: **no bulk-ingested StandardsSet should be marked `is_global=true`/authoritative without a human reviewing the extracted criteria first**, same review step the teacher-facing upload wizard already provides. Also: sourcing the actual document was the easy part — a single web search + direct download succeeded for WA/CA/NY/GA; FL's site returned an Akamai bot-protection 403 to a direct fetch, and TX needs the exact current URL (page-level links found, but a guessed filename 404'd) — both solvable, neither a blocker, just not fully automatable end-to-end without a human confirming the URL/handling the block per state.

## 12. MVP scope vs. future phases

**Phase 1 (MVP):**
- Tables §7.1–7.3 + ingest job for **pilot states: CA, WA, TX, GA, FL, NY** (confirmed — six states, not the originally-suggested 2-3; see §13 #1) in 1-2 subjects.
- **No Rosetta Exchange in Phase 1** (§13 #3 — deferred, commercial registration not pursued yet). Direct state CASE endpoints only where they exist: confirmed for **GA** (SuitCASE) and **TX**. CA/WA/FL/NY CASE-server availability is unconfirmed — verify per state before ingest; where no state-run CASE endpoint exists, those states' content standards fall back to the same document-based LLM-extraction pipeline (§17) already required for all six states' graduation requirements (§7.4 was always statute/document-sourced, never CASE-based, so this doesn't block grad-requirements work for any pilot state).
- AI suggestion pipeline + admin review queue.
- Manual entry (admin form or seed script) of grad requirements for pilot states with citations (§7.4).
- Matriculation (college entrance) stays out of scope — confirmed HS-graduation-only for Phase 1 (§13 #2).

**Phase 2:** learner-facing filters, chips, coverage dashboard; grad-requirements watch job; expand to core four subjects in pilot states.

**Phase 3:** 50-state rollout (seed §7.4 from ECS index + per-state verification); matriculation context (A-G); district overrides. Revisit Rosetta Exchange registration if direct-state-CASE coverage proves too sparse for the remaining ~44 states.

## 13. Open issues / decisions needed

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Which pilot states? | Paul | **Resolved:** CA, WA, TX, GA, FL, NY |
| 2 | "Matriculation" scope: HS graduation only for now, or is A-G/college eligibility needed sooner? | Paul | **Resolved:** HS graduation only for Phase 1; matriculation stays reserved-not-built per §4/§12 |
| 3 | Rosetta Exchange commercial registration — confirm current fee & terms before building against the API | Paul | **Resolved:** Skip for Phase 1. Direct state CASE endpoints only (confirmed: GA, TX). Revisit in Phase 3 if coverage gaps require it |
| 4 | Does content live in one table or polymorphic types? (Determines `content_alignments` FK shape) | Dev agent — inspect schema | **Resolved:** Polymorphic. `Activity` (database.py:227) and `CurriculumUnit` (database.py:48, has its own `content_embedding Vector(384)`) are both alignable content types today; a hard FK to `activities.id` alone would miss `CurriculumUnit`. Keep `content_type text` as designed |
| 5 | Existing embeddings table conventions to reuse for §7.5 | Dev agent — inspect RAG code | **Resolved:** `RagDocument` (database.py:1375-1400) — `source_type`/`source_id` (string, no FK) + `Vector(384)` column, populated via fire-and-forget `asyncio.create_task` with its own DB session (see `standards.py:74-160 _index_standards_set_criteria` for the exact existing pattern to mirror), queried via raw-SQL pgvector cosine distance (`inference.py:503,538-554`) |
| 6 | Job scheduler already in use (backup system) to piggyback on? | Dev agent — inspect repo | **Resolved:** APScheduler, one shared instance built in `startup.py`'s `start_background_tasks` (~line 2067); new jobs follow the privacy-crawler pattern (`CronTrigger` + `get_session_factory()` for the job's own DB session, gated behind a settings flag defaulting off, e.g. a new `STANDARDS_POLL_ENABLED`) |

## 14. Appendix — source registry seed list

| Source | Type | URL | Notes |
|---|---|---|---|
| Satchel Rosetta Exchange (fka CASE Network 2) | case_api | casenetwork.1edtech.org | **Deferred — not used in Phase 1** (§13 #3). All-50-state mirror, core four subjects; registration for API/JSON. Revisit in Phase 3 |
| CASE spec (1EdTech) | reference | 1edtech.org/standards/case | CFDocument/CFItem/CFAssociation model, API surface |
| Georgia SuitCASE | case_api | (state-run CASE server) | Authoritative for GA — confirmed available, use for Phase 1 |
| Texas CASE service | case_api | (state-run CASE server) | Authoritative for TX — confirmed available, use for Phase 1 |
| CA / WA / FL / NY CASE availability | case_api? | unverified | **Verify before ingest** — no state-run CASE server confirmed for these four pilot states; if none exists, fall back to the document-based LLM-extraction pipeline (§17) for content standards, same as grad requirements already require |
| ECS 50-State Comparison: HS Graduation Requirements | ecs_index | ecs.org / reports.ecs.org | Index for §7.4; verify each row against state statute |
| Per-state DOE graduation pages | html_page | seeded per state | Pollable for change detection |
| Common Core (CCSS), NGSS | case_api / reference | via Rosetta Exchange, or direct if a pilot state publishes its own adaptation | National frameworks; states adapt — always align to the **state's** framework |

---

# PART II — International Extension

**Scope:** Brazil, France, Canada, China, South Korea, Japan, Turkey, Spain, Mexico, Germany, Italy.
**Status:** Design addendum. Written as **deltas** against Part I so US work already in flight isn't invalidated. All per-country facts in §20 must be re-verified against current official sources before ingestion (curricula in several of these countries are mid-transition).

## 15. What changes conceptually outside the US

1. **CASE mostly doesn't exist upstream.** The CASE ecosystem is US-centric; ministries in these countries publish curricula as official documents (gazettes, ministry PDFs/portals), not CASE JSON. A small number of jurisdictions have structured digital curriculum portals (see §20), but there is no standardized cross-country API. **Consequence:** the internal model stays CASE-*shaped* (Part I §7.2 works), but ingestion becomes document-based: fetch official doc → LLM-assisted structuring into items → human verification → publish internally.
2. **We mint identifiers.** No upstream GUIDs in most cases. Internal UUIDs become the alignment keys, with the country's own coding scheme (where one exists — e.g., Brazil's BNCC codes like `EF04MA01`, Spain's numbered *criterios de evaluación*) stored as `human_coding_scheme`. Add an `identifier_authority` discriminator so US CASE GUIDs and minted IDs coexist safely.
3. **"State" generalizes to "jurisdiction."** Three governance patterns:
   - **National curriculum:** France, Japan, South Korea, Turkey, Italy, (Brazil, Mexico — national base).
   - **Federal / subnational authority:** Canada (13 provinces/territories, no national curriculum), Germany (16 Länder; KMK sets shared *Bildungsstandards* at transition points).
   - **National base + regional elaboration:** Spain (state *enseñanzas mínimas* by royal decree; autonomous communities complete the curriculum), China (national MOE standards, provincial administration of exams).
4. **Grade systems don't line up.** France thinks in *cycles* and counts down (6e→terminale); Germany in Klassen 1–13 varying by Land; Korea resets numbering per school level. Normalize on **UNESCO ISCED 2011 levels** as the cross-country backbone, keep local labels for display.
5. **Matriculation is exam-centric.** Unlike US credit accumulation, most of these systems gate progression/graduation/university entry through national or regional exams: ENEM (BR), Brevet + Baccalauréat/Parcoursup (FR), zhongkao/gaokao (CN), Suneung/CSAT (KR), Common Test (JP), LGS/YKS (TR), EBAU/EvAU (ES), Esame di Stato/maturità (IT), Abitur & lower certificates (DE), provincial diplomas (CA), MCCEMS/varied entrance exams (MX). Model exams as first-class entities linked to curricula.
6. **Curriculum transitions overlap.** Several countries are mid-rollout (Korea's 2022 revised curriculum phasing 2024–2027; Turkey's Maarif Modeli from 2024; Italy drafting new *Indicazioni*; Japan revises roughly every 10 years). Two framework versions are simultaneously in force for different grade cohorts. `effective_from/effective_to` from Part I is necessary but not sufficient — see `framework_cohort_applicability` below.
7. **Language.** Authoritative text is in the local language. Store original as canonical; translations are derived artifacts with provenance. Embeddings must be multilingual (single multilingual model preferred over per-language models so cross-language retrieval works: English quest content ↔ Japanese standard).

## 16. Schema deltas

### 16.1 Jurisdictions (replaces `state_code` everywhere)

**Check first:** the international privacy table likely already has a country/jurisdiction table — reuse/extend it rather than duplicating. If not:

```sql
CREATE TABLE jurisdictions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code    char(2) NOT NULL,            -- ISO 3166-1: US, BR, FR, CA, CN, KR, JP, TR, ES, MX, DE, IT
    subdivision_code text,                       -- ISO 3166-2 where applicable: US-OH, CA-ON, DE-BY, ES-AN, CN-GD
    parent_id       uuid REFERENCES jurisdictions(id),
    name_local      text NOT NULL,
    name_en         text NOT NULL,
    governance_role text NOT NULL CHECK (governance_role IN
        ('national_authority','subnational_authority','national_base_regional_elaboration','coordinating_body')),
    default_language text NOT NULL,              -- BCP 47: pt-BR, fr-FR, zh-Hans, ko, ja, tr, es-ES, es-MX, de, it
    UNIQUE (country_code, subdivision_code)
);
```

**Migration:** `standards_frameworks.state_code` and `diploma_pathways.state_code` → `jurisdiction_id uuid REFERENCES jurisdictions(id)`. Backfill US states as `subnational_authority` rows under a US `coordinating_body` row.

### 16.2 Framework/item deltas

```sql
ALTER TABLE standards_frameworks
    ADD COLUMN jurisdiction_id uuid REFERENCES jurisdictions(id),
    ADD COLUMN language text NOT NULL DEFAULT 'en',           -- language of authoritative text
    ADD COLUMN identifier_authority text NOT NULL DEFAULT 'case_upstream'
        CHECK (identifier_authority IN ('case_upstream','internal_minted')),
    ADD COLUMN ingestion_method text NOT NULL DEFAULT 'case_api'
        CHECK (ingestion_method IN ('case_api','structured_portal','document_llm','manual'));

ALTER TABLE standards_items
    ADD COLUMN language text,
    ADD COLUMN isced_levels text[],              -- ['1','24','34'] ISCED 2011; cross-country grade backbone
    ADD COLUMN local_level_label text,           -- 'Cycle 3 / CM1', 'Klasse 8', '중학교 2학년', '4º ESO'
    ADD COLUMN verification_status text NOT NULL DEFAULT 'verified'
        CHECK (verification_status IN ('verified','llm_extracted_unreviewed','in_review'));
```

Rule: items with `verification_status != 'verified'` are admin-only — never learner-visible, never used for approved alignments. (US CASE ingest sets `verified` automatically; document-LLM ingest starts at `llm_extracted_unreviewed`.)

### 16.3 Grade normalization

```sql
CREATE TABLE grade_level_map (                   -- one row per (jurisdiction, local grade)
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id),
    local_label     text NOT NULL,               -- 'CM1', '6e', 'Klasse 5', '初二', 'Seconda media'
    local_stage     text,                        -- 'école élémentaire', 'collège', 'Grundschule', '初中', 'scuola secondaria di primo grado'
    isced_level     text NOT NULL,
    typical_age     int,
    app_grade_index int NOT NULL                 -- Peripateticware's internal 0–12 index for filtering/UX
);
```

### 16.4 Cohort applicability (overlapping curriculum rollouts)

```sql
CREATE TABLE framework_cohort_applicability (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_id    uuid NOT NULL REFERENCES standards_frameworks(id),
    school_year     text NOT NULL,               -- '2026-2027' (note: JP/KR school years start in spring)
    isced_levels    text[] NOT NULL,             -- which grades this version governs in that year
    notes           text
);
```

Answers "which framework applies to a Korean 8th grader in 2026-27?" during phase-ins.

### 16.5 Translations (canonical original + derived translations)

```sql
CREATE TABLE standards_item_translations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         uuid NOT NULL REFERENCES standards_items(id) ON DELETE CASCADE,
    language        text NOT NULL,
    full_statement  text NOT NULL,
    provenance      text NOT NULL CHECK (provenance IN ('official_translation','machine_translation','human_translation')),
    translated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (item_id, language)
);
```

Official translations exist for some sources (e.g., MEXT publishes English versions of Courses of Study; Korea's NCIC has an English portal) — always prefer `official_translation`. MT fills gaps for admin UX; label it as such in the UI. This mirrors the localization-quality practice of never letting MT silently impersonate source text.

### 16.6 Exams / matriculation gates

```sql
CREATE TABLE matriculation_exams (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id),
    name_local      text NOT NULL,               -- '大学入学共通テスト', 'Baccalauréat', '수능', 'ENEM', 'YKS', 'Abitur'
    name_en         text NOT NULL,
    gate_type       text NOT NULL CHECK (gate_type IN
        ('lower_secondary_exit','upper_secondary_exit','upper_secondary_entrance','university_entrance','placement')),
    administering_body text NOT NULL,            -- 'INEP', 'ÖSYM', 'KICE', ministry, Land, province
    based_on_framework_id uuid REFERENCES standards_frameworks(id),  -- exam ↔ curriculum link when official
    source_url      text NOT NULL,
    statute_citation text,
    effective_from  date,
    effective_to    date,
    notes           text
);
```

`diploma_pathways` (Part I §7.4) remains for credit/coursework-based graduation (US, Canadian provinces, Japan's HS credit system) and gains `jurisdiction_id`. A pathway can reference required exams via a join table `pathway_exam_requirements(pathway_id, exam_id, requirement_note)` — e.g., Ontario OSSD requires the OSSLT; German Abitur is both pathway and exam.

## 17. Ingestion pipeline delta (document-based countries)

New pipeline alongside the CASE ingest:

1. **Fetch:** poll registered official sources (ministry portals, official gazettes — see §20). Gazette RSS/pages are the change-detection layer: BOE (ES), DOU (BR), DOF (MX), Bulletin officiel (FR), Gazzetta Ufficiale (IT), KMK/Länder announcements (DE), MOE/MEB/MEXT news pages (CN/TR/JP), provincial ministry pages (CA).
2. **Snapshot & hash** (reuse Part I `html_page` machinery; add PDF handling).
3. **Structure:** LLM pass (existing `LLM_PROVIDER` switch) converts document sections → candidate `standards_items` with hierarchy, local codes, grade/cycle labels, in original language. Prompted per-country with that country's document conventions (e.g., BNCC's habilidade codes; Spain's competencias específicas / criterios de evaluación / saberes básicos triplets; France's attendus de fin de cycle).
4. **Verify:** admin review queue (same UI as alignment review) promotes `llm_extracted_unreviewed` → `verified`. **This human gate is non-negotiable** — LLM extraction of normative text will contain errors, and provenance claims ("aligned to the official curriculum") depend on it.
5. **Embed:** multilingual embedding model (dev agent: evaluate options available under current stack, e.g., multilingual-e5 family via Ollama vs. API embeddings; requirement = usable cross-lingual retrieval quality for the 9 languages in scope).

## 18. Frontend deltas

- Jurisdiction picker becomes country → (subdivision where applicable) → grade, driven by `grade_level_map` (display `local_label`, filter on `app_grade_index`).
- Standards chips show `human_coding_scheme` + original-language statement, with translation toggle (translation provenance badge: official / machine).
- Admin: per-country extraction review queue with side-by-side source document ↔ extracted items.
- Coverage dashboard gains exam view: coverage vs. the framework an exam is based on (`matriculation_exams.based_on_framework_id`).

## 19. Phasing (international)

- **Phase I-1 (prove the document pipeline):** Brazil + France. Rationale: single national authority; Brazil's BNCC is *already* item-coded (near-CASE-shaped, easiest structuring win); France exercises the cycle-based grade mapping. Both Romance languages adjacent to existing es/pt privacy work.
- **Phase I-2 (structured-portal jurisdictions):** Canada—Ontario & BC (both have digital curriculum portals; exercises subnational model), South Korea (NCIC database), Japan (MEXT + official English translations).
- **Phase I-3 (regional-elaboration + hard cases):** Spain (national mínimos first, communities later), Germany (KMK Bildungsstandards first, then 1–2 Länder, e.g., Bavaria's LehrplanPLUS portal), Mexico, Italy, Turkey.
- **Phase I-4:** China (source access/reliability from US hosting, language, and provincial exam variation make it the most operationally complex — validate polling feasibility of moe.gov.cn early, park if blocked).

## 20. Per-country source seed (VERIFY EACH before ingestion — several are mid-transition)

| Country | Curriculum authority & framework | Key sources to register | Matriculation gates | Structure notes |
|---|---|---|---|---|
| **Brazil** | MEC — **BNCC** (Educação Infantil, Fundamental 1–9, Médio) | basenacionalcomum.mec.gov.br; DOU (gazette) | **ENEM** (INEP) → SISU university entry | BNCC habilidades carry stable codes (`EF04MA01`) — best-structured source in scope |
| **France** | Ministère de l'Éducation nationale — socle commun + programmes per **cycle** (1–4) + lycée programmes | éduscol (education.gouv.fr/eduscol); **Bulletin officiel** (change feed) | DNB (end of collège); **Baccalauréat** (général/techno/pro); Parcoursup | Grade mapping via cycles; counts descending (6e→terminale) |
| **Canada** | **No national curriculum** — provincial. Start: Ontario, BC | Ontario digital curriculum portal; curriculum.gov.bc.ca (structured data); CMEC as reference only | **OSSD** (30 credits + OSSLT + community hours); **BC Dogwood** (80 credits + grad assessments); later: QC DES, AB diploma exams | Credit-based like US — Part I `diploma_pathways` fits directly |
| **China** | MOE — compulsory education curriculum standards (2022 revision) + senior high standards | moe.gov.cn | **Zhongkao** (HS entrance, municipal); **Gaokao** (provincial administration, national framework) | National standards, provincial exam variation; polling feasibility TBD |
| **South Korea** | MOE — **2022 Revised National Curriculum** (phasing 2024–2027) | **NCIC** ncic.re.kr (curriculum database, incl. English); KICE | **Suneung/CSAT** (KICE) | Overlapping-cohort case → `framework_cohort_applicability`; school year starts March |
| **Japan** | MEXT — **Courses of Study** (学習指導要領; current cycle in force 2020–22, ~10-yr revisions) | mext.go.jp (incl. official English translations) | HS graduation = 74+ credits; **Common Test for University Admissions** | Credit-based HS + national exam hybrid; school year starts April |
| **Turkey** | MEB — **Türkiye Yüzyılı Maarif Modeli** (phasing from 2024) | mufredat.meb.gov.tr; MEB announcements | **LGS** (HS placement); **YKS** (ÖSYM, university) | 4+4+4 structure; active transition — verify current phase-in grades |
| **Spain** | **LOMLOE**: state royal decrees set *enseñanzas mínimas*; autonomous communities complete curricula | **BOE** (consolidated law, good structured access) for RDs (Primaria/ESO/Bachillerato); community gazettes later | Título de ESO; Bachillerato; **EBAU/EvAU/PAU** (regional) | Two-tier: national mínimos Phase I-3, communities later; items = competencias específicas + criterios + saberes básicos |
| **Mexico** | SEP — **Nueva Escuela Mexicana / Plan de Estudios 2022** (fases 1–6, campos formativos); MCCEMS for media superior | gob.mx/sep; **DOF** (gazette) | Certificado de bachillerato; entrance varies (**EXANI-II**/Ceneval, UNAM/IPN exams) | Field/phase structure, not subject-grade — hardest conceptual mapping to items |
| **Germany** | **16 Länder** own curricula; **KMK Bildungsstandards** (IQB) at transition points (Primar, HSA, MSA, **Abitur**) | kmk.org; iqb.hu-berlin.de; Land portals (start: Bavaria **LehrplanPLUS** — structured portal) | Hauptschulabschluss / MSA / **Abitur** (per Land under KMK agreements) | Ingest KMK standards as national-reference framework first; Länder as elaborations |
| **Italy** | MIM — **Indicazioni nazionali** (primo ciclo; nuove Indicazioni in adoption — verify status/effective year) + Indicazioni/Linee guida for licei/tecnici/professionali | miur/mim istruzione.it; **Gazzetta Ufficiale** | Esame di Stato primo ciclo; **Esame di Stato / maturità** | Mid-transition — confirm which Indicazioni govern which cohorts before ingest |

## 21. Open issues (international)

| # | Question | Owner | Resolution |
|---|---|---|---|
| 7 | Reuse jurisdiction/country table from the existing privacy component, or new table with FK to it? | Dev agent — inspect privacy schema | **Resolved: new table.** `PrivacyConfiguration` (database.py:933-957) has `country_code`/`subdivision_code` columns but they're descriptive fields on a many-rows-per-place *regulatory-config* table (multiple privacy frameworks can apply to the same place) — not a queryable one-row-per-place dimension, so it can't be a clean FK target. Build `jurisdictions` (§16.1) as its own table; it already correctly reuses the same `country_code`/`subdivision_code` (ISO 3166-1/3166-2) column convention for consistency |
| 8 | Multilingual embedding model selection (local via Ollama vs API) + eval on 9 languages | Dev agent | **Partially resolved, needs a decision before Phase I-1 build:** current `embedding_service.py:18` hardcodes `all-MiniLM-L6-v2` (384-dim, English-centric) via Ollama, and **no embedding model at all is currently pulled** in this deployment's Ollama instance (only 4 chat models present: hermes3, mistral-nemo, qwen3, TowerInstruct). Recommend `bge-m3` (strong cross-lingual retrieval across 100+ languages, covers all languages in §20's country list) if available via Ollama — needs pulling either way. **Note:** if the chosen model's dimension ≠ 384, that's a real migration + full reindex of `rag_documents.embedding` — the one part of this design that isn't zero-migration, so decide before Phase I-1 starts, not after |
| 9 | Canada/Germany/Spain subnational scope for Phase I — confirm ON+BC, Bavaria, national-mínimos-only | Paul | **Resolved:** confirmed as designed — Ontario + BC, Bavaria (LehrplanPLUS), Spain national mínimos first |
| 10 | China feasibility spike: can moe.gov.cn be polled reliably from the home-hosted deployment? | Dev agent | **Still open** — requires a live connectivity spike at implementation time (Phase I-4), not resolvable via static code review. Per §19, park China if blocked rather than let it delay Phase I-1/I-2/I-3 |
| 11 | Every §20 row: verify current framework name, version, transition status, and canonical URL before building ingest for that country | Paul + dev agent (or research pass) | **Standing process requirement, not a one-time answer** — re-verify each country's row immediately before that country's ingestion work starts (per §22.4 step 1), not all upfront |
| 12 | Translation display policy: is MT of normative standards acceptable learner-facing with a badge, or admin-only? | Paul | **Resolved:** admin-only until `verified`/officially or human translated. MT never reaches learner-facing surfaces, matching §16.2's `verification_status` gate already in the design |

## 22. Extensibility contract — adding country #12+ with zero migrations

**Design invariant:** onboarding a new country (or subnational jurisdiction) must require only **data rows and configuration — never DDL, never new code paths hard-wired to a country.** The dev agent should treat this as an acceptance test: after Phase I-1 ships, adding a hypothetical new country must be demonstrable with migrations count = 0.

### 22.1 Harden the schema for this (small deltas to Parts I & II)

Country-variable vocabularies must live in **lookup tables, not CHECK constraints.** Replace these enums:

```sql
-- Subjects vary enormously across countries (SVT in France, Sachunterricht in Germany,
-- campos formativos in Mexico do not map 1:1 to US subjects). Two-level model:
CREATE TABLE subjects_canonical (               -- Peripateticware's own stable taxonomy (app-facing)
    id       text PRIMARY KEY,                  -- 'math','language_arts','natural_science','social_science',
    name_en  text NOT NULL                      -- 'arts','physical_education','technology','civics','other'
);
CREATE TABLE subjects_local (                   -- what the jurisdiction actually calls it
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id),
    name_local      text NOT NULL,              -- 'Sciences de la vie et de la Terre', 'Sachunterricht', 'Saberes y pensamiento científico'
    name_en         text,
    canonical_id    text NOT NULL REFERENCES subjects_canonical(id),  -- many-to-one; 'other' is legal
    notes           text
);
-- standards_frameworks.subject and graduation_course_requirements.subject
-- → subject_local_id uuid REFERENCES subjects_local(id)
```

Same treatment for other CHECKed vocabularies that new countries will strain:
- `matriculation_exams.gate_type`, `graduation_noncourse_requirements.requirement_type`, `diploma_pathways.pathway_type`, `content_alignments.alignment_type` → keep the CHECK **plus** an `'other'` value and a free-text `subtype` column, or promote to lookup tables. Rule of thumb: if a value is *about the world* (exam kinds, requirement kinds), it's a lookup table; if it's *about our pipeline* (`status`, `method`, `verification_status`, `ingestion_method`), a CHECK is fine because extending it legitimately IS a code change.
- `grade_level_map` and `jurisdictions` already generalize; `isced_level` stays the universal join key.

### 22.2 Country ingestion profiles are configuration, not code

Per-country extraction logic lives in a data-driven profile, executed by one generic pipeline:

```sql
CREATE TABLE ingestion_profiles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id),
    name            text NOT NULL,               -- 'BNCC habilidades v1', 'LOMLOE RD 217/2022 ESO'
    ingestion_method text NOT NULL,              -- matches standards_frameworks.ingestion_method
    config          jsonb NOT NULL,              -- document conventions: code regex ('^EF\d{2}[A-Z]{2}\d{2}$'),
                                                 -- hierarchy labels, item-unit definition (habilidade / criterio de
                                                 -- evaluación / attendu de fin de cycle), language, PDF vs HTML hints
    extraction_prompt text,                      -- the per-country LLM structuring prompt (versioned by row)
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

The pipeline (§17) reads the profile; no `if country == 'FR'` branches anywhere. Where a jurisdiction has a structured portal or CASE endpoint, `ingestion_method` + `config` (endpoint, format) select a generic adapter (`case_api`, `structured_portal:json`, `document_llm:pdf`, `document_llm:html`). New format = new adapter (a legitimate code change); new country on an existing format = rows only.

### 22.3 Nothing else may encode country knowledge

- **Frontend:** jurisdiction picker, grade labels, subject names, exam names all render from DB (`jurisdictions`, `grade_level_map`, `subjects_local`, `matriculation_exams`). No country lists, flags, or labels in React code or i18n files beyond generic UI chrome.
- **RAG/embeddings:** one multilingual model for all languages; language is a metadata filter, not a routing branch.
- **Jobs:** the scheduler iterates `standards_sources`; a new country's sources are just new rows with `poll_frequency`.
- **APIs:** all endpoints already parameterize by jurisdiction/framework ids — verify none grow country-specific parameters.

### 22.4 Country onboarding playbook (the repeatable procedure)

1. **Research pass** — identify: curriculum authority(ies) & governance pattern, current framework name/version and transition status, canonical portal + gazette URLs, exam gates, grade structure, subject taxonomy, item-unit and coding scheme, official-translation availability. (This is the §20-row-shaped deliverable; ~a day with an AI research pass + human check.)
2. **Seed jurisdictions** — country row (+ subnational rows if federal), governance_role, default_language.
3. **Seed `grade_level_map`** — local labels → ISCED → `app_grade_index`.
4. **Seed `subjects_local`** — local subject taxonomy → canonical mapping.
5. **Register `standards_sources`** — portal(s) + gazette with poll frequencies.
6. **Create `ingestion_profiles`** — config + extraction prompt; dry-run on one framework; iterate prompt until extraction QA passes (see step 8).
7. **Seed `matriculation_exams` + `diploma_pathways`** (with citations) — from the research pass.
8. **Pilot extraction + verification** — ingest one subject × one level; human-verify 100% of items; measure extraction error rate. Gate: < agreed threshold before ingesting the rest at sampled-verification rates.
9. **Cohort applicability** — if mid-transition, fill `framework_cohort_applicability`.
10. **Go live** — items to `verified`, alignments pipeline on, coverage dashboard sanity check.

Steps 2–10 touch zero migrations. If any step forces a schema change, that's a design bug to fix generically, not a country special-case.
