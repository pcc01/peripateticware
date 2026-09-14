# Privacy Jurisdiction Data Backfill — Investigation + Plan

**Status: investigation + plan only. Nothing in this document has been executed against prod.**
This session has no prod DB/SSH write access and did not attempt any (see
`claude-code-remote-docker-exec-blocked.md`). Every prod-facing command below is written
for a human operator (or a future dev-agent session with real access) to run, verify, and
roll back manually, in the exact order given.

Scope note: this document extends the live finding already confirmed this session (prod's
`compliance_rules` table has exactly 3 active rows — `US`/`US-COPPA`/`US-CA`, all dated
`2026-07-07T23:49:48`, confirmed by running `003_add_activity_compliance_rule_fields.py`
live and getting "No active compliance_rules row" for all 6 of `002`'s jurisdiction keys).
That finding is treated as ground truth throughout; this document does not re-derive it.

---

## 1. How the divergence happened (git-archaeology theory, evidence-backed)

**There are two entirely separate, never-reconciled compliance-rules seeding mechanisms
in this codebase, and only one of them has ever actually run in prod.**

### 1a. The mechanism that DID run: `seed_compliance_frameworks()` in `backend/startup.py`

- Defined at `backend/startup.py:2268-2315`, imported and called **unconditionally on every
  app boot** (dev or prod) from `backend/main.py:114,235` — inside the FastAPI `lifespan()`
  startup sequence, gated by an app-wide Postgres advisory lock so only one gunicorn worker
  actually runs it (`main.py:152-154`).
- Internally gated by `SELECT COUNT(*) FROM compliance_rules; if count == 0: <insert 4 rows>`
  (`startup.py:2279-2281`) — so it is a **run-once-ever, first-boot-only** seeder; once any
  row exists it is permanently a no-op, silently, forever (no log line distinguishes
  "skipped because already seeded" from "skipped because of an error" beyond the generic
  `except Exception` wrapper at `startup.py:2314-2315`).
- It inserts using `effective_date = NOW()` as a **literal SQL expression** (not a
  Python-computed timestamp) and relies on `compliance_rules.created_at`'s column default
  (`DEFAULT NOW()`, `startup.py:567`) — which is exactly why the 3 live rows all carry an
  **identical** `effective_date`/`created_at` timestamp: both columns were stamped by the
  same `NOW()` evaluation inside one INSERT statement, at first-boot time.
- The jurisdiction keys it inserts (`US`, `US-COPPA`, `US-CA`, plus a 4th `EU` row — see
  §1c) and the exact sparse field shape of their `rule_definition` (§3) match the 3 live
  rows precisely — this is strong direct evidence this function is their origin, not a
  coincidence.
- **Corroborating evidence for *why* it only just barely succeeded around 2026-07-07**:
  `GO_LIVE_RUNBOOK.md:257-266` documents that until a fix landed and was deployed on
  **2026-07-07** (commit `1a6198c`, "isolate migration statements with savepoints to stop
  cascading transaction failures"), *"the backend was failing to boot at all before this —
  a migration bug in startup.py was silently dropping `evidence_captures`,
  `notebook_entries`, `student_competencies`, `student_profiles`, `assessment_rubrics`,
  **`compliance_rules`** on every restart because one failed ALTER statement aborted the
  whole shared transaction."* In other words: before that exact date, `compliance_rules`
  itself likely never durably existed across a restart, so `seed_compliance_frameworks()`'s
  own `SELECT COUNT(*) FROM compliance_rules` would either error (table doesn't exist,
  caught by its blanket `except Exception`, silently skipped) or transiently exist and then
  get rolled back along with everything else in that boot's failed transaction. The first
  boot *after* the savepoint fix landed is the first time `compliance_rules` could survive
  a restart at all — which lines up with the seed timestamp landing on the same date as the
  fix.

### 1b. The mechanism that was authored later but NEVER run: `backend/migrations/002_seed_privacy_rules.py`

- `002`'s own docstring says explicitly: *"Run this script once after applying migration
  `20260527_privacy_engine_tables`: `python backend/migrations/002_seed_privacy_rules.py`"*
  — it is a **manual, human-run, one-off script**. It is never imported or called from
  `main.py`, `startup.py`, or anywhere else in the app boot path (confirmed by repo-wide
  grep — the only hits for the string `002_seed_privacy_rules` are in docs, `003`'s
  docstring, and the file itself).
- It uses a **different jurisdiction-key naming convention** than `startup.py`'s seeder:
  `ferpa_us`/`coppa_us`/`ccpa_california`/`gdpr_eu`/`lgpd_brazil`/`pipeda_canada`, vs. the
  legacy `US`/`US-COPPA`/`US-CA`/`EU`. This is not an accident — `WORK_TRACKING.md:989`
  (Session 32 cont. #2, 2026-06-26) records the change explicitly: *"Jurisdiction ID
  standardization — hardcoded IDs in the migration did not match the naming convention used
  by the privacy seeder. Renamed all: `US_FEDERAL` → `ferpa_us`, `EU` → `gdpr_eu`, etc. so
  migration and seeder stay in sync."* — i.e. **`002` was explicitly authored/renamed to
  supersede the legacy startup.py-seeded keys** and align with what
  `services/privacy_seeder.py`/`privacy_jurisdiction_resolver.py` actually write into
  `organizations.privacy_jurisdiction_ids` at signup time. `services/privacy_engine.py`'s
  own `JURISDICTION_ALIASES` comment block (`privacy_engine.py:426-433`) independently
  documents this exact same "two historical ID namespaces that must be reconciled" picture,
  written by a previous session that had already diagnosed the split.
- **Conclusion: `002` was meant to *replace/enrich*, not run alongside unmodified.** It was
  written, reviewed, referenced in multiple planning docs (`PRIVACY_BUGFIX_PLAN.md`,
  `TOMORROW_CHECKLIST.md`, `WORK_TRACKING.md`) across at least two sessions — and never
  actually executed against the live database. This is a real gap that "fell through the
  cracks" rather than a deliberate decision to defer it.

### 1c. One open discrepancy, flagged rather than papered over

`seed_compliance_frameworks()`'s current code inserts **4** rows in one call
(`FERPA→US`, `COPPA→US-COPPA`, `CCPA→US-CA`, **and `GDPR→EU`**), all in a single
`engine.begin()` transaction with no per-statement isolation — Postgres transaction
semantics mean this should be all-or-nothing (either all 4 commit, or none do). Git
archaeology found only one point in history where this function (and all 4 framework
entries, including `gdpr_eu_v1`/`EU`) was introduced (commit `24912ad`, 2026-06-25),
predating the 2026-07-07 seed date by ~12 days, with no evidence of any later edit to the
`_frameworks` list. Yet the live finding is **3** active rows, no `EU`/`GDPR` row.

This is **not fully resolved** by this investigation. Hypotheses, none confirmed:
- A 4th `EU` row exists but with `is_active = false` (the live finding as reported only
  characterized *active* rows) — most likely explanation, cheapest to rule in/out.
- The exact code that ran on the first successful post-savepoint-fix boot differed from
  what's in the current git history (a deploy from an uncommitted/rebased state).
- Some later out-of-band action (manual `UPDATE`/`DELETE`, or use of the
  `PATCH /rules/framework/{id}/deactivate` admin endpoint — see §5, which matches on
  `rule_definition->>'framework'` and would deactivate every row sharing that value)
  removed it after the fact.

**Action before backfill**: run a plain `SELECT jurisdiction, is_active, rule_id,
effective_date, created_at, regulation_type FROM compliance_rules ORDER BY created_at;`
(no filter on `is_active`) against prod and confirm whether a 4th/inactive row exists. This
doesn't change the backfill plan's mechanics but should be resolved before anyone assumes
they understand the table's full history.

---

## 2. Every other one-off script in `backend/migrations/` — audited

None of these are wired into `main.py`/`startup.py`'s boot sequence (confirmed by grep —
only `002` and `003` are even referenced anywhere outside their own file, and only in docs).
They fall into two very different buckets:

### 2a. Runnable standalone scripts (have their own `if __name__ == "__main__":` / real DB
connection code) — same pattern as `002`/`003`, meant to be run manually once:

| File | Purpose | Evidence it already ran in prod |
|---|---|---|
| `001_phase3_database_optimization.py` | Adds indexes, `ANALYZE` | None found either way; low-risk/idempotent (`CREATE INDEX IF NOT EXISTS`-style); if it never ran, only a perf cost, not a correctness bug. Not investigated further — out of scope for this plan. |
| `002_seed_privacy_rules.py` | Seeds 6 rich jurisdiction rows | **Confirmed NOT run** (this session's live finding). |
| `003_add_activity_compliance_rule_fields.py` | Backfills 3 extra keys onto `002`'s rows | **Confirmed NOT run** (depends on `002`'s rows existing; live-tested this session, reported "no active row" for all 6 keys). |
| `add_activity_media_fields.py` | `activities.hero_image_url`, `activities.attachments` | **Superseded** — both columns are also created via inline `_exec_safepoint()` ALTERs in `startup.py:547-548`, which run on every boot. Whichever ran first is moot; the columns exist today via the startup.py path regardless of whether this file was ever invoked. Dead/redundant, not a gap. |
| `add_activity_phase_columns.py` | `activities.orient_phase/inquiry_phase/reflect_phase` | Not cross-checked against startup.py inline patches in this pass — flag as **unverified**, low risk (additive nullable TEXT columns; a missing column would surface immediately and loudly as a 500 on any code path reading it, unlike the silent `compliance_rules` gap). |
| `add_curriculum_created_by.py` | `curriculum_units.created_by` | Not cross-checked — same low-risk profile as above (loud failure mode if missing, not silent). |
| `add_field_encryption.py` | Widens `users.email`/`full_name`, adds `email_index` blind-index column | **High-importance, not verified.** This is exactly the kind of migration that fails silently in the same way as `compliance_rules`: if it never ran, `FIELD_ENCRYPTION_KEY`-based encryption (real prod concern per `check_config_warnings()` in `startup.py:2355-2362`) may be writing ciphertext into a column too narrow to hold it, or the blind-index lookup path may be broken. **Recommend a dedicated follow-up investigation** (out of scope for this jurisdiction-data plan, but flagged here per the task's "audit every one-off script" instruction). |
| `add_privacy_notices_table.py` | Creates `privacy_notices` table | Not cross-checked against startup.py/init.sql in this pass. |
| `add_user_state_code.py` | `users.state_code` | `startup.py:78` mentions `state_code` in a comment listing columns startup.py itself manages — **likely superseded/redundant**, same pattern as the media-fields file, not independently confirmed. |

### 2b. Alembic-*shaped* files sitting in the wrong directory — cannot ever be run as written

These use `from alembic import op`, `revision = "..."`, `down_revision = None`,
`def upgrade():`/`def downgrade():` — the real Alembic migration format. But they live in
`backend/migrations/`, not `backend/alembic/versions/`, so `alembic upgrade head` (the only
documented migration command in this repo — see §4) never discovers them, and none of them
has a `__main__` block or any other way to bind `op` to a real connection and execute
outside a genuine Alembic run. **They are inert, unexecutable dead code as they sit today** —
this is not speculation; it was directly confirmed by reading each file's full contents
looking for an entry point and finding none.

This confirms and *generalizes* the earlier-session flag on `20260602_multitenancy_foundation.py`
("Alembic-shaped but not wired into the real chain") — it is **one of six** files in this
exact situation, not a one-off:

| File | Would-be schema change | What actually happened instead |
|---|---|---|
| `20260602_ai_routing_tables.py` | `ai_task_config`, `ai_batch_queue`, `ai_api_keys`, `teacher_notifications` | `ai_task_config` **is** live — created via inline SQL in `startup.py:369-370` and `database/init.sql:1336`. This orphaned file is redundant for that table; **not verified** whether `ai_batch_queue`/`ai_api_keys`/`teacher_notifications` exist anywhere else — possible real gap, out of scope here. |
| `20260602_class_size_limit.py` | `organizations.max_students_per_classroom` + tier backfill | **Superseded** — column exists via `database/init.sql:68` (fresh DB) and `startup.py:692` (inline ALTER, idempotent patch on every boot). The tier-based backfill `UPDATE` in the orphaned file never ran, but the column's `DEFAULT 30` in both real paths makes this low-risk. |
| `20260602_completion_mode.py` | `activities.completion_mode`, `require_field_approval`, several `activity_submissions` columns | **Superseded** — `completion_mode` exists via `database/init.sql:271-273` and `startup.py:488` inline ALTER. Not cross-checked whether every `activity_submissions` column this file would have added (`field_phase_status`, `reflection_content`, etc.) also has a real-path equivalent — **flag as unverified**, same "silent gap" risk profile as compliance_rules if any one of them doesn't. |
| `20260602_multitenancy_foundation.py` | `organizations`, `organization_members`, `classrooms`, `classroom_students`, `classroom_invitations`, `users.org_id` | **Superseded** — `organizations` exists via `database/init.sql:54` and `startup.py:628` inline CREATE TABLE; multitenancy demonstrably works in prod (orgs, `org_id`, jurisdiction seeding all function), so this must have come from the real path, not this file. Confirms the earlier-session flag was correct. |
| `add_breach_incidents_table.py` | `breach_incidents` table (GDPR Art. 33/34 breach log) | **Not superseded anywhere — genuine live gap.** Grepped `database/init.sql` and `startup.py` for `breach_incidents`: **zero hits, anywhere, by any mechanism.** But `backend/models/compliance.py` and `backend/tasks/retention_cleanup.py` (a scheduled background task, per `main.py`'s `start_background_tasks`) both reference this table. **This means the breach-notification feature is very likely erroring (`relation "breach_incidents" does not exist`) every time the referencing code path runs in prod today** — a real, currently-live bug, separate from the jurisdiction-data gap this document is about. Flagging prominently; recommend a separate, dedicated investigation/fix (create the table via a real Alembic migration or an inline `startup.py` patch, mirroring how every other table in this repo actually gets to prod). |
| `add_user_deleted_at.py` | `users.deleted_at` + index | **Superseded** — `startup.py:122` has the equivalent inline ALTER (`ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`) which does run on every boot. |

**Pattern across both buckets**: the two things that actually reach prod today are (1)
`database/init.sql` (applied once, only on a truly empty Postgres volume) and (2) inline
`_exec_safepoint()`-wrapped ALTER/CREATE statements directly inside `backend/startup.py`,
run unconditionally on every boot. Anything authored as a standalone `backend/migrations/*.py`
script or an orphaned Alembic-shaped file in that same directory is **structurally
optional** — nothing in the deploy process forces it to run, and (per `add_breach_incidents_table.py`)
at least one such file represents a real, currently-shipping-broken feature as a direct
consequence.

---

## 3. Is there a documented process for running `backend/migrations/*.py` one-offs?

**No. This is a structural gap in the deploy process, not a one-time human error.**

Both canonical deploy documents were checked in full for any mention of
`backend/migrations/`:

- `GO_LIVE_RUNBOOK.md` (self-described as *"The definitive launch document... Supersedes
  `DEPLOY_PLAN.md` and `DEPLOY_SMALL.md`"*) — §4.2 "First start" has exactly one migration
  step: `docker compose exec backend alembic upgrade head    # apply versioned migrations`.
  Zero mentions of `backend/migrations/` anywhere in the file.
- `DEPLOY_GUIDE.md` — the "pull latest code + restart" section (lines 260-290) likewise has
  exactly one migration step: `docker exec peripateticware-backend alembic upgrade head`,
  with a comment noting *"there's no automatic migration step in the image — always check
  after a pull that touched `backend/models` or `backend/alembic/versions`"* (note: this
  comment itself only names `backend/alembic/versions`, not `backend/migrations`). Zero
  other mentions of `backend/migrations/` in the file.

Every reference to `002_seed_privacy_rules.py` found anywhere in the repo
(`PRIVACY_BUGFIX_PLAN.md`, `TOMORROW_CHECKLIST.md`, `WORK_TRACKING.md`) is either a
"here's where this code lives" file-location note or a design discussion of what it should
eventually contain — **never a deploy-runbook checklist item with a checkbox**. There is no
"☐ run pending one-off migrations/*.py scripts" line anywhere in either canonical runbook.

**Conclusion**: this project has a real, working process for the *actual* Alembic chain
(`alembic upgrade head`, documented in two places, apparently followed consistently — no
evidence of a missed Alembic migration anywhere in this investigation). It has **no
equivalent process at all** for the parallel `backend/migrations/*.py` one-off convention —
those scripts structurally rely on someone remembering they exist and manually running them,
with no checklist, no CI check, and no startup-time verification that they've been applied.
`002` didn't fall through a checklist that named it and got skipped — it fell through the
absence of a checklist that would ever have named it.

---

## 4. Exactly what's in the 3 real prod rows today

Read directly from `seed_compliance_frameworks()`'s literal `_frameworks` list
(`startup.py:2282-2299`) — this is what was actually inserted (module `startup.py` has not
been edited since to touch these literals; confirmed no other write path exists for these
3 jurisdiction keys anywhere in the repo, i.e. no drift is possible from a second writer).

| Jurisdiction | `regulation_id` | `regulation_type` | `rule_definition` fields present |
|---|---|---|---|
| `US` (FERPA) | `FERPA` | `privacy` (column default; not set explicitly) | `framework`, `jurisdiction_name`, `country_code`, `max_retention_days` (365, **flat int**, not per-category), `encryption_required` (**True**), `encryption_algorithm` (AES-256), `student_data_sharing_allowed` (False), **`student_monitoring_allowed`: True**, `student_profiling_allowed` (False), `student_targeting_allowed` (False) |
| `US-COPPA` (COPPA) | `COPPA` | `privacy` (default) | same shape as above, plus `behavioral_advertising_allowed: False`; `student_monitoring_allowed: False` |
| `US-CA` (CCPA) | `CCPA` | `data_protection` (set explicitly in this row) | same base shape, plus `state_code: "CA"`, `opt_out_right: True`, `data_deletion_right: True` |

**Explicitly absent from all 3 rows** (confirmed by reading the literal dict content —
none of these keys appear anywhere in `_frameworks`): `consent_rules`, `age_threshold_parental_consent`,
`processing_rules`, `retention_policies` (nested per-category dict — only the flat
`max_retention_days` int exists), `rights_rules`, `student_age_categories`,
`prohibited_data_collection`, `special_restrictions`, `version` (defaults to `"1.0"` on
read via `startup.py`'s literal `version` field — actually present, correction: `version`
**is** set to `"1.0"` for all 3).

**This confirms the suspicion in the original brief**: the 3 real rows are indeed sparse
and legacy-shaped relative to `002`'s schema — genuinely lacking `consent_rules` entirely
(not just the 3 keys `003` was built to backfill). One concrete, verifiable behavioral
consequence: **`enforce_on_submission()`'s age-differentiated consent check**
(`privacy_engine.py:762-816`, added under `PRIVACY_BUGFIX_PLAN.md` Bug 2, 2026-09-12) reads
`config.consent_rules` and is a documented no-op whenever that list is empty — since all 3
live rows produce an empty `consent_rules` list today (the key doesn't exist in their
`rule_definition` at all), **this check is currently fully dormant for every org in
production**, including `strict`/`lenient`/`ccpa` which otherwise get real DB-backed content
today. This matters directly for the backfill risk assessment in §6.

**Drift risk from `002`/`003` themselves**: confirmed by reading `002`'s own INSERT logic —
it `INSERT ... ON CONFLICT (rule_id) DO NOTHING`, where `rule_id` is a **UUIDv5 hash of a
string literal specific to `002`'s own jurisdiction keys** (e.g. `uuid5(NAMESPACE_DNS,
"FERPA-1974-US-FEDERAL-v2.1")`) — **not** a conflict target on the `jurisdiction` column.
`compliance_rules.jurisdiction` has **no unique constraint at all** (confirmed: no `UNIQUE`
or matching index found in `backend/alembic/versions/20260527_privacy_engine_tables.py` or
`20260530_compliance_rules_regulation_type.py`, nor in `startup.py`'s inline
`CREATE TABLE`). This means **`002` cannot collide with, update, or replace the 3 existing
`US`/`US-COPPA`/`US-CA` rows under any circumstances** — running it inserts 6 brand-new
rows with new UUIDs and new jurisdiction keys, fully independent of and additional to the 3
that exist today. `003` similarly cannot touch the 3 legacy rows: it explicitly
`SELECT`s `WHERE jurisdiction = :jurisdiction` for `002`'s 6 keys only (`ferpa_us`,
`coppa_us`, etc.) — it does not know the legacy `US`/`US-COPPA`/`US-CA` keys exist at all,
so it would never touch them even if it were re-run.

---

## 5. Scope of the gap: exactly which of the 12 test orgs get real rule content

Org → jurisdiction-slug mapping taken from `PRIVACY_LARGE_SCALE_TEST_PLAN.md` (§ jurisdiction
matrix, lines 107-119), cross-referenced against the 3 live rows + `JURISDICTION_ALIASES`
(`privacy_engine.py:434-441`) for "today," and against what `002` would add for "after
step 1 only" (see §6 — 5 of the 12 jurisdictions have no seed script at all, `002` or
otherwise, and need net-new work).

Resolution mechanics confirmed by reading `resolve_jurisdiction_id()`
(`privacy_engine.py:444-455`) and `_load_rules_from_db()` (`privacy_engine.py:246-268`):
`_load_rules_from_db` keys its returned dict **literally by the `jurisdiction` column
value**; `resolve_jurisdiction_id` checks **direct match first**, falling back to
`JURISDICTION_ALIASES` only if the literal id isn't already a key. Orgs' own
`organizations.privacy_jurisdiction_ids` store the **config-file-style** ids
(`ferpa_us`, `gdpr_eu`, etc. — confirmed via `services/privacy_jurisdiction_resolver.py`'s
`JURISDICTION_MAP`/`verify_jurisdictions()`, which checks `config_exists()` against
`backend/config/jurisdictions/{id}.json` filenames using exactly these names). So once
`002`-style rows exist under these exact keys, resolution goes **directly** to the new rich
row and the alias to the legacy `US`/`US-COPPA`/`US-CA` keys becomes unreachable for those
orgs (aliases only matter for the pure-fallback path, `identify_jurisdiction()`'s
`["US_FEDERAL"]` default when an org has no jurisdiction ids seeded at all).

| Org slug | Jurisdiction(s) | **Today** | **After running `002` as-is** |
|---|---|---|---|
| `strict` | `coppa_us` + `ferpa_us` | Real DB content, via alias → `US-COPPA`/`US` (sparse, no `consent_rules`) | Real DB content, **direct match** → new rich `coppa_us`/`ferpa_us` rows (has `consent_rules`, age thresholds — **behavior changes, see §6**) |
| `lenient` | `ferpa_us` alone | Real (sparse), via alias → `US` | Real (rich), direct match → `ferpa_us` |
| `ccpa` | `ccpa_california` | Real (sparse), via alias → `US-CA` | Real (rich), direct match → `ccpa_california` |
| `gdpr` | `gdpr_eu` | **Generic fallback** — alias target `EU` does not exist as a row | Real (rich) for the **first time** — `gdpr_eu` row now exists directly |
| `pipeda` | `pipeda_canada` | Generic fallback — no alias entry, no row | Real (rich) for the first time |
| `lgpd` | `lgpd_brazil` | Generic fallback — no alias entry, no row | Real (rich) for the first time |
| `auprivacy` | `privacy_act_au` | Generic fallback — no alias entry, no row | **Still generic fallback** — `002` does not seed this jurisdiction |
| `pdpa` | `pdpa_singapore` | Generic fallback | **Still generic fallback** — not in `002` |
| `popia` | `popia_za` | Generic fallback | **Still generic fallback** — not in `002` |
| `lpdc` | `lpdc_mx` | Generic fallback | **Still generic fallback** — not in `002` |
| `aepd` | `aepd_ar` | Generic fallback | **Still generic fallback** — not in `002` |
| `baseline` | none resolved | Fails open entirely — `merge_jurisdictions([])` returns the hardcoded `JurisdictionConfig(jurisdiction_id="DEFAULT", ...)` (`privacy_engine.py:551-559`), which is **not the same thing** as the "generic fallback" the other 8 get (that fallback still goes through `merge_jurisdictions()` with an unresolved id — see next line) | **Unaffected** — no jurisdiction ids to resolve either way |

**Clarifying the "generic fallback" for the 8 unresolved-but-labeled orgs** (`gdpr`,
`pipeda`, `lgpd`, `auprivacy`, `pdpa`, `popia`, `lpdc`, `aepd`, today): `resolve_jurisdiction_id`
returns `None` for these ids (not in `configs`, not in `JURISDICTION_ALIASES`), so
`merge_jurisdictions()`'s `relevant` list is empty and it returns the exact same
`DEFAULT`/`JurisdictionConfig()` fallback as `baseline` gets — meaning **these 8 orgs and
`baseline` are, today, functionally identical in enforcement outcome**, despite the audit
trail recording `rules_applied: "gdpr_eu"` etc. for the 8 (because `merge_jurisdictions`
still echoes back the *requested* ids into `rules_applied` — see `privacy_engine.py:725`
— even when it resolved none of them to real content). This is the sharpest form of the
"looks jurisdiction-specific, isn't" problem named in the original brief.

Note the `JurisdictionConfig` dataclass's own defaults for the 4 student-behavior booleans
are all `False` (`privacy_engine.py:190-194`), so the "generic fallback"/`DEFAULT` config is
actually maximally *restrictive* on those 4 flags specifically (denies monitoring, sharing,
profiling, targeting) — the real risk from today's gap is less "these 8 orgs can do
anything" and more "these 8 orgs get zero jurisdiction-specific nuance beyond that one
blanket deny, and zero consent-rule enforcement at all" (see §6's risk analysis, which is
about consent_rules specifically, not the 4 booleans).

**Bottom line for today**: **3 of 12** orgs (`strict`, `lenient`, `ccpa`) get real,
DB-backed jurisdiction content — but it's the sparse/legacy shape, not `002`'s rich shape,
and even for these 3, the `consent_rules`-driven age-differentiated check is dormant
because the legacy rows have no `consent_rules` at all. **9 of 12** (the other 8 plus
`baseline`) get an identical generic/restrictive-on-4-booleans default regardless of the
jurisdiction label shown in their audit trail.

---

## 6. The backfill plan

### Step 0 — Pre-flight verification (no writes)

```sql
-- Confirm current full state, including any inactive rows (resolves the §1c open question)
SELECT jurisdiction, is_active, rule_id, regulation_id, regulation_type,
       effective_date, created_at
FROM compliance_rules
ORDER BY created_at;
```
Expect: the 3 known rows, plus possibly a 4th inactive `EU` row. If a 4th row is found,
re-read its `rule_definition` before proceeding — it changes nothing about the sequencing
below, but it's worth knowing before assuming `gdpr` org's "before" state is a pure
generic-fallback (an inactive row is still just as absent from `merge_jurisdictions()`'s
perspective, since it filters `is_active == True` — so no plan changes are needed even if
found, only the narrative in §1c/§5 needs a footnote).

Also capture current audit-log baseline for a few real students in `strict`/`lenient`/`ccpa`
orgs (the 3 orgs whose enforcement content is about to change) — a few recent
`rule_audit_log` rows per org — so post-backfill spot-checks in Step 3 have a concrete
"did this specific case's outcome change" comparison, not just a vibe check.

### Step 1 — Run `002_seed_privacy_rules.py` as-is

Confirmed safe to run exactly as written, unmodified:
- Idempotent by design (`ON CONFLICT (rule_id) DO NOTHING`, keyed on a UUIDv5 of each rule's
  own literal string — re-running it a second time is a guaranteed no-op).
- Cannot collide with, overwrite, or deactivate the 3 existing `US`/`US-COPPA`/`US-CA` rows
  (different jurisdiction keys, no unique constraint on `jurisdiction` — see §4). It purely
  **adds** 6 new active rows: `ferpa_us`, `coppa_us`, `ccpa_california`, `gdpr_eu`,
  `lgpd_brazil`, `pipeda_canada`.
- **This does create two simultaneously-active rows for the same real-world law** (e.g. the
  legacy `US` FERPA row and the new `ferpa_us` FERPA row both `is_active = true` after this
  step) — by design, not a bug to fix here: nothing in the resolution code (`resolve_jurisdiction_id`)
  ever merges/compares two configs for the same underlying law; direct-match-wins ordering
  (§5) means only one of the two is ever actually consulted for any given org, so this does
  not create a genuine double-application risk. It does mean the legacy 3 rows become
  effectively dead weight for the 3 orgs that upgrade (`strict`/`lenient`/`ccpa`) — **leave
  them active, do not deactivate them** (§6, Step 1 continued): they remain the correct
  content for the `identify_jurisdiction()` `["US_FEDERAL"]` fallback path, which is
  independent of this backfill and still needed for any org with no seeded
  `privacy_jurisdiction_ids` at all.

```bash
# Run inside the backend container, against the real DATABASE_URL env already set there —
# do NOT override DATABASE_URL on the command line (that risks pointing it at the wrong DB).
docker compose exec backend python backend/migrations/002_seed_privacy_rules.py
```
Expected output: `✅ 6 jurisdiction rules seeded successfully.` (all 6 — `ON CONFLICT DO
NOTHING` only silently no-ops per-row if that exact UUID already exists, which it won't on
a first run).

**Verify immediately**:
```sql
SELECT jurisdiction, rule_id, regulation_id, effective_date
FROM compliance_rules
WHERE jurisdiction IN ('ferpa_us','coppa_us','ccpa_california','gdpr_eu','lgpd_brazil','pipeda_canada')
ORDER BY jurisdiction;
```
Expect exactly 6 new rows, all `is_active = true` implicitly (INSERT sets it explicitly True).

### Step 2 — Run `003_add_activity_compliance_rule_fields.py`

Safe to run immediately after Step 1 succeeds — it only touches the 6 rows Step 1 just
created (matches by `jurisdiction = 'ferpa_us'` etc., `WHERE is_active = true`), merges 3
new keys (`student_age_categories`, `prohibited_data_collection`, `special_restrictions`)
into each `rule_definition`, and is idempotent (recomputes the same SHA-256 audit hash on
a re-run, per its own docstring).

```bash
docker compose exec backend python backend/migrations/003_add_activity_compliance_rule_fields.py
```
Expected output: 6 lines of `✓ Updated <jurisdiction> ...` (all 6 keys from Step 1 — `003`'s
`RULE_FIELD_UPDATES` dict covers exactly these 6, confirmed by reading it).

### Step 3 — Invalidate the Redis rules cache (do not skip, do not assume the TTL is fine)

`ENFORCEMENT_MODE=block` is live. `_get_cached_rules()` (`privacy_engine.py`) caches the
**pre-backfill** rule set under Redis key `privacy:rules:all` with a 1-hour TTL
(`_RULES_CACHE_KEY`/`_RULES_TTL`, `privacy_engine.py:41-42`). Any backend process/worker
that already has this cached will keep enforcing the *old* rules (for `strict`/`lenient`/`ccpa`,
that means continuing to silently skip the newly-enabled `consent_rules` check — see the
risk note below) for up to an hour after Step 1/2 complete, unless invalidated explicitly.

```bash
# Exact key, confirmed from source (privacy_engine.py:41):
docker compose exec redis redis-cli DEL "privacy:rules:all"
```
(Equivalent effect: `docker compose exec backend python -c "import asyncio; from services.privacy_engine import invalidate_rules_cache; asyncio.run(invalidate_rules_cache())"` — either works; the direct Redis DEL is simpler and doesn't need an app-context import to succeed.)

Verify: `docker compose exec redis redis-cli EXISTS "privacy:rules:all"` → expect `0`. The
next read repopulates it from the now-updated DB automatically (`_get_cached_rules()`'s
cache-miss path).

### Step 4 — Verify via the app itself, not just SQL

```bash
# As a platform admin (per GO_LIVE_RUNBOOK.md §4.3's token flow):
curl -s http://127.0.0.1:8000/api/v1/privacy/jurisdictions -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Expect: 9 total active rows (3 legacy + 6 new), with the 6 new ones showing
`framework: ferpa|coppa|gdpr|ccpa|lgpd|pipeda` and today's date as `created_at`.

Then spot-check **actual enforcement behavior**, not just data presence — this is the step
the brief specifically calls out as necessary because `block` mode has real consequences:

1. Pick one real (or disposable test) student in the `strict` org with `age_group` on file
   and no existing consent record, and attempt a submission with sensitive evidence
   (location/photo/audio) via the real submission endpoint. **Before this backfill**, this
   should pass (dormant `consent_rules` check). **After**, if that student's `age_group`
   matches `coppa_us`'s `young_child` band, this should now correctly require consent — a
   **change in behavior, not a regression**, since COPPA has always required this; confirm
   it's a deliberate 403 with the new consent-required message
   (`privacy_engine.py:812-816`'s exact text), not an unrelated error.
2. Pick a `gdpr`-org student under 16 (or the closest available age_group) and repeat —
   this is the highest-impact untested case, since `gdpr` goes from zero real content to a
   fully-populated GDPR rule in one step. Confirm the block reason is the expected
   age-based-consent one, not some unrelated jurisdiction-resolution error.
3. Pick an **adult** student (or one with no `age_group` on file) in each of `strict`,
   `gdpr`, `ccpa` and confirm their submissions are **unaffected** — `consent_rules` matching
   requires both `age_groups` and `evidence_categories` overlap (`privacy_engine.py:783-798`),
   so an adult or an age-group-less student should see no behavior change at all. This is
   the "no should-allow case starts wrongly blocking" check the brief asked for.

### Step 5 — Rollback plan (data rollback, not a git revert)

If Step 4 surfaces unexpected blocking (a case that should allow now blocks, and it's not
one of the deliberate COPPA/GDPR tightenings described above):

```sql
-- Targeted rollback: deactivate exactly the 6 rows this backfill added, nothing else.
-- Do NOT use PATCH /rules/framework/{id}/deactivate for this — it matches on
-- rule_definition->>'framework', which is the SAME value ("ferpa","coppa","ccpa","gdpr")
-- shared by the legacy US/US-COPPA/US-CA/hypothetical-EU rows, so it would deactivate
-- BOTH the old and new rows for a given framework together, potentially leaving that
-- org with ZERO active rule (worse than the pre-backfill state). Use direct SQL, scoped
-- by the jurisdiction column, which is unique to the 6 new rows:
UPDATE compliance_rules
SET is_active = false
WHERE jurisdiction IN ('ferpa_us','coppa_us','ccpa_california','gdpr_eu','lgpd_brazil','pipeda_canada');
```
Then repeat Step 3 (Redis invalidation) — this is not optional on rollback either; without
it, already-cached workers keep serving the rolled-back (but still-cached) rich rules for
up to an hour. Confirm via Step 4's `GET /jurisdictions` call that exactly the original 3
rows remain active.

This rollback is safe and non-destructive: it doesn't delete data (rows stay in the table,
just `is_active = false`), doesn't touch `003`'s effects (those live inside the now-inactive
rows' `rule_definition`, harmless at rest), and returns every org to exactly its
documented "today" behavior from §5.

### What this plan does NOT cover (explicitly out of scope, per the brief's own sizing guidance)

The 5 jurisdictions with authored JSON but no DB seed at all
(`privacy_act_au`, `pdpa_singapore`, `popia_za`, `lpdc_mx`, `aepd_ar` — serving `auprivacy`,
`pdpa`, `popia`, `lpdc`, `aepd` orgs) are **not addressed by this plan's Steps 1-5**. Per
the brief's instruction to scope this explicitly rather than force it into this pass:

- **No `JURISDICTION_ALIASES` code change is needed for these 5**, even in future work —
  confirmed by the same direct-match-first resolution mechanics in §5: these 5 have only
  ever had **one** spelling anywhere in the system (the config-file-style name, e.g.
  `aepd_ar`), matching their `backend/config/jurisdictions/{id}.json` filenames exactly. An
  alias is only needed to reconcile *two different* spellings for the same thing (as with
  `ferpa_us`↔`US`); a brand-new seed script that inserts rows with `jurisdiction = 'aepd_ar'`
  etc. (matching the filenames) needs zero alias entries to become immediately resolvable.
- Future work: a new script modeled directly on `002`'s structure (per the brief's
  "copy already-authored data" principle, same as `003`), reading
  `backend/config/jurisdictions/{aepd_ar,lpdc_mx,pdpa_singapore,popia_za,privacy_act_au}.json`
  and inserting one `compliance_rules` row per file, run through the exact same
  Steps 1-style sequencing (idempotent INSERT, verify, invalidate cache, spot-check
  enforcement before/after). Not attempted here — sizing it accurately requires reading all
  5 JSON files in full to confirm they parse cleanly through `_deserialise_jurisdiction()`'s
  canonical-schema path (§4's discussion of `PrivacyRule.model_validate` / `effective_max_retention_days()`),
  which this pass did not do exhaustively for all 5.
- `add_field_encryption.py` and `add_breach_incidents_table.py` (§2) are real, separate gaps
  surfaced by this audit but unrelated to jurisdiction data — flagged for separate follow-up,
  not folded into this plan.

---

## Summary of what's NOT fully certain (flagged per the brief's explicit instruction)

1. **The missing 4th `EU`/GDPR row** (§1c) — best-supported theory (savepoint-fix timing)
   doesn't fully explain why only 3 of the current code's 4 framework inserts are visible
   as active. Resolve with the Step 0 SQL query before treating §1's narrative as complete.
2. **`add_activity_phase_columns.py`, `add_curriculum_created_by.py`, `add_privacy_notices_table.py`**
   (§2a) were not cross-checked against `startup.py`/`init.sql` for a superseding path the
   way the others were — flagged as unverified, believed lower-risk than `compliance_rules`
   because a missing column there fails loudly (500) rather than silently.
3. **`20260602_ai_routing_tables.py`'s `ai_batch_queue`/`ai_api_keys`/`teacher_notifications`
   tables** and **`20260602_completion_mode.py`'s full `activity_submissions` column list**
   (§2b) — only `ai_task_config` and `completion_mode` themselves were confirmed superseded;
   the remaining tables/columns in those two files were not individually verified.
4. Whether all 5 of the not-yet-seeded jurisdictions' JSON files (`aepd_ar.json` etc.) parse
   cleanly through the existing deserialization path without errors — assumed likely (since
   `gdpr_eu.json`'s richer structure was already confirmed compatible per
   `PRIVACY_BUGFIX_PLAN.md`'s own investigation), but not independently re-verified for all 5
   in this pass.
5. The exact behavioral delta for `strict` org's FERPA-labeled traffic is worth double
   checking: the legacy `US` row says `student_monitoring_allowed: True`; the new rich
   `ferpa_us` row says `student_monitoring_allowed: False`. Since `strict` also includes
   `coppa_us` (which is `False` in both old and new forms, and `merge_jurisdictions` uses
   `all()` — strictest wins), the *merged* result for `strict` is `False` either way, so
   this particular delta is very likely a non-issue for that org specifically — but
   `lenient` (which is `ferpa_us` **alone**, no COPPA) goes from `True` (legacy) to `False`
   (new rich row) on `student_monitoring_allowed` with nothing else to override it. Confirm
   in Step 4 whether any code path actually branches on `student_monitoring_allowed` for a
   monitoring-type action `lenient`-org users take today, since this is the one boolean-level
   (not just consent_rules-level) behavior change identified in this pass.
