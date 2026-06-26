# i18n Do-Not-Translate Reference

This document lists every category of content in the Peripateticware codebase that must
**never be translated** by a localization pipeline, AI translator, or human translator.

---

## 1. Product Name

**"Peripateticware"** is a registered product name / proper noun.
It must appear identically in every language, in every locale file.

### Source of truth
```ts
// frontend/src/constants/brand.ts
export const PRODUCT_NAME = 'Peripateticware';
```

### Rule for source code
Never pass the product name through `t()` as a standalone render:

```tsx
// WRONG — translator will corrupt it
{t('landing:peripateticware', 'Peripateticware')}

// CORRECT
import { PRODUCT_NAME } from '../constants/brand';
{PRODUCT_NAME}
```

When the name appears inside a translatable sentence (e.g. "Welcome to Peripateticware"),
keep the `t()` wrapper for the sentence, but ensure translators know the name is fixed
(see Translator Instructions below).

### Rule for locale JSON files
The key `"peripateticware"` in any locale file must always have the value `"Peripateticware"`.
The keys `footer.brand_title` and `footer.company_name` must also always be `"Peripateticware"`.

These are enforced at the JSON level — the value is the same string in en, ar, de, es, fr,
he, it, ja, pt-BR, tr, and zh.

**Previously broken (now fixed):** German had "Peripatetische Ware", Spanish had
"Artículos peripatéticos", French had "Peripatétiqueware", Arabic had "بيريباتيكووار",
Japanese had "ペリパティックウェア", Chinese had "流动软件", Italian had "PeripateticoWare",
Hebrew had "פריפטיקוואר", Turkish had "Peripatetikware".

---

## 2. Legal / Regulatory Acronyms

These acronyms are proper nouns defined by law and must appear in English in all locales.
Translating or expanding them (e.g. GDPR → "RGPD" in French) is incorrect for display
in compliance badges, card titles, and legal notices.

| Acronym | Full name (for translator context only — do not render) |
|---------|--------------------------------------------------------|
| FERPA   | Family Educational Rights and Privacy Act (US) |
| COPPA   | Children's Online Privacy Protection Act (US) |
| GDPR    | General Data Protection Regulation (EU) |
| CCPA    | California Consumer Privacy Act (US) |
| PIPEDA  | Personal Information Protection and Electronic Documents Act (Canada) |
| LGPD    | Lei Geral de Proteção de Dados (Brazil) |
| PDPA    | Personal Data Protection Act (varies by jurisdiction) |
| SOC 2   | Service Organization Control 2 (AICPA audit framework) |
| APP     | Australian Privacy Principles |

**Locale keys where these must remain English:**
- `privacy_engine.ferpa_card_title` → always `"FERPA"`
- `privacy_engine.coppa_card_title` → always `"COPPA"`
- `privacy_engine.gdpr_card_title` → always `"GDPR"`
- `privacy_engine.ccpa_card_title` → always `"CCPA"`
- `coppa_gdpr_ccpa_compliant` → acronyms within the string must remain as-is
- `privacy_engine.tagline` → acronyms must not be localized
- `privacy_engine.summary_desc` → all acronyms fixed

Note: French locale currently renders `coppa_gdpr_ccpa_compliant` as
"COPPA, GDPR, CCPA conforme" (acronyms preserved — correct) but also expands
`ferpa` to "FERPA (Family Educational Rights and Privacy Act)" and `coppa` to
"COPPA (Protection des enfants en ligne)" in some keys — those expansions are
acceptable in descriptive text but not in badge labels or card titles.

---

## 3. Email Addresses and Domains

These must never be translated, paraphrased, or altered:

- `hello@peripateticware.com` — primary contact / support address
- `peripateticware.com` — product domain
- Demo/placeholder emails used in UI: `admin@example.com`, `teacher@example.com`,
  `student@example.com`, `parent@example.com`, `you@example.com`

Example locale keys that contain these and must not modify them:
- `footer.company_contact` — renders a mailto link to `hello@peripateticware.com`
- `login.demo_teacher`, `login.demo_student`, etc. — demo credentials

---

## 4. External Brand Names

These third-party proper nouns must appear in their canonical English form in all locales:

- **Google** (as in "Sign in with Google", if applicable)
- **Apple** (as in "Sign in with Apple", if applicable)
- **McGraw-Hill Education** (appears in origin story text)
- **Apache 2.0 / Business Source License 1.1** — license names, not translated
- **Peri** — the AI guide's name (short for Peripatetic); treat as a proper noun

---

## 5. Technical Terms That Are Proper Nouns in Context

These are acronyms or technical identifiers that must not be translated:

- **API** — do not render as "interfaz de programación de aplicaciones" etc.
- **GPS** — do not translate
- **UUID** — do not translate
- **JSON** — do not translate
- **HTTP / HTTPS** — do not translate
- **LMS** — Learning Management System, used as an acronym in origin story
- **EdTech** — used as a proper noun in origin story text
- **SOC 2** — (see Legal Acronyms above)
- **Apache 2.0** — license identifier, not translated
- **BSL 1.1** — Business Source License identifier

---

## 6. Translator Instructions (i18next / Lokalise / any pipeline)

### For human translators
When translating any string that contains "Peripateticware", preserve that word exactly.
Do not translate, transliterate, or phonetically adapt it.

Example:
- Source (en): `"Peripateticware is built for homeschool families."`
- Target (de): `"Peripateticware ist für Homeschool-Familien konzipiert."`
- WRONG (de):  `"Peripatetische Ware ist für Homeschool-Familien konzipiert."`

### For AI translation pipelines
Add "Peripateticware" to the glossary / term base as a DO NOT TRANSLATE term.
In Lokalise: mark as "Term" with "Do not translate" flag.
In DeepL Glossary: map "Peripateticware" → "Peripateticware" for every language pair.
In ChatGPT/Claude prompts: prepend "Do not translate the product name Peripateticware."

### For i18next-scanner
If using i18next-scanner or similar extraction tools, the `"peripateticware"` key
in locale files should be treated as a locked string. Consider adding a custom
validator that asserts `locales[lang].landing.peripateticware === 'Peripateticware'`
for all non-English locales.

---

## 7. Keys Where English Value Must Be Identical Across All Locales

These specific JSON keys must have the same English value in every locale file:

| Key path | Required value |
|----------|---------------|
| `landing.peripateticware` | `"Peripateticware"` |
| `landing.layouts_dashboardshell.peripateticware` | `"Peripateticware"` |
| `landing.homeschool.layouts_dashboardshell.peripateticware` | `"Peripateticware"` |
| `footer.brand_title` | `"Peripateticware"` |
| `footer.company_name` | `"Peripateticware"` |
| `privacy_engine.ferpa_card_title` | `"FERPA"` |
| `privacy_engine.coppa_card_title` | `"COPPA"` |
| `privacy_engine.gdpr_card_title` | `"GDPR"` |
| `privacy_engine.ccpa_card_title` | `"CCPA"` |

---

*Last updated: 2026-06-26. Maintained alongside `brand.ts`.*
