# Peripateticware — Design Review & Decision Brief
Session: 2026-05-28

---

## What We Have (Design Assets)

Uploaded design files to review:
- `Hi-Fi Design.html` — primary hi-fi mockups
- `Hi-Fi Design-c2b36025.html` — alternate/updated hi-fi
- `Teacher Hi-Fi.html` — teacher-specific flows
- `PPW Mobile Dashboards.html` — mobile dashboard designs
- `Phase 6 - Student Mobile Build-out.html` — student mobile UI
- `Wireframes.html` — original wireframes
- `Design System.html` — tokens, components, spacing
- `Language Fonts.html` — typography per language/locale

---

## Key Design Decisions to Make Tomorrow

### 1. The Crow Mascot
- Crow component exists (`Crow.tsx`, `CrowByAgeBand.tsx`, `CrowByAgeBand_Alt2`, `CrowByAgeBand_Alt3`)
- Multiple age-band variants already built (geometric, organic, native styles)
- **Decision needed:** Which crow style to use? Where does it appear?
  - Landing page hero ✅ (partially there)
  - Loading screens?
  - Empty states?
  - Onboarding flow?
  - Mobile app splash?

### 2. Color Scheme / Skins
- Original plan: 3 palettes for K-12 age bands
- **Revised plan (confirmed):** 3 palettes as user-chooseable skins
- **Decision needed:**
  - Where is the skin picker exposed? (Settings page? Onboarding? Profile?)
  - Default skin per role (teacher gets one, student gets another)?
  - Skin stored in localStorage or user profile in DB?
  - Names for the 3 skins (e.g. "Forest", "Ocean", "Sunset")?

### 3. Landing Page vs. App
- Landing page (`LandingPage.tsx`) is retained as-is ✅
- **Decision needed:** Does the landing page get the crow treatment?
  - Hero image = crow?
  - Or keep existing landing and only add crow inside the authenticated app?

### 4. Mobile vs. Desktop Priority
- Product is K-16 — students will be on phones in the field
- Phase 6 mobile build-out designs exist
- **Decision needed:**
  - Web app is responsive (current) or do we treat mobile as a separate React Native app?
  - The Expo/React Native config exists in the repo (`app.json`, `EXPO_PUBLIC_API_URL`)
  - Do we pursue the RN mobile path or keep web-responsive for now?

### 5. Navigation Model
- Teacher: sidebar nav (desktop) — exists
- Student: bottom tab nav (mobile-first) — designs exist, partial implementation
- Parent: minimal nav — exists
- **Decision needed:** Confirm nav pattern for each role before we build missing pages

---

## Design System Summary (from assets)

Based on the design files, the system uses:
- **Typeface:** Inter (primary), with language-specific font fallbacks per `Language Fonts.html`
- **3 Color Palettes** (review exact values in `Design System.html` tomorrow):
  - Palette A — warmer tones (likely student/young)
  - Palette B — cooler/professional (likely teacher)
  - Palette C — neutral/natural (parent or alternate)
- **Component library:** Custom (not shadcn, not MUI) — Button, Card, Input, Badge, Modal all in `frontend/src/components/common/`
- **Icons:** Likely Lucide (already in package.json)

---

## Pages to Build (in priority order)

### Broken / Incomplete Now
1. **SignUpScreen** — fields exist, API call broken (see FIXPLAN.md)
2. **ActivityList page** — renders but store returns empty (stub)
3. **ActivityManager (create/edit)** — form exists, save is a no-op
4. **AI Activity Generation panel** — `OllamaLessonSuggestions.tsx` exists, inference router not registered

### Missing Pages (have designs, need implementation)
5. **Student Dashboard** — partial, needs real data from API
6. **Student Activity Detail** — `StudentActivityDetailPage.tsx` exists, needs wiring
7. **Session/capture page** — `SessionPage.tsx` exists (Phase 6 capture flow)
8. **Teacher Submissions** — `TeacherSubmissionsPage.tsx` exists, needs data
9. **Parent Progress** — `ParentProgressPage.tsx` exists, needs data

### Stubbed as ComingSoon (lower priority)
- Teacher: Student Management
- Admin: User Mgmt, Class Mgmt, Analytics
- Parent: Messages, Calendar, Reports, Notifications

---

## Tomorrow's Session Agenda (suggested)

**Part 1 — Design Review (30-45 min)**
- Open each HTML design file in browser
- Confirm crow style choice
- Confirm 3 skin names and where picker lives
- Confirm nav pattern per role
- Note any component gaps vs. current implementation

**Part 2 — Design Tokens + Skin System (45 min)**
- Add CSS custom properties for 3 skins to `index.css`
- Add skin picker to Settings pages (teacher + student)
- Apply crow to appropriate screens

**Part 3 — Fix + Build (rest of session)**
- Follow FIXPLAN.md priority order
- i18n → signup → teacher store → inference → missing pages

---

## Files to Have Open Tomorrow
- `FIXPLAN.md` (this folder) — bug fix checklist
- `frontend/src/stores/teacher.ts` — stub implementations to replace
- `backend/main.py` — router registration
- `backend/routes/inference.py` — AI endpoints
- `frontend/src/components/auth/SignUpScreen.tsx`
- `frontend/src/App.tsx` — routing


---

## AI Scaling Strategy (confirmed approach — do not change)

### The Rule: AI runs at creation time, never at student runtime

**On-device (zero cost, offline-capable):**
- Socratic / Aristotelian questions → SQLite DB on device, ~50MB one-time download
- Keyed by: subject × grade_band × bloom_level × observation_type
- 5,000–20,000 templates covers virtually all K-16 scenarios
- No server call, no GPU, works with no signal in the field

**Location-activity cache (primary cost saver):**
- Cache key: hash(location_id OR lat/lng bucket, subject, grade_level, bloom_level)
- Table: `cached_locations` (already in DB schema) — extend to store generated activities
- First teacher generates "Louvre + geometry + grade 7" → stored permanently
- Every subsequent request → cache hit → $0, <100ms
- Pre-seed famous/common locations during deployment
- TTL: 6 months (activities stay relevant)
- Add cache hit/miss tracking to monitor effectiveness

**Batch overnight for assessment (not real-time):**
- Student submits work → batch processes at 1AM UTC
- 95% cheaper than on-demand ($0.01–0.05 vs $0.10–1.00)
- Teacher judgment is primary; AI is suggestion/support only

**LLM provider chain (already in inference.py):**
- Ollama local → school/home server, zero marginal cost
- Claude API → premium fallback, teacher/district pays
- Never invoke cloud LLM if cache has the answer

### Implementation priorities for AI features:
1. Build Socratic question SQLite DB schema + seed data (mobile)
2. Wire activity cache check BEFORE any Ollama/Claude call in inference.py
3. Add cache-write after any successful AI generation
4. Pre-seed top 50 educational locations (Louvre, Central Park, Yellowstone, etc.)
5. Batch assessment pipeline (overnight, not blocking)
