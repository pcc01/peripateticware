# Localization Content Audit — 2026-07-07

Scope: `frontend/public/locales/en.json` and `frontend/scripts/translate_sync.py`.

## Still open — needs real content

None. `landing.team_1_bio` (Paul's real bio, `/` Meet the Team section) is now filled in with the text you sent and is NOT locked — it will translate normally on the next pipeline run.

## Fixed with real English copy

All of these previously held an auto-generated placeholder (the literal key name with underscores turned to spaces, e.g. `"brand_desc"` → `"brand desc"`) because the component called `t('key')` with no default text and nobody had written real copy — `ast_tagger.cjs` invents that placeholder as a matter of course, and it silently became the permanent "English" source.

- `landing.footer.*` (18 keys) — column headings, links, brand description, copyright line. URL: `/` (Footer, all tabs).
- `landing.privacy.*` (19 keys) — Privacy Engine feature cards, CTA section. URL: `/privacy`.
- `landing.pendingReflectionQueue.*` (6 keys) — student reflection status labels. URL: `/student` (dashboard widget).

## Resolved as lorem ipsum / locked (not real people)

Per your note that only `team_1` (Paul) is real — `team_2`–`team_4` (Sofia/James/Amara) were mockup names used to build the page layout:

- `landing.team_2_name` / `_role` / `_initial` / `_bio`
- `landing.team_3_name` / `_role` / `_initial` / `_bio`
- `landing.team_4_name` / `_role` / `_initial` / `_bio`
- `landing.testimonial_1..5_text` / `_author`

All now hold lorem ipsum text and are locked in `translate_sync.py`'s do-not-translate list, so they render identically (untranslated) in every locale instead of being machine-translated into fabricated-sounding names/quotes.

## Low-priority / orphaned — no action taken

- `landing.500`, `landing.or`, `landing.ing` — top-level stray keys, not referenced by any current component (dead leftovers from earlier code). Harmless; safe to delete in a future cleanup.
- `landing.landing.role_student/teacher/parent` — double-nested under `landing.landing`, also unreferenced in current source.
- `landing.teacheractivitylistpage.students` / `.submissions` — read fine as-is (e.g. "12 students"); not a real gap.

## Pipeline fixes (frontend/scripts/translate_sync.py)

1. **Output sanitization** — strips ANSI escape codes/control characters, rejects non-string JSON values instead of `str()`-coercing them (was producing literal `"False"` text), rejects hallucinated placeholder-token spam and stringified-list wrappers, and rejects output in the wrong script for non-Latin target locales (ja/zh/ko/ar/he). Bad output triggers one retry, then falls back to the English source rather than saving garbage.
2. **Do-not-translate enforcement** — now reads intent from `frontend/src/constants/i18n-do-not-translate.md` in code: product name, legal acronyms (FERPA/GDPR/CCPA/PIPEDA/LGPD), testimonial/team-name fields, and `/terms` (Terms & Conditions, per your instruction to keep it English-only for now) are copied verbatim into every locale instead of sent to the LLM.
3. **Email handling** — pure placeholder-email values (e.g. `you@example.com`) are locked whole; emails embedded in a larger translatable sentence (e.g. `"Teacher: teacher@example.com"`) still get their surrounding text translated, but the exact email address is now verified to survive translation unchanged — this was broken in every non-English locale (`tú@example.com`, `あなた@example.com`, `you@example.com.tr` with a mangled TLD, etc).
4. **Stale-translation detection fixed** — previously compared a translation's current value to *today's* English source to decide if retranslation was needed, which is backwards (falsely flagged coincidental English/target matches — brand names, cognates — forever, while never reliably catching real English-text edits). Now compares against the source text recorded in each locale's `.xlf` file from the last time that key was actually translated.

## Italian `/privacy` screenshot — confirmed, and one separate bug found

The screenshot showed exactly the garbage placeholder text this audit already fixed: "descrizione riepilogo", "cta riepilogo", "titolo motore del core", "titolo prima schermata sul dispositivo", "titolo del framework di consenso" are all literal translations of the auto-generated key-name placeholders (`summary_desc`, `summary_cta`, `engine_core_title`, `on_device_first_title`, `consent_framework_title`) — now fixed in `en.json` and will render as real Italian copy after the next Clean Reset run.

The large green diamond icon with the huge empty space around it is **not a translation bug** — it's `PrivacyPage.tsx`'s static SVG icon (same markup in every locale) sitting in a two-column CSS grid (`.summary-grid`) that collapses to a single stacked column on narrow/mobile viewports. The screenshot's dimensions (1067×2600, very tall and narrow) indicate a mobile-width viewport — this icon-and-whitespace gap would show up identically in English, Spanish, every locale, at that same width. It's a CSS/layout issue in the component, separate from anything in the localization pipeline — let me know if you'd like me to fix that one too.

## Required next step (can't be done from here)

None of the sanitization/lock rules above retroactively fix translations already sitting in `es.json`, `ja.json`, `it.json`, etc. — a normal incremental run only re-translates keys whose English source changed. To flush out the existing corruption (ANSI codes, wrong-script text, mistranslated emails, un-locked testimonials/team fields), run `translate_sync.py` with **Clean Reset** for the affected locales (option `[2]` in the wizard, or `--reset` on the command line) so every key gets regenerated under the new validation rules. This needs to run against your local Ollama — I don't have access to it from here.
