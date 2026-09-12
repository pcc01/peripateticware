# Privacy Enforcement — Handoff (2026-09-12)

Status doc for whoever picks up the next round of work: what's done, what's
verified live vs. only unit-tested, a concrete plan for the two remaining
live-verification tracks, and a pros/cons debate on enforcement-mode timing
that still needs a human decision.

## What's done and deployed (commit `62dd0be`, live on prod since 2026-09-12 07:31 UTC)

**The original ask** (`peripateticware-privacy-engine-enforcement` memory):
verify whether the privacy engine was "flagging but not blocking, tracking
but not actioning." It was worse — see that memory + this repo's
`SECURITY_PRIVACY_REVIEW.md` / `PRIVACY_CATALOG_REMAINING.md` for the full
history. Two rounds of fixes landed:

1. **2026-09 (earlier commit `9323938`)**: fixed the audit trail so
   `ENFORCEMENT_MODE=log` actually records `would_block` instead of
   silently discarding every real violation it detected.
2. **2026-09-12 (this round, `62dd0be`)**: found and fixed three separate,
   disconnected consent/jurisdiction mechanisms via live testing across all
   12 jurisdiction configs the engine supports:
   - `identify_jurisdiction()`'s per-student age override checked a
     `user.age` attribute that doesn't exist on the `User` model — always
     `None`, dead code. A FERPA-only or unmapped-jurisdiction org got zero
     blocking on sensitive evidence for a real under-13 student. Fixed to
     use the real `age_group`/`requires_parental_consent` fields.
   - `enforce_on_submission()` set `consent_required=True` but never
     checked whether consent existed — always blocked, no way to satisfy
     it. Added `_has_valid_consent()`, checking the real `consent_logs`
     (activity-scoped GPS) and `ConsentRecord` (blanket parental) tables.
   - `location_update`, `live-position`, and `track` only ever checked
     age-based consent — a region-restricted org (e.g. GDPR) had zero
     jurisdiction check on live GPS streaming for a 13+ student. Added a
     second, independent gate on all three, **hard-blocking immediately**
     (not waiting on the global `ENFORCEMENT_MODE`), matching those
     endpoints' pre-existing unconditional age gate.

Full design rationale: `C:\Users\pcerd\.claude\plans\giggly-weaving-toast.md`
(the approved plan this was built from). Test coverage: 11 new tests across
`backend/tests/test_privacy_enforcement.py` and `test_gps_consent.py`; full
suite green (377 passed; 3 failed/13 errors are pre-existing, unrelated
environment gaps — missing `boto3`/`botocore`, a `_NoOpLimiter.reset` gap in
MFA tests — confirmed by inspection, not caused by this change).

**Live-verified post-deploy**: a regression check against the two original
throwaway orgs confirmed no regression and that the new code path is
genuinely live — the `strict` (coppa_us+ferpa_us) org's GPS field-notes now
show `would_block=true` with the NEW reason text ("...and no active consent
record was found", only present in the new code), `lenient` (ferpa_us)
unaffected (`would_block=false`).

## NOT yet verified live (unit-tested only) — two tracks for a new agent

### Track A — under-13 age-override, end to end

**Why it matters**: this is the actual fix for the core finding (a
FERPA-only org gave zero protection to a real under-13 student). Proving it
live means showing a genuinely-under-13 student in a **lenient** org
(`ferpa_us` only, not `strict`, which already blocks from its own org-level
jurisdiction regardless of this fix) still gets blocked.

**The obstacle**: an account real enough to set `age_group='under_13'` also
gets `is_active=False` until parental consent is granted
(`routes/classrooms.py::accept_invite`) — no email/token access was
available this session to complete that loop.

**Steps**:
1. As the `lenient` teacher (`admin+priv-lenient@thewordinbits.com`,
   org `78a923d3-fac1-4828-864b-3f2ed5ea6741` — password in the user's
   password manager, not repeated here), create an
   invite and join a NEW student with `date_of_birth` under 13 and a real
   `parent_email` under the `thewordinbits.com` domain (plus-addressed, so
   it lands in an inbox the user can check).
2. Confirm `POST /classrooms/join/{token}` returns 403
   `parental_consent_required` (mirrors the already-verified `strict`-org
   test from earlier this session).
3. **Ask the user to check that inbox and hand you the consent link/token**
   (or complete `POST /privacy/consent` themselves) — check
   `services/signed_url.py` first to confirm there's genuinely no
   DB-retrievable copy of the token before assuming email is the only path.
4. Once active, log in as that student, `POST /student/field-notes` with
   GPS coords.
5. Query `rule_audit_log` for that row: expect `rules_applied` to include
   `coppa_us` even though the org itself only resolved to `ferpa_us`, and
   `would_block=true`. This is the actual proof.
6. Control: same request from a non-under-13 student in the same org →
   `would_block=false`, proving the override doesn't over-fire.

### Track B — live GPS-streaming region gate

**Why it matters**: proves `location_update`/`live-position`/`track` really
hard-block a region-restricted org's live GPS streaming for a non-minor
(the gap Gate 2 was built for — Gate 1's age check wouldn't have caught
this case at all).

**The obstacle**: needs a real activity with
`discovery_location_gps_capture_enabled=True` and an active
`learning_session` — none of the 12 throwaway orgs have any content
authored, and the activity-creation/publish flow hasn't been explored this
session at all.

**Steps**:
1. Read `routes/activities.py` for the teacher-side create/publish flow and
   the exact fields needed (`discovery_location_gps_capture_enabled`,
   `wayfinding_capability_ceiling`).
2. As the `gdpr` org's teacher (cleaner test than COPPA — GDPR restricts
   monitoring regardless of age, so a plain adult/unknown-age student is
   enough; no under-13/consent complexity needed), create + publish such an
   activity.
3. As that org's existing student, start a session, then:
   - `POST /{session_id}/events` with `event_type=location_update` + a
     coordinate → expect 403 (Gate 2, since Gate 1's age check wouldn't
     fire for this student).
   - `POST /{session_id}/live-position` → expect 403
     `live_share_consent_required` — wait, check the actual detail string;
     Gate 2 raises through `enforce_or_raise`, so the detail is
     `result.blocking_reason`, not the rung-check's own message. Confirm
     which gate actually fires first / what the client sees.
   - `POST /{session_id}/track` → same check.
4. Query `rule_audit_log` for `data_type IN ('learning_session_event',
   'wayfinding_live_location')`: confirm `would_block=true` AND
   `compliance_status='BLOCKED'` (not log-collapsed to ALLOWED — these 3
   sites pass `force_block_on_would_block=True`, so a live 403 should have
   really happened, not just been audited).
5. Control: same sequence against a lenient/baseline org's student →
   expect success (201s), proving the gate doesn't over-block.

**Note for whoever runs this**: these 3 endpoints hard-block live in prod
right now, regardless of `ENFORCEMENT_MODE`. A 403 during this test is
expected/correct, not a bug — don't "fix" it by loosening the gate.

### Cleanup (after both tracks — deferred per earlier request)

All `admin+priv-*@thewordinbits.com` accounts (teachers + students, list in
`C:\Users\pcerd\privacy_emu_created.json` plus the two originals — `strict`
`a20cb5dc-23b8-4f5f-9fec-c3fa35561324` now `role=ADMIN`, `lenient`
`2dc3d768-eb76-45e6-afec-ad416341e6cf` — plus the under-13 sub-account and
whatever Track A/B create), their orgs/classrooms/invites/field-notes, and
the synthetic `rule_audit_log` rows (`data_type` in
`student_field_note`/`learning_session_event`/`wayfinding_live_location`,
or simpler: everything with an `actor_id`/`student_id_hash` matching one of
these throwaway student IDs) — per the earlier decision to keep
`rule_audit_log` purely organic.

## Debate: flip `ENFORCEMENT_MODE` now, or stay in `log`?

The trigger for this question: the product's public `/privacy` page and
`GET /privacy/status`'s `"frameworks_enforced"` field make real compliance
claims. Right now those claims are **partly aspirational** — the engine
detects violations correctly (as of this fix) but `log` mode never acts on
them for 9 of 12 write paths (the 3 GPS-streaming ones now hard-block).
`compliance_status` in the audit trail also always reads `ALLOWED` in log
mode, even on a genuine violation.

### Case for flipping sooner (to `warn`, or further to `block`)

- **Regulatory/legal honesty.** COPPA enforcement (FTC) and GDPR both carry
  real exposure for representing protections that aren't actually acting —
  "unfair or deceptive practices" is COPPA's own enforcement language. This
  isn't hypothetical for this codebase: it already had a real, live PII
  bug (`peripateticware-classroom-invite-bug`) — privacy claims here have
  already mattered in practice, not just in theory.
- **The decision logic is now much more trustworthy.** Most of the original
  reason to wait (verify the logic itself is right before acting on it) is
  addressed by this round's fixes — age-override, consent-awareness, and
  the region-gate closure. What's left unverified is mostly *volume/false-
  positive rate on real traffic*, not *correctness*.
- **`warn` mode is available today at essentially zero availability risk.**
  It never rejects a request — it only makes `compliance_status` honest
  (surfacing real violations instead of collapsing to `ALLOWED`). That
  alone may be enough to make the website's current claims true, or at
  least much closer to true, without touching production availability at
  all.
- **The 3 GPS-streaming endpoints already hard-block in prod as of this
  deploy**, and nothing broke — direct evidence that hard-blocking is
  operationally viable for at least the clearest, highest-stakes case.
- **Delay compounds, it doesn't reset.** Every day spent in `log` mode
  with a "we enforce X" public claim is another day of the same gap, not a
  neutral holding pattern.

### Case for staying in `log` (or `warn`, not full `block`) longer

- **Zero real organic-traffic data exists yet.** Every `would_block` data
  point gathered so far is either pre-fix (uninformative) or synthetic (a
  scripted 50/50 GPS coin-flip designed to sample the rule space, not
  representative of real usage). Flipping to `block` now means real
  students/teachers are the first live test of a decision made blind to
  actual usage patterns.
- **False positives hit real classrooms, not abstractions.** A wrongly
  blocked submission mid-lesson is a support ticket at best, a school
  losing trust in the platform at worst — a materially different failure
  mode than "our compliance claim is imprecise for a few more weeks."
- **Existing orgs' self-reported signup data is unverified and probably
  stale for some fraction of them.** Orgs that signed up before this fix
  existed have jurisdiction assignments nobody has re-examined; `block`
  mode is far less forgiving of any remaining edge case in that data than
  `log`/`warn` are.
- **This exact fix is hours old in production.** No time-in-prod track
  record yet even for the log-only 9 sites under the NEW logic. Standard
  practice is to observe before consequences bite, not after.
- **The staged rollout (`log` → `warn` → `block`) already exists as a plan**
  (see `peripateticware-privacy-engine-enforcement` memory, item 3) for
  exactly this reason — skipping straight to `block` discards a safety net
  that costs nothing to keep.
- **The two concerns are separable.** If the actual problem is "the
  website's wording overclaims," the fastest, lowest-risk fix is correcting
  the *wording* now (independent, near-zero-risk, already flagged as an
  open item) — rather than coupling an availability-risking mode flip to a
  documentation-accuracy problem that doesn't strictly require it.

### One recommendation, for what it's worth (not a directive — this is the user's call)

A staged move that gets the honesty benefit today without the availability
risk: (1) fix the `/privacy` page and `GET /privacy/status`'s
`frameworks_enforced` wording now to describe what's actually true (loaded
+ detected + logged, not "enforced"/"blocked") — independent, ships
immediately; (2) flip global `ENFORCEMENT_MODE` to `warn` now — zero
availability risk, makes `compliance_status` honest; (3) hold `block` for
after a real observation window on `warn`-mode organic data, except the 3
GPS-streaming endpoints, which are deliberately already ahead of that
timeline for the reasons in the code's own comments (irreversibility the
instant they fire).
