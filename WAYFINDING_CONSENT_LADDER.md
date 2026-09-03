# The Wayfinding Consent Ladder

**Peripateticware — design brief · discovery activities**

| | |
|---|---|
| **Status** | Draft for review |
| **Version** | 0.1 |
| **Date** | 2026-09-02 |
| **Scope** | `activity_type = discovery` (scavenger hunts) |
| **Regs in frame** | COPPA · FERPA · GDPR-K |

> How multi-step scavenger hunts get GPX wayfinding without turning a child's
> walk across a park into a stored movement trace. Every location capability is a
> rung the teacher and the guardian climb on purpose — and each rung carries its
> own retention rule.

This is an internal design brief, not a published policy. Retention windows,
consent expiries and capability defaults are proposals pending sign-off from
product and counsel.

---

## §1 — The feature and the stance

Today a discovery activity holds one point: `location_latitude`,
`location_longitude`, `location_radius_meters`. A multi-step hunt replaces that
with an ordered set of **waypoints** (each a stop, a clue, an arrival radius)
plus an optional **route line** — the GPX `<wpt>`, `<rte>` and `<trk>` payloads.
Teachers can import a route from Gaia GPS, CalTopo or AllTrails, or drop pins on
the map, and export the finished hunt as a `.gpx` file.

The navigation itself — "you are 40 m from Stop 3, bearing NNE" — is the part
that wants a continuous read of where a student is standing. That is the privacy
surface this brief exists to contain. The design holds to three rules.

- **Optional by default.** The hunt runs with zero location data. Every
  capability above that is off until a teacher enables it *and* the right person
  signs off. No setting is a precondition for finishing a hunt.
- **Minimise at the source.** The cheapest anonymisation is the coordinate never
  sent. On-device arrival detection emits *"reached waypoint 3"* — an index and a
  timestamp — not a latitude. Raw position leaves the phone only on rungs that
  genuinely need it.
- **Retention follows the choice.** Each rung declares its own
  `data_retention_policies` row. A richer capability is kept for a shorter
  window, de-linked sooner, and never archived.

**Reuses what already exists:** the `consent_logs` append-only audit table
(`consent_type = 'gps_tracking'`), the `_check_gps_consent()` gate in
`log_session_event`, the `discovery_location_gps_capture_enabled` flag, and the
`discovery_location_sharing_rules` JSONB. New work is the waypoint model, the
on-device wayfinding hook, and a retention sweeper — see §7.

---

## §2 — The capability ladder

The rungs are a true sequence: each one exposes strictly more than the last.
"Exposure" below is how much of a child's movement becomes legible to someone
other than the child, on a 0–5 scale. A hunt author picks the highest rung the
activity needs; a guardian's sign-off decides how high any individual student
actually goes (§4).

### Rung A — Static route content
**Exposure 0/5 · always on · no consent**

The student sees the stop list, clues and the route drawn on the map. They tap
*"I found it"* at each stop themselves. The phone never reads GPS.

| | |
|---|---|
| Collected | Nothing about the student's location |
| Visible to | The student only |
| Retention | Manual check-offs stored with the submission |
| Default | On for every hunt |

### Rung B — On-device arrival detection
**Exposure 1/5 · recommended default**

The `useWayfinding` hook compares GPS to the waypoint coordinates *on the phone*
and shows distance and bearing to the next stop. What is stored is a
`waypoint_arrival` event: waypoint index, sequence-correct flag, timestamp. No
coordinate is transmitted or written.

| | |
|---|---|
| Collected | Stop index + time reached. Never a lat/long. |
| Visible to | Student live; teacher sees "5 of 8 stops" |
| Retention | 90 d student-linked → activity aggregates |
| Default | Proposed on for K-12 discovery hunts |

### Rung C — Coordinate stamp on evidence
**Exposure 2/5 · opt-in · `gps_tracking` consent**

When the student attaches a photo, note or audio clip at a stop, the capture is
stamped with the coordinates where it was taken (this is the existing
`EvidenceCapture` lat/long path). Discrete points, one per submitted artefact —
not a continuous track.

| | |
|---|---|
| Collected | One lat/long per evidence capture |
| Visible to | Teacher, on the submission and fieldwork map |
| Retention | Precise 30 d → coarsened to ~110 m |
| Default | Off. Honours `only_on_submission`. |

### Rung D — Live position to the teacher
**Exposure 3/5 · opt-in · separate line item**

During an active session the teacher's monitor map shows the student's moving
pin, refreshed on the existing `session_events` REST poll. Foreground only — the
app must be open, the screen on. Intended for a supervised class field trip, not
a solo assignment.

| | |
|---|---|
| Collected | Position samples while the session is live |
| Visible to | The supervising teacher, in real time only |
| Retention | Purged 7 d after session ends · never archived |
| Default | Off. Needs its own consent, not bundled with C. |

### Rung E — Breadcrumb track recording
**Exposure 4/5 · opt-in · explicit, revocable any time**

The student's full path is recorded as a GPX `<trk>` and saved, so the class can
review the route walked afterward ("compare everyone's line down the ravine").
This is a complete movement trace and is treated as the most sensitive artefact
the feature produces.

| | |
|---|---|
| Collected | Continuous trackpoints for the whole hunt |
| Visible to | Student + teacher; export available |
| Retention | 30 d hard delete · no archive · 1-tap delete |
| Default | Off. Guardian re-prompted every activity. |

### Rung F — Background arrival alerts
**Exposure 5/5 · out of scope for v1**

"You're near a stop" while the phone is locked. Requires the OS
background-location grant, a new App Store / Play Store data disclosure, and the
strongest consent tier. **Recommend deferring.** Documented here so the ladder is
complete and the line is drawn on purpose.

| | |
|---|---|
| Collected | Position with the app backgrounded |
| Visible to | n/a in v1 |
| Retention | n/a in v1 |
| Default | Not built. Requires a fresh review to enable. |

### Where the value sits

Rungs **A** and **B** deliver essentially the whole product experience — a
student navigating a real multi-stop hunt with live distance and bearing — at
exposure 0–1. **C** adds geo-tagged evidence for assessment. **D** and **E**
serve narrow, teacher-supervised cases and cost the most in retained data.

**Recommendation:** ship A + B on by default for K-12, C opt-in, and gate D/E
behind a distinct second consent with the shortest windows in the policy.

---

## §3 — Retention & anonymisation

COPPA's operative test is "retain only as long as reasonably necessary for the
purpose it was collected." Each rung's data has a narrow purpose, so each gets a
narrow window. Two mechanisms do the work after that window: **coarsening** (drop
coordinate precision) and **de-linking** (drop the student key, keep only
activity-level aggregates).

One `data_retention_policies` row per category, per activity, per jurisdiction.
The shortest applicable window always wins (existing `privacy_engine` behaviour).

| Data category | Purpose | Student-linked | Then | Deleted at | Rung |
|---|---|---|---|---|---|
| **Route definition** (`waypoints, clues, path`) | Teacher content | n/a — no PII | **keep** life of activity | Activity delete + 12 mo archive | A–E |
| **Waypoint-progress events** (`index + timestamp`) | Show progress, grade completion | 90 days | **de-link** → activity aggregates only | Aggregates purged at 24 mo | B |
| **Evidence coordinates** (`lat/long per capture`) | Locate submitted fieldwork | 30 days precise | **coarsen** to 3 dp (~110 m) or snap-to-waypoint | With the submission (COPPA cap 365 d) | C |
| **Live-session positions** (`location_update events`) | Real-time supervision | Session + 7 days | **delete** — not anonymised, removed | 7 days after session ends | D |
| **Breadcrumb track** (`GPX <trk> blob`) | Post-hunt route review | 30 days | **delete** — no coarsened copy retained | 30 days · or immediately on request | E |
| **Consent records** (`consent_logs rows`) | Compliance audit / legal basis | While covered data exists | **keep** minimal fields — never holds a coordinate | Last covered record + 3 yr | C–E |

### The two mechanisms

- **Coarsening.** Reduce stored precision to 3 decimal places (≈ 110 m) or
  replace the point with the nearest waypoint id. A coarse point still answers
  "was at Riverside Park"; it can no longer place a child at a house or a street
  corner. Applied on a timer to rung C data.
- **De-linking.** Drop the `student_id` / `session_id` foreign keys and keep only
  what rolls up to an activity: stops completed, visit order, inter-stop minutes
  in buckets. Any aggregate covering fewer than **5 students** is suppressed, so
  a small class can't be re-identified by subtraction.
- **Minimise at source.** Rung B is the mechanism working *before* collection:
  the phone resolves arrival locally and reports an index. There is nothing to
  coarsen because there was never a coordinate.

### Two lanes — operational vs. analytics

The de-link step feeds a second, permanent lane. Product still needs to see
*what kinds of hunts teachers build* and *how multi-step hunts perform in
aggregate* long after the operational rows are gone. That is legitimate and
safe **if the analytics lane structurally cannot carry an identifier** — not
`student_id`, not `session_id`, not `activity_id` (which links to
`activities.teacher_id`), not `org_id` at fine grain (a one-teacher org *is*
the teacher), not a timestamp precise enough to correlate with a known
publish, and no free text (titles and clue text can name a school or a child).

| Lane | Contents | Identifiers | Retention |
|---|---|---|---|
| **1 — operational** | Everything in the table above | Yes, user-linked | Windows above; then coarsen / de-link / hard-delete |
| **2 — analytics** | `authoring_analytics`, `hunt_outcome_analytics` — enums, buckets, counts only | **None, by construction** | Indefinite (not personal data) |

**`authoring_analytics`** — written at publish time (fire-and-forget off
`publish_activity`, like the existing `log_access` audit call), never on a
timer. Fields: `activity_type`, `discovery_mode`, `wayfinding_mode`,
`wayfinding_enabled`, `capability_ceiling`, `waypoint_count_bucket`
(`0` / `1-3` / `4-8` / `9-15` / `16+`), `route_imported`, `grade_level`,
`subject`, `bloom_level`, `difficulty`, `region_country` (from
`signup_country_code` — country only), `created_month` (first-of-month, not a
timestamp). The writer takes an allowlist of scalar fields, never the row.

**`hunt_outcome_analytics`** — written only by the de-link retention task.
One row per (activity, roll-up run), but the activity's *shape* is
denormalised onto the row (`activity_type`, `wayfinding_mode`,
`waypoints_total`) and the id is dropped. Fields: `cohort_size` (always ≥ 5),
`sessions_count`, `median_reached`, `mean_reached`, `completion_rate`,
`in_sequence_rate`, `p50_minutes_between_stops`, `period_start`/`period_end`.

**Cohort floor (k = 5).** An "activity-level" aggregate over a 4-child
homeschool pod is still personal. The de-link task groups expired
`session_waypoint_progress` rows by `activity_id`; a group with fewer than
**5 distinct students** is **deleted without a roll-up**, never aggregated.
Reporting queries over both lanes apply the same k ≥ 5 suppression to any
cell.

This is what takes Lane 2 outside COPPA's scope — the FTC three-part test:
(1) take reasonable measures to de-identify (identifier-free schema + cohort
floor), (2) publicly commit to keep and use it only in de-identified form,
(3) never re-identify.

### Enforcement — the retention sweeper

`data_retention_policies` is defined in the schema but nothing reads
`deletion_scheduled_for`. Rather than a parallel engine, the wayfinding
categories are added as tasks to the **existing** `tasks/retention_cleanup.py`
sweep (daily 02:00 UTC via `start_background_tasks`, with the same
`_safe_run` un-migrated-table guard and `rule_audit_log` audit writes):

| Task | Category | `deletion_method` | Window (constant, overridable per-activity via `data_retention_policies`) |
|---|---|---|---|
| `coarsen_expired_capture_coordinates` | Evidence coordinates | `coarsen` | 30 d → `ROUND(lat/long, 3)` |
| `delink_expired_waypoint_progress` | Waypoint-progress events | `delink` | 90 d → roll up to `hunt_outcome_analytics` (if cohort ≥ 5), then delete |
| `purge_expired_session_positions` | Live-session `location_update` events | `delete` | session end + 7 d |

`deletion_method` gains the values `delete` / `coarsen` / `delink`. Windows
live as constants in `retention_cleanup.py` (matching the rest of that file);
a matching `data_retention_policies` row, when present, overrides the constant
for that activity.

---

## §4 — COPPA sign-off

A student's effective capability is the **lowest** of three independent limits.
Any one of them can hold the student at rung A, and the hunt still runs.

```
                 activity ceiling   — highest rung the teacher enabled on this hunt
effective  =  MIN( consent ceiling  — highest rung with an active, unexpired,
                                      non-withdrawn consent_logs row for
                                      (student, activity)
                   age floor )      — under-13 with no linked guardian account →
                                      hard cap at rung B; D and E unavailable
                                      regardless of any consent UI

no match → rung A, manual check-off
```

### Who signs off

| Student | Signs off | Mechanism | Expiry | Can reach |
|---|---|---|---|---|
| Under 13 (`requires_parental_consent = true`) | Parent / guardian | `consent_logs` · `given_by_parent = TRUE`, via `/parent/consent/gps` | 30 days | A–E, one rung per granted line item |
| 13 and over (`age_group ≠ under_13`) | The student | `consent_logs` · `given_by_student = TRUE` | 1 year | A–E |
| Homeschool | Guardian is the teacher | Self-consent at activity creation | 1 year | A–E |
| Under 13, no guardian linked | Nobody can | Gate returns rung B ceiling | — | A–B only |

### Rules that make it real

- **Per rung, not per feature-set.** Rung C, rung D and rung E are three separate
  consent line items with their own checkboxes and their own plain-language copy.
  Granting C never implies D.
- **Consent gates the write, not the hunt.** The existing `_check_gps_consent()`
  check stays: an event above the consented rung is refused with
  `403 gps_consent_required` and the app silently drops to the rung below. The
  student is never blocked from finishing.
- **Withdrawal is one action.** Revoke sets `withdrawn_at = NOW()` on the active
  row (already how `/parent/consent/gps` works). On withdrawal of E, the
  breadcrumb track is deleted within 24 h, not left to its 30-day timer.
- **Expiry re-prompts.** A lapsed 30-day parent grant drops the student to their
  age floor and surfaces a re-consent card next time the activity opens. No
  silent renewal.
- **Consent copy names the retention.** The window from §3 is shown in the
  consent dialog itself — "kept 30 days, then deleted" — not buried in a policy
  page.

### Worked example

**Maya, age 11.** Her class does the "Trees of Riverside Park" hunt. The teacher
enabled rung **C** (geo-tagged photos) and rung **D** (live map for the field
trip). Maya's guardian granted **C** but left **D** unchecked.

```
activity ceiling = D  ·  consent ceiling = C  ·  age floor = E
effective = min(D, C, E) = C
```

Maya's app does on-device wayfinding and stamps her three submitted photos with
coordinates. Her pin does *not* appear on the teacher's live map. Those three
coordinates are stored precisely for 30 days, then coarsened to ~110 m and kept
with the submission until the class's records age out. If her guardian later
revokes C, the stamps are coarsened immediately.

---

## §5 — What parents and guardians see

Each row is one toggle in the guardian's consent card, shown per activity. No
pre-ticked boxes. The default for every opt-in row is off.

| Setting | What your child gets | What's recorded | Who can see it | How long it's kept |
|---|---|---|---|---|
| **Follow the route** (`rung B · default ON`) | A map with the stops and a live "40 m to the next stop" arrow. Works fully offline once the hunt has loaded. | Which stops your child reached and when. **Not** where they are — that check happens on the phone and isn't sent. | Your child during the hunt. The teacher sees a count ("5 of 8 stops"), not a location. | Linked to your child for 90 days, then only as a class total with no names. |
| **Tag my photos with where they were taken** (`rung C · opt-in`) | Their submitted photos and notes show on the teacher's map at the spot they were captured — useful for "find 6 native trees" tasks. | One location point per photo or note your child chooses to submit. Nothing between submissions. | The teacher, on the submission and the class fieldwork map. | Exact for 30 days, then blurred to roughly a city block. Kept with the schoolwork, up to one year. |
| **Show my child on the teacher's map during the trip** (`rung D · opt-in`) | On a supervised outing, the teacher can see where your child is in real time while the session is running. | Your child's position, sampled while the class session is live and the app is open on screen. | The supervising teacher, live only. Not stored for later viewing. | Deleted 7 days after the session ends. Never archived. |
| **Record the path my child walked** (`rung E · opt-in`) | The class can compare the routes everyone actually took after the hunt — a full trail line on the map. | A continuous trace of your child's walk for the length of the hunt. This is the most detailed thing the feature collects. | Your child and the teacher. You can download or delete it any time from your dashboard. | Deleted after 30 days, or the moment you ask — whichever is first. No blurred copy is kept. |

You can change any of these later. Turning one off deletes what it collected on
the shortened schedule above. Turning everything off still leaves your child a
working hunt.

---

## §6 — What teachers see

In the discovery-activity builder, a single "Location & wayfinding" panel. Each
rung above B tells the teacher plainly what consent it will trigger, so the trade
is visible before publish.

| Turn this on when… | Your students get | Your students' families will need to… | The trade-off |
|---|---|---|---|
| **Always** — it's the default (`rung B`) | A real navigating hunt: map, route line, distance and bearing to the next stop, offline-capable. | Nothing. On-device only; no coordinate leaves the phone. | You see completion counts, not positions. For most hunts this is all you need. |
| Evidence has to be **tied to a place** (`rung C`) | Every submitted photo/note pinned on your fieldwork map where it was taken. | Grant "tag photos with location" (under-13: a guardian; 13+: the student). Expires in 30 days / 1 year. | You store one point per submission. It's blurred after 30 days unless the assessment needs the precise spot. |
| A **supervised outing** where you need eyes on the group (`rung D`) | A live map of student pins for the duration of the session. | Grant "show on the map during the trip" — a *separate* checkbox from rung C. | Foreground only; students must keep the app open. Positions are deleted a week after the session. Not for solo assignments. |
| The lesson is **about the route itself** (`rung E`) | Every student's walked path saved for a post-hunt comparison. | Grant "record the path walked" — re-asked for every activity, revocable any time. | The heaviest data you can collect. 30-day hard delete, no archive, families can wipe it on demand. Consider whether rung C plus manual reflection gets you there. |

Whatever you enable is a ceiling, not a guarantee — each student rises only as
high as their family's sign-off allows, and any student without it still gets a
full rung-B hunt.

### Who can do what — matches the existing discovery/scavenger-hunt model

| | Teacher | Homeschool | Student |
|---|---|---|---|
| **Create a wayfinding hunt** | ✅ web builder (`ActivityManager`) + mobile quick-create (2+ stops) | ✅ same two paths (`/homeschool/activities`, `teacher-create-scavenger-hunt`) | ❌ no authoring path — students *propose* challenges; a teacher approves them into activities (waypoints not carried through the proposal flow) |
| **Do a hunt** | — (monitors) | children do it as student accounts | ✅ mobile activity flow (`app/activity/[id].tsx`) |
| **Consent** | n/a | self-consent (guardian is the account holder) | parent grants (under-13) / self-consent (13+) |
| **Monitor progress** | ✅ `GET /sessions/{id}/waypoints/progress` (route+waypoint map overlay on the live monitor not yet built) | ✅ same | — |

Authoring is `TEACHER | ADMIN | HOMESCHOOL` (same guard as every other activity
type); wayfinding is a `discovery_*` field on a `discovery`-type activity, so it
inherits that model rather than introducing a new one.

---

## §7 — Build notes & open decisions

### Pre-prod verification (2026-09-03, local Docker stack)

- **Startup migration boots clean** against real Postgres 16 — `activity_waypoints`,
  `session_waypoint_progress`, `session_tracks`, `authoring_analytics`,
  `hunt_outcome_analytics`, the four `activities.*` columns, and the four
  `data_retention_policies` GLOBAL seeds all created with correct indexes / FK.
- **Full backend suite: 353 passed, 4 skipped** in the container (31 wayfinding).
- **API smoke (real DB):** create/get/update hunt with waypoints · GPX
  export + re-import round-trip · publish → identifier-free `authoring_analytics`
  row · `my-capability` · rung-C consent grant/revoke · session start →
  waypoint arrive (no coordinate stored) → progress aggregation · live-position
  403 · track 403 · `run_retention_cleanup()` coarsens a real stale capture.
- **Frontend:** `tsc --noEmit` 0 errors · production `vite build` succeeds
  (1874 modules). **Browser pass (Chrome, live stack):** builder renders in the
  Location panel · enable → Leaflet map + toolbar · **ceiling select shows only
  B/C + "D/E pending review" note** · click-map adds numbered pins with a
  connecting polyline · reorder (▲▼ disabled at ends) + delete · per-stop
  editor (clue, radius, required, ask-photo/note, unlock rule, coords) · **full
  round-trip** — save → reload edit page → wayfinding re-checked, 3 stops back,
  renamed stop + clue + capture-ask all persisted · Export GPX (no errors) · no
  console errors.
- **Mobile:** `tsc` clean for wayfinding files · 26 jest unit tests pass ·
  **`11-wayfinding.yaml` PASSES on a Pixel 6 / API 33 emulator against the live
  local backend** (`1/1 Flow Passed`): launch → onboarding → login → open the
  seeded hunt → Brief/Orient → `wayfinding-panel` + `wayfinding-map` render →
  `NEXT STOP` → `1 of 3 stops` → `2 of 3 stops` → `All stops found! 🎉`. DB
  after the run confirms 3 `session_waypoint_progress` rows (all `arrived`,
  `in_sequence`, **no coordinate stored**) and 3 `waypoint_arrival`
  `session_events` — the on-device GPS → arrival confirm →
  `POST /sessions/{id}/waypoints/{wid}/arrive` → upsert → aggregate → complete
  path, against real Postgres.
- The run surfaced **two more bugs, now fixed:**
  (a) `app/activity/[id].tsx` never started a learning session (`setSessionId`
  declared, never called — pre-existing dead code the best-effort
  `logSessionEvent` calls tolerated, but the arrival report needs a real
  `session_id`); it now calls `POST /student/activities/{id}/start` on load.
  (b) `useWayfinding` used `distanceInterval: 5`, so location nudges under 5 m
  never reached the watcher and the arrival streak never advanced; dropped to
  `distanceInterval: 1`, `ARRIVAL_CONFIRM_FIXES` 3→2, and added a `canArrive`
  gate so a streak that completes before the session resolves still fires once
  `session_id` lands rather than being marked permanently reached.
- The flow assumes a fresh backend (no prior session for the test student) —
  true in CI, which reseeds Postgres per run; between local re-runs, reset
  `session_waypoint_progress` / `learning_sessions` for the activity.
- **Bugs found & fixed by this pass** (why real-DB testing mattered): retention
  seed `AmbiguousParameterError` + SQLAlchemy `::cast` mis-parse → `CAST(x AS t)`;
  `consent_logs` expiry `:days::text` mis-parse (would 500 every grant) →
  `make_interval(days => CAST(:days AS int))`; `my-capability` route registered
  at `/{id}/…` instead of `/activities/{id}/…` (404); `seed_wayfinding_demo`
  INSERT missing a bind param.
- **Pre-existing bugs surfaced (not this feature):** `seed_demo_classroom` /
  `seed_test_classroom` hit the same `AmbiguousParameterError`;
  `tasks/retention_cleanup._audit()` writes `rule_audit_log.action_type` which
  doesn't exist (non-fatal, affects every retention task).

### Build status (2026-09-02)

| Slice | State |
|---|---|
| Data model — `activity_waypoints`, `session_waypoint_progress`, `activities.*` cols; ORM + `startup.apply_wayfinding_migrations` + `init.sql` + Alembic `20260902b` | **done** |
| Activity API — waypoints on create/update/response; GPX import/export (`gpxpy`) | **done** |
| Arrival API — `POST /sessions/{id}/waypoints/{wid}/arrive`, `GET .../progress` (no coordinate) | **done** |
| Analytics lane — `authoring_analytics`, `hunt_outcome_analytics`, `services/wayfinding_analytics.py`, publish hook, Alembic `20260902c` | **done** |
| Retention sweeper — 3 tasks in `tasks/retention_cleanup.py` + policy seeds | **done** |
| Consent — `services/wayfinding_consent.py` min() gate; `/…/my-capability`; C/D/E `rung` param on both consent endpoints; immediate coarsen on C revoke | **done** |
| Mobile — `useWayfinding` hook (+ extracted `wayfindingMath.ts`), `WayfindingPanel`, `WayfindingConsentCard`, wired into `app/activity/[id].tsx` | **done** |
| Web builder — `WayfindingBuilder.tsx` (Leaflet pin editor, drag/reorder, per-stop fields, client-side GPX import, GPX export, mode + ceiling selects), i18n-wrapped, in `ActivityManager.tsx` | **done** |
| Mobile quick-create parity — `app/teacher-create-scavenger-hunt.tsx` gains a "One spot / Multi-step route" toggle: capture 2+ stops on the spot → sends a rung-B wayfinding hunt (`waypoints[]`, ceiling `B`), matching the existing on-the-spot discovery-hunt authoring. Teacher/homeschool only, same as the single-point flow. | **done** |
| Rung D live-share — `POST /sessions/{id}/live-position` (gated ≥ D), mobile throttled `onLiveFix` → teacher monitor poll; 7-day retention | **done** |
| Rung E track storage — `session_tracks` table, `POST /sessions/{id}/track` (gated ≥ E), `GET …/track.gpx` export, mobile breadcrumb buffer + 30 s flush; 30-day hard-delete task; **immediate delete on E revoke** | **done** |
| Tests — 45 unit/endpoint tests (backend 29: consent math, analytics roll-up + k≥5, GPX parse/build, arrive/live-position/track endpoints, retention tasks; mobile 16: geo/selection helpers). Maestro mock-walk flow `wayfinding/11-wayfinding.yaml` + CI wiring + `seed_wayfinding_demo` | **done** |
| Deliberately deferred (see decisions below) | **offline basemap tiles** — v1 ships blank-canvas offline; a real offline basemap is a multi-week vector-map effort, revisit only on field feedback |

### Net-new

- `activity_waypoints` table + `wayfinding_mode` / `route_geometry` on
  `activities` — proper Alembic migration, ORM model and `init.sql` in sync (the
  `consent_logs` drift history in `GPS_MAP_HANDOFF.md` is the cautionary tale).
- `session_waypoint_progress` table for resumable, queryable rung-B state.
- `useWayfinding` hook — generalises `useGeofence` to an ordered waypoint set,
  emits `waypoint_arrival`, keeps the coordinate on-device.
- GPX import/export — `gpxpy` on the backend, `@tmcw/togeojson` for the Leaflet
  preview.
- **Retention sweeper** — three tasks added to the existing
  `tasks/retention_cleanup.py` (`coarsen_expired_capture_coordinates`,
  `delink_expired_waypoint_progress`, `purge_expired_session_positions`).
  Prerequisite for every window in §3.
- **Analytics lane** — `authoring_analytics` + `hunt_outcome_analytics` tables
  (identifier-free by construction) and `services/wayfinding_analytics.py`
  (`snapshot_authoring` at publish, `rollup_hunt_outcomes` from the de-link
  task). See §3 "Two lanes".
- Consent UI — three distinct line items (C / D / E) with retention text inline,
  wired to the existing `/parent/consent/gps` and student self-consent endpoints.

### Reused as-is

- `consent_logs` append-only model; grant = INSERT, revoke =
  `UPDATE … withdrawn_at`.
- `_check_gps_consent()` gate and the `403 gps_consent_required` contract.
- `discovery_location_gps_capture_enabled` and `discovery_location_sharing_rules`
  (`only_on_submission`, `require_permission`, `share_with_teacher`) — extended,
  not replaced.
- `privacy_engine` "shortest window wins" across jurisdictions.

### Decisions needed before build

| Decision | Considerations | Recommendation |
|---|---|---|
| **Is rung B on by default for K-12, or opt-in?** | It stores no coordinate, only an arrival index — arguably needs no consent. But "the app watched my child's GPS" is a perception question as much as a legal one. | On by default, disclosed in the activity brief, no separate consent. |
| **Coarsening precision for rung C — 3 dp, or snap-to-waypoint?** | 3 dp (~110 m) keeps a real point for mapping. Snap-to-waypoint keeps only "which stop" and is unambiguously non-tracking, but loses off-route captures. | Snap-to-waypoint when the capture is within a waypoint radius, 3 dp otherwise. |
| **Does the student's breadcrumb track (rung E) ever leave the org?** | Export is useful for the teacher; it also puts a full movement trace in a downloadable file outside the retention sweeper's reach. | Teacher export allowed; guardian export allowed; no public share link; exported files carry the 30-day expectation in a sidecar note. |
| **Offline basemap?** | OSM raster tiles aren't cached. Offline v1 shows waypoints and the route line on a blank canvas; a real offline basemap is a multi-week add. | Ship blank-canvas offline for v1; revisit tile packs only if field feedback demands it. |
| **COPPA sign-off on the continuous-tracking copy** | Rungs C–E consent text needs counsel review, specifically the retention statements shown inline and the re-prompt cadence for rung E. | Block D/E launch on that review; A–C can proceed on the existing `gps_tracking` consent language. |

---

*Peripateticware internal design brief · `wayfinding-consent-ladder` v0.1 · 2026-09-02.*
