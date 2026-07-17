# Feature plan — grade-level picker, accessibility, and four reintroduced features

Written after auditing the current codebase against `work_tracking.md`,
`BUG_REPORT_TRIAGE.md`, and the manual/E2E test suites to ground every
recommendation below in what actually exists (or used to exist) rather than
assumptions. Each section states current behavior, what changed and why
(where I could find it), and what's needed to build/finish it, plus the
corresponding test coverage.

---

## 1. Age-band ("grade-level") picker — recommendation: remove it

**What it currently does:** exactly what you suspected — word choice, and
nothing else.

- `src/bands/copy.ts` is a pure string table (`OnboardingCopy`): different
  phrasing per band for onboarding screens, button labels, and two tab
  labels (`journalLabel`: "Field notes" vs "Field Journal" vs "Field
  record"). No band varies logic, question difficulty, or feature
  availability.
- `PeriSpeech`/`CrowAvatar` vary avatar *size* by band (44px vs 36px) —
  cosmetic.
- The one place band *could* have mattered — `src/api/questions.ts`'s
  `fetchQuestion({ grade })` filters observation questions by grade band
  server-side — is never actually wired up. `app/activity/[id].tsx` calls
  `fetchQuestion({ subject: activity.subject })` and never passes `grade`
  at all. So even the potentially-substantive use is dead code.
- `band` is client-only, resets to `'m712'` on every app launch
  (`BandContext.tsx`), and isn't tied to the logged-in account in any way —
  confirmed independently by `e2e/age-band-adaptation.test.js`'s own
  header comment.

**There's precedent for removing it.** `work_tracking.md` (BUG-32/34)
documents that `settings.tsx` was rebuilt once already with the age-band
selector explicitly removed, replaced by a language picker. The current
`settings.tsx` has the reverse — age-band present, language picker
absent — meaning that decision got reversed at some point with no comment
explaining why.

**Recommendation:** remove the age-band picker from Settings, and either
delete `src/bands/` entirely or fold its only real value (the
`activityLabel`/`journalLabel` string differences) into whatever replaces
it. If content difficulty by grade is actually wanted later, that's a real
feature — wire `fetchQuestion`'s existing `grade` param to something real
(the account's actual grade, not client-only local state) — not a copy
change. Worth deciding which one you actually want before rebuilding
anything here.

**If removed, update:** `settings.tsx` (drop the picker), `BandContext`
usages in `activity/[id].tsx`, `PeriSpeech`, `CrowAvatar`, `journal.tsx`,
`progress.tsx`, `index.tsx`, `login.tsx`, and the onboarding screens (14
files touch `band` today — see the audit). `maestro/flows/age-band/` would
be deleted along with it.

---

## 2. Accessibility (WCAG 2.1 AA) — mobile side

The audit doc at `docs/accessibility/wcag-aa-audit.md` is scoped entirely to
`frontend/src/` (the web SPA) — I checked, its fixes (aria attributes,
skip-nav, the `--text-muted` contrast fix) are all still in place there,
nothing appears to have been lost. But it never touched `mobile/` at all,
and the six items you listed apply squarely to the mobile app too:

- **Screen reader optimization** — mobile currently has **zero**
  `accessibilityLabel`/`accessibilityRole` usage anywhere in `app/` (grepped
  the whole tree). Every icon-only button (capture row, tab bar, camera
  shutter/record, close buttons) is invisible to TalkBack/VoiceOver right
  now. This is the biggest, most concrete gap of the six.
- **Keyboard navigation** — lower priority for a touch-first app, but
  matters for Android's Switch Access / external keyboard users. RN's
  default focus order follows render order; nothing currently overrides it
  badly, but nothing's been verified either.
- **Color contrast** — found a concrete, real bug: `src/theme/tokens.ts`'s
  `fieldGuide` theme has `textMuted: '#7a6f5e'` on `surfaceAlt: '#f5f0e6'` —
  this is the *exact* color pair the frontend audit flagged as a 4.34:1
  failure (below the 4.5:1 AA minimum) and fixed by changing to `#6b6150`.
  Mobile has the identical pair and was never updated. Same fix applies
  here; worth checking `terrain`/`atmosphere` themes for the same pattern
  while in there.
- **Transcripts for audio/video** — there's real backend infrastructure for
  this already: `backend/services/asr_service.py` and
  `StudentCapture.transcript`/`transcript_status`/`transcript_confidence`
  fields exist and are populated. Mobile never displays a transcript
  anywhere — `transcript` is referenced in `CaptureSheet.tsx`/`captures.ts`
  types but not rendered. This is mostly a UI task, not a new backend
  build.
- **Mobile accessibility enhancements** — touch target sizes (the capture
  row's small icon buttons are worth measuring against the 44×44pt
  guideline), and making sure custom components like `Btn.tsx` set
  `accessibilityRole="button"` by default.
- **Dyslexia-friendly font options** — no existing hook for this; would be
  a new `fontBody` override, likely as a Settings toggle independent of the
  three visual themes (a reading-comfort setting, not a color theme).

**Suggested scope for a first pass:** accessibility props on every
icon-only/emoji-only touchable (capture buttons, tab bar, camera controls,
sheet close buttons), the `textMuted` contrast fix, and surfacing
`transcript` text under audio/video captures in `CaptureSheet`/Journal —
these three are concrete, boundable, and don't require new backend work.
Keyboard nav and dyslexia fonts are worth scoping into follow-up phases
since they touch more surface area for less certain payoff.

---

## 3. Four reintroduced features

### 3.1 Language picker (settings)

**History:** existed once — `BUG_REPORT_TRIAGE.md`'s old `features.test.ts`
coverage table lists "8 language chips + switching" in Settings, and
`work_tracking.md` confirms it was keyed off `AsyncStorage @ppw_language`.
Removed at some point when age-band replaced it (see section 1).

**Locale list — decided.** `src/i18n/locales.ts` now holds
`SUPPORTED_LOCALES`, mirroring `frontend/src/config/i18n.ts`'s
`SUPPORTED_LANGUAGES` for web/mobile parity: English, Español, Français,
العربية, 日本語, **한국어 (Korean, confirmed)**, and Português (Brasil) — 7
languages. Web's locale files already have `ko/common.json` and
`ko/landing.json` on disk; `ko` was already in web's `SUPPORTED_LANGUAGES`
before this pass, so no web change was needed there beyond confirming it.
The original mobile picker reportedly had 8 chips; the 8th isn't
recoverable from the docs, so this list is 7 for now — add the 8th to both
`locales.ts` and web's list together if it's ever identified, to keep
parity intentional rather than accidental.

**Still scope-only (not built):**
- A chip-style picker in `settings.tsx`, same visual pattern as the
  existing theme picker (`THEMES.map(...)` → `SUPPORTED_LOCALES.map(...)`).
- Persisting the selection to `AsyncStorage` under the key `locales.ts`
  already exports (`LANGUAGE_STORAGE_KEY = '@ppw_language'`, matching the
  prior key so any leftover logic/migrations expecting it still work).
- The actual string translation layer: mobile still has no i18n library
  wired up, unlike `frontend/`'s full `src/config/i18n.ts`. Two paths,
  still undecided: bring in a lightweight RN i18n library and translate
  the existing hardcoded strings, or — smaller first step — just persist
  the preference and wire translation later. `useSpeech.ts` (section 3.3)
  is already written to accept a `language` BCP-47 tag so TTS can follow
  whichever locale is picked, once picking is real.

### 3.2 Speaker/read-aloud button on Peri's speech

**History:** `BUG_REPORT_TRIAGE.md`'s old test coverage lists "TTS/PeriSpeech:
button visible, tap triggers speech" — so this lived directly on the
`PeriSpeech` component, which still exists today as a pure text-bubble
display with no button of any kind.

**Scope:**
- Add a speaker icon button to `PeriSpeech.tsx`, next to or inside the
  speech bubble.
- On tap, read `text` (the prop it already receives) aloud via on-device
  TTS (see 3.3 — same underlying mechanism).
- Since `PeriSpeech` is already used in 7+ places (onboarding screens,
  activity phases, PeriChatSheet's greeting), this one component change
  gets read-aloud everywhere Peri "talks" for free.
- Also directly serves the accessibility "transcripts/audio" goal from
  section 2 — read-aloud is a meaningful accessibility feature for low
  literacy/vision, not just a nice-to-have.

### 3.3 On-device TTS

This is the engine 3.2 needs. Scope:

- Add `expo-speech` (not currently a dependency — checked `package.json`).
  It wraps `AVSpeechSynthesizer` (iOS) / `TextToSpeech` (Android) — no
  network dependency, no new backend work.
- A small wrapper hook, e.g. `useSpeech()`, handling start/stop/rate,
  probably keyed to age band's old size logic being replaced by something
  band-independent now (see section 1) or just a fixed comfortable default.
- If the language picker (3.1) ships, TTS voice/locale should follow the
  selected language — `expo-speech`'s `language` param takes a BCP-47 tag,
  so this composes naturally once 3.1 exists.
- Natural extension once transcripts (section 2) are surfaced: a "play"
  button next to a capture's transcript text, reusing the same hook.

### 3.4 First-use onboarding flow — WIRED IN (tour-then-login)

**Built.** `AuthGuard` (`app/_layout.tsx`) now checks a persisted
`@ppw_has_onboarded` flag (`src/onboarding/onboardingFlag.ts`):
unauthenticated + flag not set → `(onboarding)`, unauthenticated + flag set
→ `/login` (unchanged behavior for returning users).

**Model chosen: tour-then-login** (per Paul's explicit instruction —
"signup will be done via teacher/hometeacher in webapp"). Onboarding still
does not create or authenticate an account — `name.tsx` only ever collected
a display name into a route param for the "hi {name}" copy on the last
screen. `first-activity.tsx`'s two CTAs now call `finishOnboarding()`,
which sets the flag then `router.replace('/login')` instead of the old
`router.replace('/(tabs)')`. Real account creation is unchanged: a teacher
or homeschool parent creates the student account in the web app, and the
student then logs in with those credentials on this screen.

Nothing in the four onboarding screens needed rebuilding — they were
already themed and used real components (`Btn`, `PeriSpeech`,
`MapIllustration`) consistent with the rest of the app. Age-band-conditional
copy/sizing in them was replaced with the fixed `onboardingCopy` (section 1
removed the band system); functionally unchanged for users, since `m712`
was always the default band everyone saw anyway.

**Test impact (ripple effect worth flagging):** every existing Detox test
and Maestro flow that does a fresh `launchApp({ delete: true })` /
`clearState: true` and then expects `login-screen` immediately now lands on
`onboarding-splash` first instead. Fixed centrally — `e2e/helpers.js`'s
`completeOnboardingIfPresent()` and `maestro/flows/onboarding-skip.yaml`
tap through the tour (no-op if not showing) — and `login-student.yaml`
calls the Maestro version at the top, which covers every flow that already
`runFlow`s it. The handful that assert `login-screen` without going through
that subflow (`1.4-login-failed.yaml`, `0.1-sanity.yaml`,
`14.1-speaker-button.yaml`, and Detox's `auth.test.js`/`starter.test.js`)
were each updated individually. New testIDs were added to all four
onboarding screens' interactive elements to make this possible (`Btn` also
gained a `testID` prop — it didn't have one before).

---

## 4. Test coverage plan for all of the above

Each feature gets a new Maestro flow folder once built, mirroring this
session's conventions (`clearState: true`, testIDs on every new
interactive element before writing the flow, not after):

| Feature | New flow(s) | Notes |
|---|---|---|
| Age-band removal | *(deleted `maestro/flows/age-band/`)* | Done — `11-age-band-adaptation.yaml` and the Detox equivalent removed; `9.1-account-pickers.yaml`/`settings.test.js` updated to drop the K-6/7-12/College assertions |
| Language picker | `maestro/flows/settings/9.3-language-picker.yaml` (not yet — no picker UI built, see 3.1) | Once built: assert chip selection persists across relaunch (`AsyncStorage` round-trip) — this is the one thing settings.test.js's original 9.1/9.2 pattern doesn't cover yet (persistence), worth adding for theme too while in there |
| Speaker/read-aloud button | `maestro/flows/perispeech/14.1-speaker-button.yaml` — built | Maestro can assert the button exists/is tappable; it can't assert audio actually played — same class of limitation as the AI-reply-text gap already documented for PeriChat. Asserts the visible state change (icon swaps between 🔊/⏸) instead |
| On-device TTS | *(covered by the speaker-button flow above — same feature)* | |
| Onboarding-as-tutorial | `maestro/flows/onboarding/15.1-first-launch.yaml` + `e2e/onboarding.test.js` — built | First real test of these 4 screens ever. `clearState: true` does wipe AsyncStorage (confirmed — the flow's second `launchApp: { clearState: false }` relaunch correctly stays on `login-screen` rather than showing onboarding again) |
| Accessibility (a11y props) | No new flow — regression risk, not new behavior | Consider adding an axe-equivalent for RN (`@testing-library/react-native`'s accessibility queries, or a manual TalkBack pass) rather than a Maestro flow; Maestro doesn't have an accessibility-audit mode |
| Transcript display | `maestro/flows/capture/12.5-transcript-view.yaml` | Not built this pass (out of the scope Paul asked for — a11y props + contrast fix only, not the transcript item). Depends on the ASR pipeline actually finishing before the flow checks — may need a poll/wait similar to the offline-sync flow's limitations |

Offline capture (section 5E, the gap identified separately) is already
built: `maestro/flows/offline/13.1-offline-capture-queued.yaml` and
`13.2-offline-capture-syncs.yaml`, run via
`npm run test:maestro:offline-capture` (wraps them with the adb network
toggle Maestro itself can't do). 13.2 only asserts the app survives
reconnect, not that the specific queued item synced — see that flow's
header comment for why, and consider adding a visible sync-status
indicator to Journal as a follow-up; it'd make both the UX and this test
stronger at the same time.

---

## 5. Suggested build order

1. **Age-band decision first** — every other change below touches files
   that also reference `band`; deciding removal vs. keep now avoids
   rework later (e.g. don't build the language picker in a settings.tsx
   layout you're about to restructure anyway).
2. **Accessibility props + contrast fix** — cheapest, highest-value,
   no design decisions blocking it, touches files everything else also
   touches so doing it first means later work inherits it for free.
3. **On-device TTS hook + speaker button** — self-contained, no
   dependency on the other three.
4. **Language picker** — needs the i18n-scope decision from 3.1 above
   before work starts.
5. **Onboarding wiring** — needs the tour-vs-signup product decision from
   3.4 above before work starts; otherwise it's the least code of all of
   these (the screens already exist).

Steps 3 and 4 compose (TTS voice follows language), so doing TTS before
the language picker means the language picker's TTS integration is nearly
free when it lands.
