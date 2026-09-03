# E2E — Homeschool Signup → First Activity — Findings

> **2026-09-03 — all 12 findings fixed** in one pass (see "Resolution" at the
> bottom). Plus: in-app pre-expiry / trial-ending prompt added
> (`TrialExpiryBanner`, wired into every dashboard shell).


Run date: 2026-09-03. Target: production `peripateticware.com` (post go-live:
`SIGNUP_MODE=open`, Resend SMTP fixed, beta funnel retired — commit `d46758d`).
Persona: homeschool parent + one child. User wants these **fixed after the
workflow is fully walked, not mid-run**.

Status key: 🔴 open · 🟢 fixed · ⚪ won't-fix / accepted

---

## What passed (no action)

- Signup (browser UI + direct API), role HOMESCHOOL → **201**, ~0.2–0.45s, no SMTP block.
- Verification email → `Email sent` in backend logs; delivery to inbox confirmed.
- Login before email verification → correctly **403 "User account is inactive"**.
- The `access_token` returned in the signup response (user still `is_active=false`)
  cannot reach any protected endpoint — `/homeschool/*`, `/activities`, `/auth/me`
  all return 401/403 "inactive". No verification bypass.
- `/signup` route always shows the real form; `/request-beta` → 302 `/signup`.

---

## 🔴 1. Country `<select>` shows "us United States" (flag emoji degrades on Windows)

- **Where:** signup form → Teaching Context → Country dropdown
  (`frontend/src/constants/geo.js` `COUNTRIES`, rendered in
  `components/auth/SignUpScreen.tsx`).
- **Symptom:** each option label is `` `${flag} ${name}` `` e.g. `🇺🇸 United States`.
  On Windows (Chrome/Edge — no flag-emoji font) the regional-indicator pair
  renders as lowercase letters, so the collapsed control reads **"us United
  States"**, "gb United Kingdom", etc. Confirmed visually in the user's own Chrome.
- **Impact:** cosmetic, but it's on the primary signup path and looks broken /
  typo'd to a big share of the audience (Windows desktop).
- **Fix options:** drop the emoji from the label; or keep the flag as a
  separate `<span>`/inline SVG outside the option text; or use an SVG-flag
  select component.
- **Severity:** low.

## 🔴 2. Geo-hint does not pre-fill Country on signup

- **Where:** `SignUpScreen.tsx` `useGeoHint()` → `useEffect` that should
  `setCountryCode(geoHint.countryCode)`.
- **Symptom:** Country stayed on "Select country"; had to choose US manually.
  `GET /api/v1/geo/hint` may be failing/blocked at the edge, returning empty,
  or the effect isn't firing before interaction.
- **Impact:** extra friction on every signup; also means `subdivision_code`
  / privacy-jurisdiction matching depends entirely on manual entry.
- **Next step:** check `/api/v1/geo/hint` response through the Cloudflare edge
  (it reads `CF-IPCountry` / an IP geo lookup) and the hook's set logic.
- **Severity:** low–medium.

## 🔴 3. Password fields use `••••••••` as placeholder text

- **Where:** `SignUpScreen.tsx` password + confirm inputs,
  `placeholder={t("landing:", "••••••••")}`.
- **Symptom:** empty password fields look pre-filled with 8 dots.
- **Impact:** minor confusion ("do I already have a password?"); also the i18n
  key is the empty string `"landing:"` which is malformed.
- **Fix:** remove the placeholder (or use real hint text) and fix the key.
- **Severity:** low.

---

## 🔴 4. Onboarding wizard creates child accounts with a shared hard-coded password — HIGH

- **Where:** `frontend/src/pages/homeschool/HomeschoolWelcomePage.tsx:96–111`.
- **What:** the "Add Children" onboarding step only asks name + grade. To satisfy
  the backend (`POST /homeschool/children` requires email + password) the wizard
  **hard-codes** `password: 'Homeschool@1234'` for *every* child and auto-generates
  the email as `<first>.<last>.<5-char-rand>@homeschool.peripateticware.com`.
- **Confirmed in prod:** child `timmy.homeschool.izfui@homeschool.peripateticware.com`
  was created via the wizard; logging in with `Homeschool@1234` **succeeded** and
  landed in the full student app. I never set that password.
- **Impact:**
  1. **Security / account takeover on minors' accounts.** Every wizard-created
     child on the platform shares one password. Email pattern is semi-guessable
     (`firstname.lastname.xxxxx@homeschool.peripateticware.com`, 5 lowercase
     alnum chars ≈ 60M space, but enumerable and the domain is fixed). A
     credential-stuffing script gets into child accounts.
  2. **Flow dead-end.** The parent is never shown the child's email or password
     and there's no "set password" / "get login link" UI on the Children page,
     so a parent who onboards via the wizard has **no supported way to log the
     child in**. (The separate non-wizard "Add Child Account" form on
     `/homeschool/children` *does* ask for email+password properly — the wizard
     is the broken path, and it's the default one from onboarding step 1.)
- **Fix options:** wizard should (a) collect a real password per child, or
  (b) generate a random per-child password and surface it once with a "copy /
  print these credentials" panel, or (c) create a device/login-code flow for
  young kids. Never ship a fixed string.
- **Severity:** HIGH — ship-blocker for the homeschool launch.

## 🔴 5. Production login page exposes demo-account quick-login + password — MED

- **Where:** `/login` — a "TRY A DEMO ACCOUNT" panel with Teacher / Student /
  Parent / Homeschool / **Admin** buttons and the text **"Password: SecurePass123!"**
  shown in plaintext. Rendered on prod.
- **Impact:** if the seeded demo accounts exist in prod (`ENABLE_DEMO_SEED_ACCOUNTS=true`),
  anyone can one-click into a demo **Admin** / Teacher / etc. session. Even if the
  accounts don't exist, it's not launch-appropriate and invites probing. Ties to
  the known legacy `admin`/`admin123` panel exposure in
  [[peripateticware-admin-accounts]].
- **Next step:** confirm whether `admin@example.com` / `SecurePass123!` (and the
  others) authenticate on prod; gate the whole panel behind a dev/staging flag.
- **Severity:** medium (high if the Admin demo account is live).

## 🔴 6. "Student View" from the homeschool activity list 404s — MED

- **Where:** homeschool Activities list → activity card → **"Student View"**
  button → navigates to `/homeschool/activities/{id}/student-preview` →
  **"404 Page Not Found"**. Route isn't registered.
- **Impact:** the parent's only obvious way to preview what the child sees is
  broken.
- **Severity:** medium.

## 🔴 7. In-progress activity session not resumed on page reload — MED

- **Where:** student activity detail page (`StudentActivityDetailPage.tsx`).
- **What:** with a live `in_progress` session (evidence + reflection already
  saved server-side), reloading the activity URL shows the "Before you begin /
  I'm ready — Start Activity" screen from scratch — Orient/Inquiry/Reflect
  progress not restored. Clicking Start again *does* resume (backend
  `start_activity_session` is idempotent and logs "Resuming existing session"),
  but the UI doesn't detect the existing session on load, and the Reflect form
  doesn't repopulate the previously-saved reflection text.
- **Impact:** looks like lost work; a kid on a flaky connection re-does steps.
- **Severity:** medium.

## 🟡 8. "Submit Activity" uses a native `window.confirm()` — LOW

- **Where:** `StudentActivityDetailPage.tsx:227` — `if (!confirm('Submit this
  activity for review?')) return;`
- **Impact:** unstyled native dialog, off-brand, blocks the main thread; also
  what made this E2E's automation appear to hang. Cosmetic for real users.
- **Fix:** replace with the app's own modal component.
- **Severity:** low.

## 🟡 9. Homeschool dashboard greeting shows "Welcome, there" — LOW

- **Where:** `/homeschool` — header reads **"Welcome, there 👋"** instead of
  "Welcome, Harriet". First name not interpolated (empty → "there" fallback).
- **Severity:** low.

## 🟡 10. Activity builder overwrites the entered location name with a reverse-geocoded address — LOW

- **Where:** activity create → Location. Entered name "Back yard, Austin TX" +
  coords (30.2672, -97.7431); saved/displayed name became
  "Charles Schwab, 501, Congress Avenue, Downtown, Austin, Travis County,
  Texas, 78701, United States" (reverse-geocode of the coords). The
  human-friendly label the parent typed is lost.
- **Severity:** low.

## 🟡 11. Signup Teaching-Context state not carried into onboarding "Your State" step — LOW

- Signup collected State = Texas (Teaching Context). The homeschool onboarding
  wizard step 2 "Which state do you homeschool in?" starts blank ("Select your
  state"). Redundant re-entry; `subdivision_code` from signup not reused.
- **Severity:** low.

## 🟡 12. Child grade shows one higher than selected — LOW / needs confirm

- Onboarding: set Timmy to **Grade 4** (`value="4"`). Activity builder then said
  "Peri will suggest activities for Science, grade **5**", and the created
  activity card shows **Grade 5**. Possible off-by-one between the wizard's
  grade value and how it's read back, or the builder just defaults to 5
  independent of the child. Needs a code check.
- **Severity:** low.

## ⚪ Not bugs (checked)

- Renderer "freezes" during this run = the `window.confirm()` (finding 8) +
  the automation's inability to see native dialogs. Not a product hang.
- Student sees all 11 published activities in "Find Activities", not just
  parent-assigned ones — appears to be the intended shared-library model
  (there is no "assign to child" concept in the homeschool flow).

## Flow coverage

signup ✅ · email verify ✅ (user-confirmed) · login ✅ · homeschool onboarding
wizard ✅ · add child ✅ (but finding 4) · create activity ✅ · publish ✅ ·
child login ✅ (via finding 4) · start session ✅ · add evidence ✅ ·
save reflection ✅ · **submit activity ✅** (`POST /submit` → 201, submission
`ae51b4aa-…`) · parent sees it ✅ (`/homeschool/children/{id}/progress` →
`completed_sessions:1, overall_progress:100`; dashboard `session_count:1`).

**Full homeschool signup→first-activity loop works end to end on production.**
Every 🔴/🟡 above is a defect found *along* that working path, not a break in it,
except finding 4 which needs a real fix before homeschool launch.

## Test artifacts created on prod (for teardown)

- Parent user `peri.e2e.hsparent@thewordinbits.com` (+ auto org "Homeschool E2E Family",
  org id via signup), password `E2eTest!2026`, role HOMESCHOOL, verified/active.
- Child user `timmy.homeschool.izfui@homeschool.peripateticware.com`
  (id `dc739882-be77-4337-bfd2-a96dda537776`), password `Homeschool@1234`.
- Activity `aa9ef023-fe7d-4584-9530-06c1aefdf48e` "Backyard Leaf & Tree Investigation" (published).
- Session `c22c0d72-…`, submission `ae51b4aa-…`, 1 evidence + 1 reflection.
- Earlier API-only throwaway parent `hstest.parent.1788446326@thewordinbits.com`
  (unverified/inactive) + its auto org.
- `emailcheck_1788443884@thewordinbits.com` (unverified) — from the SMTP delivery test.

---

# Resolution — 2026-09-03

| # | Sev | Fix |
|---|-----|-----|
| 1 | low | `constants/geo.ts` — dropped flag emoji from `COUNTRIES` labels (Windows renders 🇺🇸 as "us"); also the inline `🌍 Other` option in `SignUpScreen.tsx`. |
| 2 | low-med | `routes/geo.py` `/geo/hint` now reads Cloudflare's `CF-IPCountry` header first — behind the cloudflared tunnel the backend only ever saw a loopback peer, so MaxMind always returned null and the signup country never pre-filled. |
| 3 | low | `SignUpScreen.tsx` — password + confirm placeholders were `••••••••` under a malformed `"landing:"` i18n key; now real hint text ("At least 8 characters" / "Re-enter your password"). |
| 4 | **HIGH** | `HomeschoolWelcomePage.tsx` — no more shared `Homeschool@1234`. Each wizard-created child gets a **unique random password** (`generateChildPassword()` — readable nature-word + digits, meets complexity). After step 1 the wizard shows a **"Your children's logins"** panel (email + password per child, "Copy all" button, "save/print — can't be shown again") before advancing. Reset path: Children page. |
| 5 | med | `LoginScreen.tsx` — the "TRY A DEMO ACCOUNT" panel (incl. Admin + `SecurePass123!` in plaintext) is now gated `import.meta.env.DEV || VITE_SHOW_DEMO_LOGINS==='true'` → absent from the production build. |
| 6 | med | Added the missing route `/homeschool/activities/:id/student-preview` → `<StudentActivityPreview/>` in `App.tsx`; made that component's back-button context-aware (`/homeschool` vs `/teacher`). Was a hard 404 from the homeschool "Student View" button. |
| 7 | med | Resume support. `GET /student/activities/{id}` now returns `my_session` (`{session_id, status, has_reflection, evidence_count}`). `StudentActivityDetailPage.tsx` reads it on load and restores session + phase + evidence, and re-hydrates the reflection textarea via new `getSessionReflections()`. No more "start from scratch / work lost" on reload. |
| 8 | low | `StudentActivityDetailPage.tsx` — replaced `window.confirm('Submit this activity for review?')` with a styled inline confirm panel (`showSubmitConfirm` → "Yes, submit" / "Cancel"). This native dialog was also what stalled the E2E automation. |
| 9 | low | `TokenResponse` + `MeResponse` now include `first_name` / `full_name`; `stores/auth.ts` maps them into `user` on login / signup / MFA / `/me`; `HomeschoolDashboard.tsx` greeting falls back `first_name → full_name → email local-part → "there"`. |
| 10 | low | `ActivityManager.tsx` — a `locationNameEdited` ref: once the user types their own location name, a later lat/lng reverse-geocode no longer overwrites it (was replacing "Back yard, Austin TX" with the nearest street address). Empty/auto names still auto-fill. |
| 11 | low | Signup writes the chosen US state to `localStorage['hs_signup_subdivision']` for HOMESCHOOL; `HomeschoolWelcomePage.tsx` step 2 pre-selects it (resolves code or full name against its `US_STATES` list). |
| 12 | low | `ActivityManager.tsx` — was a hard-coded `grade_level: 5` default with no link to the child. In homeschool + create mode it now fetches `/homeschool/children` and defaults the grade to the first child's grade (3–12). Teacher mode keeps the neutral default. |

### New: in-app pre-expiry prompt
`components/TrialExpiryBanner.tsx` — reads `GET /api/v1/billing/status`; shows a
slim dismissible banner when `trial_days_left <= 7` (or in grace period) with a
"See plans" link to `/licensing`. Dismissal is per-day (localStorage). Mounted
once in `DashboardShell` so it covers teacher + homeschool (hidden for roles
with no org / no trial). Mobile apps still don't sell in-app — this drives to
the website, per the billing design.
