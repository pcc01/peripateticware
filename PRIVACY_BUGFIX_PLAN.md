# Privacy Engine — Bugfix Plan (2026-09-12)

**Status: INVESTIGATION AND PLANNING ONLY.** Nothing in this document has
been executed. No code changed, no prod access attempted, no accounts
created, no live API calls made while writing this plan. It is written so a
separate "dev" agent can execute a fix without re-deriving the investigation.

**Why this matters right now**: `ENFORCEMENT_MODE` was flipped from `log` to
`block` in production during this same session (already deployed, live). A
real bug in enforcement logic now produces real 403s for real
students/teachers, not log lines. All three bugs below were found either by
code-reading against `PRIVACY_LARGE_SCALE_TEST_PLAN.md`'s gate inventory
(bugs 1 and 2) or by live observation this session (bug 3). None of them
was introduced by the `block`-mode flip itself — all three are pre-existing
defects that the flip makes consequential in a new way (bugs 1 and 3) or
changes the risk profile of but doesn't itself cause (bug 2).

Read first: `PRIVACY_ENFORCEMENT_HANDOFF.md`, `PRIVACY_LARGE_SCALE_TEST_PLAN.md`
(§1's gate inventory, tables D and the `under_16`/`under_18` note in §2b),
and the `peripateticware-privacy-engine-enforcement` memory.

---

## Bug 1 — activity-publish jurisdiction mismatch

### Verdict: **CONFIRMED**, and worse than the test plan's framing in one
additional respect (see "Compounding finding" below).

### Evidence

`backend/routes/activities.py:564-655` (`publish_activity`, `POST
/activities/{id}/publish`) runs its privacy compliance check like this:

```
# activities.py:602-623
from services.privacy_engine import get_privacy_checker
checker = get_privacy_checker()
await checker.load_from_db(db)
...
is_compliant, issues, warnings = checker.check_activity_compliance(
    str(activity.id),
    activity_data,
    student_age_proxy,
    settings.ACTIVE_JURISDICTION,   # <-- single GLOBAL env var, not per-org
)
```

`settings.ACTIVE_JURISDICTION` is defined at `backend/core/config.py:166`:
`ACTIVE_JURISDICTION: str = os.getenv("ACTIVE_JURISDICTION", "gdpr_eu")` — one
process-wide value, not resolved per organization.

Compare this to the actual per-student/per-org jurisdiction resolution used
by every other enforcement call site, in
`backend/services/privacy_engine.py`:
- `identify_jurisdiction()` (`privacy_engine.py:425-493`) reads the
  student's own org's `organizations.privacy_jurisdiction_ids` (seeded at
  teacher signup by `privacy_seeder.py` from country/subdivision/under-13
  answers) and layers the under-13 COPPA override on top.
- `merge_jurisdictions()` (`privacy_engine.py:496-...`) takes that list and
  produces a strictest-wins merged config.
- `enforce_on_submission()` (`privacy_engine.py:594-690`) calls both of
  these itself when no explicit `jurisdiction_id` is passed
  (`privacy_engine.py:632-636`) — this is the pattern `publish_activity`
  should be using and isn't.

`publish_activity` never calls `identify_jurisdiction`, `merge_jurisdictions`,
or `enforce_or_raise` at all — grepped every route file for those three
names; `activities.py` has zero hits. It is a structurally separate
mechanism: `get_privacy_checker()` returns a `PrivacyComplianceChecker`
singleton (`privacy_engine.py:1055-1199`), a different class from the
`PrivacyEngine`/`enforce_on_submission` family, and its
`check_activity_compliance()` (`privacy_engine.py:1077-1142`) takes a single
`jurisdiction_id` string and does a direct dict lookup
(`self.configurations.get(jurisdiction_id)`) — no merge, no per-student
override, no notion of "the org this activity's teacher belongs to."

The same bug exists a second time at `check_activity_compliance_quick`
(`activities.py:1792-1811`, `POST /activities/check-compliance`), the
advisory-only "badge" endpoint — it passes `settings.ACTIVE_JURISDICTION`
identically (`activities.py:1811`).

### Direction of the mismatch, concretely

Of the 12 throwaway test orgs in `PRIVACY_LARGE_SCALE_TEST_PLAN.md` §2a,
only `gdpr` resolves to `gdpr_eu` — the same value as `ACTIVE_JURISDICTION`'s
**default**. Every other org (`strict`, `lenient`, `ccpa`, `pipeda`, `lgpd`,
`auprivacy`, `pdpa`, `popia`, `lpdc`, `aepd`, `baseline`) would have its
publish-time check run against `gdpr_eu`'s rules regardless of its own real
jurisdiction — 11 of 12 orgs checked against the wrong ruleset, assuming
prod's actual `ACTIVE_JURISDICTION` value is still the code default (see
"Cannot verify" below). This generalizes beyond the 12 test orgs: **any**
real org whose resolved jurisdiction differs from whatever
`ACTIVE_JURISDICTION` happens to be set to in prod's `.env` is affected.

Which direction (false-block vs false-allow) is real risk depends on the
compounding finding below — but structurally: an org stricter than
`ACTIVE_JURISDICTION` gets a falsely lenient check (should-block published
anyway); an org more lenient than `ACTIVE_JURISDICTION` gets a falsely
strict check (should-allow blocked with a 422). Because this gate is
**unconditional and independent of `ENFORCEMENT_MODE`** (its own docstring,
`activities.py:570-576`: "Privacy compliance check runs before saving...
BLOCK... WARNING... fails open"), it has been exactly this broken since
before today's `log`→`block` work — **this is a pre-existing bug, untouched
by today's three-mechanism fix** (which touched `identify_jurisdiction`,
`enforce_on_submission`, and the three GPS-streaming gates — never
`activities.py`).

### Compounding finding — the fix must not stop at "pass the right
jurisdiction id"

Reading `check_activity_compliance()`'s actual decision logic
(`privacy_engine.py:1077-1142`) against what's actually seeded in the
database revealed a second, deeper problem that changes how big this fix
really is:

- `check_activity_compliance()`'s real decision logic only fires from
  `rule_def = (config.metadata or {}).get("_rule_definition")` — it reads
  `rule_def["student_age_categories"]`, `rule_def["prohibited_data_collection"]`,
  and `rule_def["special_restrictions"]` (`privacy_engine.py:1107-1132`).
- Those three keys **do** exist, richly populated, in the standalone JSON
  files under `backend/config/jurisdictions/*.json` (confirmed by reading
  `gdpr_eu.json` in full — it has `student_age_categories` with a `teen`
  band 14-17, `prohibited_data_collection` per age band, and
  `special_restrictions` for location/profiling/automated-decisions).
- **But those files are not what the live engine loads.** The live path is
  `checker.load_from_db(db)` → `_load_rules_from_db()`
  (`privacy_engine.py:246-268`) → the `compliance_rules` DB table, seeded by
  `backend/migrations/002_seed_privacy_rules.py`. I grepped that entire
  migration file for `student_age_categories`, `prohibited_data_collection`,
  and `special_restrictions`: **zero matches, for any of the 10+ seeded
  jurisdictions, including `gdpr_eu` itself.** The DB seed only carries the
  sparser fields (`age_threshold_parental_consent`, a `consent_rules` list
  with `age_groups`/`parental_age_threshold`, `processing_rules`,
  `retention_policies`, etc. — see `002_seed_privacy_rules.py:170-247` for
  the full GDPR seed row).
- Consequence: for **every** DB-backed jurisdiction (i.e. every real prod
  org, always), `rule_def` in `check_activity_compliance()` is a non-empty
  dict (so the `if rule_def:` branch is taken — the "legacy fallback" branch
  at `privacy_engine.py:1133-1140` is **dead code** for DB-seeded
  jurisdictions), but `age_cats = rule_def.get("student_age_categories", {})`
  and `prohibited = rule_def.get("prohibited_data_collection", {})` are
  **always `{}`**, so the loop at `privacy_engine.py:1109-1123` never has
  anything to iterate — `issues` stays empty. Same for `special_restrictions`
  at `privacy_engine.py:1125-1132`. **`check_activity_compliance()`
  structurally cannot return a genuine issue for any org today, correct
  jurisdiction or not** — this gate has likely never actually blocked a
  publish via real DB-backed rule data since the DB-seed format was
  introduced, independent of the `ACTIVE_JURISDICTION` bug.
- One partial mitigating/complicating wrinkle found while tracing this:
  `POST /privacy/reload-config` (`routes/privacy_locations.py:83-104`) DOES
  load the rich JSON files (via `PrivacyConfigurationLoader` +
  `checker.register_jurisdiction()`) into the **same module-level
  `get_privacy_checker()` singleton** that `publish_activity` uses. If an
  admin has ever called that endpoint, the singleton would briefly hold rich
  rule data for whichever jurisdictions were reloaded — but the very next
  `publish_activity` call does `await checker.load_from_db(db)`
  (`activities.py:605`), which **fully replaces**
  `checker.configurations` (`privacy_engine.py:1075`,
  `self.configurations = await _get_cached_rules(db)`), wiping out anything
  `reload-config` put there. So in practice the rich data never survives to
  the next publish call regardless. Flag this as a fragile, order-dependent
  side detail worth knowing about but not the primary fix target.

**Bottom line**: fixing only the jurisdiction-selection bug (passing the
org's real jurisdiction instead of the global env var) would produce a
publish-time gate that is *correctly targeted* but still a no-op in
practice, because the DB-seeded rule data it reads from has never carried
the fields its own decision logic requires. Both problems need fixing
together, or the fix will look complete in code review but demonstrably
does nothing differently in `block` mode.

### Scope / blast radius

- **Endpoints**: `POST /activities/{id}/publish` (hard 422, blocks the
  actual publish) and `POST /activities/check-compliance` (advisory badge
  only, never blocks — `activities.py:1792` docstring/behavior).
- **Always live**, independent of `ENFORCEMENT_MODE` — has been since this
  code was written, not something today's `block`-flip changed.
- **Every org except one whose jurisdiction happens to equal prod's actual
  `ACTIVE_JURISDICTION` value** gets the wrong-jurisdiction check; **all
  orgs, including that one**, get a check that can't produce a genuine issue
  regardless of jurisdiction, due to the DB-seed data gap above.
- Net practical risk today: closer to "this gate provides approximately zero
  real protection for any org" than "orgs are being wrongly blocked" — the
  structural inability to produce `genuine_issues` means the far more likely
  real-world direction is **false-allow** (an activity that should be
  blocked for a stricter jurisdiction publishes anyway), not false-block.
  A false-block is only possible today via the "Unknown jurisdiction:"
  sentinel path being mis-filtered, which I checked and is **not** the
  case — `activities.py:630-634` explicitly filters that sentinel out of
  `genuine_issues`, so an unresolved jurisdiction id (which is what most
  orgs would produce if `ACTIVE_JURISDICTION` were changed to something
  exotic) fails open, not closed.

### Fix plan

1. **Jurisdiction resolution** — in `publish_activity`
   (`activities.py`, replacing lines 602-623) and in
   `check_activity_compliance_quick` (`activities.py:1802-1811`):
   - Call `identify_jurisdiction(str(activity.teacher_id), None, db)` (or,
     if a student-specific check is ever wanted, the actual enrolled
     student — but for a *publish*-time check the teacher/org's own
     resolved jurisdiction is the right unit, matching how org jurisdiction
     is assigned at signup) to get the list of applicable jurisdiction ids
     for this activity's org, exactly as `enforce_on_submission()` does at
     `privacy_engine.py:634`.
   - **Do not** feed the result through `merge_jurisdictions()` for this
     call site — that produces a merged `JurisdictionConfig` with only
     boolean/scalar fields (`student_monitoring_allowed`, etc.), not a
     `rule_def`/`metadata["_rule_definition"]`, so `check_activity_compliance()`'s
     data-driven branch would have nothing to read. Instead: for each
     individual jurisdiction id returned by `identify_jurisdiction()`,
     resolve it via `resolve_jurisdiction_id(jid, checker.configurations)`
     (same helper `merge_jurisdictions()` itself uses,
     `privacy_engine.py:407-418`) and call
     `checker.check_activity_compliance(activity_id, activity_data,
     student_age_proxy, resolved_id)` once per resolved id.
   - Aggregate: union `issues` and `warnings` across all applicable
     jurisdictions for the org (strictest-wins semantics — if ANY applicable
     jurisdiction produces a genuine issue, the publish blocks), mirroring
     the "strictest wins" principle already documented at the top of
     `privacy_engine.py:9-15`.
   - Keep the existing "Unknown jurisdiction:"/"No jurisdiction configured"
     sentinel-filtering behavior (`activities.py:630-634`) per resolved id,
     so an org whose jurisdiction genuinely isn't seeded still fails open
     exactly as today, rather than newly hard-blocking every activity for
     jurisdictions nobody has authored rule data for yet.

2. **Rule-data gap** — extend `backend/migrations/002_seed_privacy_rules.py`'s
   `rule_definition` payloads to include `student_age_categories`,
   `prohibited_data_collection`, and `special_restrictions` for at least the
   jurisdictions that already have this data authored in
   `backend/config/jurisdictions/*.json` (11 files: `aepd_ar`,
   `ccpa_california`, `coppa_us`, `ferpa_us`, `gdpr_eu`, `lgpd_brazil`,
   `lpdc_mx`, `pdpa_singapore`, `pipeda_canada`, `popia_za`,
   `privacy_act_au`) — the data has already been authored once; this is a
   migration/data task (copy the relevant keys from each JSON file into the
   corresponding DB seed row's `rule_definition`), not new rule design. This
   needs a new migration (a data-only migration appending to/updating
   existing `compliance_rules` rows — do not silently mutate
   `002_seed_privacy_rules.py`'s already-applied historical migration in
   place if the project's migration convention treats migrations as
   immutable once applied; check `backend/migrations/`'s existing numbering
   convention and add a new one, e.g. `00X_add_activity_compliance_rule_fields.py`).
   Call out to the dev agent: confirm whether `_get_cached_rules()`'s Redis
   cache (`_RULES_CACHE_KEY`, 1h TTL, `privacy_engine.py:41-42`) needs an
   explicit `invalidate_rules_cache()` call after this migration runs in
   prod, or whether the 1-hour TTL is an acceptable wait.

3. **Tests** — new test module or a new class in
   `backend/tests/test_privacy_enforcement.py` (matching that file's async
   + mocked-DB pattern, e.g. `TestPublishActivityJurisdiction`):
   - A case with two jurisdictions registered on the checker (e.g. a strict
     one with `prohibited_data_collection` banning `location` for the
     activity's age band, and a lenient one without it) where the "org"
     resolves (via a mocked `identify_jurisdiction`) to the strict one —
     assert the publish call raises/produces a 422 with `genuine_issues`
     populated, where today's `settings.ACTIVE_JURISDICTION`-based code
     would have silently passed because it checked the lenient global
     default instead.
   - The mirror case: org resolves to the lenient jurisdiction while
     `ACTIVE_JURISDICTION` happens to be the strict one — assert the fixed
     code allows the publish (proving the fix isn't just "always stricter
     now," but genuinely per-org).
   - A regression case using `test_activities.py::test_publish_activity`'s
     existing fixture shape (`teacher_user`, `client`, `db`) to confirm a
     plain publish with no jurisdiction data configured still succeeds
     (fail-open preserved).
   - A case exercising the rule-data-gap fix directly: seed a
     `rule_definition` with `prohibited_data_collection` populated for a
     jurisdiction and confirm `check_activity_compliance()` now actually
     returns a genuine issue where it returned none before the migration —
     this is the regression test that would have caught the "always
     returns compliant" defect in review.

4. **Live verification post-deploy** (same spirit as today's Track A/B):
   using one throwaway teacher org known to resolve to a strict jurisdiction
   (`strict` or `gdpr` from the 12 test orgs, if still present — check
   cleanup status first) and one known-lenient org (`lenient`/`baseline`),
   author and attempt to publish an activity whose `grade_level<=8` (so
   `data_collection` includes `location`/`audio`/`photo`/`behavioral`) on
   each. Expect the strict org's publish to now genuinely 422 (it likely
   silently succeeded before the fix); expect the lenient org's publish to
   still succeed. Query for any `ComplianceRule`/audit trace this endpoint
   might leave (note: `publish_activity` does **not** call
   `enforce_or_raise`/`_record_enforcement_audit` — there is no
   `rule_audit_log` row for this gate at all, confirmed by the absence of
   any `enforce_or_raise`/`log_access` import in `activities.py`'s publish
   flow — so live verification here means checking the HTTP status code and
   the activity's resulting `status` column directly, not a `rule_audit_log`
   query).

### Could not verify — flag for the dev agent / a human

- **Prod's actual current `ACTIVE_JURISDICTION` value.** The code default is
  `gdpr_eu` (`core/config.py:166`), but prod's `.env` could override it —
  this session has no SSH/prod `.env` access (per this session's own
  constraint, see `PRIVACY_LARGE_SCALE_TEST_PLAN.md` §5). `routes/admin.py:141`
  suggests there's an admin-visible settings page listing `ACTIVE_JURISDICTION`
  under a "Privacy" section — a human with admin UI access, or whoever has
  prod `.env` access, should confirm the actual value before assuming the
  default. This changes exactly which orgs are mismatched today, though it
  does not change the verdict (some non-empty set of real orgs is always
  mismatched unless every org happens to resolve to the same single value,
  which the 12-org sweep's own jurisdiction diversity makes implausible for
  real orgs too).
- Whether `POST /privacy/reload-config` has ever actually been called in
  prod (would briefly perturb the shared checker singleton's state — see
  "Compounding finding" above). Not verifiable from a repo read; ask
  whoever has log access.

---

## Bug 2 — no differential enforcement for `under_16`/`under_18`

### Verdict: **CONFIRMED as "zero differential enforcement anywhere in
current enforcement code,"** and further confirmed that the underlying rule
**data** *does* specify a requirement (GDPR teen consent) that the engine
never reads — this is a "rules exist as data, code never consults them"
gap, not "the rules were never written."

### Evidence — every `age_group` consumer, mapped

Grepped every reference to `age_group` and every
`enforce_or_raise`/`identify_jurisdiction`/rule-matching call site in
`backend/`. Full list of consumers and exactly what each does with the four
possible values (`under_13`, `under_16`, `under_18`, `adult`, or `NULL` for
accounts with no `date_of_birth` on file):

| Consumer | File:line | Behavior |
|---|---|---|
| Set at join time | `routes/classrooms.py:762-818` (`accept_invite`) | `age < 13` → `age_group='under_13'` + `requires_parental_consent=TRUE` + `is_active=FALSE` (real gate, blocks join). `13 ≤ age < 16` → `age_group='under_16'`, no other effect. `16 ≤ age < 18` → `'under_18'`, no other effect. `≥18` → `'adult'`, no other effect. **The under_16/under_18 branches write the column and do nothing else** — no consent email, no `is_active` change, no flag set. |
| `identify_jurisdiction()` COPPA override | `privacy_engine.py:484-489` | `if age_group == "under_13" or requires_consent: append coppa_us`. Explicit equality check against the single string `"under_13"` — `under_16`/`under_18`/`adult`/`None` are all the same "no" branch. |
| `enforce_on_submission()` sensitive-evidence gate | `privacy_engine.py:640-671` | Branches only on `config.student_monitoring_allowed` (a jurisdiction-level boolean) and `_has_valid_consent()` — **never reads `age_group` at all**, at any point in this function. Same behavior for a `under_16`, `under_18`, or `adult` student in the same org. |
| GPS consent Gate 1 | `routes/sessions.py:436-442` (`log_session_event`) | `if age_group not in ("under_13", None) and not rpc: needs_consent = False`. Again a binary partition: `under_13`/`None` vs. everything else (`under_16`, `under_18`, `adult` all land in "does not need this particular consent check," identically). |
| `age_floor_rung()` (wayfinding capability ceiling) | `services/wayfinding_consent.py:144-166` | `minor = (age_group == "under_13") or rpc`; `not minor → return "E"` (full rung, no ceiling). `under_16`/`under_18` get the same unrestricted `"E"` an adult gets. |
| Peer-project GPS filter | `routes/projects.py:572-576` | Same `age_group not in ("under_13", None) and not rpc` binary partition as Gate 1. |
| Parent-notification background task | `routes/student_activities.py:400-402` (`_notify_parents_gps_consent`) | `if not (age_group == "under_13" or requires_parental_consent): continue` — only under-13 (or flagged) students trigger a parent-notification email; `under_16`/`under_18` never do. |

**Every single site that reads `age_group` treats it as a two-way split:
`under_13` (or `requires_parental_consent`) vs. "not that."** I searched
specifically for any `"under_16"` or `"under_18"` string literal appearing
in a conditional anywhere in `backend/` outside migrations/tests/models —
found none. The test plan's claim is accurate and I could not find a
counterexample.

### Rules vs. code — does the *data* call for teen consent?

Yes, in two different places, with two different fates:

1. **`backend/config/jurisdictions/gdpr_eu.json`** (the rich static file —
   confirmed by reading it in full) explicitly defines a `"teen"` age
   category (`min_age: 14, max_age: 17`,
   `student_age_categories.teen`), and
   `consent_requirements.teen: {"parental_consent_required": true,
   "explicit_consent_required": true, "consent_type": "explicit",
   "description": "Parental consent required, teen can provide separate
   consent"}`. This is real, specific teen-consent rule *data*. But per Bug
   1's investigation, **this file is not loaded by the live enforcement
   path at all** (only by the rarely-used `/privacy/reload-config` hot-reload,
   whose effect gets wiped by the next `publish_activity` call) — so this
   specific teen rule is currently unreachable by any enforcement code,
   full stop, regardless of the `age_group` question.
2. **`backend/migrations/002_seed_privacy_rules.py`** (the actual DB-seeded
   data every live enforcement call reads) — GDPR's `consent_rules` entry
   (`002_seed_privacy_rules.py:186-196`) has
   `"age_groups": ["under_16", "adult"], "requires_parental_consent": True,
   "parental_age_threshold": 16`. CCPA's seed similarly has an
   `"age_groups": ["under_16", "adult"]` entry
   (`002_seed_privacy_rules.py:265-270`, `parental_age_threshold: 13` —
   likely a data-authoring inconsistency in its own right, worth flagging
   to whoever owns rule content, but out of scope here). **This `consent_rules`
   list is real, DB-seeded, live-loaded data** — `_load_rules_from_db()`
   reads it into `JurisdictionConfig.consent_rules`
   (`privacy_engine.py:177`) via `_deserialise_jurisdiction()`. But I
   grepped the entirety of `privacy_engine.py` for `consent_rules` and
   `ConsentRule(` and found **only the dataclass field declaration itself
   (`privacy_engine.py:177`) and the two places it's populated in the
   `_deserialise_jurisdiction()` canonical-schema call
   (implicitly, via `PrivacyRule.model_validate` → but note: `_deserialise_jurisdiction()`'s
   `JurisdictionConfig(...)` constructor call at `privacy_engine.py:291-308`
   does NOT pass `consent_rules=` at all — it's omitted, so the dataclass
   field silently keeps its `default_factory=list` empty default even
   though the source rule_def and the parsed `PrivacyRule` pydantic model
   both contain the real `consent_rules` data).** **Zero code anywhere
   reads `JurisdictionConfig.consent_rules`** after that — no
   `.consent_rules` attribute access exists anywhere in
   `enforce_on_submission()`, `check_activity_compliance()`, or any other
   function in the file. This is the precise mechanism: **the rule data
   survives all the way into the parsed `PrivacyRule` object, and is then
   dropped on the floor at the exact line that builds the `JurisdictionConfig`
   the rest of the engine actually uses.** Confirmed via direct read of
   `_deserialise_jurisdiction()`, `privacy_engine.py:271-333` (both the
   canonical-schema branch and the raw-fallback branch omit `consent_rules`
   from every `JurisdictionConfig(...)` call).

So the precise, evidence-backed characterization for the "how big is the fix"
question the task asked about: **this is a genuine "rules exist as data,
enforcement code never consults them" gap, not "the rules were never
written."** The GDPR/CCPA teen-consent requirement is sitting in the exact
same DB rows the live engine already loads on every request — it's dropped
during deserialization, one assignment away from being wired up, not a
net-new rule-authoring effort like Bug 1's `prohibited_data_collection` gap.

### Realistic risk today, `block` mode live

A genuinely under-16 or under-18 student in a GDPR (or CCPA) org gets
**exactly the same enforcement treatment as an adult in that same org** —
which for a *blocking* org (per the test plan's 10-vs-2 split, GDPR is
blocking) means they're already covered by the org-level
`student_monitoring_allowed=False` check (the same one every non-minor gets)
— **not zero protection**, but not the *additional*, GDPR-specific teen
consent-ladder protection the rule data calls for either (e.g., a teen
providing their own separate consent alongside/instead of a parent's, per
the JSON file's own description text: "parental consent required, teen can
provide separate consent" — a nuance current code has no way to express at
all, since it doesn't even know a student is a teen for this purpose).

This is meaningfully different in severity from the under-13 bug fixed
earlier today (`identify_jurisdiction`'s dead `user.age` check): that bug
left a **FERPA-only or unmapped org** with **zero** protection for a
genuinely under-13 student, in *any* org type including permissive ones. The
under-16/18 gap only ever matters inside an org whose actual jurisdiction
rules (GDPR/CCPA here) draw a real *additional* distinction at that age
band — and both of the jurisdictions in this repo's rule set that do
(`gdpr_eu`, `ccpa_california`) are already in the "blocking" class for
`student_monitoring_allowed`, so the practical gap is "same consent
mechanics as an adult, missing a jurisdiction-specific nuance," not "missing
protection outright." **Real, but lower urgency than Bug 1 or the earlier
under-13 fix** — nothing here changes because `ENFORCEMENT_MODE` flipped to
`block`; it's exactly as present today as it was in `log` mode, just with
the general context (per this session's brief) that any correctness gap now
has live consequences rather than log-only ones. It is closer to "the
product doesn't yet deliver a nuance its own rule data describes" than "the
model promises something the rules never backed" — the rules genuinely call
for something specific here (see the `consent_rules`/`parental_age_threshold`
DB data above); the enforcement code just doesn't read it.

### Scope / blast radius

- Every enforcement call site listed in the table above, for every org
  whose jurisdiction has an `age_groups`/`parental_age_threshold` distinction
  in its seed data narrower than "adult only" — currently `gdpr_eu`
  (threshold 16) and `ccpa_california` (`consent_rules` entry with
  `age_groups: ["under_16", "adult"]`, though its `parental_age_threshold: 13`
  looks like a data-authoring bug worth a separate ticket, not this fix).
- Every `under_16`/`under_18` student in one of those orgs, for the lifetime
  of the account (the gap is structural, not intermittent).
- Does **not** affect `under_13` handling at all — that path is unrelated
  and already fixed/tested today.

### Fix plan

1. **Wire `consent_rules` through deserialization** — in
   `_deserialise_jurisdiction()` (`privacy_engine.py:271-333`), pass
   `consent_rules=rule.consent_rules` (canonical-schema branch, once
   confirmed that `PrivacyRule` actually parses `consent_rules` into
   `ConsentRule` instances — check `schemas/privacy_rule.py` for how it
   models this field; it wasn't in the excerpt read during this
   investigation and needs a direct check before writing this line) and, in
   the raw-fallback branch, build `ConsentRule` objects directly from
   `rule_def.get("consent_rules", [])`. This alone doesn't change any
   enforcement outcome yet — it just stops silently discarding data that's
   already loaded.
2. **Consult it in `enforce_on_submission()`** (`privacy_engine.py:640-671`):
   after resolving `config`, additionally check whether any entry in
   `config.consent_rules` whose `age_groups` includes the student's actual
   `age_group` (needs the caller to pass or the function to look up the
   student's `age_group` — it already loads the `User` row inside
   `identify_jurisdiction()`, so plumb `age_group` out of there or do a
   second small lookup) has `requires_parental_consent=True` for a
   `data_category` overlapping this submission's `evidence_types`. If so,
   treat it the same way the existing under-13 path does: require a valid
   consent record (reuse `_has_valid_consent()` — the mechanism doesn't need
   to differ, only the *trigger* for requiring it does) rather than
   inventing a second consent-checking code path. This is additive/tightening
   only, same category of change as today's earlier three-mechanism fix —
   **it can only turn some existing `would_block=False` cases into
   `would_block=True`/`consent_required=True` for under-16/18 students in
   GDPR/CCPA-class orgs specifically; it cannot loosen anything for anyone
   else.**
3. **Decide, explicitly, whether to also fix `age_floor_rung()`
   (`wayfinding_consent.py:144-166`) and the GPS-consent Gate 1
   (`sessions.py:436-442`) to recognize a teen-specific rung/consent
   requirement**, or leave those age-only/COPPA-shaped gates as under-13-only
   by design and let the new jurisdiction-level check in step 2 be the sole
   place teen consent is enforced. Recommend the latter (leave
   `age_floor_rung`/Gate 1 as-is): those two gates are explicitly modeled
   around COPPA's binary child/non-child line and a parent-child account
   link, which has no natural GDPR-teen equivalent (a GDPR teen's "own
   separate consent," per the JSON file's description, isn't a parent-link
   concept at all) — conflating the two would risk exactly the kind of
   "three separate, disconnected consent mechanisms" tangle today's earlier
   fix already had to clean up once. Flag this decision explicitly for the
   dev agent / user rather than deciding unilaterally in this plan.
4. **Tests** — extend `backend/tests/test_privacy_enforcement.py`, following
   `TestIdentifyJurisdictionAgeOverride` (`test_privacy_enforcement.py:664-714`)
   and `TestEnforceOnSubmissionDecisionMatrix`
   (`test_privacy_enforcement.py:335-517`)'s existing patterns:
   - A new case confirming `_deserialise_jurisdiction()` no longer drops
     `consent_rules` (assert `config.consent_rules` is non-empty and
     contains the expected `ConsentRule` for a GDPR-shaped `rule_def` fixture).
   - A new `enforce_on_submission()` case: `under_16` student, GDPR-class
     org, sensitive evidence, no consent on file → `would_block=True` where
     today's code (pre-fix) would show `would_block` driven only by
     `student_monitoring_allowed` (i.e., confirm the fix adds a **new**,
     independently-triggerable reason, not just duplicate the existing
     org-level check — the clearest way is a jurisdiction where
     `student_monitoring_allowed=True` at the org level but the age-based
     `consent_rules` entry alone still requires consent, isolating this
     specific code path from the pre-existing one).
   - Control case: `adult` student, same org, same evidence → unaffected
     (existing behavior, whatever it was, doesn't regress).
   - Control case: `under_16` student, an org whose jurisdiction has no
     age-differentiated `consent_rules` entry at all (e.g. plain FERPA/COPPA
     jurisdictions per the current seed data) → unaffected, proving the fix
     is genuinely jurisdiction-scoped and doesn't over-fire everywhere.
5. **Live verification post-deploy**: reuse the `gdpr` throwaway org (or a
   fresh under-16 account in it, following Track A's account-provisioning
   pattern from `PRIVACY_ENFORCEMENT_HANDOFF.md` — join with a
   `date_of_birth` landing in the 14-17 range) submitting sensitive evidence
   with no consent on file; query `rule_audit_log` for that submission and
   confirm `enforcement_actions->>'would_block'` is `true` **and** the
   `blocking_reason`/`warnings` text reflects the new age-based reason
   (distinguish it from the pre-existing org-level `student_monitoring_allowed`
   reason text, so this specific fix's live effect is unambiguous in the
   audit trail — may require adding a distinct reason string in step 2, not
   reusing the exact same message text as the existing check).

### Could not verify — flag for the dev agent / a human

- Whether `schemas/privacy_rule.py`'s `PrivacyRule` model actually parses
  `consent_rules` into typed `ConsentRule`-shaped objects, or leaves it as a
  raw list of dicts (this investigation read only lines 1-125 of that file
  for the `student_age_categories`/`prohibited_data_collection`/
  `special_restrictions` fields relevant to Bug 1; the `consent_rules` field
  specifically was not directly confirmed in the pydantic schema). **The dev
  agent must read `schemas/privacy_rule.py` in full before implementing step
  1** — the exact wiring depends on whether the field already round-trips
  correctly through `PrivacyRule.model_validate()` or needs its own schema
  field added there too.
- Whether CCPA's `parental_age_threshold: 13` alongside
  `age_groups: ["under_16", "adult"]` (`002_seed_privacy_rules.py:265-270`)
  is a deliberate design choice or a copy-paste/authoring mistake — flagged
  above as out of scope for this fix but worth a separate data-quality
  ticket.

---

## Bug 3 — audit trail's `compliance_status` is mode-collapsed even for
force-blocked requests

*(Found live this session, after the two bugs above were already under
investigation — reported directly by the user/coordinator with a specific
live repro; verified against the code below.)*

### Verdict: **CONFIRMED**, mechanism fully traced.

### Evidence — exact mechanism

`enforce_or_raise()` (`privacy_engine.py:764-829`) does the following, in
this exact order:

```
# privacy_engine.py:802-824 (paraphrased with line refs)
result = await enforce_on_submission(...)                      # 803-806
if db is not None:
    await _record_enforcement_audit(result=result, ...)        # 807-817  <-- WRITES compliance_status=result.status HERE
should_block = result.status == "BLOCKED" or (
    force_block_on_would_block and result.would_block            # 818     <-- force-block decision computed AFTER the audit write
)
if should_block:
    raise HTTPException(status_code=403, detail=result.blocking_reason)  # 819-823
```

`result.status` is computed entirely inside `enforce_on_submission()`
(`privacy_engine.py:673-679`) from the **global** `mode` variable
(`mode = str(getattr(settings, "ENFORCEMENT_MODE", "log")).lower()`,
line 614) and has **no parameter or knowledge of `force_block_on_would_block`
at all** — `enforce_on_submission()`'s signature
(`privacy_engine.py:594-601`) doesn't accept that flag; only
`enforce_or_raise()` (its caller) does. So:

- `_record_enforcement_audit()` is called with `result.status` — computed
  purely from the global mode — and writes it verbatim as
  `compliance_status` via `log_access(..., compliance_status=result.status, ...)`
  (`privacy_engine.py:745-756`, specifically `compliance_status=result.status`
  inside the `enforcement_actions`-adjacent call).
- The `should_block` line that actually decides whether an `HTTPException`
  is raised (and thus whether the caller genuinely receives a 403) runs
  **after** that audit write, and folds in `force_block_on_would_block`
  which the audit write never saw.
- Result: whenever `mode != "block"` **and** `force_block_on_would_block=True`
  **and** `result.would_block=True`, the caller gets a real 403 (verified
  live this session per the coordinator's repro: a GDPR-org `location_update`
  call returned 403 with `blocking_reason: "Sensitive evidence... no active
  consent record was found"` while `ENFORCEMENT_MODE` was still `log`), but
  the `rule_audit_log` row for that exact request has
  `compliance_status="ALLOWED"` — because at the moment `enforce_on_submission()`
  computed `status_val`, `mode=="log"` and the block-mode branch
  (`privacy_engine.py:674`, `if mode == "block" and blocking_reasons`)
  never fires, so `status_val` falls through to the `"WARNING"` branch
  (line 676) — actually falls through further, since
  `mode in ("warn", "block")` is False for `mode=="log"`, landing on
  `status_val = "ALLOWED"` (line 677's else) — despite `blocking_reasons`
  being non-empty and a real exception about to be raised two lines of code
  after the audit write already completed.
- The `EnforcementResult.status` field's own docstring
  (`privacy_engine.py:212`) says it's "the mode-dependent outcome actually
  applied to this request" — this is precisely the claim that's false for
  these three sites: the outcome *actually applied* (a raised 403) and the
  recorded outcome (`ALLOWED`) disagree.
- Confirmed the `enforcement_actions` JSON blob is NOT similarly wrong:
  it separately records `would_block` (computed independent of mode,
  `enforce_on_submission()`'s whole reason for existing per the 2026-09
  audit-trail fix) and `blocking_reason` verbatim
  (`privacy_engine.py:734-741`) — so the *detail* is right, only the
  single top-level `compliance_status` column (and by extension anything
  that queries/dashboards off that column specifically, rather than parsing
  `enforcement_actions->>'would_block'`) is wrong for these rows.

### Scope — confirmed exactly which call sites are affected

Grepped every call to `enforce_or_raise(` for `force_block_on_would_block`:
only two physical call sites pass `force_block_on_would_block=True`:

1. `routes/sessions.py:469-478` — inside `log_session_event`'s Gate 2, for
   `POST /{session_id}/events` with `event_type=location_update`.
2. `routes/sessions.py:723-732` — inside the shared helper
   `_require_effective_rung()` (`sessions.py:694-733`), which backs **both**
   `POST /{session_id}/live-position` and `POST /{session_id}/track` (single
   insertion point, per its own comment at `sessions.py:717-718`) — so this
   one call site covers two of the three endpoints named in the live repro.

Together these are exactly the "3 GPS-streaming endpoints" from
`PRIVACY_ENFORCEMENT_HANDOFF.md` (B2/B3/B4 in the test plan's gate
inventory) — confirmed no other `enforce_or_raise()` call site in the
codebase passes this flag (`student_activities.py`, `student.py`,
`phase7_student_initiated.py`'s three call sites all omit it, defaulting to
`False`). For every one of those other sites, `should_block` reduces to
exactly `result.status == "BLOCKED"` — identical to what
`_record_enforcement_audit()` already recorded — so **this bug cannot occur
anywhere except these two call sites (three endpoints).** The blast radius
is fully bounded and small.

### Why this matters going forward even though it's currently moot

`ENFORCEMENT_MODE` is `block` in prod right now (flipped this session), so
for the immediate present `mode == "block"` for these sites too, and the
`status_val` computation's block-mode branch does fire correctly — today,
live, this specific mislabeling is **not currently happening** for new
traffic. But:
- It **did** happen for some unknown number of historical rows while
  `ENFORCEMENT_MODE` was still `log` today (including whatever exact
  request the coordinator's repro captured) — any dashboard, report, or
  future data audit that trusts `compliance_status` over
  `enforcement_actions->>'would_block'` for those rows will undercount real
  blocks that already happened.
- The handoff doc's own staged-rollout plan explicitly contemplates
  reverting `block`→`warn`/`log` if false-positives spike
  (`PRIVACY_ENFORCEMENT_HANDOFF.md`'s abort criterion language, and
  `PRIVACY_LARGE_SCALE_TEST_PLAN.md` §6's abort criterion). The moment that
  happens, this bug reactivates immediately and silently for exactly the
  three endpoints that are *designed* to keep hard-blocking regardless of
  the global mode — which is also, not coincidentally, the highest-stakes
  subset of endpoints (live GPS position/track streaming), where an
  accurate audit trail matters most for a subsequent incident review.
- It is a **pure audit/observability bug, not an enforcement bug** — no
  request that should have been blocked was ever allowed through, and no
  request that should have been allowed was ever blocked, because of this
  specific defect. `should_block`'s own logic (`privacy_engine.py:818`) is
  correct; only the *record* of what happened is wrong. This meaningfully
  lowers urgency relative to Bugs 1 and 2, which are genuine decision-logic
  gaps.

### Fix plan

1. **Reorder + pass the real outcome into the audit write.** In
   `enforce_or_raise()` (`privacy_engine.py:764-829`): compute
   `should_block` (line 818's expression) **before** calling
   `_record_enforcement_audit()`, then pass the actually-applied status into
   the audit call instead of relying on `_record_enforcement_audit()`
   re-reading `result.status` on its own. Concretely:
   - Compute `effective_status = "BLOCKED" if should_block else result.status`
     right after `result = await enforce_on_submission(...)`.
   - Give `_record_enforcement_audit()` a new optional parameter (e.g.
     `override_status: Optional[str] = None`) that, when provided, is used
     for `compliance_status` in the `log_access(...)` call instead of
     `result.status` — keeping `enforcement_actions`'s own `"mode"` field
     showing the *actual* global mode at the time (don't touch that; it's
     honest and useful context for exactly this kind of discrepancy), while
     `compliance_status` reflects what really happened to the request.
   - Pass `override_status=effective_status` from `enforce_or_raise()`'s
     call to `_record_enforcement_audit()`. `audit_submission()`
     (`privacy_engine.py:832-863`, the other, post-write caller of
     `_record_enforcement_audit()`) never sets `force_block_on_would_block`
     (it doesn't accept the parameter at all) — leave its call site
     unchanged, passing no override, so its behavior is provably unaffected.
   - This is additive (a new optional parameter, defaulted so every other
     caller is byte-for-byte unaffected) — same shape of change as today's
     `force_block_on_would_block` parameter itself.
2. **Do not change `enforce_on_submission()`'s own `status_val` computation.**
   Its contract (mode-driven status, independent of any specific caller's
   force-block behavior) is otherwise correct and used elsewhere (e.g. by
   `audit_submission()`, which has no force-block concept at all) — the fix
   belongs entirely in `enforce_or_raise()`, the one function that actually
   knows about `force_block_on_would_block`.
3. **Tests** — extend `TestEnforceOrRaiseForceBlock`
   (`backend/tests/test_privacy_enforcement.py:804-847`), which already
   covers `force_block_on_would_block`'s raise/no-raise behavior:
   - New case: `mode="log"`, `force_block_on_would_block=True`,
     `would_block=True` (mirroring the existing
     `test_force_true_raises_even_in_log_mode_when_would_block`,
     `test_privacy_enforcement.py:822`) — additionally assert (via whatever
     mock/spy this test file uses for `_record_enforcement_audit`/`log_access`,
     following `TestAuditTrailIsolation`'s pattern at
     `test_privacy_enforcement.py:213-333` for inspecting what got written)
     that the recorded `compliance_status` is `"BLOCKED"`, not `"ALLOWED"`.
   - Companion case: same setup but `mode="warn"` — confirm
     `compliance_status` is `"BLOCKED"` (not `"WARNING"`, which is what
     `enforce_on_submission()` alone would have produced for `warn` mode)
     once force-block actually fires.
   - Control case: `force_block_on_would_block=True` but `would_block=False`
     (already covered structurally by
     `test_force_true_still_allows_when_would_block_is_false`,
     `test_privacy_enforcement.py:840`) — extend it to also assert
     `compliance_status` matches `result.status` unchanged (no override
     needed/applied when nothing was actually force-blocked).
   - Control case: default `force_block_on_would_block=False` (any existing
     test in `TestEnforceOrRaise`, `test_privacy_enforcement.py:88-147`) —
     assert `compliance_status` is unaffected by this fix (no override
     path taken).
4. **Live verification post-deploy**: repeat the coordinator's own repro —
   this requires a window where `ENFORCEMENT_MODE` is genuinely not
   `"block"` to actually exercise the discrepancy path, which conflicts with
   this being live-verified against **prod** right now (prod is in `block`
   mode by design, per this session's other work, and reverting it just to
   test an audit-formatting fix is not a reasonable trade). Recommend
   instead: (a) verify via the unit tests in step 3, which can freely set
   `mode="log"`/`"warn"` without touching prod's actual setting, as the
   primary verification; (b) if a live check is still wanted, it only needs
   confirming under `mode="block"` that `compliance_status` for a genuine
   force-block still correctly reads `"BLOCKED"` post-fix (a pure regression
   check, safe to run in prod's current state, low value beyond what the
   unit tests already prove) rather than needing to reproduce the
   `log`/`warn`-mode discrepancy live at all.

### Could not verify — flag for the dev agent / a human

- The exact count/identity of historical `rule_audit_log` rows already
  mislabeled by this bug (any row with `data_type` in
  `('learning_session_event', 'wayfinding_live_location')` where
  `enforcement_actions->>'would_block' = 'true'` but `compliance_status !=
  'BLOCKED'`) — this is a direct DB read a human with prod DB access could
  run (per the pattern already used earlier today, e.g. in the
  `peripateticware-privacy-engine-enforcement` memory's item 1 query) but
  this session has no such access. Worth running once, purely for
  historical-record accuracy (there is no request to "fix" retroactively —
  `rule_audit_log` is explicitly append-only/never-UPDATE per
  `privacy_engine.py:12`'s own stated design principle — but knowing the
  count matters for anyone doing a post-incident compliance narrative later).

---

## Summary table

| Bug | Verdict | Live consequence today (`block` mode) | Urgency |
|---|---|---|---|
| 1 — publish jurisdiction mismatch | Confirmed (+ compounding rule-data gap) | Publish-time compliance check is checked against the wrong ruleset for most orgs, AND structurally cannot produce a genuine block for any org today regardless of ruleset — net effect closer to "no real protection" than "wrongly blocking" | High — silently near-inert safety check on a hard-422 gate for real content publishing |
| 2 — no under_16/18 differential enforcement | Confirmed (rule data exists, dropped at deserialization) | Under-16/18 GDPR/CCPA-org students get identical treatment to adults — same org-level protection, missing an intended jurisdiction-specific nuance | Medium — real gap, but the affected students aren't left with zero protection the way the earlier under-13 bug did |
| 3 — audit compliance_status mode-collapsed for force-blocks | Confirmed, mechanism fully traced, blast radius bounded to 2 call sites / 3 endpoints | Pure record-keeping bug — the actual 403 decision is correct; only the audit trail's summary column was wrong for `log`/`warn`-mode requests through these 3 endpoints (moot right now since prod is in `block` mode, but reactivates immediately if mode is ever reverted) | Low urgency for immediate action, but cheap/safe to fix now before any future mode-revert makes it live again |
