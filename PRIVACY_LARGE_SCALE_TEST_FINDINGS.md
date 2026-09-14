# Privacy Enforcement — Stage 3 Large-Scale Sweep Findings (LOCAL only)

**Scope**: `PRIVACY_LARGE_SCALE_TEST_PLAN.md` Table 2c-i (12 jurisdictions × 5
scenarios, canonical endpoint `POST /student/field-notes`), plus a lighter
pass at Table 2c-ii (cross-endpoint parity) and Table 2c-vi (structurally
non-blocking sites). Run entirely against the **local** Docker stack
(`peripateticware-backend` / `-postgres` / `-redis`) — no SSH, no prod API
calls. Local `ENFORCEMENT_MODE` was `block` (the code default; no
`ENFORCEMENT_MODE` was set in the local `.env`) at the start of this
session — set to `log` for this sweep (see "Environment note" below) to
match the task's Stage 3 premise and prod's actual current mode.

Status key: ✅ pass · 🔴 bug (fixed) · 🟡 needs a decision

## Environment note (read first)

Local `.env` had no `ENFORCEMENT_MODE` set at all, so the code default
(`"block"`, `core/config.py`) was live locally before this session started.
Added `ENFORCEMENT_MODE=log` to `C:\dev\peripateticware\.env` and
force-recreated the backend container so local matches prod's actual mode
and this Stage's "still in log mode" premise. Verified via
`GET /api/v1/privacy/status` before and after. **This local-only `.env`
change is not committed** (`.env` is gitignored / not tracked) — flagging it
here so the coordinator knows local state changed, in case anything else in
this repo assumes local defaults to `block`.

Migrations `002`–`005` were confirmed already applied to the local DB
(21 active `compliance_rules` rows, including all 11 real jurisdictions +
legacy rows) before this sweep began — no re-run was needed.

## Summary / tally

| Table | Cases | Pass | Fail (before fix) | Fail (after fix) |
|---|---|---|---|---|
| 2c-i (12 jurisdictions × 5 scenarios, via `POST /student/field-notes`) | 60 | 60 | 1 (`lenient`/S1) | 0 |
| 2c-ii (cross-endpoint parity: `POST /activities/{id}/start`, `POST /sessions/`, gdpr + lenient) | 6 | 6 | 0 | 0 |
| 2c-vi (structurally non-blocking: reflection, notebook, `strict` org) | 2 | 2 | 0 | 0 |
| **Total** | **68** | **68** | **1** | **0** |

Plus 2 new regression unit tests added to `backend/tests/test_privacy_enforcement.py`
(full suite: **68 passed**, up from 66).

**One genuine bug found and fixed** (Finding 1 below) — exactly the
"should-allow case unexpectedly blocks" failure mode the test plan calls
highest priority. No should-block case failed to block (no false negatives
found). All HTTP responses were `201`/`200` throughout (as expected in `log`
mode) — every assertion in this sweep is against the `rule_audit_log`
audit trail (`would_block` / `compliance_status` / `rules_applied`), not
HTTP status, per the task's framing.

**Recommendation: do NOT proceed to Stage 4 (flip to `warn`) — in prod or
locally — until Finding 1's fix (migration `006`) is also applied to
prod's `compliance_rules` table.** Prod already has migration `002`'s
`ferpa_us` row (Stages 1/2 are deployed there per the handoff docs), so
prod almost certainly carries the identical bug right now, dormant only
because prod is also in `log` mode. The moment `warn`/`block` goes live,
every real prod org whose *only* seeded jurisdiction is `ferpa_us` (no
COPPA, no state law) would start being flagged/blocked on ordinary
GPS-tagged student evidence with no consent path that could ever satisfy
it — FERPA does not require one. See Finding 1 for the full mechanism.

---

## Table 2c-i results — 12 jurisdictions × 5 scenarios (canonical: field-notes)

All cases below are **post-fix** (after migration `006`, see Finding 1).
Every row shows `http_status=201` (log mode never blocks the HTTP call) and
`compliance_status=ALLOWED` (log mode collapses this too) — the only
meaningful signal is `enforcement_actions.would_block`, shown per case.

| Jurisdiction | S1 should-BLOCK | S2 should-ALLOW (consent) | S3 should-ALLOW (non-sensitive) | S4 should-BLOCK (COPPA override) | S5 should-ALLOW (COPPA+consent) |
|---|---|---|---|---|---|
| strict (`coppa_us`+`ferpa_us`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| lenient (`ferpa_us`) | 🔴→✅ wb=false (see Finding 1) | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| ccpa (`ccpa_california`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| gdpr (`gdpr_eu`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| pipeda (`pipeda_canada`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| lgpd (`lgpd_brazil`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| auprivacy (`privacy_act_au`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| pdpa (`pdpa_singapore`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| popia (`popia_za`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| lpdc (`lpdc_mx`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| aepd (`aepd_ar`) | ✅ wb=true | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |
| baseline (none) | ✅ wb=false (permissive class — correct) | ✅ wb=false | ✅ wb=false | ✅ wb=true | ✅ wb=false |

Notes:
- `lenient` and `baseline` are the **permissive class** per the test plan's
  own jurisdiction matrix (§2a) — S1's *correct* expected outcome for these
  two is `would_block=false`, not `true`. Both now show the correct result
  after Finding 1's fix (before the fix, `lenient` incorrectly showed
  `wb=true`; `baseline` was correct throughout since it resolves to no
  jurisdiction at all, never touching the buggy `ferpa_us` row).
- S4/S5 (under-13, real DOB) `rules_applied` was spot-checked for `lenient`,
  `gdpr`, and `baseline` and confirmed to literally include `coppa_us`
  alongside the org's own jurisdiction (e.g.
  `"gdpr_eu,coppa_us"`, `"US_FEDERAL,coppa_us"`) — direct proof the COPPA
  age-override fires regardless of the org's own jurisdiction, exactly the
  behavior this round's earlier fix (Track A) targeted.
- S2/S5 consent was granted as a blanket `ConsentRecord(consent_type=
  'parental', is_active=True)` row per student, matching
  `_has_valid_consent()`'s fallback path (`services/privacy_engine.py`).
- Evidence: local `rule_audit_log` rows, actor-hashed per
  `hash_actor_id()`; raw JSON captured at
  `C:\dev\peripateticware\PRIVACY_SWEEP_RESULTS_final.json` (60 cases) for
  the full per-case detail (rules_applied, compliance_status, timestamps).

---

## Table 2c-ii — cross-endpoint parity spot-check (gdpr + lenient)

| Endpoint | Org | Scenario | Expected wb | Actual wb | Result |
|---|---|---|---|---|---|
| `POST /student/activities/{id}/start` (C1) | gdpr | S1 (GPS, no consent) | true | true | ✅ |
| `POST /student/activities/{id}/start` (C1) | lenient | S1 (GPS, no consent) | false | false | ✅ |
| `POST /student/activities/{id}/start` (C1) | gdpr | S3 (no GPS) | false | false (gate structurally not invoked) | ✅ |
| `POST /student/activities/{id}/start` (C1) | lenient | S3 (no GPS) | false | false (gate structurally not invoked) | ✅ |
| `POST /sessions/` (C4) | gdpr | S1 (GPS — required by schema) | true | true | ✅ |
| `POST /sessions/` (C4) | lenient | S1 (GPS — required by schema) | false | false | ✅ |

No site-specific wiring bugs found at either site. Note: `POST /sessions/`
(C4)'s request schema (`CreateSessionRequest`) makes `latitude`/`longitude`
**required** fields (not optional) — there is no way to call this endpoint
without GPS, so no S3-style ("no evidence at all") variant is structurally
possible there; this is a schema property, not a bug, and is noted here
only because the test plan's §2c-ii table assumed an S3-equivalent existed
at every site.

Evidence: `C:\dev\peripateticware\PRIVACY_SWEEP_RESULTS_part2_final.json`.

## Table 2c-vi — structurally non-blocking sites (confirm-only, `strict` org)

| Endpoint | Expected wb | Actual wb | Result |
|---|---|---|---|
| `POST /sessions/{id}/reflection` (C3) | false | false | ✅ |
| `POST /student/notebook` (C9) | false | false | ✅ |

Both confirmed to never block even against the strictest local org
(`coppa_us`+`ferpa_us`) — neither route ever passes `evidence_types` to
`enforce_or_raise()`, so the sensitive-evidence branch structurally cannot
fire, exactly as designed.

---

## Finding 1 — 🔴 `ferpa_us` seed data silently turned a permissive org into a permanently-blocking one (fixed)

- **Endpoint**: any of the 9 mode-gated `enforce_or_raise()` call sites
  (found via `POST /student/field-notes`, confirmed independently at
  `POST /student/activities/{id}/start` and `POST /sessions/` during the
  2c-ii pass) — this is a **data** bug, not a route-specific one, so it
  affects every site that runs `enforce_on_submission()`.
- **Symptom**: a plain adult/unknown-age student in an org whose *only*
  seeded jurisdiction is `ferpa_us` (the `lenient` test org: FERPA alone,
  no COPPA) submitting an ordinary GPS-tagged field note with **no**
  consent record on file was flagged `would_block=true` — i.e., Table
  2c-i's S1 case, which per the test plan's own jurisdiction matrix (§2a)
  should be the **permissive** class's one `would_block=false` result
  alongside `baseline`, came back as if `lenient` were a blocking-class
  org like the other 10.
- **Root cause**: `backend/migrations/002_seed_privacy_rules.py` authored
  the `ferpa_us` `compliance_rules` row with
  `"student_monitoring_allowed": False`. `enforce_on_submission()`
  (`backend/services/privacy_engine.py`) reads this flag on a code path
  **independent** of the same row's `consent_rules` field — and that
  row's own `consent_rules[0]` entry *explicitly* says the opposite:
  `"consent_type": "none_required", "requires_parental_consent": False`,
  with the note *"FERPA uses rights transfer, not consent-based model."*
  The coarse boolean directly contradicted the row's own, more carefully
  authored, more specific field. Confirmed by direct query: the row's
  `rule_definition->>'student_monitoring_allowed'` was `false` in the local
  DB (seeded by `002` earlier today). The legacy `US` row (FERPA under the
  old naming convention, still active for the fallback path) correctly has
  `student_monitoring_allowed: true` — `ferpa_us` was meant to supersede it
  with equivalent-or-richer content, not silently tighten this one flag.
  This exact risk was already flagged, but not yet confirmed, in
  `PRIVACY_JURISDICTION_DATA_BACKFILL_PLAN.md`'s own Summary item 5.
- **Impact**: **HIGH once `warn`/`block` mode is live** (currently dormant
  under `log` in both local and prod). Any real org onboarded with FERPA as
  its only jurisdiction (a very plausible real-world case — a US school
  with no state-specific law seeded, no under-13 students) would have
  every sensitive-evidence submission (GPS, photo, audio, video,
  biometric) from every adult/non-minor student flagged as requiring
  consent that FERPA itself does not require and that has no path to ever
  be satisfied through the product's normal parental-consent flow (that
  flow is COPPA/under-13-shaped). This is precisely the "should-allow case
  that unexpectedly blocks" failure mode the test plan's own framing calls
  the highest-priority thing to catch before a mode flip. **Prod almost
  certainly has the identical bug right now** (Stages 1/2, including
  migration `002`, are already deployed to prod per
  `PRIVACY_ENFORCEMENT_HANDOFF.md`/backfill-plan docs) — it just hasn't
  bitten anyone yet because prod is also in `log` mode.
- **Fix**:
  - `backend/migrations/002_seed_privacy_rules.py` — corrected the source
    literal (`student_monitoring_allowed: False → True` for `ferpa_us`),
    so a fresh seed on a clean database is right from the start.
  - `backend/migrations/006_fix_ferpa_monitoring_allowed_bug.py` (new) —
    idempotent fix-forward `UPDATE` for the already-seeded row (same
    pattern as `003`/`004`), since `002`'s `ON CONFLICT (rule_id) DO
    NOTHING` means re-running it does not pick up the source fix. Run
    locally; **needs to be run against prod too**, followed by the usual
    Redis `privacy:rules:all` cache invalidation, before Stage 4.
  - Two new regression tests in `backend/tests/test_privacy_enforcement.py`
    (`TestFerpaMonitoringAllowedRegression`): one asserts the `002` source
    literal directly (fails immediately if someone re-authors the bug back
    in, no DB/HTTP needed), one runs the real `enforce_on_submission()`
    logic against the real deserialized `ferpa_us` rule content (only the
    DB-lookup collaborators mocked, per the project's established "mock
    only the actual boundary" convention from the earlier Redis
    cache-round-trip bug) and asserts `would_block is False`.
- **Verified locally**: DB row confirmed `student_monitoring_allowed: true`
  after running `006`; Redis `privacy:rules:all` key invalidated; re-ran
  the live `POST /student/field-notes` call for the `lenient` org's adult
  student — `would_block` flipped from `true` to `false`
  (`compliance_status=ALLOWED`, `blocking_reason=null`). Full 60-case
  Table 2c-i sweep re-run afterward: 60/60 pass. `backend/tests/
  test_privacy_enforcement.py` full suite: 68/68 pass (66 pre-existing + 2
  new).
- **Found**: 2026-09-13, this session, Stage 3 large-scale local sweep,
  Table 2c-i S1 against the `lenient` org.
- **Severity**: **High** (would cause real, permanently-unsatisfiable
  false-positive blocking for a real class of orgs the instant `warn`/
  `block` mode goes live) but **currently dormant** in both local and prod
  (both in `log` mode as of this writing).
- **Committed**: branch `fix/privacy-ferpa-monitoring-allowed-bug` (see
  below) — not `main`, not pushed, per the handoff pattern. **Not yet
  applied to prod** — migration `006` needs to be run there and the Redis
  cache invalidated before Stage 4 proceeds.

---

## What was NOT covered in this pass (explicitly out of scope, per the task)

- Table 2c-iii (GPS-streaming hard-block trio, B1–B4) and Table 2c-iv
  (activity-publish gate, D1) — explicitly excluded by the task as separate
  future stages.
- Table 2c-v (`under_16`/`under_18` no-differential-treatment confirmation)
  — not requested for this pass.
- Full 24-case 2c-ii combinatorial sweep — only a 2-site, 2-org spot-check
  was requested ("lighter touch, not the main focus"); no further
  cross-endpoint wiring issues were found at the 2 sites checked, but the
  other 5 mode-gated call sites (C2, C6, C7, C8, plus the D1/D2
  publish-gate family) remain unexercised against this jurisdiction data
  and are worth a future pass, especially C2 (the historically-original
  finding site) once `warn`/`block` is closer.

## Files touched this session

- `C:\dev\peripateticware\.env` — added `ENFORCEMENT_MODE=log` (local only,
  not committed/tracked).
- `backend/migrations/002_seed_privacy_rules.py` — source fix
  (`ferpa_us.student_monitoring_allowed`).
- `backend/migrations/006_fix_ferpa_monitoring_allowed_bug.py` — new,
  fix-forward migration for the already-seeded row.
- `backend/tests/test_privacy_enforcement.py` — 2 new regression tests
  (`TestFerpaMonitoringAllowedRegression`).
- `backend/scripts/privacy_sweep_local.py`,
  `backend/scripts/privacy_sweep_local_part2.py` — new, the test-execution
  scripts used for this sweep (provisioning + live HTTP + audit-log
  verification). Left in place for reuse in a future stage; not wired into
  CI, not referenced by app code.
- Raw per-case JSON: `PRIVACY_SWEEP_RESULTS_final.json`,
  `PRIVACY_SWEEP_RESULTS_part2_final.json` (repo root, this session).
- Local test data created (all `local-sweep-*@thewordinbits.com`, clearly
  named, local dev DB only): 12 orgs (`organizations.slug =
  local-sweep-<jurisdiction>`), each with 1 teacher + 1 adult/unknown-age
  student + 1 under-13 student + (for the `gdpr`/`lenient` parity pass) 1
  extra consent-free "parity" student; 2 shared test activities, 1
  curriculum unit, 1 learning session (all titled `Local Sweep — ...` for
  easy identification/cleanup). Not cleaned up — left for a future stage
  or for the coordinator to clear per their own convention (no prod
  equivalent exists; these are local-DB-only rows).
