# Adding a Privacy Jurisdiction

The privacy engine is **data-driven**: adding a country, region, or law normally
requires **no code change**. You add a rule (a JSON document) either as a file on
disk or via the admin API, and the engine picks it up.

## The one rule that matters: use ONE id everywhere

Every jurisdiction has a single canonical `jurisdiction_id`. Use the same string
in the config filename, the `jurisdiction_id` field, the `compliance_rules.jurisdiction`
column, and the org's `privacy_jurisdiction_ids`.

Recommended convention: `<framework>_<region>`, lowercase, e.g.
`pdpa_singapore`, `gdpr_eu`, `coppa_us`, `ccpa_california`.

> Historical aliases (`US`, `US-COPPA`, `US-CA`, `EU`, `US_FEDERAL`) are mapped to
> the canonical ids in `services/privacy_engine.py::JURISDICTION_ALIASES`. Do NOT
> add new aliases — pick one id and use it consistently. Aliases exist only so old
> data keeps resolving.

## Two ways to add a rule

### 1. JSON file (version-controlled, ships with the app)

Create `backend/config/jurisdictions/<jurisdiction_id>.json`. Minimum viable rule:

```json
{
  "jurisdiction_id": "pdpa_singapore",
  "jurisdiction_name": "Singapore - Personal Data Protection Act",
  "country_code": "SG",
  "framework": "pdpa",
  "version": "1.0",
  "max_retention_days": 365,
  "encryption_required": true
}
```

That's enough to be valid. Everything else is optional and grows the rule's power.

### 2. Admin API (runtime, no redeploy)

`POST /api/v1/privacy/rules` (admin only) with a `rule_definition` body. The
request is validated against the canonical schema and returns **HTTP 422 with
field-level errors** if anything is malformed, so you get immediate feedback. On
success the Redis cache is invalidated and the rule is live immediately. A brand-new
country also triggers a background crawl to seed authoritative source metadata.

## The canonical schema

All three consumers — the file loader, the DB deserialiser, and `POST /rules` —
validate against `backend/schemas/privacy_rule.py` (`PrivacyRule`). Key sections:

- **Identity** (required): `jurisdiction_id`, `jurisdiction_name`, `country_code`.
  `framework` defaults to `custom`; unknown frameworks are normalised to `custom`
  rather than rejected, so a new law works before the enum is updated.
- **Flat scalars** drive the strictest-wins merge: `max_retention_days`,
  `encryption_required`, `student_data_sharing_allowed`, `student_monitoring_allowed`,
  `student_profiling_allowed`, `student_targeting_allowed`,
  `requires_privacy_impact_assessment`, `requires_data_protection_officer`.
- **Rich sections** drive per-activity compliance checks:
  `student_age_categories`, `consent_requirements`, `prohibited_data_collection`,
  `special_restrictions`, `data_retention`, `compliance_checks`. See
  `coppa_us.json` / `gdpr_eu.json` for complete worked examples.

`extra="allow"` means unknown keys are preserved (not rejected), so you can add a
new section to a file before the engine reads it.

## How rules are applied

1. **`identify_jurisdiction(student_id, ...)`** reads the student's org's
   `privacy_jurisdiction_ids` (seeded at signup from country / subdivision /
   under-13 answers by `services/privacy_seeder.py`), plus `coppa_us` if the
   student is under 13.
2. **`merge_jurisdictions([...])`** combines them strictest-wins: shortest
   retention, encryption if ANY requires it, a permission is allowed only if ALL
   allow it.
3. **`enforce_on_submission(...)`** applies the merged rule at write time. Behaviour
   depends on `ENFORCEMENT_MODE` (env):
   - `log` (default) — evaluate + record, always allow.
   - `warn` — return `WARNING` with reasons, still allow.
   - `block` — return `BLOCKED`; the submission route refuses the write (403).

Roll out as: `log` → check the audit dashboard → `warn` → `block`.

## Making a new country apply automatically at signup

Add the country → jurisdiction-id mapping in
`services/privacy_seeder.py::JURISDICTION_MAP` (this is the one small code touch
for a genuinely new country, and it's a single dict entry). After that, every org
that signs up from that country gets the jurisdiction seeded automatically.

## Checklist

1. Pick the canonical `jurisdiction_id` (`framework_region`).
2. Add `backend/config/jurisdictions/<id>.json` (or `POST /privacy/rules`).
3. If it's a new country, add one line to `JURISDICTION_MAP` in `privacy_seeder.py`.
4. Confirm it loads: `GET /api/v1/privacy/jurisdictions`.
5. Leave `ENFORCEMENT_MODE=log` until dashboards look right, then escalate.
