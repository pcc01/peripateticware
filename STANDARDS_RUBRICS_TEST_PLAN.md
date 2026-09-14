# Standards & Rubrics — Test Plan

> Created: 2026-09-13
> Scope: `backend/routes/standards.py`, `backend/routes/rubrics.py`, `backend/routes/homeschool.py` (coverage/report/export), `backend/services/standards_graph_fold.py`, `backend/services/graph_retrieval.py`, `backend/services/export_service.py`
> Companion to: the "Standards, Rubrics & Levels" source brief and the code audit performed 2026-09-13 (published artifact `93794b74-…`), and `fix/ai-route-provider-agnostic` (this session — Ollama→provider-agnostic fix for taxonomy classify + rubric AI-generation).
> Out of scope: taxonomy classification and grade-level settings (covered by the earlier audit; no open functional gaps there beyond what that fix already closed).

---

## 0. Update 2026-09-13 — the blocking gap is closed

**Built:** `POST /activities/teacher/submissions/{session_id}/score-rubric`. A teacher can now save (partial or complete) per-criterion rubric scores, which merge into `activity_submissions.rubric_scores` and auto-flip `submission_status` to `'graded'` with a computed `grade` once every criterion has a score. `GET .../detail` (the frontend's real submission-detail call) now returns the attached rubric definition and current scores in one round trip; `TeacherSubmissionsPage.tsx` renders a scoring panel wired to it.

**Also built, requested directly:** the same endpoint independently accepts a `standards_evaluation` list — a teacher's verdict (`not_met`/`partial`/`full`/`exceeds`) on whether *this specific submission* met each state/curriculum standard the activity is mapped to. This is new: `activity_standards_map` had no student dimension before, and `get_coverage`'s `met` flag used to be `times_addressed > 0` — true for any completed activity regardless of quality, with no way to express "this student did not meet this standard" at all. `routes/standards.py::get_coverage` and `routes/homeschool.py::coverage_summary` now both prefer this explicit verdict over the old completion-based heuristic when one exists (each coverage item flagged `evaluated: true/false`). Verified live: scoring a rubric to 88% and separately marking its mapped standard `not_met` correctly dropped that criterion out of `criteria_met` — previously inexpressible.

**Found and fixed along the way, not a rubric-scoring bug but blocking it entirely:** `AssessmentRubric.framework` was declared as a native Postgres enum with no matching DB type ever created — every `POST /rubrics` call had always 500'd. `assessment_rubrics` had zero rows in the dev DB because rubric *creation* was broken, not because scoring was untested. Fixed (`native_enum=False`).

§3.4 and §5 below are updated to test the real, built behavior. The rest of this document (§1–2, §3.1–3.3, §4, §6) still applies as originally written.

<details>
<summary>Original 2026-09-13 note (kept for record — the gap this closed)</summary>

There was no working path — frontend or backend — for a teacher to score a submission against a rubric. The frontend's `scoreAssignment()` (`frontend/src/services/api.ts:382`) posted to `POST /assessment/score`, which existed nowhere in the backend and was itself never called from any component — dead code on both ends. The one thing that did apply a rubric to a submission, `agents/rubric_scoring_agent.py` (`POST /agents/rubric/score`), never wrote to the database and had no frontend caller either. This is why `activity_submissions.rubric_scores` was `NULL` on every row in the dev database: unbuilt, not untested.

</details>

---

## 1. Test environment

| Item | Value |
|---|---|
| Stack | `docker compose up -d` from repo root — `peripateticware-backend`, `-postgres`, `-redis`, `-frontend` |
| Backend health | `curl http://localhost:8000/health` → `{"status":"ok"}` |
| Test accounts (dev seed, `SecurePass123!`) | `teacher@example.com`, `homeschool@example.com`, `admin@example.com`, `student@example.com` |
| Backend test command | `docker exec peripateticware-backend python -m pytest tests/ -q` |
| Frontend e2e | `cd frontend && npx playwright test tests/e2e/targeted-flows.spec.ts` (Rubric Builder / Standards / Homeschool—Rubrics specs) |
| Fixture files needed | One real state-standards PDF or CSV (a small, real one — e.g. a few pages of a state math framework) for §2.1; a deliberately malformed/scanned-image PDF for the extraction-failure path |

**Known trap:** `auth.setup.ts`'s six role logins share one 5-requests/minute rate limit. Run it serially (`--workers=1`) or expect 429s and false failures — this bit the previous session's e2e run.

---

## 2. Standards — test matrix

### 2.1 Upload & LLM extraction (`POST /standards/upload`)

**Automated 2026-09-13** (`backend/tests/test_standards_parser.py`, 15 cases, `services/standards_parser.py::extract_criteria` directly): success-path sanitization/defaults/truncation, every never-raises failure path (S3/S6 below), provider resolution, oversized-document truncation before the prompt (S7), deterministic low temperature. S4 was run live against real Claude with a sample document (not just mocked) — see the test file's header. What's below marks which rows that closes vs. what's still HTTP-endpoint-level and untested.

| # | Case | Expected | Automated? |
|---|---|---|---|
| S1 | Upload a real state standards PDF, `set_type=state_standards` | 200; response is a **preview** (criteria list), nothing persisted yet — confirm no `standards_sets` row exists until the follow-up save call | ❌ HTTP-level only, not yet tested — `extract_criteria` itself is, but not `POST /standards/upload`'s handling of a real multipart PDF upload |
| S2 | Upload a CSV instead of PDF | Same extraction path via `document_parser.py`; criteria list returned | ❌ same as S1 |
| S3 | Upload with no local Ollama reachable, `LLM_PROVIDER=ollama` | Graceful `{criteria: [], error: "..."}", not a 500 — matches `extract_criteria`'s never-raises contract | ✅ `test_provider_unreachable_is_graceful_not_raised` |
| S4 | Upload with `LLM_PROVIDER=claude` (or per-feature `AGENT_STANDARDS_EXTRACTION_PROVIDER=claude`) | Extraction succeeds against the real Anthropic API | ✅ verified live this session with a real sample science-standards excerpt; `test_routes_through_the_provider_abstraction_not_a_hardcoded_client` covers the provider-resolution logic (mocked) |
| S5 | Upload a scanned/image-only PDF | Falls through to `document_parser.py::_extract_pdf_ocr` (vision call) — confirm it also resolves through `dispatch()`/`AGENT_DOCUMENT_OCR_PROVIDER`, not a hardcoded provider (this path wasn't touched by this session's fix — verify it wasn't already broken the same way) | ❌ still open — `document_parser.py` has no test file yet |
| S6 | Upload text that yields zero usable criteria (e.g. a blank page) | `{criteria: [], error: "...didn't identify any criteria..."}`, not an empty-list-with-no-explanation | ✅ `test_zero_criteria_found_has_a_distinct_message_from_a_dead_provider` (also confirms this message differs from S3's) |
| S7 | Text over `max_chars` (12,000) | Truncated silently, extraction still runs on the truncated text | ✅ `test_oversized_document_text_is_truncated_before_reaching_the_prompt` |

### 2.2 Save / CRUD (`POST /standards`, `GET /standards`, `GET|PUT|DELETE /standards/{id}`)

**Automated 2026-09-13** (`backend/tests/test_standards_routes.py`): S8–S10 below are covered (normalized-type persistence including the BUG-14 regression by name, checksum cache-hit dedup, the global-set 403 gate). S11–S14 are not yet.

| # | Case | Expected |
|---|---|---|
| S8 | Save the previewed criteria from S1 as-is | `standards_sets` row created; `processing_status='complete'` |
| S9 | Edit a criterion's `name`/`required`/`weight` in the preview before saving | The **edited** version persists, not the raw LLM output — this is the human-review gate the source brief claims exists; confirm it's real, not decorative |
| S10 | Save with `set_type` the frontend sends but the backend doesn't recognize (repeat of historical BUG-14 in `REGRESSION_LOG.md`) | `_normalize_set_type` maps it to `custom` rather than a 422/500 — regression check on a previously-fixed bug |
| S11 | `PUT /{set_id}` to rename a set | 200; `updated_at` bumps |
| S12 | `POST /{set_id}/refresh` — re-run extraction against the same source file | `processing_status` cycles `pending → complete`; criteria replaced, not appended-and-duplicated |
| S13 | `DELETE /{set_id}` on a set with existing `ActivityStandardsMap` rows | Confirm the FK/cascade behavior — does it 409, cascade-delete the mappings, or orphan them? (Not documented anywhere found in this audit — establish the actual behavior and whether it's intentional.) |
| S14 | List sets as a teacher who doesn't own any (`GET /standards`) | Empty list, not another teacher's sets — authz check |

### 2.3 Mapping an activity to a criterion (`POST /{set_id}/map`)

**Automated 2026-09-13** (`backend/tests/test_standards_routes.py`): S15 and S18 are covered (primary write, dual-write failure isolation, re-map-updates-not-duplicates). S16 is covered by the re-map test. S17 (the race with materialization) is not.

| # | Case | Expected |
|---|---|---|
| S15 | Map a real activity to a real criterion, `coverage_level="full"` | 201; `ActivityStandardsMap` row created **and** a `content_alignments` row created (dual-write per `standards_graph_fold.py`) — assert both, not just the response `{"status":"mapped"}` |
| S16 | Re-map the same (activity, criterion) pair with a different `coverage_level` | Updates the existing row (`existing.coverage_level = body.coverage_level`), doesn't duplicate |
| S17 | Map before `materialize_standards_set()` has ever run for that set | Per the code comment at `routes/standards.py:605-610`, this is called synchronously here specifically to avoid a race with the background indexing task — confirm the `content_alignments` FK write doesn't 500 on a set that was *just* saved |
| S18 | Force the `content_alignments` dual-write to fail (e.g. a bad `item_id`) | `ActivityStandardsMap` write still commits (the comment says this is non-fatal/best-effort) — confirm the primary write really does survive a secondary-write failure, not just in comments |

### 2.4 Coverage reporting — **two independent implementations**

There are two separate coverage endpoints that must independently union `ActivityStandardsMap` and `content_alignments` and agree with each other:
- `GET /standards/{set_id}/coverage` (`routes/standards.py::get_coverage`)
- `GET /homeschool/coverage` (`routes/homeschool.py::coverage_summary`)

| # | Case | Expected |
|---|---|---|
| S19 | Map 3 of 10 criteria via `ActivityStandardsMap` only (simulate the legacy path — e.g. a row inserted directly, bypassing the dual-write) | Both coverage endpoints report `3/10` |
| S20 | Map 2 more criteria via `content_alignments` only (simulate the graph-native path) | Both endpoints now report `5/10` — this is the "dedup so a criterion mapped through both paths for the same activity doesn't double-count" logic from the GraphRAG PRD; **write this as an actual test**, it was previously only "verified against a simulated case" by hand |
| S21 | Map the *same* criterion through both paths for the same activity | Coverage still counts it once, not twice — the specific double-count case |
| S22 | `?student_id=` filter on `get_coverage` | Only that student's evidence counts toward the percentage |
| S23 | A criterion with zero activities mapped to it | Appears in the matrix as not-met, not silently omitted (a family filing a state report needs to see what's *missing*, not just what's done) |

### 2.5 GraphRAG retrieval (`StandardsExplorer` / `/rag-retrieve`)

| # | Case | Expected |
|---|---|---|
| S24 | Search a query with a known ancestor/prerequisite chain (e.g. "fraction equivalence" against Wisconsin's framework, per the source brief's own example) | Results include `relation: "match"` plus `"ancestor"`/`"prerequisite"`/`"cross_reference"` entries, not just flat similarity hits |
| S25 | Same query, timed | Should land in the 85–188ms range the migration PRD measured after the N+1 fix, not 955ms–2.8s — a regression here means the batched-query fix silently reverted |
| S26 | `jurisdiction_id` filter | Only that state's (and its ancestor jurisdiction's) results returned |
| S27 | A query against a state with only an upload (no CASE data) vs. a state with both | Confirm `is_authoritative_over_uploads` is computed correctly (it is, per the PRD) even though — separately — nothing in ranking uses it yet; don't test for ranking behavior that was never built |

### 2.6 Manual / regulatory (no automated test can substitute)

| # | Case | Expected |
|---|---|---|
| S28 | Have someone with actual homeschool-reporting-requirement expertise review one real state's LLM-extracted `StandardsSet` against that state's actual published requirements | Extraction accuracy is a compliance-facing risk, not just a code-correctness one — a missing or wrong requirement in a filed portfolio is the real failure mode |
| S29 | Confirm the "human review before trusted" UI flow (upload → preview → edit → save) cannot be bypassed by calling `POST /standards` directly with unreviewed LLM output | Currently enforced only by the UI's two-step flow, not a DB constraint (see the earlier audit) — decide if that's acceptable or needs a `reviewed_at`/`reviewed_by` column |

---

## 3. Rubrics — test matrix

### 3.1 CRUD (`POST/GET/PUT/DELETE /rubrics`)

| # | Case | Expected |
|---|---|---|
| R1 | Create a rubric with 3 criteria, 4 levels each | 201; `total_points` matches the sum the teacher entered, not a server-recalculated value (confirm which is authoritative) |
| R2 | `GET /rubrics` as a different teacher | Only the caller's own rubrics — `AssessmentRubric.teacher_id == current_user.id` filter |
| R3 | `PUT /{rubric_id}` to add a 4th criterion | Full replace or merge? Confirm which, and that `RubricBuilder.tsx`'s save button matches whichever it is |
| R4 | `DELETE /{rubric_id}` | Soft-delete (`is_active = False`, confirmed in code) — verify `GET /rubrics` excludes it afterward, and that an activity already attached to it doesn't break |

### 3.2 AI-generation (`POST /rubrics/generate`) — **just fixed this session, needs its first real coverage run**

This is the route fixed in `fix/ai-route-provider-agnostic`. Automated coverage was added (`backend/tests/test_ai_route_providers.py`), but confirm these live, not just via the mocked unit tests:

| # | Case | Expected |
|---|---|---|
| R5 | Generate with `LLM_PROVIDER=claude` (prod's actual config) | Real call to Anthropic succeeds — this session verified it once by hand; put it in CI or a scheduled smoke test so it can't silently regress again the way the original Ollama-only version did |
| R6 | Generate with no provider reachable at all (bad API key) | `{criteria: [], error: "...service unavailable..."}`, 200 not 500 — teacher can still fall back to manual entry |
| R7 | Generate against an activity that already has criteria (`existing_rubric_criteria` populated) | New criteria don't duplicate the existing ones by name — the prompt explicitly instructs this; confirm the model actually complies, don't just trust the instruction |
| R8 | Generate, then check the frontend never auto-saves the result | Criteria are **appended to the form**, not written to the DB, until the teacher explicitly saves via `POST /rubrics` — this is the "AI proposes, teacher disposes" guarantee the source brief calls a deliberate trust choice; a regression here (auto-save) would be a real behavior change worth its own alert |
| R9 | Submit a 5,000-character activity description and 30 objectives | Now capped (`_DESCRIPTION_MAX_CHARS`, `_MAX_OBJECTIVES`) rather than sent whole — confirm via a captured prompt, as the new unit tests do, but also confirm end-to-end that generation still succeeds rather than erroring on the trimmed input |
| R10 | Hit `/rubrics/generate` 20+ times in under a minute as one org | The new `ai_rate_limit` guardrail should 429 once the org's tier limit is exceeded — this session's manual check didn't trigger it (the test account's tier limit wasn't hit in ~7 calls); confirm the actual threshold for a `free`/`trial` org specifically (documented as 5/min in `core/rate_limit.py`) |
| R11 | Malformed/non-JSON model output (simulate via a mocked provider) | `{criteria: [], error: "...wasn't valid structured data..."}` — already covered by existing tests, re-confirm post-fix |

### 3.3 Attach to activity (`POST /{rubric_id}/attach/{activity_id}`)

| # | Case | Expected |
|---|---|---|
| R12 | Attach as the owning teacher | 200; `Activity.rubric_id` set |
| R13 | Attach someone else's rubric, or to someone else's activity | 404 (both lookups filter by `teacher_id == current_user.id`) — confirm this isn't a silent no-op that returns 200 |
| R14 | Re-attach a different rubric to an activity that already has one | Overwrites `rubric_id` — confirm this is intended (no "are you sure" / no versioning of the old attachment) |

### 3.4 Scoring (`POST /teacher/submissions/{session_id}/score-rubric`) — built 2026-09-13

Automated coverage exists (`backend/tests/test_submission_rubric_scoring.py`, 14 cases, all mocked-DB). What's still worth a live/manual pass:

| # | Case | Expected | Automated? |
|---|---|---|---|
| R15 | Score every criterion on a submission | `rubric_scores` populated; `submission_status → 'graded'`; `grade` = round(total/max × 100) | ✅ `test_complete_rubric_scoring_flips_status_to_graded` |
| R16 | Score with a level that doesn't exist on the criterion | 422, rejected before any write | ✅ `test_422_score_not_a_valid_level` |
| R17 | Score one criterion, come back later and score the rest | First call persists partial progress without grading; submission only grades once the last criterion lands | ✅ `test_partial_rubric_scoring_does_not_grade_yet` |
| R18 | Evaluate a mapped standard as `not_met` for a submission whose activity was otherwise completed | `GET /standards/{set_id}/coverage` for that student drops the criterion out of `criteria_met`, `evaluated: true` | ✅ Closed 2026-09-13 — `tests/test_standards_coverage_evaluation.py` drives `get_coverage` through its real mocked query sequence (3 cases: explicit override, no-evaluation fallback, evaluation-without-completion) plus 5 pure-function cases for `homeschool.py::_criterion_status` (extracted specifically so its precedence logic didn't need the whole `coverage_summary` query chain mocked). Still verified live too. |
| R19 | Two teachers on the same org score different students' submissions concurrently | No cross-contamination — each write is scoped by `sub_id` from that session's own row |
| R20 | A scored submission rolls up into `student_competencies` | ✅ Built 2026-09-13 — `routes/activities.py::_accrue_competency()`, called from `score_submission_rubric` for every `standards_evaluation` verdict. Best-ever-achieved semantics (status never regresses); `evidence_count` increments every verdict; `first_achieved_at` set once. 4 unit tests + verified live (a real `student_competencies` row was created against the dev DB). `StudentCompetency` previously had readers in 2 routes and zero writers anywhere — confirmed by grep before building this. |
| R21 | Manual/live: run the full flow once against a real teacher account | Create rubric → attach → map a standard → score both → confirm `GET .../detail` and `GET /standards/{id}/coverage` agree, **and** a `student_competencies` row now appears for the evaluated standard — this session's own verification (Creek Habitat Study / eco-1) is the template; keep it or re-run with fresh data before a release |

---

## 4. Cross-cutting

| # | Case | Expected |
|---|---|---|
| X1 | Regression guard | `pytest tests/test_ai_route_providers.py::test_no_route_imports_ollama_directly` stays in CI — fails the build if any route reaches Ollama directly again |
| X2 | Full backend suite | `docker exec peripateticware-backend python -m pytest tests/ -q` — baseline is 446 passed / 2 pre-existing unrelated `test_mfa.py` failures / 4 skipped; any new failure is a real regression, any *drop* in passed count is worse |
| X3 | Non-teacher role hits any `/standards` or `/rubrics` write endpoint | 403 — spot-check with a student/parent JWT against `POST /rubrics`, `POST /standards`, `POST /rubrics/generate` |
| X4 | Homeschool role vs. teacher role on rubric routes | Per `targeted-flows.spec.ts`'s existing e2e coverage ("homeschool role is accepted by the rubrics API (no 403)"), confirm this still holds — homeschool parents are meant to use rubrics too, not just teachers in a classroom |
| X5 | Export end-to-end | `GET /export/pdf/homeschool_portfolio` and `GET /export/csv/standards_coverage` against an activity/rubric/standard set built in this test pass — confirm the numbers in the export match what §2.4's coverage endpoints report, not a separately-computed value |

---

## 5. One real end-to-end pass (do this first, it's cheap and covers the most ground)

1. As `teacher@example.com`: create one activity (grade 6, Bloom's "Analyze").
2. Upload a real state standards document; review and save the extracted set.
3. Create a rubric (manually, then again via `/generate` against Claude) and attach it to the activity.
4. Map the activity to 2–3 criteria from the saved standards set.
5. As `student@example.com`: complete the activity.
6. Score the submission against the rubric **and** evaluate each mapped standard, via `POST /teacher/submissions/{session_id}/score-rubric` — this session did exactly this once already (Creek Habitat Study / a synthetic Washington ecosystems standard), including confirming a `not_met` verdict correctly drops a criterion out of coverage. Redo it with the fresh fixtures from steps 1–5 so the seed reflects real content, not the throwaway test data this session used.
7. As `teacher@example.com` or `homeschool@example.com`: pull `GET /standards/{set_id}/coverage` and `GET /homeschool/coverage`, confirm they agree **and** that `evaluated: true` shows on the criteria scored in step 6.
8. Export the homeschool portfolio PDF and the standards-coverage CSV; confirm the numbers match step 7.
9. **Keep this data.** It's the fixture the unit tests in §2–3 are currently missing, and the next person who touches this area shouldn't have to build it from scratch again.

---

## 6. Exit criteria

- [x] §0's decision made — built, not deferred: a real scoring path plus per-submission standards evaluation
- [x] R18's coverage-side effect has a real automated test (`test_standards_coverage_evaluation.py`) — closed 2026-09-13
- [x] R20 (rolling scored evidence into `student_competencies`) — built and tested 2026-09-13, not just scoped
- [x] `extract_criteria` (parsing) and `create_standards_set`/`map_activity_to_criterion` (applying) have real automated coverage — closed 2026-09-13, was the other 0%-coverage gap from the original audit
- [ ] S1/S2/S5 (the actual `POST /standards/upload` HTTP endpoint, multipart PDF/CSV/scanned-image handling) still untested — `extract_criteria` itself is covered, the upload route wrapping it isn't
- [ ] All of §3.2 (rubric generation) executed at least once against a real Anthropic call in CI, not only this session's manual check
- [ ] §5's end-to-end pass re-run with fresh fixtures (not this session's throwaway test data) and committed as a reusable seed
- [ ] X1–X2 green in CI
- [ ] S28 (regulatory review) scheduled with someone outside engineering
