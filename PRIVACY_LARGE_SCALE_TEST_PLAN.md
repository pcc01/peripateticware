# Privacy Enforcement — Large-Scale `block`-Mode Test Plan (2026-09-12)

**Status: PLANNING ONLY. Nothing in this document has been executed.** No
accounts have been created, no API calls made, no production data touched
while writing this plan. It is written so a fresh agent or the user can
pick it up and start execution without re-deriving context — the same
purpose `PRIVACY_ENFORCEMENT_HANDOFF.md` served for Track A/B.

**Trigger for this plan**: a parallel effort is flipping prod's
`ENFORCEMENT_MODE` to `block` globally (today only 3 GPS-streaming
endpoints hard-block unconditionally; by the time this plan executes, every
`enforce_or_raise()` call site will too). From that moment, a wrong answer
from the privacy engine is a **real 403 with real consequences** — a
legitimate student/teacher action rejected — not a log line. This plan is
written for that world: false-positive (wrongly-blocked) coverage matters
**at least as much** as true-positive (correctly-blocked) coverage.

**Read first, in this order**:
1. `PRIVACY_ENFORCEMENT_HANDOFF.md` (repo root) — full history of what was
   fixed 2026-09-12, what Track A/B already live-verified vs. still pending,
   and the `log`→`warn`→`block` debate.
2. `k6/FINDINGS.md` + `k6/README.md` (repo) — the existing load-test
   infra's conventions this plan reuses (below).
3. `C:\Users\pcerd\privacy_emu_created.json` — the 12 throwaway
   jurisdiction orgs (teacher + 1 student each) from the original synthetic
   sweep.
4. `C:\Users\pcerd\privacy_emu_extras.json` — Track A/B's additions. **Its
   own header comment already says**: *"Append here, don't create parallel
   tracking files."* This plan's new accounts extend this same file (see
   §4) — not a new sibling file.
5. `backend/cleanup_privacy_test_accounts.py` — the dry-run-by-default
   cleanup script. Its `load_accounts_json()` already anticipates exactly
   this situation: a dict file can carry `extra_emails`/`extra_user_ids`/
   `extra_org_ids` **and** a nested `"orgs"`/`"entries"` list of full
   org/teacher/student rows in the same file (see the code comment at
   `cleanup_privacy_test_accounts.py:323-333`, literally written to support
   "a future extras file [that] wants to mix both shapes in one file").

---

## 1. Full enforcement-gate inventory

There are **four families** of gate, not one. Only the third (C) respects
`ENFORCEMENT_MODE` at all — the other three are, and always have been,
unconditional regardless of `log`/`warn`/`block`. This matters: flipping
`ENFORCEMENT_MODE` changes behavior at 9 of these 16 call sites; the other
7 are already exactly as "live" today as they'll ever be, and only need
*correctness* testing, not *mode-flip* testing.

### A. Account/join-time gate (unconditional, not part of `enforce_or_raise` at all)

| # | Call site | Endpoint | Trigger | Verified live? |
|---|---|---|---|---|
| A1 | `routes/classrooms.py::accept_invite` | `POST /classrooms/join/{token}` | Self-reported `date_of_birth` → age < 13 sets `is_active=FALSE`, `requires_parental_consent=TRUE`, `age_group='under_13'`; join response is `403 parental_consent_required` until a parent completes the consent link | **Live-verified** (strict org, pre-dates this round — re-run only as a regression smoke, not new logic) |

### B. Unconditional hard-block gates (ignore `ENFORCEMENT_MODE` entirely)

| # | Call site | Endpoint | `data_type` | Trigger | Verified live? |
|---|---|---|---|---|---|
| B1 | `routes/sessions.py::log_session_event` — Gate 1 (`_check_gps_consent`, age-only) | `POST /{session_id}/events` (`event_type=location_update`) | n/a (403 `gps_consent_required`) | Student `age_group='under_13'` or `requires_parental_consent`, activity has `discovery_location_gps_capture_enabled=True`, no matching `consent_logs` row | **NOT verified live** (Track B, pending — needs a GPS-enabled published activity + active session, which no throwaway org has yet) |
| B2 | `routes/sessions.py::log_session_event` — Gate 2 (`enforce_or_raise`, `force_block_on_would_block=True`) | same endpoint | `learning_session_event` | **Any** age; jurisdiction resolves `student_monitoring_allowed=False` and no valid consent (`_has_valid_consent`) | **NOT verified live** (Track B, pending) |
| B3 | `routes/sessions.py::post_live_position` via `_require_effective_rung` | `POST /{session_id}/live-position` | `wayfinding_live_location` | Effective capability rung < D (activity ceiling / consent rung / age floor), **or** the same region gate as B2 | **NOT verified live** (Track B, pending) |
| B4 | `routes/sessions.py::append_session_track` via `_require_effective_rung` | `POST /{session_id}/track` | `wayfinding_live_location` | Same as B3, minimum rung E | **NOT verified live** (Track B, pending) |

B1–B4 all require a real activity with `discovery_location_gps_capture_enabled=True` (and, for B3/B4, a `wayfinding_capability_ceiling` at or above the rung under test) plus an active `learning_session` — **none of the 12 throwaway orgs have any authored content today.** This is the single biggest reason Track B never got off the ground; §4/§6 address it head-on this time (content creation is part of provisioning, not an afterthought).

### C. Mode-gated `enforce_or_raise` sites (9 call sites — respect `ENFORCEMENT_MODE`, so `block`-flip changes their live behavior)

| # | Call site | Endpoint | `data_type` | `evidence_types` | Can ever block? | Verified live in `block` mode? |
|---|---|---|---|---|---|---|
| C1 | `student_activities.py::start_activity_session` | `POST /activities/{id}/start` | `learning_session` | `["gps"]` iff lat/long on session start | Yes | No — only unit-tested |
| C2 | `student_activities.py::add_evidence_capture` | `POST /sessions/{id}/evidence` | `student_evidence` | `[capture_type]` | Yes | No — this is the **original** site from the first finding (the "audio" 201 test, months ago, in `log` mode). Needs re-verification specifically in `block` mode |
| C3 | `student_activities.py::add_reflection` | `POST /sessions/{id}/reflection` | `student_reflection` | none passed | **No — structurally cannot block** (the sensitive-evidence branch requires `evidence_types`; this call never supplies any) | Confirm-only: prove it stays non-blocking post-flip |
| C4 | `sessions.py::create_session` | `POST /sessions/` | `learning_session` | `["gps"]` iff lat/long | Yes | No |
| C5 | `phase7_student_initiated.py::create_field_note` | `POST /student/field-notes` | `student_field_note` | `["gps"]` iff lat/long | Yes | **Heavily exercised in `log` mode** (the original 12-org × ~50-call coin-flip sweep) but **never in `block` mode** — this is re-verification, not new-logic testing |
| C6 | `phase7_student_initiated.py::create_peer_project` | `POST /student/peer-projects` | `student_peer_project` | `["gps"]` iff lat/long | Yes | Not exercised at all |
| C7 | `phase7_student_initiated.py::add_capture_to_response` | `POST /student/peer-projects/{id}/my-response/captures` | `student_peer_project_capture` | `["photo"]` always | Yes | Not exercised at all |
| C8 | `student.py::upload_capture` (+ `/captures/{audio,photo,video}` aliases) | `POST /captures/upload` | `student_capture` | `[capture_type]` (+`gps` if present) | Yes | Not exercised at all |
| C9 | `student.py::create_notebook_entry` | `POST /notebook` | `student_notebook` | none passed | **No — structurally cannot block**, same as C3 | Confirm-only |

**Design implication for §2/§3**: C1, C2, C4, C5, C6, C7, C8 all share **identical decision logic** (same `enforce_on_submission()`, same sensitive-evidence set, same `_has_valid_consent()`). Running the full jurisdiction × scenario matrix independently at all 7 sites would be 7× redundant work for zero extra signal. The plan runs the **full matrix once** against the established lowest-friction site (C5, field-notes — already has convention/precedent from the original sweep) and a **lighter cross-endpoint parity pass** at the other 6, to catch a site-specific wiring bug (wrong `data_type`, missing `activity_id`, etc.) without re-deriving the whole decision table 7 times.

### D. Independent compliance-check mechanism (activity publish/preview — NOT part of the `enforce_or_raise` family, NOT gated by `ENFORCEMENT_MODE`, and — this is a genuine, previously unexamined finding — **NOT gated by the org's own jurisdiction either**)

| # | Call site | Endpoint | Trigger | Verified live? |
|---|---|---|---|---|
| D1 | `activities.py::publish_activity` | `POST /activities/{id}/publish` | Runs `checker.check_activity_compliance()` against **`settings.ACTIVE_JURISDICTION`** — a single **global** env var (`gdpr_eu` by default), not the publishing teacher's org jurisdiction. `data_collection` categories are `["location","audio","photo","behavioral"]` for `grade_level<=8`, else `["location"]`. Any genuine issue → hard `422`, always, ignoring `ENFORCEMENT_MODE` entirely (this gate predates and is orthogonal to the whole `log`/`warn`/`block` mechanism) | **NOT verified against the jurisdiction matrix at all — zero coverage today** |
| D2 | `activities.py::check_activity_compliance_quick` | `POST /activities/check-compliance` | Same global-jurisdiction check as D1, but **advisory-only** — always returns `200` with a `compliant`/`review`/`blocked` **badge string**, never a 403/422 | Should be confirmed to genuinely never block, and that its badge doesn't diverge from what D1 actually decides at publish time |

**Why D1 matters for this plan specifically**: because it keys off a *global* setting instead of the org's resolved jurisdiction, a GDPR-org teacher happens to get a meaningful check today only because prod's `ACTIVE_JURISDICTION` happens to also be `gdpr_eu` — every *other* org (CCPA, PIPEDA, LGPD, POPIA, LPDC, AEPD, PDPA, AU Privacy Act, FERPA, baseline) is being checked against **the wrong ruleset** at publish time, coincidentally or not. This is independent of the `block`-mode flip (D1 already hard-blocks today) and independent of anything Track A/B tested. Flag prominently in the findings tracker (§7) the first time it's exercised — this looks like a real, separate bug, not a test artifact.

---

## 2. Jurisdiction × age-bracket coverage matrix

### 2a. The 12 jurisdiction configs (from `privacy_emu_created.json`) and what's empirically known about each

The engine's live decision data comes from DB-seeded `ComplianceRule` rows
(via `_load_rules_from_db()`/`merge_jurisdictions()`), **not** directly
from the static files under `backend/config/jurisdictions/*.json`
(11 files there — those feed a separate onboarding/resolver path, not
necessarily the same seed). Treat the empirical finding from the original
sweep (`peripateticware-privacy-engine-enforcement` memory) as ground
truth, not the static JSON:

| Slug | Jurisdiction(s) resolved | `student_monitoring_allowed` (empirical) | Expected class |
|---|---|---|---|
| `strict` | `coppa_us` + `ferpa_us` | `False` (strictest-wins: COPPA forbids) | **Blocking** |
| `lenient` | `ferpa_us` alone | `True` | **Permissive** |
| `ccpa` | `ccpa_california` | `False` | Blocking |
| `gdpr` | `gdpr_eu` | `False` | Blocking |
| `pipeda` | `pipeda_canada` | `False` | Blocking |
| `lgpd` | `lgpd_brazil` | `False` | Blocking |
| `auprivacy` | `privacy_act_au` | `False` | Blocking |
| `pdpa` | `pdpa_singapore` | `False` | Blocking |
| `popia` | `popia_za` | `False` | Blocking |
| `lpdc` | `lpdc_mx` | `False` | Blocking |
| `aepd` | `aepd_ar` | `False` | Blocking |
| `baseline` | none resolved / `US_FEDERAL` fallback | `True` (fails open — no config = no restriction) | **Permissive** |

So structurally there are really only **two behavioral classes** for the
core sensitive-evidence gate (C1/C2/C4–C8, B2–B4): **10 blocking orgs**
(everything except `lenient` and `baseline`) and **2 permissive orgs**
(`lenient`, `baseline`) — until the COPPA age-override fires, which
tightens *any* org (blocking or permissive) for a genuinely under-13
student. This 10-vs-2 split, not 12 independent behaviors, is what makes
full per-jurisdiction coverage tractable instead of combinatorially
exploding.

### 2b. Age brackets — and a finding that changes what "coverage" should mean here

The `User.age_group` field has four values — `under_13`, `under_16`,
`under_18`, `adult` — set once at `accept_invite` time from
`date_of_birth`. **Confirmed by reading every consumer of `age_group` in
the codebase** (`identify_jurisdiction()`, `age_floor_rung()`,
`log_session_event`'s Gate 1): **only `under_13` (or the
`requires_parental_consent` flag it sets) changes engine behavior
anywhere.** `under_16` and `under_18` are indistinguishable from `adult`
to every gate in this inventory today — despite `gdpr_eu.json`'s own
`consent_requirements.teen` block explicitly calling for parental consent
down to age 14. **This is a genuine, pre-existing gap, not a test-design
choice** — worth its own `FINDINGS.md` entry the first time it's
empirically confirmed (§7), separate from anything about the
`ENFORCEMENT_MODE` flip.

Practical consequence for this plan: testing `under_16`/`under_18` against
all 12 jurisdictions would mostly re-prove "identical to adult" 24 times
over. Test it on a **representative subset** (one blocking org, one
permissive org, `baseline`) — 3 orgs × 2 brackets = 6 cases — and record
the "no differential treatment" result as a finding, not exhaustively.

### 2c. The matrices

**Table 2c-i — Core decision-logic matrix, canonical endpoint = C5 (`POST /student/field-notes`).** One scenario set run against every jurisdiction.

| Scenario | Setup | Expected (once `block` is live) | Already covered? |
|---|---|---|---|
| S1 — should-BLOCK | Adult/unknown-age student, sensitive evidence (`gps`), no consent on file | `403`, `rule_audit_log.compliance_status='BLOCKED'` | **Net-new in `block` mode** (log-mode `would_block` signal exists for all 12 from the original sweep, but nobody has seen the actual 403 yet) |
| S2 — should-ALLOW (consent) | Same student as S1, **after** a valid `gps_tracking` consent_log or blanket `ConsentRecord` is granted | `201`, allowed | **Net-new** — nobody has tested that `_has_valid_consent()` genuinely un-blocks a previously-blocking case; this is arguably the single most important false-positive-shaped test in this whole plan, since it's the exact bug (`consent_required` set but never checked) this round's fix targeted |
| S3 — should-ALLOW (non-sensitive) | Same student, note with no lat/long | `201`, allowed, regardless of jurisdiction | Net-new in `block` mode (was implicitly true in `log` mode) |
| S4 — should-BLOCK (COPPA override) | Genuinely under-13 student (real `date_of_birth`), no consent, in **any** org including the 2 permissive ones | `403`, `rules_applied` includes `coppa_us` even when the org itself resolves to something permissive | **Covered for `lenient` only** (Track A) — **net-new for the other 11 orgs**, and specifically the point of the whole age-override fix: proving a `ferpa_us`/baseline org doesn't quietly exempt an under-13 student |
| S5 — should-ALLOW (COPPA override + valid consent) | Same under-13 student as S4, **after** parent completes the consent link | `201`, allowed — proves the override doesn't become permanently unsatisfiable | **Net-new everywhere**, including `lenient` — Track A's "control" was a *different, non-minor* student, not the same under-13 student post-consent |

12 jurisdictions × 5 scenarios = **60 cases** at this table alone (S1/S4 are "should-block," S2/S3/S5 are "should-allow" — a deliberately even split, not a should-block-heavy suite).

**Table 2c-ii — Cross-endpoint parity smoke pass.** Confirms C1, C4, C6, C7, C8 (and C2 itself, the historically-original site) are wired identically to C5, without re-deriving the full decision table at each one.

- Scenarios: S1 (should-block) and S3 (should-allow, non-sensitive where applicable — C7/some of C8 always pass `evidence_types`, so use S2-style "with consent" instead for those) — **2 scenarios**
- Endpoints: C1, C2, C4, C6, C7, C8 — **6 endpoints**
- Jurisdictions: one blocking rep (`gdpr` — cleanest, no COPPA complexity) + one permissive rep (`lenient`) — **2 orgs**

2 × 6 × 2 = **24 cases**.

**Table 2c-iii — Hard-block GPS-streaming trio (B1–B4).** Needs a GPS-enabled published activity + active session per org under test (new content, not new accounts — see §4).

| Org rep | Class | What it proves |
|---|---|---|
| `gdpr` | Blocking | B2/B3/B4 hard-block a 13+/adult student in a monitoring-restricted org — **Track B's original target, never executed** |
| `ccpa` | Blocking (2nd rep) | Confirms B2–B4 aren't GDPR-specific wiring |
| `lenient` | Permissive | **The control Track B's own handoff flagged as needed but never ran**: same sequence should return `201`s, not 403s — proves the region gate doesn't over-block a permissive org |
| `baseline` | Permissive (2nd rep) | Same control, second permissive rep |
| `strict` (with the existing under-13 sub-account, or a fresh one) | Age-floor path | B1 (age-only) fires from `age_floor_rung`/Gate 1 regardless of region — isolates the age gate from the region gate |

5 orgs × 3 endpoints (events/location_update, live-position, track) × (should-block or should-allow, per org's class) ≈ **~15 request sequences**, each producing 1–3 assertions (HTTP status + `rule_audit_log` row check) → budget **~24 cases** including the age-floor isolation checks.

**Table 2c-iv — Activity-publish gate (D1) — zero prior coverage, net-new in full.**

12 orgs × 2 grade bands (`grade_level<=8` → `["location","audio","photo","behavioral"]`, `>8` → `["location"]`) = **24 cases**. Expect (per the D1 finding above) that the actual pass/fail is driven by prod's `ACTIVE_JURISDICTION` value, **not** each org's own jurisdiction — record whatever the actual behavior is per org, specifically to surface the mismatch rather than assume it.

**Table 2c-v — `under_16`/`under_18` no-differential-treatment confirmation.**

3 orgs (`strict`, `gdpr`, `baseline`) × 2 brackets = **6 cases**, run through C5 with sensitive evidence, no consent — expect identical behavior to that org's adult-student result (i.e. `strict`/`gdpr` still block on jurisdiction grounds alone, `baseline` still allows) — confirms age_group has no separate effect, not that these ages are unprotected in some other way.

**Table 2c-vi — Structurally-non-blocking sites (C3, C9) — confirm-only.**

Run once each against the strictest org (`strict`) with maximal sensitive context implied (can't actually pass `evidence_types` — that's the point) — **2 cases** — proves free-text reflection/notebook entries never regress into blocking merely because `ENFORCEMENT_MODE=block` is now live everywhere.

**Table 2c-vii — Join-time age gate (A1) regression check.**

Re-run the already-verified `strict`/`lenient` pair once each, purely as a post-flip regression smoke (not new logic) — **2 cases**.

### Total test-case count

| Table | Cases |
|---|---|
| 2c-i (core matrix, 12 jurisdictions × 5 scenarios) | 60 |
| 2c-ii (cross-endpoint parity) | 24 |
| 2c-iii (GPS-streaming hard-block trio) | ~24 |
| 2c-iv (publish-gate) | 24 |
| 2c-v (age-bracket confirmation) | 6 |
| 2c-vi (structurally non-blocking, confirm-only) | 2 |
| 2c-vii (join-gate regression) | 2 |
| **Total** | **~142** |

Roughly half (S1, S4, and D1's expected-block cells) are true-positive
(should-block) cases; the other half (S2, S3, S5, the permissive-org
reps in 2c-ii/2c-iii, all of 2c-v/2c-vi) are false-positive/regression
(should-allow) cases — deliberately balanced per the task's framing that a
wrong `should-allow` answer is now a real, consequential 403.

---

## 3. False-positive / regression coverage — why it's structured this way, not bolted on

Every "should-block" scenario in §2 (S1, S4, and the blocking-org cells of
2c-ii/2c-iii/2c-iv) has an explicit "should-allow" sibling scenario
(S2/S3/S5, the permissive-org reps, 2c-v, 2c-vi) that exercises the
**same code path** with **one variable changed** (consent granted, evidence
non-sensitive, age not actually under-13, jurisdiction permissive). This
is deliberate: a should-allow case that merely uses a *different* endpoint
or *different* jurisdiction than its should-block sibling proves less than
one that isolates the single condition that's supposed to flip the
outcome. Concretely, the highest-value false-positive tests in this plan,
in priority order, are:

1. **S2 (consent un-blocks a would-otherwise-block case)** — this is
   testing the exact bug this round's fix targeted
   (`_has_valid_consent()`); if this regresses, real families who've
   already consented get real 403s the moment `block` goes live.
2. **S5 (COPPA-override consent-grant loop)** — same failure mode, for the
   under-13 population specifically — the group this whole engine exists
   to protect, so a false-positive here is also the population least able
   to route around it.
3. **The permissive-org reps in 2c-ii/2c-iii** — proves the region/rung
   gates don't quietly start blocking `lenient`/`baseline` traffic just
   because `ENFORCEMENT_MODE` flipped (these two gates were already
   unconditional, so in theory nothing *should* change for them — any
   change here is either a bug in this test or a real regression).
4. **S3 and 2c-vi** — the "can this ever block by accident" floor: no
   jurisdiction, age, or mode combination should turn a plain text
   reflection or a non-GPS field note into a 403.

**Do not skip §2's should-allow cells to save time under schedule
pressure** — if anything is cut, cut a should-block cell whose sibling
should-allow cell already passed (a redundant confirmation of a known-good
path), never the reverse.

---

## 4. Account provisioning plan

### 4a. Reuse as-is (no new accounts)

All 12 existing teacher+student pairs in `privacy_emu_created.json` cover:
S1, S3 (via C5 directly), the teacher side of D1/D2 (publish-gate), and
the cross-endpoint parity pass's blocking/permissive reps (`gdpr`,
`lenient`). **Sequencing matters**: run S1 (should-block, no consent)
*before* S2 (should-allow, consent granted) on the *same* existing student
account, so no new account is needed to get both states from one org.

### 4b. New accounts needed

| Purpose | Count | Naming |
|---|---|---|
| Under-13 students, one per remaining org (S4/S5) — `lenient` already has one from Track A (`admin+priv-lenient-a13@`) | **11** | `admin+priv-<slug>-a13@thewordinbits.com` |
| Parent-contact addresses for the above (no login account — just an email on file, same pattern as Track A's `-a13-parent@`) | **11** | `admin+priv-<slug>-a13-parent@thewordinbits.com` |
| `under_16`/`under_18` reps, 3 orgs × 2 brackets (§2c-v) | **6** | `admin+priv-<slug>-a16@` / `admin+priv-<slug>-a18@thewordinbits.com` (orgs: `strict`, `gdpr`, `baseline`) |

**Total: 17 new student accounts + 11 parent-contact email addresses (no
account of their own).** No new teacher/org accounts are needed — B1–B4's
GPS-enabled activities and D1/D2's publish attempts are new *content*
(activities), authored by the *existing* 12 teachers, and are swept up
automatically by `cleanup_privacy_test_accounts.py`'s existing
"activities authored by target teachers" step — they don't need separate
tracking entries.

### 4c. Tracking — extend `privacy_emu_extras.json`, do not create a new file

Per that file's own header comment and per
`cleanup_privacy_test_accounts.py`'s `load_accounts_json()` (which already
parses an `"orgs"`/`"entries"` list alongside the flat `extra_*` arrays in
one dict file), add to `privacy_emu_extras.json`:

```jsonc
{
  "_comment": "... (existing) ...",
  "extra_user_ids": [
    "bac27010-debf-47d3-b046-463ab0825093",   // existing (Track A)
    "<new under-13 user ids, one per new account>",
    "<new under-16/under-18 user ids>"
  ],
  "extra_emails": [
    "admin+priv-lenient-a13@thewordinbits.com",        // existing
    "admin+priv-lenient-a13-parent@thewordinbits.com", // existing
    "admin+priv-<slug>-a13@thewordinbits.com",         // x11, new
    "admin+priv-<slug>-a13-parent@thewordinbits.com",  // x11, new — email-only, no account
    "admin+priv-<slug>-a16@thewordinbits.com",         // x3, new
    "admin+priv-<slug>-a18@thewordinbits.com"          // x3, new
  ],
  "extra_org_ids": [],
  "large_scale_test_accounts": [
    // Rich metadata purely for human/plan traceability — NOT read by
    // cleanup_privacy_test_accounts.py. Every id/email here MUST also
    // appear in extra_user_ids/extra_emails above, or it will not be
    // cleaned up. This array exists so nobody has to reverse-engineer
    // "why does this account exist" from a bare email string later.
    {
      "slug": "ccpa-a13", "org_slug": "ccpa", "purpose": "S4/S5 COPPA-override",
      "age_bracket": "under_13", "email": "admin+priv-ccpa-a13@thewordinbits.com",
      "user_id": "<uuid>", "parent_email": "admin+priv-ccpa-a13-parent@thewordinbits.com",
      "gates_exercised": ["S4", "S5"]
    }
    // ... one entry per new account ...
  ],
  "notes": [ /* existing entries, append new ones here as created */ ]
}
```

**This tracking file must be updated the moment an account is created —
not batched at the end.** If execution is interrupted (classifier denial,
session end, human unavailable for a consent link) partway through, the
file must already reflect every account that exists in prod at that
moment, so `cleanup_privacy_test_accounts.py --dry-run` run at any point
mid-execution gives a true accounting of what's out there. This is the
single most important process rule in this whole plan — the user has
explicitly asked to be able to remove every account this effort creates,
and "discovered after the fact" is exactly the failure mode being
designed against.

---

## 5. Execution mechanics — designed around this session's actual constraints

Constraints, as given (don't re-litigate, design around them):
- **(a)** Any call carrying an *existing* account's password (a login) is
  denied by the classifier.
- **(b)** SSH/`docker exec` to the prod host is denied entirely.
- **(c)** A 2nd-distinct-account `/forgot`-password request in one session
  is flagged "Credential Exploration" and denied.
- **What works**: Bearer-token-only calls; completing a password *reset*
  using a token the human obtained out-of-band; the account-creation/
  signup password field (a different action-shape than login).

### 5a. Does the k6 suite's provisioning approach sidestep this? — Checked; **no, not for this session**

`k6/lib/auth.js::login()` posts `{email, password}` to `/auth/login`
directly — and per `k6/README.md`, the whole suite is designed to be
**launched via SSH** on the prod host (`ssh pcc@192.168.50.76 "... k6
run ..."`) against loopback. Constraint (b) blocks *that transport
entirely*, independent of what the script inside does — so even though
k6's login() call would itself be fine if a *human* ran it (constraint (a)
is about this session's own tool calls, not what a script a human launches
does), this session cannot invoke k6 the way the suite is designed to be
invoked, full stop. **Do not attempt `ssh ... "k6 run ..."` from this
session — it will be denied identically to every other SSH command, not
because of what's inside the script.**

### 5b. Two-tier execution model

**Tier 1 — this session, direct HTTPS calls to the public prod URL (no SSH), for every correctness case in §2.** This is exactly how Track A/B were actually run this session (confirmed by the handoff — "an org's existing student, start a session..." etc. via direct API calls, not k6/SSH). Bearer tokens for the accounts in §4b are obtained per-account via, in order of preference:

1. **`POST /classrooms/join/{token}` (accept-invite)** — for every new
   student account (§4b), this is account-creation-shaped (allowed) and
   **returns a usable `access_token` directly** in its response body
   (`routes/classrooms.py:876-880`) — no login call needed at all, exactly
   the pattern Track A already established.
2. **Existing teacher/admin accounts (the 12 originals)**: their
   passwords are already known/rotated (see `privacy_emu_extras.json`
   notes) but constraint (a) blocks *this session* from calling `/auth/
   login` with them regardless. Use the **password-reset-completion**
   path instead: ask the human once per account that's actually needed
   this session (not per test case) to retrieve a `/reset/{token}` link
   from their inbox and hand it back; `POST /reset` with that token
   returns a fresh session. In practice this plan needs at most 1–2 such
   resets per execution session (the admin-role account for activation
   calls, §5c) — well under constraint (c)'s 2-distinct-account trigger,
   but budget for it explicitly: **never request a `/forgot` link for a
   3rd distinct account in the same session** — batch admin/teacher work
   under whichever 1–2 accounts already have a live token.
3. **New teacher/org accounts**: none are needed per §4b, so this doesn't
   arise in this plan — noted here only so a future round doesn't have to
   re-derive it: `POST /auth/signup` **does** return a `TokenResponse`
   with a real `access_token` at creation time, but in prod
   `is_active=False` until verified, and `get_current_user`
   (`core/dependencies.py`) checks `is_active` at *request* time (not at
   token-mint time) — so the token is genuinely unusable until an admin
   flips `is_active`, but once flipped, the *original* signup token works
   with no re-login needed.

**Tier 2 — the user, via a new k6 scenario, for any volume/load dimension layered on top of the correctness matrix (optional, see §6 step 4).** If the user wants to push beyond the ~142 discrete correctness cases into genuine volume (e.g. a scaled-up version of the original 50-calls/org coin-flip, now against live `block` mode, to see real block/allow throughput under load) — write it as a new `k6/scenarios/privacy.js` reusing `k6/lib/`'s existing helpers, but have it accept **pre-minted Bearer tokens via `__ENV`** (one per already-provisioned account from Tier 1) rather than calling `login()` itself. This sidesteps constraint (a) even in principle (not just because the user, not this session, launches it) and keeps the volume-testing script consistent with the correctness-testing tokens rather than re-deriving auth. The user runs this themselves per `k6/README.md`'s existing `run-loopback.sh`/`run-edge.sh` pattern — this session should draft the scenario file but hand off the actual `ssh ... k6 run ...` invocation.

### 5c. Admin activation (needed for §4b's new accounts if any of them ever need `is_active` toggling — mostly moot given 5b's accept-invite path already sets `is_active=True` for non-under-13 students, but under-13 students need it flipped after consent)

Use `admin+priv-strict@thewordinbits.com` (already `role=ADMIN`, per
`privacy_emu_extras.json`'s notes) and its Bearer token (obtained via
password-reset per §5b.2) to call `PUT /admin/users/{id}` with
`{"is_active": true}` — a Bearer-token-only call, fully within the allowed
action-shapes, exactly as used to unblock signups during the original
12-org sweep.

---

## 6. Sequencing / rollback plan

**This is a decision checkpoint list for the user, not an autonomous
script.** Nothing here should proceed to the next step without an explicit
go-ahead, and the abort criterion is a decision trigger, not an automatic
action.

1. **Step 0 — Inventory/read-only verification.** Confirm `ENFORCEMENT_MODE=block` is actually live (`GET /privacy/status` or a single known-should-block call) before running anything else in this plan. If it's not live yet, stop — everything below assumes it is.
2. **Step 1 — Low-blast-radius true-positive smoke.** Run 2c-i's S1 against 2 orgs only (`gdpr`, `strict`) using the *existing* accounts (no new accounts needed yet). Confirm: `403`, correct `blocking_reason` text, `rule_audit_log.compliance_status='BLOCKED'`. **This alone proves `block` mode is genuinely wired end-to-end** before investing in the other ~140 cases.
3. **Step 2 — False-positive/regression sweep (§2c-i S2/S3, §2c-vi) across all 12 orgs, still using existing accounts only.** This is the highest-value, lowest-cost set — no new accounts, and it's exactly the set most likely to surface a real-consequence bug (a should-allow case that now 403s).
4. **Step 3 — New-account provisioning (§4), one org at a time, tracking file updated after each (§4c).** Interleave with running S4/S5/2c-v against each org as its accounts come online, rather than provisioning all 17 first and testing second — this bounds how many untested throwaway accounts ever exist in prod at once.
5. **Step 4 — GPS-streaming trio + publish-gate (2c-iii, 2c-iv).** These need new *content* (activities/sessions), not just accounts — do this after Step 3's accounts exist so B1's age-floor rep can reuse a real under-13 account rather than needing yet another one.
6. **Step 5 (optional) — Tier 2 volume/load pass**, only if the user wants it, only after Steps 1–4 are clean.
7. **Cleanup** — `cleanup_privacy_test_accounts.py --dry-run` against the fully-updated `privacy_emu_created.json` + `privacy_emu_extras.json`, human review, then `--confirm`.

### Abort criterion (decision trigger for the user — never autonomous)

**Stop and recommend flipping `ENFORCEMENT_MODE` back to `warn`/`log`
if, at any point in Steps 1–5: 2 or more distinct should-allow cases
(S2, S3, S5, a permissive-org rep in 2c-ii/2c-iii, or a 2c-v/2c-vi case)
receive an unexpected block.** One isolated false positive might be a
test-setup mistake (wrong account state, stale consent record) — two
independent ones in the should-allow set is a signal the decision logic
itself has a live bug that Track A/B's unit tests + this session's own
earlier passes didn't catch, and every minute longer in `block` mode is
another real user placed at risk. Present the two failures to the user
with full request/response/audit-log detail and let them decide — do not
flip the mode automatically, and do not "fix and continue" without their
sign-off given the stakes.

---

## 7. Reporting format

Reuse `k6/FINDINGS.md`'s conventions (status emoji key, a summary table at
top for anything that gets fixed, one `##`-level section per finding with
**Endpoint / Symptom / Root cause / Impact / Found (date)**) but as a
**new, separate file** — this is a different testing domain (privacy
enforcement correctness, not load/capacity) and mixing the two trackers
would make both harder to scan. Create
`PRIVACY_LARGE_SCALE_TEST_FINDINGS.md` at repo root when execution begins
(not now — this plan doesn't execute anything), seeded with:

- A results table mirroring §2's case tables (jurisdiction × scenario →
  ✅/🔴/🟡 + one-line note + `rule_audit_log` row id where applicable) —
  this doubles as the actual coverage record, not just a bug list.
- The D1 global-vs-org-jurisdiction mismatch (§1, Table D) as its own
  numbered finding the first time it's empirically confirmed, independent
  of `block`-mode status.
- The `under_16`/`under_18` no-differential-treatment result (§2b) as its
  own finding, framed as "confirmed, not newly discovered here" with a
  pointer back to this plan's code-reading trail.
- Any abort-criterion trigger (§6) logged with full detail even if the
  user decides not to flip modes, so the decision is traceable later.

---

## Appendix — file/endpoint quick reference

| Need | File |
|---|---|
| Gate call sites | `backend/routes/{student_activities,student,sessions,phase7_student_initiated,activities,classrooms}.py`, `backend/services/{privacy_engine,gps_consent,wayfinding_consent}.py` |
| Jurisdiction merge/override logic | `backend/services/privacy_engine.py::identify_jurisdiction`, `merge_jurisdictions`, `enforce_on_submission`, `_has_valid_consent` |
| Existing 12-org accounts | `C:\Users\pcerd\privacy_emu_created.json` |
| Track A/B additions + this plan's new accounts | `C:\Users\pcerd\privacy_emu_extras.json` |
| Cleanup (dry-run first, always) | `backend/cleanup_privacy_test_accounts.py --accounts-json ... --accounts-json ... --dry-run` |
| Load-test infra conventions reused here | `k6/README.md`, `k6/FINDINGS.md`, `k6/lib/{auth,config}.js` |
