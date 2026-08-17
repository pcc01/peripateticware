# PRD / Technical Spec — RAG → GraphRAG Migration for Standards & Homeschool Reporting

**Product:** Peripateticware
**Component:** Standards/Homeschool retrieval pipeline + supporting Postgres schema
**Author:** Paul (drafted with Claude) | **Date:** 2026-08-16 | **Status:** Draft — ready for review
**Relationship to prior work:** This is a continuation of `PRD-standards-alignment-engine-2026-07-31_1.md`. That PRD already specified a graph-shaped schema (§7.1–7.2) for CASE standards; migration `20260807_case_standards.py` built those tables. This document (a) finishes the parts that PRD explicitly deferred (§7.3–7.5: `content_alignments`, embeddings, RAG integration), (b) makes the *retrieval pipeline itself* graph-aware (the actual "GraphRAG" change), and (c) unifies the two parallel standards systems that currently exist side by side.

---

## 1. What "review the build" found

### 1.1 Two standards systems exist, and they don't talk to each other

**System A — `StandardsSet` / `ActivityStandardsMap`** (`models/database.py:1316-1372`, `routes/standards.py`)
This is what's actually wired to the frontend today: `AdminStandardsPage`, `TeacherStandardsPage`, `HomeschoolRequirementsPage`, `StandardsImportPage`, `CurriculumImportPage`. A teacher/homeschool parent uploads a PDF/CSV, Ollama extracts a flat JSON list of criteria into `StandardsSet.criteria` (JSONB), and `ActivityStandardsMap` links an `Activity` to one criterion by string ID. No hierarchy, no cross-references — a criterion is a leaf in a list, not a node in anything.

**System B — CASE graph tables** (`jurisdictions`, `standards_sources`, `standards_frameworks`, `standards_items`, `standards_associations`, `standards_item_revisions` — migration `20260807_case_standards.py`, populated by `scripts/ingest_case_standards.py`)
This *is* graph-shaped already: `standards_items.parent_id` gives hierarchy (domain → cluster → standard), `standards_associations` gives typed cross-edges (`isChildOf`, `exactMatchOf`, `precedes`, …), `jurisdictions.parent_id` gives a place hierarchy (country → state → district). It's genuinely populated (561k `standards_items` rows, 683 frameworks, 32 jurisdictions in the local dev DB). But **nothing reads these tables**. I grepped every route, service, and agent — the only code that touches `standards_items`/`standards_associations`/`standards_frameworks` is the migration and the ingest script. Structurally correct, real data, and completely inert.

So today: the graph exists but isn't retrieved from, and the thing that *is* retrieved from (`StandardsSet.criteria`) has no graph shape. Fixing that gap is most of this plan.

### 1.2 The retrieval layer is flat single-hop vector search, plus some dead/broken code

- `routes/inference.py` `/rag-retrieve` — the one live retrieval path. Cosine-distance pgvector search over `rag_documents.embedding`, no traversal, no re-ranking, no hierarchy awareness. This is "RAG" in the plainest sense.
- `services/rag_orchestrator.py` (`HaystackRAGPipeline`) — **not used by anything reachable from a route.** It re-embeds every candidate document at query time via a hardcoded `nomic-embed-text` Ollama model instead of using a stored vector column, which is both slow and uses a *different embedding model* than the live path (`embedding_service.py` uses `all-MiniLM-L6-v2`). Two models nominally both claim 384 dimensions but are not the same vector space — if this code path were ever wired up alongside the live one, similarity scores would be meaningless. Recommend deleting it rather than migrating it.
- `agents/standards_mapping_agent.py` `run_with_retrieval()` — retrieval is **hardcoded to return zero candidates** (`candidates = []` with a comment admitting it's a stub). The anti-hallucination filter downstream is correctly written but has nothing to filter against, so this agent currently can never return a mapping grounded in real content.
- `agents/standards_ingestion_agent.py` `ingest_and_embed()` — computes an embedding per extracted standard, then **discards it** (only logs the dimension). It doesn't call the working insert path in `routes/standards.py::_index_standards_set_criteria`. Net effect: this agent's embeddings never reach `rag_documents`.
- `curriculum_units.content_embedding` — written as `[0.0] * 384` (`routes/curriculum.py:162`, literally commented `# Placeholder`) and never updated with a real embedding anywhere. The `/rag-retrieve` fallback that queries this column when `rag_documents` is empty will happily return zero-vector "matches" ranked by an arbitrary tie-break instead of failing loudly. This fallback is actively misleading and should be removed, not carried into the graph version.
- `rag_documents` (the live vector table) is created by a raw `CREATE TABLE IF NOT EXISTS` in `startup.py` at process boot, not by an Alembic migration — it's the same schema-bootstrap-drift pattern the codebase's own comments elsewhere warn about (see the `native_enum=False` comments in `models/database.py` describing enum-name mismatches caused by exactly this kind of dual bootstrap path). Worth fixing during this migration rather than perpetuating it in the new tables.

### 1.3 Net assessment

You don't need to bolt a graph onto a document-blob RAG system from scratch — half the graph substrate is already designed and migrated (thanks to the standards-alignment PRD). The actual work is: (1) make retrieval traverse it, (2) finish the tables that PRD explicitly left for later, (3) fold System A into the same shape as System B so there's one pipeline instead of two, and (4) delete the dead/broken code so the next person doesn't debug it thinking it's live.

---

## 2. Why GraphRAG fits this domain specifically (not just a trend to chase)

Standards data is graph-shaped by construction, not by choice of tooling:

- **Hierarchy**: a domain contains clusters contains standards contains sub-standards. A student "meeting" `CCSS.MATH.4.NF.A.1` is evidence toward its parent cluster too — a flat vector search can't express that, but a `parent_id` walk can.
- **Cross-references**: the same competency appears under different codes across frameworks (`exactMatchOf` between a state's adopted standard and the national CCSS original) and across state homeschool-reporting requirements. A parent/teacher asking "does this activity cover Texas's version of what my kid already did in the Common Core unit" is a graph-traversal question, not a similarity question.
- **Prerequisites**: `precedes`/`isRelatedTo` associations encode learning sequence — useful for "what should come next" recommendations, which pure vector similarity is bad at (semantically similar text isn't the same as pedagogically prerequisite).
- **Jurisdiction hierarchy**: a district's homeschool reporting requirement inherits from its state's; `jurisdictions.parent_id` already models this.
- **Content↔standard alignment** (once `content_alignments` exists, §4.3): "what else did students do that hit this same standard" is a graph join, not a text search.

None of that needs paragraph-level entity extraction from unstructured prose (the "extract a knowledge graph from documents" flavor of GraphRAG, e.g. Microsoft's approach). The graph here is **structural metadata the source data already has** (CASE's own object model). That makes this a cheaper, higher-confidence version of GraphRAG than the general case — recommend leaning into that rather than building a generic entity/relation extraction pipeline.

### Infra recommendation: stay in Postgres, don't add a graph database

- Current node/edge counts are in the thousands-to-low-tens-of-thousands range (state standards frameworks, not web-scale knowledge graphs). Postgres recursive CTEs over indexed `parent_id`/edge tables handle this fine.
- `docker-compose.yml` runs `pgvector/pgvector:pg16` — no Apache AGE, no separate graph engine. Adding Neo4j or AGE means a second datastore to deploy, back up, and secure (relevant given the existing small-scale deployment docs, `DEPLOY_SMALL.md`), for a workload that doesn't need it yet.
- The CASE tables are *already* a graph encoded the standard relational way (adjacency list + typed edge table). Keep using that pattern rather than introducing a second graph representation to keep in sync with the first.

**Recommendation: implement GraphRAG as "vector search finds seed nodes → recursive CTE / edge-table walk expands context" inside Postgres.** Revisit a dedicated graph engine only if node/edge counts grow by orders of magnitude (e.g., full 50-state, all-subject CASE ingest plus fine-grained content graphs) or if traversal queries become the dominant latency cost.

---

## 3. Target retrieval architecture

Replace the single-hop `/rag-retrieve` with a two-stage pipeline:

```
query text
   │
   ▼
[Stage 1: Seed retrieval]
   embed query → pgvector ANN search over node embeddings
   (standards_items, rag_documents-for-uploaded-criteria, curriculum content)
   → top-N seed node_ids (N ~ 10-15, wider than final top_k)
   │
   ▼
[Stage 2: Graph expansion]
   for each seed node:
     - walk parent_id up (ancestor path — gives terse standards their context,
       per PRD §7.5's existing note that ancestor path matters for embedding text)
     - walk standards_associations for isChildOf / exactMatchOf / precedes neighbors
     - walk content_alignments for "content already aligned to this standard"
     - walk jurisdictions.parent_id if a state/district filter is active
   → merged candidate set, deduped, tagged with relation to seed (self/parent/
     cross-reference/prerequisite/sibling-content)
   │
   ▼
[Stage 3: Rank + trim]
   combine vector similarity (seed nodes) with graph distance (expanded nodes)
   → final top_k, each item annotated with *why* it's included
     (not just a similarity score — "parent of top match" is a different kind
     of relevance than "0.83 cosine similarity" and the LLM prompt should say so)
   │
   ▼
   LLM (existing ai_router / LLM_PROVIDER switch — unchanged)
```

This is the standards-alignment PRD's own §8.3 "alignment suggestion pipeline" and §7.5 "ancestor path gives crucial context" notes, generalized into the general-purpose retrieval endpoint instead of being alignment-specific.

No new extraction step is needed for standards content — the graph edges already exist in `standards_associations`/`parent_id` once ingested. For **teacher-uploaded rubric/homeschool criteria** (System A content), there is no pre-existing graph — see §4.2 for how those get folded in.

"Community summaries" (the GraphRAG technique of clustering nodes and summarizing each cluster so broad queries don't need to enumerate every leaf): **use the existing `item_type` taxonomy (`Domain`/`Cluster`/`Standard`) instead of building a clustering pipeline.** CASE already groups standards into named clusters; a cluster node's `full_statement` plus a rollup of its children's statements is a perfectly good community summary and costs nothing extra to compute. Don't run Leiden/Louvain clustering on top of a taxonomy that already has groups.

---

## 4. Postgres schema changes

### 4.1 Finish PRD §7.3–7.5 (previously deferred)

```sql
-- Content ↔ standards alignment edge (the missing link between Activity/
-- CurriculumUnit content nodes and the standards_items graph)
CREATE TABLE content_alignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id      uuid NOT NULL,
    content_type    text NOT NULL,             -- 'activity' | 'curriculum_unit'
    item_id         uuid NOT NULL REFERENCES standards_items(id),
    alignment_type  text NOT NULL DEFAULT 'teaches'
                    CHECK (alignment_type IN ('teaches','assesses','requires','extends')),
    method          text NOT NULL CHECK (method IN ('ai_suggested','manual')),
    confidence      real,
    status          text NOT NULL DEFAULT 'suggested'
                    CHECK (status IN ('suggested','approved','rejected')),
    reviewed_by     uuid REFERENCES users(id),
    reviewed_at     timestamptz,
    rationale       text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (content_id, item_id, alignment_type)
);
CREATE INDEX ON content_alignments (item_id) WHERE status = 'approved';
CREATE INDEX ON content_alignments (content_id, content_type);
```

`diploma_pathways` / `graduation_course_requirements` / `graduation_noncourse_requirements`: build per PRD §7.4 DDL as written — out of scope for the RAG change itself, but note them here since they're the other half of "finish the deferred PRD tables" and share the jurisdiction FK.

### 4.2 Fold System A (`StandardsSet`) into the graph, don't run it in parallel forever

Two systems for "a thing a teacher checks off" is the kind of split that causes exactly the bugs this codebase's comments keep describing (enum mismatches from dual bootstrap paths, etc.) — recommend against maintaining both long-term.

- Add a migration path: when a `StandardsSet` is created/refreshed (`routes/standards.py::create_standards_set` / `refresh_standards_set`), instead of (or in addition to, during transition) writing to `StandardsSet.criteria` JSONB, materialize each criterion as a `standards_items` row:
  - `framework_id` → a new or existing `standards_frameworks` row with `source_id` pointing at a `standards_sources` row of type `'pdf'` representing "teacher/parent upload," `is_authoritative_over_uploads = false`.
  - `parent_id` → derive from `criterion.category` the first time a category is seen for that set (create a synthetic parent `standards_items` row of `item_type='Category'`); subsequent criteria in the same category attach under it. This is the cheapest way to give uploaded rubrics real hierarchy without new LLM extraction work — categories already exist in `standards_parser.py`'s output schema, they're just not linked today.
  - `raw` → the original criterion JSON, for forward-compat/debugging.
- `ActivityStandardsMap` becomes a **legacy read path**: keep it for existing rows, stop writing new ones, write new mappings to `content_alignments` instead (same shape, `content_type='activity'`). A view can union both for the coverage-report query (`routes/standards.py::get_coverage`) during transition so nothing breaks mid-migration.
- Once transitioned, `StandardsSet` itself becomes a thin "named collection" pointer (a saved view over a `standards_frameworks` row + its `standards_items`) rather than the source of truth for criteria content.

This is the biggest single-item of work in this plan and the one most worth scoping carefully — see §6 phasing.

### 4.3 Make `rag_documents` graph-aware

Today a chunk's link back to its source is a loosely-typed `(source_type text, source_id text)` pair with no FK — fine for "what created this chunk," useless for "what graph node does this chunk represent, so I can expand from it." Add:

```sql
ALTER TABLE rag_documents
    ADD COLUMN node_type text,              -- 'standards_item' | 'jurisdiction' | 'activity' | 'curriculum_unit'
    ADD COLUMN node_id   uuid;               -- FK-less polymorphic pointer, mirrors content_alignments.content_id pattern
CREATE INDEX ON rag_documents (node_type, node_id);
```

Stage 2 graph expansion (§3) needs `node_id` to know *which* `standards_items` row a chunk resulted from, so it can look up `parent_id`/`standards_associations` for that exact node instead of re-matching by fuzzy source_id string. Backfill for existing rows: `source_type='standards' AND source_id=<StandardsSet.id>` rows get `node_type='standards_item'` mapped through the §4.2 materialization; anything that can't be mapped stays `node_id = NULL` and is only reachable via Stage 1 vector search (no traversal for pre-graph content — acceptable, it just behaves like today's RAG until re-indexed).

Move `rag_documents` table creation out of `startup.py`'s `CREATE TABLE IF NOT EXISTS` and into a proper Alembic migration (it's the only one of the tables in this plan not already migration-managed) — this closes the schema-drift gap flagged in §1.2 rather than extending it into the new columns.

### 4.4 Embedding pipeline consistency

Standardize on one embedding model end-to-end (`embedding_service.py`'s `all-MiniLM-L6-v2` path — it's the one actually wired to the live `/rag-retrieve` and `_index_standards_set_criteria` code). Delete `services/rag_orchestrator.py` (§1.2) so the second, incompatible `nomic-embed-text` path can't be reintroduced by accident. Fix `standards_ingestion_agent.py::ingest_and_embed` to call the same insert path `routes/standards.py::_index_standards_set_criteria` uses instead of discarding its embedding result. Remove `curriculum_units.content_embedding` placeholder writes and the dead fallback query in `/rag-retrieve` that reads it (§1.2) — once curriculum content is migrated into `rag_documents`/`content_alignments` like everything else, that fallback has no remaining reason to exist.

### 4.5 Vector index parity

`rag_documents` already has an HNSW index (`startup.py:1201`, cosine ops) — carry that forward into the Alembic migration from §4.3. Add the same on any new embedding column introduced (there shouldn't need to be one — keep embeddings centralized in `rag_documents` rather than adding another `Vector()` column on `standards_items` itself, so there's exactly one embedding table to index and query, per the PRD §7.5 note that this was already the intended convention).

---

## 5. New/changed retrieval endpoint

Replace `/rag-retrieve`'s body with the two-stage flow (§3); keep the route signature backward-compatible (`query`, `top_k`, `source_type`) so existing frontend callers (`inferenceService.ts`, `ExtractionWizard.tsx`) don't need day-one changes. Add optional new params as the frontend adopts them: `jurisdiction_id` (filter/expand within a state's tree), `include_ancestors: bool`, `include_related: bool`. Response items gain a `relation` field (`"match" | "ancestor" | "cross_reference" | "prerequisite" | "aligned_content"`) so the UI (and the LLM prompt built from it) can distinguish "this is what you searched for" from "this is structurally connected to what you searched for."

`agents/standards_mapping_agent.py::run_with_retrieval` gets its stub replaced with a real call into this endpoint's Stage 1+2 — this is the fix that makes the existing anti-hallucination filter (already correctly written, currently filtering against nothing) actually do its job.

---

## 6. Phased implementation plan

**Phase 0 — cleanup (low risk, do first, unblocks everything else) — ✅ done 2026-08-16**
- Deleted `services/rag_orchestrator.py` and its test (`tests/test_rag.py`) — dead, Ollama-only, incompatible embedding model vs. the live path.
- Extracted `services/rag_store.py` (`upsert_rag_chunk`/`delete_rag_chunks`) as the one place that embeds + writes to `rag_documents`; `routes/standards.py`, `routes/inference.py`, and `agents/standards_ingestion_agent.py` all use it now instead of three separate hand-rolled INSERTs. Fixed `standards_ingestion_agent.py` to actually persist embeddings (it previously computed and discarded them).
- Removed the `curriculum_units.content_embedding` `[0.0]*384` placeholder and the `/rag-retrieve` fallback query that read it; `create_curriculum_unit` now indexes into `rag_documents` via the shared helper instead, so curriculum content flows through the one real retrieval path from day one instead of waiting for Phase 3.
- Added Alembic migration `20260816_rag_documents` bringing `rag_documents` under migration management (previously only a runtime `CREATE TABLE IF NOT EXISTS` in `startup.py`, §4.3); verified idempotent against the already-bootstrapped dev DB (`alembic upgrade head` ran clean, no duplicate objects, same table/index/FK shape). `startup.py`'s function stays as a defensive fallback for envs that never run Alembic.
- **Added, beyond the original Phase 0 scope — provider-agnostic generation/embeddings (see §9).** The RAG/standards pipeline no longer hard-requires Ollama.

**Phase 1 — finish the deferred PRD tables — ✅ `content_alignments` done 2026-08-16**
- Added migration `20260816b_content_alignments` (§4.1 DDL, exactly as specified). Applied to the local dev DB — verified table/indexes/constraints/FKs.
- **Found and fixed a blocking bug along the way:** `scripts/ingest_case_standards.py` imports `Jurisdiction`, `StandardsSource`, `StandardsFramework`, `StandardsItem`, `StandardsAssociation` from `models.database` — but none of those classes existed as ORM models in the code as committed. Migration `20260807_case_standards.py` created the tables via raw Alembic DDL only; nobody added the corresponding SQLAlchemy classes. Confirmed by actually importing the script: `ImportError: cannot import name 'Jurisdiction' from 'models.database'`. (The local dev DB's 561k existing `standards_items` rows must have been loaded some other way — an earlier version of the code, or a restored dump — not by running this script against the current repository state; either way, running it today, as committed, was broken.) Added all five ORM models (plus `StandardsItemRevision`, for the not-yet-built revision-review-queue job) to `models/database.py`, matching the migration's columns/constraints exactly; verified `configure_mappers()` succeeds and the ingest script now imports cleanly. This was a prerequisite for `content_alignments` anyway (needs `StandardsItem` as an ORM class to declare its FK against).
- `diploma_pathways` + requirement tables migration (per original PRD §7.4 DDL) — still deferred; independent of the RAG work, doesn't block Phase 2/3.

**Phase 2 — graph-aware `rag_documents` + retrieval rewrite — 🔶 in progress (2026-08-16)**
- ✅ `node_type`/`node_id` columns added (migration `20260816c_rag_documents_node_link`) — FK-less polymorphic pointer from a `rag_documents` chunk to its exact graph node, per §4.3.
- ✅ **Discovered a load-bearing gap before writing any retrieval code:** the CASE ingest (`scripts/ingest_case_standards.py`) had already populated real data — 561,092 `standards_items`, 683 frameworks, 32 jurisdictions in the local dev DB — but **zero** of it was in `rag_documents`. Only `StandardsSet` uploads were ever embedded. A vector-search-first retrieval pipeline would have had nothing to find for any CASE-sourced standard.
- ✅ Built `scripts/backfill_standards_embeddings.py` — resumable (skips already-indexed `node_id`s), batches commits, embeds `human_coding_scheme + full_statement + ancestor path` (parent chain resolved via a cached walk up `parent_id` — a bare sub-code like "A.1" means nothing without its ancestors, per the original PRD §7.5 note).
- ✅ Ran it against a 53-item pilot framework (Georgia's Personalized Learning Standards — chosen for having real hierarchy: 51/53 items with a parent, 53 `standards_associations` rows). Verified end-to-end: a semantic query ("help a student advocate for their own learning needs") correctly top-ranked the right standards via pgvector cosine search; a seed hit's `node_id` correctly resolves to its `standards_items` row, whose `parent_id` and `standards_associations` (`isChildOf`) independently agree on the same parent — confirming the graph-link column and the underlying CASE graph are both sound.
- ✅ **Embedding provider decided and verified:** Ollama + `qwen3-embedding:0.6b` (native 1024 dims, truncated to 384 via Ollama's `dimensions` param — confirmed Ollama actually honors this for Matryoshka-trained models). `embedding_service.py`'s Ollama adapter updated to request/verify the truncated dimension the same way the OpenAI adapter already did. Configured in `.env`.
- ✅ **`/rag-retrieve` rewritten as the two-stage pipeline.** New `services/graph_retrieval.py::expand_seeds()` walks `standards_items.parent_id` (recursive CTE, capped depth 5), `standards_associations` (directional relation mapping: `isChildOf`-as-origin/`precedes`-as-destination → `ancestor`/`prerequisite`, everything else → `cross_reference`; children-of-seed edges intentionally skipped to avoid unbounded subtree pulls), and `content_alignments` (→ `aligned_content`, query-ready but empty until Phase 3 populates that table). Route signature stays backward-compatible (`query`/`top_k`/`source_type` unchanged); new optional `jurisdiction_id`/`include_ancestors`/`include_related` params, the last two defaulting **on** so existing callers get graph-expanded results automatically. Every result item now carries a `relation` (`match`/`ancestor`/`cross_reference`/`prerequisite`/`aligned_content`) instead of being presented as an undifferentiated similarity list. Verified directly against real association data (all 3 relation-mapping branches individually confirmed against live `precedes`/`isChildOf` edges) and via the FastAPI app's route registration (correctly 403s unauthenticated rather than 500ing — full auth-flow test not run, logic already verified at the query level).
- ✅ **Fixed a real, load-bearing performance bug found while testing the backfill at scale:** `embedding_service.py` opened a brand-new `httpx.AsyncClient` (and thus a new TCP connection) per embed call. Fine in short bursts, but under sustained concurrent load throughput decayed continuously and without bound — 34/sec for the first ~900 items, then steadily down to <14/sec by item ~1300, with no sign of leveling off (confirmed reproducible across independent runs, and independent of concurrency level — only the speed of onset changed). Switched to a shared, pooled client reused for the process's lifetime (the standard httpx pattern for long-lived apps). Re-tested sustained for 3900+ items at concurrency=24: throughput now plateaus around **~18 items/sec** instead of continuing to decay — bounded and predictable, not fixed to the initial 34/sec burst rate, but no longer degrading indefinitely.
- 🔶 **Full ~561k-row backfill launched** (`docker exec -d`, detached, `--concurrency 24`, logging to `/tmp/full_backfill.log` inside the `peripateticware-backend` container) — running in the background as of this update. At the measured ~18/sec plateau, full completion is ≈8.5 hours. Resumable — safe to check on, and safe to re-run `--all` if it's interrupted; already-indexed rows are skipped.

**Phase 3 — fold `StandardsSet`/`ActivityStandardsMap` into the graph (§4.2) — ✅ done 2026-08-16**
- New `services/standards_graph_fold.py::materialize_standards_set()` — one `standards_frameworks` row per `StandardsSet` (**same id as the set itself**, so no separate mapping table is needed), one `standards_items` row per criterion grouped under synthetic per-category parent nodes (`item_type='Category'`). Ids are deterministic (`uuid5`, namespaced by set id + criterion id/category), so re-running on a refresh upserts in place — verified idempotent directly (re-materializing North Dakota's 53-criterion/18-category set twice produced exactly 53+18 rows both times, no duplicates).
- Turned out to be **purely additive, not a risky cutover** — no feature flag needed. `StandardsSet.criteria` (JSONB) is untouched and still the teacher-facing source of truth; materialization runs alongside the existing embed-into-`rag_documents` step (now also linking each chunk's `node_type`/`node_id` to its graph node) and is idempotent/safe to call repeatedly. `ActivityStandardsMap` keeps being written exactly as before; `map_activity_to_criterion` additionally (best-effort, non-fatal on failure) writes a matching `content_alignments` row (`method='manual'`, `status='approved'` — no separate review step in this flow). Nothing is removed or made read-only in this pass.
- `get_coverage` now unions both: legacy `ActivityStandardsMap` rows plus approved `content_alignments` rows (matched back to a criterion via the same deterministic id — a pure function, so this read endpoint doesn't need materialization to have already run), deduped so a criterion mapped through both paths for the same activity doesn't double-count. Verified end-to-end against real data (an existing completed `learning_sessions` row + a `content_alignments` row correctly showed `met=True` with the right criterion match).
- `agents/standards_mapping_agent.py::run_with_retrieval`'s zero-candidates stub (the reason its own anti-hallucination filter was a permanent no-op — see §1.2) now does a real pgvector search + `expand_seeds()` graph expansion, same store and expansion logic as `/rag-retrieve`. Verified end-to-end: a real submission-text query returned genuine graph-backed candidates and a successful classification.
- **Found in passing, unrelated to this migration but fixed on request (2026-08-16):** `AgentRun.created_at`'s ORM default (`datetime.now(timezone.utc)`, timezone-aware) didn't match its DB column (`TIMESTAMP WITHOUT TIME ZONE`) — every agent run's audit-log write was failing (non-fatally, caught and logged) with an asyncpg naive/aware datetime error, so `agent_runs` was silently never being written to at all, for any agent. Fixed in `models/agent_run.py` by switching to `default=datetime.utcnow` (naive), matching both the actual DB column and this codebase's convention everywhere else (`models/database.py`'s many `default=datetime.utcnow` columns). Verified: a real `standards_mapping` agent run now writes a row to `agent_runs` with no error, where it previously errored every time.

**Phase 4 — frontend adoption — ✅ done 2026-08-16**
- **Found while starting this phase: `/rag-retrieve` had zero frontend consumers.** `inferenceService.ts::ragRetrieve` existed but was never called from any page/component, and its response type (`RagRetrieveResponse`) didn't match the real backend contract at all (wrong field names, and unwrapped the response as `response.data.data` against an endpoint that returns its payload directly with no `{data: ...}` envelope — same bug in `generateTextEmbedding`, fixed alongside it). This wasn't a regression from the Phase 2 rewrite; the type was already wrong before it, just never exercised. So "surface `relation` in existing results" wasn't available as an enhancement — there was no existing surface. Built one instead:
  - Fixed `RagRetrieveResponse`/added `RagDocument` types in `types/api.ts` to match the real backend shape (including `relation`, `expanded_from`, `node_type`/`node_id`), and fixed `inferenceService.ts`'s response unwrapping and `ragRetrieve()`'s params (added `jurisdictionId`/`includeAncestors`/`includeRelated`, matching the rewritten endpoint's query params).
  - New `components/shared/StandardsExplorer.tsx` — search box over the standards graph; each result is badged by `relation` (Match/Ancestor/Cross-reference/Prerequisite/Aligned content, distinct colors) rather than shown as a flat ranked list, plus a summary line ("N direct matches, M related via the standards graph"). Wired into both `AdminStandardsPage` and `TeacherStandardsPage` (the two pages the original plan named).
- **Coverage rollup — done via the real, already-wired-up page**, not the pages originally named. `HomeschoolCoveragePage`/`AdminStandardsPage`/`TeacherStandardsPage` don't actually render coverage — checked and found the real consumer is `HomeschoolCoveragePage`, backed by `routes/homeschool.py::coverage_summary` (a separate, independent implementation from `routes/standards.py::get_coverage` that Phase 3 had already updated — this one still only read `activity_standards_map`). Extended it with the same content_alignments union + dedup pattern as Phase 3's `get_coverage` fix, using an ORM `select()`/`.in_()` query rather than raw-SQL `ANY(:param)` (a variable-length UUID array bound into raw text() SQL is an easy place to get asyncpg's array-type inference subtly wrong). Verified: the query executes correctly against real data, and the dedup logic was directly tested against a simulated case where both write paths exist for the same (activity, criterion) pair (confirmed no double-count). Full hierarchy-rollup-through-`parent_id` (the "3 of 4 sub-standards → partial cluster progress" idea) is not built — the current criteria views are flat lists, and building a tree UI for that specific idea was more scope than this pass covered; the graph data it would need (via `standards_items.parent_id`) is already there for whoever picks it up next.
- Frontend TypeScript compiles clean (`tsc --noEmit`, 0 errors) across all changed/new files.

---

## 7. What this deliberately does *not* do

- No separate graph database (Neo4j/AGE/etc.) — see §2's infra recommendation. Reassess only if scale changes materially.
- No unstructured-document entity/relation extraction pipeline (the generic "GraphRAG over arbitrary text" technique) — the standards domain's graph is already given by the CASE data model; building an extraction pipeline on top would be solving a problem this data doesn't have.
- No Leiden/Louvain-style community detection — CASE's `item_type` hierarchy already provides community structure.
- Doesn't touch `graduation_course_requirements`/diploma pathway modeling beyond noting it shares infrastructure — that's a separate feature, not part of making RAG graph-aware.

---

## 9. Provider-agnostic generation & embeddings (added 2026-08-16, folded into Phase 0)

**Requirement:** the RAG/standards pipeline must not assume a local Ollama server. A deployment may instead run entirely against hosted or self-hosted LLM APIs (Claude, OpenAI, Azure OpenAI, or any OpenAI-wire-compatible server — vLLM, LiteLLM proxy, LM Studio, etc.).

**What was already provider-agnostic:** `services/ai_router.py` and `agents/base_agent.py`/`agents/provider.py` already resolved a provider per call (`LLM_PROVIDER`, per-agent env var overrides) rather than hardcoding Ollama — but the resolver only actually implemented two providers (`ollama`, `claude`); an `AIProvider.OPENAI` enum value and rate existed in `ai_router.py` with no working adapter behind it.

**What was hardcoded to Ollama and has now been fixed:**
- `services/embedding_service.py` — embeddings only ever called Ollama's `/api/embed`. Now resolves `EMBEDDING_PROVIDER` (falls back to `LLM_PROVIDER`, then `ollama`) between an Ollama adapter and an OpenAI-shaped adapter (`OPENAI_BASE_URL` + `OPENAI_API_KEY` — real OpenAI by default, but works against Azure OpenAI or any compatible embeddings server since almost everything self-hosted now speaks that wire format). Anthropic has no embeddings endpoint of its own, so `EMBEDDING_PROVIDER`/`LLM_PROVIDER=claude` remaps to the OpenAI-shaped adapter rather than failing — set `OPENAI_BASE_URL` to point at Voyage AI or another compatible embeddings host if that's what's actually running. Requests `dimensions=384` (OpenAI's `text-embedding-3-*` support truncation via Matryoshka representation learning) to stay compatible with the existing `vector(384)` columns/HNSW indexes without a schema change; if a server returns a different dimension anyway, that's surfaced as an explicit error rather than silently stored — naive client-side truncation isn't mathematically valid for arbitrary embedding models.
- `agents/provider.py` — added a real `call_openai()` adapter (text + vision), extended `resolve_provider()`/`resolve_model()`/`dispatch()` to recognize `"openai"` as a first-class third provider alongside `ollama`/`claude` (previously anything not `"claude"` silently fell through to Ollama, including typos). Every `BaseAgent` subclass (`StandardsIngestionAgent`, `StandardsMappingAgent`, etc.) gets this for free since they all route through `dispatch()`.
- `services/standards_parser.py::extract_criteria` — the teacher/homeschool document-upload extraction path had its own direct `ollama.Client(...)` call, bypassing the shared provider abstraction entirely. Now routes through `agents/provider.py` via a new `AGENT_STANDARDS_EXTRACTION_PROVIDER` setting (blank → inherits `LLM_PROVIDER`).
- `services/document_parser.py::_extract_pdf_ocr` — the scanned-PDF OCR fallback (vision call) had the same direct-Ollama pattern. Now routes through `dispatch()` with `images=[...]` via a new `AGENT_DOCUMENT_OCR_PROVIDER` setting; Ollama still needs its dedicated `OLLAMA_MODEL_VISION` (its default text model isn't vision-capable), but Claude/OpenAI's configured default chat models already are, so no extra vision-model setting was needed for those two.
- `agents/provider.py`'s `call_claude`/`call_ollama`/`call_openai` all gained an optional `images: list[str]` param (base64 PNGs, attached to the last user turn in each provider's native shape) and `temperature` param, so vision and low-temperature-structured-output calls work uniformly across all three providers instead of being Ollama-specific behavior that silently vanished for other providers.

**Found but intentionally left alone (out of scope for the RAG pipeline):** `routes/activities.py` (draft activity suggestions) and `routes/rubrics.py` (`generate_rubric_criteria`) also call `ollama.Client(...)` directly. Neither is part of the standards/RAG retrieval pipeline this document covers — flagging here as a follow-up for whoever next touches those features, not fixed as part of this pass.

---

## 10. Open questions for Paul

1. ~~Phase 3 (folding `StandardsSet` into the graph) is the highest-risk, highest-value piece — confirm appetite for a feature-flagged parallel-write period vs. a harder cutover.~~ **Resolved:** turned out purely additive, no flag needed — done, see Phase 3.
2. ~~Should uploaded rubric/homeschool criteria ever be eligible for `is_authoritative_over_uploads = true`...~~ **Resolved 2026-08-17:** an upload is authoritative for its jurisdiction until a CASE framework exists for that same jurisdiction; a subsequent CASE ingest demotes it. **Implemented and verified** (§11).
3. ~~Priority: is closing the `standards_mapping_agent` stub...~~ **Resolved:** done, see Phase 3.

## 11. Authoritativeness policy implementation (2026-08-17)

Per Paul's decision on open question #2 above: `services/standards_graph_fold.py::_get_or_create_framework` now resolves `StandardsSet.state_code` to a `jurisdictions` row (get-or-create, matching `scripts/ingest_case_standards.py`'s own seeding convention — `country_code='US'`, `subdivision_code=f'US-{code}'` — so both paths land on the same row regardless of which runs first) and sets `is_authoritative_over_uploads = True` unless a non-upload-sourced (`standards_sources.source_type != 'pdf'`, i.e. a real CASE) framework already exists for that jurisdiction. The reverse direction lives on the ingest side: `ingest_case_standards.py::_demote_uploads_for_jurisdiction`, called right after a CASE framework is upserted, demotes any currently-authoritative upload-sourced framework in the same jurisdiction.

Verified all three cases directly against real + constructed data:
- Re-materializing the real North Dakota math upload (which has genuine CASE data already ingested for ND) → correctly `False`.
- A synthetic Wyoming upload (a state with zero CASE presence in this dataset) → correctly `True`.
- Simulating a CASE framework landing for that same synthetic Wyoming jurisdiction → the previously-authoritative upload correctly flips to `False`.

Nothing downstream (retrieval ranking, coverage display) reads this flag yet — same as the original PRD's own framing, it's a precedence signal for future consumers, not yet wired into ranking logic. That remains a natural next step, not done here.

---

## 12. Graph-expansion latency: found, fixed (2026-08-17)

Requested by Paul: a real query ("How do I teach students to understand ratios and proportional relationships?") run against the live pipeline, compared to what the flat pre-migration system would have returned.

**Quality result:** genuinely better, not marginally — same 5 top matches as flat vector search (same embeddings), plus ancestor-chain context for each, plus one real prerequisite catch a similarity search alone would never surface: *"Demonstrate a ratio relationship with whole numbers using pictures or numbers"* (an earlier-grade foundational skill, correctly reached via a `precedes` edge — it doesn't share much vocabulary with the query, so cosine similarity wouldn't have ranked it highly on its own).

**Latency result — a real problem, found and fixed in the same pass:** `services/graph_retrieval.py::expand_seeds` looped over each seed and issued up to 3 separate queries per seed (ancestors, associations, aligned content) — an N+1 pattern. Measured against real data: **955ms–2.8s** for a 5-seed request, confirmed consistent across repeated trials (not a fluke/cold-cache artifact). Fixed by batching: `_fetch_ancestors_batch`/`_fetch_associations_batch`/`_fetch_aligned_content_batch` now each run **one query covering every seed at once** (a single recursive CTE seeded with all seed ids for ancestors; `ROW_NUMBER() OVER (PARTITION BY seed_id ...)` instead of a plain `LIMIT` for the other two, so per-seed result caps survive batching without starving richly-connected seeds). SQLAlchemy's `bindparam(..., expanding=True)` handles the variable-length UUID list safely (verified directly — same reasoning as the `routes/homeschool.py` fix in Phase 4, avoiding raw `= ANY(:param)` array binding).

**Result: 955ms-2.8s → 85-188ms — roughly 15-20x**, same result set (verified: same ancestor chains, same prerequisite catch, item count consistent). Full backend test suite stayed green (267 passed, 1 pre-existing unrelated failure) through the change.

### Further latency/quality options surfaced, not implemented (would need a scoping decision)

- **Query result caching** (Redis, already in the stack) for repeated/near-duplicate queries — meaningful for a classroom where many students ask similar things, but needs a TTL/invalidation strategy decision (standards data changes rarely; a long TTL is probably fine, but that's a product call, not just an engineering one).
- **Richer association-type coverage.** `_fetch_associations_batch` only gives 3 relation labels distinct meaning (`ancestor`/`prerequisite`/catch-all `cross_reference`); the real ingested data has more CASE association types (`isPartOf`, `ext:isAlignedTo`, `exemplar`, `ext:hasSubstitute`, `replacedBy`) currently all folded into `cross_reference`. `replacedBy` in particular is arguably its own category (a superseded/deprecated standard) worth surfacing distinctly rather than lumped in as "related."
- **Jurisdiction-aware result labels.** A `cross_reference` result's `full_statement` doesn't currently say *which* state/framework it's from — a teacher comparing "my state's version vs. Texas's" would need to click through rather than see it at a glance. Would need joining `standards_frameworks.jurisdiction_id → jurisdictions.name` into the expansion queries.
- **Use `is_authoritative_over_uploads` in ranking** (§11) — now that the flag is set correctly, nothing yet prefers an authoritative framework's standards over a demoted upload's when both could plausibly match a query. Not urgent (few jurisdictions have both today) but will matter more as CASE coverage grows.
- **HNSW index tuning** for the base vector search (`ef_search`, currently pgvector defaults) — not investigated; the base search is already fast (60-90ms) at current data volume, so likely not the next bottleneck, but worth revisiting once the full ~561k-row backfill completes and the index is at final size.

---

## 13. GPU/embedding throughput: batching beats concurrency (2026-08-17)

Requested by Paul: reduce how long the remaining backfill takes. Checked GPU placement first (`/api/ps`: `size_vram == size`, the whole `qwen3-embedding:0.6b` model is resident in VRAM — not a CPU-fallback problem) before looking at request patterns.

**Finding:** Ollama's `/api/embed` accepts a *list* of texts in `input`, not just a single string — embedding many texts in one request is dramatically more efficient than the same count of concurrent single-text requests, on the same GPU:

| Approach | ms/item |
|---|---|
| 20 concurrent single-item requests | 193ms |
| 2 concurrent batches of 10 | 122ms |
| 1 batch of 20 | 109ms |
| 1 batch of 100 | **14ms** |
| 1 batch of 200 | 14.5ms (no further gain) |
| 1 batch of 400 | **fails** — Ollama's internal tokenizer subprocess connection refused |

Batch=100 is ~13x more efficient per item than the original one-request-per-item pattern (with up to 24-way client concurrency) — the GPU does one batched forward pass instead of many small ones, and per-request overhead is paid once instead of N times. There's a real ceiling somewhere between 200 and 400 (an internal Ollama instability, not a client-side limit); 100 is a deliberately conservative choice with margin, not the measured maximum.

**Implemented:** `services/embedding_service.py` gained `_embed_batch_with_ollama`/`_embed_batch_with_openai` (OpenAI's `/embeddings` also accepts a batched `input` array; response items carry an `index` field, sorted on explicitly rather than trusted to come back in submission order) and `EmbeddingService.embed_texts()` — previously dead code (imported in `routes/inference.py`, never actually called — verified before changing its behavior) that looped calling `embed_text()` once per item — now chunks into batches of `_MAX_BATCH_SIZE` (100) and does one provider call per chunk. `scripts/backfill_standards_embeddings.py` rewritten to match: `BATCH_SIZE = 100`, one `embed_texts()` call per DB-commit batch, the old semaphore/`--concurrency` machinery removed entirely (batching replaced what concurrency was trying to achieve, more effectively).

**Result, restarted against the live backfill:** the old process (still running the pre-batching code — a fresh process pickup was needed to load the change) was stopped and a new one launched; **stable 52-55 items/sec** sustained across 5,600+ items with no decay (vs. the connection-pooling fix's ~18 items/sec plateau from §11's predecessor finding — batching also incidentally eliminates the earlier per-request-connection-churn issue almost entirely, since 100x fewer HTTP requests means 100x fewer connection-setup events). **ETA dropped from ~8.5 hours to ~2.2 hours** for the remaining ~422k items. Fully resumable — stopping and restarting the script picks up exactly where it left off, verified during this same restart.

Full backend test suite green throughout (267 passed, 1 pre-existing unrelated failure).

---

## 14. Voyage AI as a third embedding provider; prod deploy prep (2026-08-17)

Prod runs Anthropic only (no local Ollama, no OpenAI key) — Claude has no embeddings endpoint of its own, so `/rag-retrieve`'s live query embedding (and any future content indexing) would have nothing to call there. Paul asked for a cost/quality comparison of Voyage AI (Anthropic's own recommended embeddings partner) vs. OpenAI before deciding.

**Comparison** (pulled from Voyage's current docs, not stale training data): both have a cheapest tier at $0.02/1M tokens; Voyage's `input_type=query`/`document` asymmetric-embedding feature (tunes the embedding differently depending on whether the text is a search query or indexed content — neither Ollama nor OpenAI's API offers this) is a genuine retrieval-quality fit for this exact two-stage seed-then-expand design; against the measured corpus (~23M tokens across all 561k standards_items, avg 164 chars/chunk), backfilling via Voyage costs under $1-3 one-time regardless of tier, likely $0 under Voyage's 200M-token first-time free allowance. Tradeoff: Voyage's `output_dimension` is a fixed enum (256/512/1024/2048) — no 384, unlike Ollama/OpenAI's arbitrary Matryoshka truncation. Paul chose Voyage.

**Implemented:**
- `services/embedding_service.py`: `_embed_with_voyage`/`_embed_batch_with_voyage`, using Voyage's actual wire format (`output_dimension` not `dimensions`, `input_type` support) rather than routing through the OpenAI-shaped adapter — the two APIs are close but not identical, and reusing the OpenAI path would have silently dropped `input_type` entirely, giving up the actual reason to pick Voyage. `embed_text()`/`embed_texts()` gained an `input_type: "query"|"document"|None` parameter, threaded through to every call site: `rag_retrieve` and `standards_mapping_agent`'s candidate search pass `"query"`; `ingest_document`, `rag_store.upsert_rag_chunk`, and `backfill_standards_embeddings.py` pass `"document"`. Ignored by Ollama/OpenAI, so this is a no-op for those providers.
- `core/config.py`: `VOYAGE_API_KEY`, `VOYAGE_BASE_URL`.
- New migration `20260817_rag_documents_dim.py`: resizes `rag_documents.embedding` to `settings.VECTOR_DIMENSION` **read at migrate time**, not hardcoded — a deployment that stays at the 384 default (local dev, still on Ollama) hits a no-op branch; a deployment that sets `VECTOR_DIMENSION=512` (prod, for Voyage) gets the column actually resized + HNSW index rebuilt the first time `alembic upgrade head` runs there. Verified both branches directly: re-ran against the live dev DB (already at 384) — confirmed no-op, existing 229k+ embedded rows untouched; separately verified the actual resize+reindex SQL against an isolated scratch table (384→512, index rebuilt, row preserved with embedding correctly nulled).
- Found and fixed a real bug while smoke-testing the new no-API-key fallback path: `EmbeddingService._embed_mock()` (the safety net used whenever a configured provider is unreachable/misconfigured — not new, always existed) crashed with `ValueError: invalid literal for int() with base 16: ''` for any `VECTOR_DIMENSION >= 16`, i.e. always — a slice-arithmetic wraparound bug (`(i*2) % 32 : (i*2+2) % 32 + 1` produces an empty slice at `i=15`). This silently broke the exact resilience behavior the whole provider-agnostic design depends on (degrade to mock rather than hard-fail). Fixed by extending the hash material to a contiguous length instead of wraparound-slicing a fixed 32-char digest. Confirmed reproducible before the fix via any misconfigured provider (tested both `openai` with no key and `voyage` with no key — same crash, so this predates the Voyage work and wasn't introduced by it).
- `.env.example` and README's AI Configuration section updated with a Voyage subsection (config block + the `VECTOR_DIMENSION` resize/re-backfill note).

Full backend test suite green after both the provider work and the mock-embedding fix (267 passed, 1 pre-existing unrelated failure).

**Also found while preparing the prod deploy** (separate from the Voyage work, but blocking it): prod's deploy path has never actually run `alembic upgrade` — schema changes ship as idempotent inline-SQL patches in `startup.py` instead. The GraphRAG migrations (`20260807_case_standards`, `20260816_rag_documents`, `20260816b_content_alignments`, `20260816c_rag_documents_node_link`, and now `20260817_rag_documents_dim`) have no such fallback — a plain `git pull` + `docker compose up` would silently skip creating `content_alignments`/the CASE standards tables, and every GraphRAG endpoint would 500 on prod. Fixed in `docker-compose.prod.yml`: the backend's prod command now runs `alembic upgrade head &&` before starting gunicorn (once per container start, before workers fork, no-op once applied — safe to leave in permanently).

**Deploy plan (in progress):** copy the provider-independent structural tables (`jurisdictions`, `standards_sources`, `standards_frameworks`, `standards_items`, `standards_associations` — plain CASE text/structure, no embeddings, safe regardless of embedding provider) from local dev to prod via `pg_dump`/`psql` once prod is deployed. Deliberately **not** copying `rag_documents` — those rows are embedded with Ollama's `qwen3-embedding:0.6b` locally, which is a different, incompatible vector space from whatever prod's Voyage-embedded vectors will be. Prod gets its own `rag_documents` populated by running `backfill_standards_embeddings.py` there directly, against the copied structural tables, once `EMBEDDING_PROVIDER=voyage`/`VOYAGE_API_KEY`/`VECTOR_DIMENSION=512` are set in prod's `.env`.
