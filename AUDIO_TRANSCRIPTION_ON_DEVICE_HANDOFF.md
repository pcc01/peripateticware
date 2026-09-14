# Outstanding Items Handoff (2026-09-13)

Handoff doc for a new agent to pick up several unrelated pieces of
outstanding work without re-deriving this session's context. Sections:

1. Audio transcription — on-device (the original subject of this doc)
2. Regulatory items needing legal/product review (not engineering)
3. A real, live encrypted-data-leak bug (classroom roster endpoint)
4. How to clean up throwaway test accounts — needed again for whichever of
   the above ends up requiring live verification

Each section is self-contained; read only the one(s) relevant to what
you're picking up.

---

# 1. Audio Transcription — On-Device

Two related pieces of work: (1) a quick, safe fix to the *existing*
server-side transcription pipeline, and (2) a larger, separate feature —
real on-device speech-to-text — that the product owner intended to have
built already but didn't.

## Background: how this came up

This session did a large privacy-engine audit/fix pass today (see
`PRIVACY_ENFORCEMENT_HANDOFF.md` for that unrelated but adjacent work — same
repo, same day, different subsystem). While auditing "does the website's
third-party-sharing copy match reality," the audit found that `POST
/inference/chat` ("Ask Peri") sends a student's message to Anthropic's
Claude API with zero privacy/age gating. That's now fixed (see "Already
shipped today" below) — but investigating it surfaced a second, separate
question from the user: **why are images/audio being sent to a third party
at all, and shouldn't everything be on-device by default, only reaching
Claude when Claude is actively being used for student discussion?**

The user's stated design principle, verbatim intent (not a direct quote,
but the substance of several messages in this session):
> Data should be saved on-device first. Nothing goes to a third party
> (specifically Claude) unless Claude is actively being used for student
> discussion. The user recalls building the original server-side audio
> transcription path, then deciding on-device transcription should be used
> instead — but that pivot was apparently never actually implemented.

## What's confirmed true right now (verified this session, don't re-derive)

### Images: NOT actually a live issue — corrected mid-session, don't re-flag this

`POST /inference/multimodal-process` (`backend/routes/inference.py::process_multimodal_input`)
would send images to Claude Vision (confirmed: in this deployment's real
config, Claude Vision is the *primary* path for the `image` input type, not
a fallback — see `services/vision_service.py`). **But this endpoint has
zero real callers** — verified by grepping the entire web frontend and the
entire mobile app for `processMultimodal`/`multimodal-process`. The only
frontend function that calls it
(`frontend/src/services/inferenceService.ts::processMultimodal`) is itself
never invoked by any component. Earlier in this session it was
mis-reported as a live gap based on tracing the backend code's theoretical
behavior without confirming a real caller existed — that was wrong,
corrected explicitly to the user, and this doc is repeating the correction
so it doesn't get re-flagged as urgent by a future pass. If this endpoint
is ever wired up to a real caller in the future, re-apply the same
age-gate pattern used for chat (see below) before shipping it live.

### Audio: real, live, and exactly the pattern the user is concerned about

`backend/routes/student.py::upload_capture` (the real capture-upload route,
used for photo/video/audio evidence — `POST /captures` and its
`/captures/{audio,photo,video}` aliases): for `capture_type == AUDIO`
specifically, it unconditionally schedules a background task:

```python
if capture_type == CaptureType.AUDIO:
    background_tasks.add_task(_transcribe_audio_background, capture.id, str(file_path))
```

This fires on **every** audio capture, completely independent of whether
the student ever opens a Peri chat about it. (Photo/video captures do
**not** trigger any automatic third-party processing today — only the raw
file gets saved to disk. This is the corrected finding above: the
image-analysis path that *would* auto-process photos is the dead
`/inference/multimodal-process` endpoint, not this one.)

`backend/services/asr_service.py::_transcribe_audio_background` →
`ASRService` has a three-tier provider chain, in this literal order (see
the module's own header comment):
1. **PRIMARY**: Whisper on Ollama — self-hosted, local infrastructure, not
   a third party.
2. **SECONDARY**: OpenAI Whisper API — cloud, third party.
3. **TERTIARY**: Anthropic Claude — cloud, third party, "ultimate fallback."

Confirmed live prod config (`.env`, values not read/logged, only presence
checked):
- `ASR_ENABLED` — **set** (note: appears as a **duplicate key** in prod's
  `.env`, i.e. `ASR_ENABLED=` appears twice; worth a quick cleanup while
  touching this file, unrelated to the actual bug but easy to fix in the
  same pass). Code default if unset is `false`
  (`backend/core/config.py:225`), but prod has it explicitly set.
- `OLLAMA_BASE_URL` — **set** (so tier 1, self-hosted, is genuinely
  configured and should be the common-case path).
- `ANTHROPIC_API_KEY` — **set** (so tier 3, Claude, is genuinely reachable
  as a fallback, not just theoretical).
- `OPENAI_API_KEY` — **not set** (tier 2 is effectively skipped in
  practice; the real fallback chain today is Ollama → Claude, not
  Ollama → OpenAI → Claude).

Net effect: in normal operation, audio transcription happens via
self-hosted Ollama and never reaches a third party. But on any local-infra
hiccup (Ollama down, model not loaded, timeout, etc.), it silently falls
through to sending the student's raw audio to Anthropic — and that
fallback is **not** conditioned on "Peri is being used for discussion" in
any way. It's a reliability fallback for an unrelated automatic background
job, not a discussion-context feature.

### On-device transcription: does not exist anywhere in the codebase today

Searched both `frontend/src` and the entire `mobile/` tree for any speech-
recognition / speech-to-text implementation (`react-native-voice`,
`expo-speech` used for STT, `SFSpeechRecognizer`, Android `SpeechRecognizer`,
Web Speech API, anything matching "on-device transcri*"). Found:
- `mobile/package.json` has `expo-speech` (`~14.0.8`) — this is
  **text-to-speech only** (Peri reading a response *aloud to* the student
  via `mobile/src/hooks/useSpeech.ts`, `VoicePicker.tsx`,
  `SpeechVoiceContext.tsx`). It has no speech-to-text capability at all —
  don't confuse this with the transcription feature; it's a completely
  separate direction of audio.
- `mobile/FEATURE_PLAN.md` (an existing planning doc in the mobile
  package) confirms: "there's real backend infrastructure for
  transcripts... Mobile never displays a transcript anywhere" — i.e. even
  the *server-side* transcript pipeline's OUTPUT isn't surfaced in the
  mobile UI yet, let alone replaced by an on-device INPUT mechanism.

**Conclusion: the "switch to on-device transcription" decision the user
recalls making was never implemented.** The code still reflects the
original, pre-decision, server-side-only design. This isn't a regression
to fix — it's unstarted work.

## Already shipped today (context, not part of this handoff's task list)

For reference/pattern-matching, not to redo: `chat_with_peri` and
`process_inquiry`'s real-student-text branch (`backend/routes/inference.py`)
now have a hard under-13 age floor —
`_is_third_party_ai_sharing_permitted(current_user)` returns `False` for
`age_group == "under_13"` or `requires_parental_consent`, and both call
sites skip the real LLM call entirely for such a student, returning a
graceful curated-bank-style fallback (HTTP 200, not an error) instead.
Matching copy was added in three places: `frontend/src/pages/PrivacyEnginePage.tsx`,
`frontend/src/pages/PrivacyPage.tsx`, and
`frontend/src/components/teacher/ActivityManager.tsx` (a short disclosure
line under the AI-interaction-mode selector in the activity **create**
flow specifically — confirmed that's where the teacher actually makes this
choice, per the user). This is the disclaimer *style/pattern* to match for
the audio-capture UI disclaimer below — short, matter-of-fact, same
density as surrounding copy, not a wall of text.

Live-verified end-to-end against production (not just unit tests): a real
under-13 test account got the curated fallback from `/inference/chat`, a
real adult test account got a genuine distinct LLM-generated reply. Both
test accounts and their throwaway org were cleaned up afterward.

## The two pieces of work for the next agent

### Task A — Quick fix to the existing pipeline (small, low-risk, do this first)

1. **Remove the Claude (and, since it's unreachable anyway, OpenAI) tier
   from `ASRService`'s fallback chain** in `backend/services/asr_service.py`
   — make it Ollama-only. If self-hosted transcription fails or is
   unavailable, the capture should simply not get a transcript (fail
   without a cloud fallback) rather than silently sending the student's
   audio to a third party. Decide/confirm with the user exactly what
   "fails" should look like from the student/teacher's side (silently no
   transcript vs. some visible status) — `StudentCapture.transcript_status`
   already exists as a field per `FEATURE_PLAN.md`'s notes, likely already
   has a way to represent "failed"/"pending" — check `models/database.py`
   or wherever `StudentCapture` is defined before inventing a new status
   value.
2. **Add a short disclosure near wherever audio capture happens in the
   UI**, matching the pattern/tone from today's chat disclaimer. Likely
   `mobile/src/components/CaptureSheet.tsx` and/or
   `CapturePreviewModal.tsx` (both reference `CaptureType.AUDIO` — verify
   which one is the actual entry point the student sees before recording,
   vs. a post-capture review screen, and place the disclosure at the
   point of capture, not after). Something like: "Your recording is
   transcribed on our own servers — it's never sent to a third-party AI
   provider unless you're actively chatting with Peri." (Wording should
   reflect whatever Task A #1 actually ships — don't promise "never" if a
   fallback is kept after all; confirm the exact final behavior first,
   write copy second.)
3. Fix the duplicate `ASR_ENABLED=` key in prod `.env` while in the
   neighborhood (cosmetic, not a functional bug — .env parsers typically
   just take the last occurrence, but it's confusing and worth a one-line
   cleanup).
4. Test locally first, per this session's established workflow (see
   `PRIVACY_ENFORCEMENT_HANDOFF.md` for the pattern: local Docker stack,
   full test suite green, only then commit/push/deploy to prod via the
   documented SSH+docker-compose flow). This repo's session-level
   permission classifier denies direct `docker exec`/deploy actions for a
   background agent fairly often — if blocked, stop and hand the exact
   command back to the user rather than retrying or routing around it
   (established pattern all session).

### Task B — Real on-device speech-to-text (separate, larger, scope before building)

This is new feature work, not a bugfix — different scope and skill set
than Task A. Suggested scoping questions for whoever picks this up (don't
just start coding):

- **Which platform(s) first?** Mobile (React Native / Expo) is the primary
  candidate given `expo-speech` (TTS) is already an Expo dependency —
  check whether Expo's ecosystem has a maintained on-device STT module
  compatible with the app's current Expo SDK version, vs. needing a
  third-party RN library (`@react-native-voice/voice` is the common
  choice, but confirm current maintenance status before depending on it)
  vs. writing native modules directly against `SFSpeechRecognizer`
  (iOS)/Android's `SpeechRecognizer` API. Web (the teacher/browser side)
  is a separate, much smaller question if in scope at all — the Web
  Speech API (`webkitSpeechRecognition`) exists in most browsers but has
  patchy cross-browser support and would need its own feasibility check.
- **What replaces what?** Does on-device transcription fully replace the
  server round-trip (audio never leaves the device at all for
  transcription purposes), or does it produce a transcript that still
  gets uploaded as text alongside the audio file (audio itself still
  stored server-side for the teacher/portfolio review use case, just the
  transcription step moves on-device)? This matters a lot for scope —
  the first option is a bigger architecture change than the second.
  Given `StudentCapture.transcript`/`transcript_status`/
  `transcript_confidence` already exist as DB fields (per
  `FEATURE_PLAN.md`), the second (on-device transcription writes into the
  same existing fields via a new upload path) is likely the lower-risk,
  faster path — the server-side ASR pipeline from Task A would then
  become a fallback for devices/situations where on-device STT isn't
  available, rather than being removed outright.
- **Permissions, offline behavior, accuracy/language coverage** vs. the
  current Whisper-based pipeline — worth a short comparison before
  committing, especially since this app supports many locales (see
  `peripateticware-mobile-i18n` project context — 13 languages already
  localized) and on-device STT quality/language support varies a lot by
  platform and OS version.
- **Where mobile's existing transcript-display gap fits in**: per
  `FEATURE_PLAN.md`, mobile doesn't display transcripts at all yet
  (section 2 in that doc, referenced above) — that UI work may be a
  natural, smaller first step to pair with Task B, or may already be
  tracked separately; check `FEATURE_PLAN.md` in full before assuming
  it's untouched.

## Files to read before starting (in addition to what's cited inline above)

- `backend/routes/student.py` — `upload_capture`, `_transcribe_audio_background`
- `backend/services/asr_service.py` — full provider chain
- `backend/core/config.py:225` — `ASR_ENABLED` default
- `backend/routes/inference.py` — `chat_with_peri`, `process_inquiry`,
  `_is_third_party_ai_sharing_permitted` (the pattern to match for any new
  gating), `process_multimodal_input` (confirmed dead, don't re-flag)
- `mobile/src/components/CaptureSheet.tsx`, `CapturePreviewModal.tsx`
- `mobile/FEATURE_PLAN.md` — existing planning doc, has relevant
  transcript-display context already written
- `frontend/src/pages/PrivacyEnginePage.tsx`,
  `frontend/src/pages/PrivacyPage.tsx`,
  `frontend/src/components/teacher/ActivityManager.tsx` — disclaimer
  style/pattern reference from today's shipped chat-gate work

---

# 2. Regulatory items needing legal/product review (not engineering work)

Full detail already written up in `PRIVACY_REGULATORY_WATCH.md` (repo
root, same day, untracked/uncommitted — still sitting in the working
tree). This section is a pointer + summary so a new agent doesn't have to
open that file blind; read the full doc before acting on any of these,
since each one turns on a real legal/factual question, not a code fix.

**None of these are engineering tasks.** They need a human (counsel or
product) to make a call; there is nothing here to "implement" until that
happens. If an agent is asked to act on one, the action is almost
certainly "draft a question for counsel" or "propose product-behavior
options," not "write code."

Four items flagged as real/near-term, out of a longer list of things that
are fine to just track:

1. **NYC DOE generative-AI moratorium** (announced Sept 2, 2026) — the
   largest US school district banned generative AI for grades 2K-8 and
   banned "companion chatbots" district-wide, zero exemptions. Directly
   relevant to this product's `ai_chat` feature (Peri) if this platform is
   sold into or used by NYC DOE schools — needs a sales/product posture
   decision, not code.
2. **Brazil's Digital ECA** (Law 15.211/2025, in force March 2026, ANPD
   enforcing) — explicitly names chat features, age-banded, and is
   **already legally binding today**, not pending. Highest-urgency item
   on the list purely because it's the only one that's unambiguously
   already in force with no interpretive question attached.
3. **EU AI Act Annex III** (Aug 2, 2026) — brought high-risk obligations
   for "education" into force, defined broadly, no age/institution
   carve-out. Turns on a fact question only product/legal can answer:
   does Peri's adaptive tutoring "steer the learning process" in the
   sense Annex III means (point 3(b))? Engineering can describe what the
   feature actually does; the classification call isn't an engineering
   decision.
4. **California SB 243** (+ 11 other US states' AI-companion-chatbot laws)
   — no education carve-out in the statute at all. `ai_chat` could
   plausibly meet the statutory definition of "companion chatbot"
   regardless of the school context it's used in. Needs a legal read on
   whether Peri's actual behavior (guided-inquiry Q&A tied to a specific
   educational activity, not open-ended companionship) falls inside or
   outside that definition.

Checked and explicitly **not** applicable despite surface resemblance
(don't waste time re-investigating): Australia's under-16 social media
ban (squarely about public social platforms, doesn't reach a closed
classroom tool); UK Online Safety Act's core chatbot duties (Ofcom's own
Dec 2025 guidance treats a 1:1 student↔AI chatbot with no user-to-user
sharing as outside the regulated category, which matches Peri's actual
architecture).

---

# 3. Real, live bug: classroom roster endpoint leaks raw encrypted ciphertext

Found incidentally today (not part of the privacy-engine work, a separate
pre-existing bug), **not fixed**, flagged for its own ticket.

`GET /classrooms/{classroom_id}` (`backend/routes/classrooms.py::get_classroom`,
around line 333) fetches the student roster via a raw SQL `text()` query:

```python
students = (await db.execute(text("""
    SELECT u.id, u.email, u.first_name, u.last_name, u.full_name,
           cs.enrolled_at
    FROM   classroom_students cs
    JOIN   users u ON u.id = cs.student_id
    WHERE  cs.classroom_id = :cid
    ORDER BY u.last_name, u.first_name
"""), {"cid": classroom_id})).mappings().all()
```

`users.email` and `users.full_name` are `EncryptedString` columns — the
decryption only happens via the SQLAlchemy ORM's own type-decorator layer.
A raw `text()` query bypasses that entirely, so `s["email"]`/`s["name"]`
in the endpoint's response are the **raw Fernet ciphertext** (looks like
`gAAAAABq...`, base64), not the real values. Confirmed live in prod this
session: a teacher's own classroom-detail view returns ciphertext instead
of their students' actual names/emails.

This is the **same bug class** already found and fixed once elsewhere in
this codebase (see the existing comments in
`routes/classrooms.py::accept_invite` describing an identical
raw-SQL-bypasses-ORM issue that was fixed for the invite-accept path — this
endpoint just never got the same treatment). The fix pattern already
exists in this repo to copy: query via the ORM (`select(User)...`) instead
of raw SQL for any column that's an `EncryptedString`, or if raw SQL is
kept for the join/performance reasons, decrypt explicitly using whatever
helper the ORM's `EncryptedString` type wraps (check
`core/encryption.py`) before returning.

**Scope check before fixing**: grep the rest of `routes/classrooms.py` and
neighboring route files for the same raw-`text()`-selecting-`email`-or
`full_name`-or-any-other-`EncryptedString`-column pattern — this specific
one was found by accident while doing unrelated cleanup-account debugging,
not from a systematic search, so there may be siblings.

---

# 4. How to clean up throwaway test accounts (needed again for any live verification above)

Whichever of the above ends up needing live verification against
production (Task A's audio-gate fix, or Task B's on-device work once
built — both, per this session's established pattern, should be tested
locally first and only verified live afterward) will need throwaway test
accounts, same as today's entire privacy-engine effort did. Here's the
tooling and convention, already built and working — reuse it, don't
reinvent it.

## The cleanup script

`backend/cleanup_privacy_test_accounts.py` — a management script (same
invocation pattern as the existing `backend/set_admin.py`), run inside the
backend container. **Defaults to dry-run; nothing is ever deleted without
an explicit `--confirm` flag.** Already committed to `main`, already
deployed, already used successfully today (with two small bugs found and
fixed live — see its own git history / commit messages for exact fixes,
both were empty-list SQL edge cases, already patched).

Note before you start: `docker cp`/`docker exec` against the prod host get
denied by this session's permission classifier fairly often for a
background agent — if that happens, stop and hand the exact command back
to the user rather than retrying or routing around it (established
pattern all session, see `PRIVACY_ENFORCEMENT_HANDOFF.md` for why).

Usage:
```
# 1. Get an accounts-tracking JSON file (see schema below) onto the prod
#    host and into the running container:
scp <local-file>.json pcc@192.168.50.76:/home/pcc/peripateticware/<file>.json
ssh pcc@192.168.50.76 "docker cp /home/pcc/peripateticware/<file>.json peripateticware-backend:/app/<file>.json"

# 2. Dry run first, always:
ssh pcc@192.168.50.76 "docker exec peripateticware-backend python cleanup_privacy_test_accounts.py --accounts-json /app/<file>.json --dry-run"

# 3. Read the report carefully -- it prints a full FK inventory, any
#    safety exclusions (e.g. an org with a non-target member -- don't
#    delete until you understand why), and the exact row counts per table
#    it WOULD delete. Only once satisfied:
ssh pcc@192.168.50.76 "docker exec peripateticware-backend python cleanup_privacy_test_accounts.py --accounts-json /app/<file>.json --confirm"
```

## Accounts-JSON schema (the script accepts either shape, and multiple `--accounts-json` flags can be combined in one run)

```jsonc
// Flat "extras" shape -- simplest, use this for a small/new round:
{
  "extra_emails": ["admin+priv-<slug>@thewordinbits.com", ...],
  "extra_user_ids": ["<uuid>", ...],   // only if you already know the id; emails alone are enough
  "extra_org_ids": ["<uuid>", ...]     // IMPORTANT: orgs are NOT auto-discovered from users --
                                        // if you created an org, its id MUST be listed here explicitly
                                        // or it will be silently left behind (found live today).
}
```

**Critical gotcha, found live today**: the script does **not** infer which
orgs to delete from the users you give it. If you create a throwaway
teacher + org and only list the teacher's email/id, the teacher (and
anything cascading from the teacher, like their classroom) gets deleted,
but the bare `organizations` row itself is orphaned and left behind unless
its id is *also* explicitly listed in `extra_org_ids`.

## Naming convention (keep using this — it's what makes accounts identifiable as throwaway)

All of today's test accounts used `admin+priv-<slug>[-<suffix>]@thewordinbits.com`
(a plus-addressed alias under the real admin's domain, so mail is
receivable without creating real separate mailboxes). Keep using this
prefix for any new round so accounts stay trivially greppable/identifiable
as disposable, and so the cleanup script's own safety logic (which checks
the resolved email actually matches this pattern before ever adding an id
to the delete set) keeps working without modification.

## Current state (as of this handoff — don't assume prior test data still exists)

**Everything from today's earlier privacy-engine work has already been
cleaned up** — all `admin+priv-*` accounts, orgs, activities, and
synthetic audit-log rows from that effort were deleted via this same
script earlier today. The tracking files that recorded them,
`C:\Users\pcerd\privacy_emu_created.json` and
`C:\Users\pcerd\privacy_emu_extras.json` (local machine, not in the repo),
**still exist as historical records but describe accounts that no longer
exist in prod** — don't treat them as a current inventory, and don't feed
them to `--confirm` expecting anything to happen (a dry-run would just
show everything as "not found, already deleted"). Any new round of test
accounts (for Task A/B verification here, or anything else) needs its own
fresh tracking file from scratch, following the same schema and
`admin+priv-*` convention.
