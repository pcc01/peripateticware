# WCAG 2.1 AA Audit Report

> **Round 2 addendum — 2026-07-02.** See the "Round 2" section at the bottom for
> what changed since the original audit (color-contrast fix, a broken-media
> regression fix, new-page label fixes, and the axe CI spec that was previously
> only recommended). The original 2026-06-27 report follows unchanged.

**Date:** 2026-06-27  
**Auditor:** Static analysis (automated grep + manual review)  
**Scope:** Peripateticware SPA — all `.tsx` files under `frontend/src/`  
**Standard:** WCAG 2.1 Level AA  
**App type:** EdTech — teacher, student, parent, and homeschool personas  

---

## Executive Summary

The codebase had **20 aria-\* attributes** across ~300 TSX files before this audit. The README claimed AAA compliance. Actual target is AA. This audit found and fixed all statically detectable violations across 6 WCAG criteria. After fixes, aria-\* attribute count rose to **106** — a 5× increase.

No images with missing `alt` text were found. The `<html lang="en">` attribute was already present in `index.html`.

---

## Summary Table

| WCAG Criterion | Violations Found | Fixed | Manual Check Needed |
|---|---|---|---|
| 1.1.1 Non-text content (alt text) | 0 | 0 | Logo/avatar images if added later |
| 1.3.1 Info and relationships (form labels) | 28 | 28 | — |
| 2.1.1 Keyboard (clickable non-interactive elements) | 4 | 4 | Complex drag-drop interactions |
| 2.4.1 Bypass blocks (skip nav) | 1 | 1 | — |
| 2.4.7 Focus visible | 1 | 1 | Color contrast of focus ring |
| 3.3.1 Error identification | 12 | 12 | — |
| 3.3.2 Labels or instructions | 0 | 0 | — |
| 4.1.2 Name, role, value (buttons/dialogs) | 14 | 14 | Icon-only buttons added later |
| **Total** | **60** | **60** | — |

---

## Fixed Issues

### 1.3.1 / 4.1.2 — Unlabeled Form Inputs

**Files changed:**
- `src/components/auth/LoginScreen.tsx` — email and password inputs got `id`, `htmlFor` on labels, `aria-describedby` pointing to error paragraphs, `aria-invalid` on validation failure
- `src/components/auth/SignUpScreen.tsx` — all 5 fields (first name, last name, email, password, confirm password) got matching `id`/`htmlFor`/`aria-describedby`/`aria-invalid`; role selector buttons got `aria-pressed`; back arrow link got `aria-label="Back to login"` and icon got `aria-hidden="true"`
- `src/components/shared/ExtractionWizard.tsx` — set name, criterion name/category/weight/required inputs all got `aria-label`; hidden file input got `aria-label`
- `src/components/teacher/ActivityManager.tsx` — latitude/longitude inputs got `aria-label`
- `src/components/teacher/OllamaLessonSuggestions.tsx` — subject, grade, duration, group size, focus inputs got `aria-label`
- `src/components/teacher/RubricBuilder.tsx` — score, label, description inputs per criterion level got contextual `aria-label` with criterion/level index
- `src/components/student/SelfProjectView.tsx` — title, objective, and prompt inputs got `aria-label`
- `src/pages/admin/AdminClassesPage.tsx` — search input got `aria-label`
- `src/pages/admin/AdminUsersPage.tsx` — search, email, full name, password inputs got `aria-label`
- `src/pages/admin/AdminSystemPage.tsx` — config key, value, description inputs got `aria-label`
- `src/pages/admin/AdminAIConfigPage.tsx` — Ollama URL and API key inputs got `aria-label`
- `src/pages/admin/AdminStandardsPage.tsx` — "show expired" checkbox got `aria-label`
- `src/pages/AdminAuditLogPage.tsx` — date filter from/to inputs got `aria-label`
- `src/pages/auth/ResetPasswordPage.tsx` — inputs got `id` attributes to match existing `<label>` elements via `htmlFor`; error list got `role="alert"`
- `src/pages/homeschool/HomeschoolChildrenPage.tsx` — child form inputs (full name, email, password, grade) got `aria-label`

### 3.3.1 — Error Messages Not Programmatically Associated

All inline error `<p>` elements in login and signup flows were given:
- A stable `id` (e.g. `login-email-error`)
- `role="alert"` so screen readers announce immediately on appearance
- The corresponding input received `aria-describedby` pointing to that id

**Files changed:** `LoginScreen.tsx`, `SignUpScreen.tsx`, `ResetPasswordPage.tsx`, `HomeschoolChildrenPage.tsx`

### 4.1.2 — Icon-Only Buttons Without Accessible Names

- `LoginScreen.tsx` — show/hide password toggle button: added `aria-label={showPassword ? "Hide password" : "Show password"}` and `aria-hidden="true"` on Eye/EyeOff icons
- `LoginScreen.tsx` — demo account buttons: added `aria-label={"Fill demo credentials for " + label}`
- `LoginModal.tsx` — close button (× character): added `aria-label="Close dialog"`
- `DashboardShell.tsx` — sidebar collapse button: replaced `title` with `aria-label` + `aria-expanded`; logout buttons: replaced `title` with `aria-label`; LogOut icon: `aria-hidden="true"`

### 4.1.2 — Dialog/Modal Role Missing

- `LoginModal.tsx` — inner modal content div: added `role="dialog" aria-modal="true" aria-label="Authentication"`; overlay div: added `role="presentation"`; tab buttons: added `role="tab"` and `aria-selected`; status message: added `role="alert"` (error) or `role="status"` (success)
- `AdminUsersPage.tsx` — user detail overlay div: added `role="dialog" aria-modal="true"`
- `ParentMessagesPage.tsx` — compose/reply overlay div: added `role="dialog" aria-modal="true"`

### 2.1.1 — Keyboard Access (Clickable Non-Interactive Elements)

- `HomeschoolDashboard.tsx` — `StatCard` component: added `role="button"`, `tabIndex={0}`, `aria-label`, and `onKeyDown` (Enter/Space → navigate); emoji icons: `aria-hidden="true"`
- `HomeschoolChildrenPage.tsx` — child row div: added `role="button"`, `tabIndex={0}`, `aria-label`, and `onKeyDown`
- `PrivacyConfirmationPage.tsx` — `<span onClick>` "Admin → Privacy" link: replaced with a semantically correct `<button type="button">`

### 2.4.1 — Skip Navigation Link

Added skip-nav link to `DashboardShell.tsx` (shared by all role layouts):

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only ..."
>
  Skip to main content
</a>
```

`<main>` element given `id="main-content"`.

### 2.4.7 — Focus Visible + 2.4.1 — Screen Reader Utility

Added to `design-system.css` (lines 1009–1060):

```css
:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}

/* Preserves mouse UX — only suppress outline for pointer interaction */
input:focus:not(:focus-visible),
textarea:focus:not(:focus-visible),
select:focus:not(:focus-visible) {
  outline: none;
}

.sr-only { ... }            /* screen-reader-only utility */
.sr-only:focus-visible { ... }  /* reveal for keyboard (skip-nav) */
```

### 1.3.1 — Navigation Landmark

- `DashboardShell.tsx` — `<nav>` element: added `aria-label="Main navigation"`

### 2.4.5 — Map Interactive Control

- `Map.tsx` — draw zone toggle button: added `aria-pressed={isDrawingZone}`; zone shape `<select>`: added `aria-label="Zone shape"`

---

## What Was Already Correct

- `<html lang="en">` — present in `index.html` ✓
- `Modal.tsx` (design-system modal) — already had `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-label="Close modal"` on close button ✓
- `LoginModal.tsx` form inputs — already had `id` + `<label htmlFor>` associations ✓
- `rememberMe` checkbox in `LoginScreen.tsx` — already had `id="rememberMe"` + `<label htmlFor="rememberMe">` ✓
- `age_confirmed` checkbox in `SignUpScreen.tsx` — already had `id="age_confirmed"` + `<label htmlFor="age_confirmed">` ✓
- `Input.tsx` and `Select.tsx` design-system components — already had `label`→`htmlFor`→`id` wiring; enhanced with `aria-required`, `aria-invalid`, `aria-describedby` pointing to error/hint spans

---

## Remaining Manual Checks Required

These cannot be detected via static analysis and require browser-based or manual testing:

### Color Contrast (WCAG 1.4.3)
Requires visual inspection with a contrast checker (e.g. [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) or Deque axe DevTools):
- Gray muted text (`var(--text-muted)`) against white/light surface backgrounds — verify ≥ 4.5:1 for body text, ≥ 3:1 for large text
- Green brand color (`#4a7c59`) on white — used in buttons and active nav items
- Demo account role badges (small colored text on white cards)

### Screen Reader Testing (WCAG 4.1.3)
Test with NVDA (Windows) or VoiceOver (macOS/iOS):
- Login/signup flow — verify field error announcements fire on submit
- Session recording flow (student `SessionPage`) — complex multi-step interaction
- Dashboard stat cards — verify `role="button"` + `aria-label` is announced correctly

### Focus Order (WCAG 2.4.3)
Verify tab order is logical (left-to-right, top-to-bottom) on:
- Login form (currently no explicit `tabIndex` — relies on DOM order)
- SignUp form (role selector buttons)
- Dashboard sidebar → main content transition (skip-nav verifies this works)

### Video / Audio (WCAG 1.2.x)
No video or audio content is currently in the SPA. When added (e.g. tutorial videos), captions (1.2.2) and audio descriptions (1.2.5) will be required.

### Mobile Accessibility
Touch target sizes should be ≥ 44×44 CSS pixels (WCAG 2.5.5 — AAA, but good practice). The collapsed sidebar icon buttons (`w-14` → 56px wide but narrow height) should be verified on mobile.

### Dynamic Content / Live Regions
The `UpgradeModal` (fired via `CustomEvent`) and `CookieConsentBanner` appear dynamically — verify they are announced by screen readers. Consider adding `role="alertdialog"` to upgrade modal.

---

## CI Integration — axe-core

Add automated accessibility checks to the test pipeline:

### Install
```bash
npm install --save-dev @axe-core/playwright axe-core
```

### Playwright test example
```ts
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES_TO_CHECK = [
  { url: '/', name: 'Landing' },
  { url: '/login', name: 'Login' },
  { url: '/signup', name: 'Signup' },
];

for (const { url, name } of PAGES_TO_CHECK) {
  test(`${name} — WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
```

### GitHub Actions step
```yaml
- name: Accessibility audit (axe)
  run: npx playwright test e2e/accessibility.spec.ts
```

---

## Files Changed

| File | Change type |
|------|-------------|
| `src/components/auth/LoginScreen.tsx` | aria-invalid, aria-describedby, aria-label (buttons), htmlFor |
| `src/components/auth/SignUpScreen.tsx` | aria-invalid, aria-describedby, aria-label, aria-pressed, htmlFor |
| `src/components/landing/LoginModal.tsx` | role="dialog", role="tab", aria-selected, aria-label (close), role="alert/status" |
| `src/components/common/Input.tsx` | aria-required, aria-invalid, aria-describedby, role="alert" on error |
| `src/components/common/Select.tsx` | aria-required, aria-invalid, aria-describedby, role="alert" on error |
| `src/components/common/Map.tsx` | aria-pressed, aria-label |
| `src/components/shared/ExtractionWizard.tsx` | aria-label on all inputs |
| `src/components/teacher/ActivityManager.tsx` | aria-label on lat/lng inputs |
| `src/components/teacher/OllamaLessonSuggestions.tsx` | aria-label on all inputs |
| `src/components/teacher/RubricBuilder.tsx` | aria-label on score/label/description inputs |
| `src/components/student/SelfProjectView.tsx` | aria-label on title/objective/prompt inputs |
| `src/layouts/DashboardShell.tsx` | Skip nav link, id="main-content", aria-label (nav/buttons), aria-expanded |
| `src/pages/admin/AdminAIConfigPage.tsx` | aria-label on inputs |
| `src/pages/admin/AdminClassesPage.tsx` | aria-label on search |
| `src/pages/admin/AdminStandardsPage.tsx` | aria-label on checkbox |
| `src/pages/admin/AdminSystemPage.tsx` | aria-label on config inputs |
| `src/pages/admin/AdminUsersPage.tsx` | role="dialog", aria-label on form/search inputs |
| `src/pages/AdminAuditLogPage.tsx` | aria-label on date inputs |
| `src/pages/auth/ResetPasswordPage.tsx` | htmlFor/id binding, role="alert" on error list |
| `src/pages/homeschool/HomeschoolChildrenPage.tsx` | role="button", tabIndex, aria-label, onKeyDown, aria-label on form inputs |
| `src/pages/homeschool/HomeschoolDashboard.tsx` | role="button", tabIndex, aria-label, onKeyDown, aria-hidden on decorative emoji |
| `src/pages/ParentMessagesPage.tsx` | role="dialog", aria-modal |
| `src/pages/PrivacyConfirmationPage.tsx` | Replaced `<span onClick>` with `<button>` |
| `src/design-system.css` | :focus-visible rule, .sr-only utility class |

---

## Round 2 — 2026-07-02

### Fixed

**1.4.3 Contrast (AA) — the one real contrast failure.** `--text-muted` was
`#7a6f5e`, which is 4.34:1 on `--surface-alt` (#f5f0e6) — below the 4.5:1 needed
for normal text. Contrast ratios were computed for every muted/brand/error/focus
pair; all others pass. Changed `--text-muted` to **`#6b6150`**, which is ≥4.5:1 on
white, `--bg`, `--surface-alt`, and `--surface-deep` (worst case 4.86:1).
*(src/design-system.css)*

**Regression fix (also a11y).** The signed-media-token security change made the
capture stream endpoint reject the old `?token=<JWT>` URLs. Two components still
used that pattern and would have shown broken media:
- `FieldNoteEditor.tsx` — photo/video thumbnails. Replaced with a `CaptureThumb`
  component that fetches a short-lived signed URL and carries descriptive `alt` /
  `aria-label` (previously `alt="capture"`).
- `capture/AudioRecorder.tsx` — saved-recording playback. Its `AudioPlayer` now
  accepts a `captureId` and resolves a signed URL.
- New shared hook `hooks/useSignedCaptureUrl.ts`.

**1.3.1 / 3.3.1 — new page inputs.** `DoNotSellPage.tsx` (CCPA) email field got
`id`+`htmlFor`, `aria-describedby`/`aria-invalid`, and the error `<p>` got
`id`+`role="alert"`.

### Added
- **axe CI spec** — `tests/e2e/accessibility.spec.ts` runs axe-core against the
  public pages (landing, login, signup, privacy, terms, do-not-sell, privacy-engine)
  with the wcag2a/2aa/21a/21aa tag set. Requires
  `npm install --save-dev @axe-core/playwright axe-core`, then
  `npx playwright test tests/e2e/accessibility.spec.ts`. This closes the
  "CI integration" item the original audit only recommended.

### Still needs a human / browser (unchanged from original)
- Screen-reader pass (NVDA/VoiceOver) on the student session + recording flows.
- Focus-order verification on login/signup.
- `--text-faint` (#a89d8a) is ~2.4:1 on white — acceptable only because it's used
  for non-essential/decorative text; do NOT use it for body copy or controls.
- Touch-target sizes (2.5.5) on the collapsed mobile sidebar.
- Run the axe spec in CI and triage anything it surfaces on the authenticated
  dashboards (not covered by the public-page spec).

### Standards note
WCAG 2.1 AA is the operative bar for both **Section 508** (US school procurement)
and the **European Accessibility Act** (EU consumer SaaS, in force since June 2025),
so this audit + the axe gate cover both — pending the manual screen-reader pass.
