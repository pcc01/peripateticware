# mobile/i18n/xliff — localization provenance (NOT shipped)

One `{code}.xlf` per non-English locale. Each is XLIFF 1.2 with a W3C-PROV
JSON-LD graph in the header recording, per key: the translation activity and
its translator agent (model, provider, parameters), any `QualityAssessment`
from the review model, redrive revisions (`wasRevisionOf`,
`overwroteTranslationBy`), and the human operator.

**These files are the source of truth.** `mobile/src/i18n/locales/en.json`
is the English source; every target string lives here.

**These files never reach a device.** They are not imported by any app code,
so Metro never bundles them. The app downloads *only*
`backend/locale_packs/{code}.json` at runtime — a flat strings-only
projection of the `<target>` values in these files, produced by:

```
python scripts/localize.py publish      # or: npm run i18n:publish
```

Full pipeline: `npm run i18n:run-all` (check → translate → review → redrive →
publish). See `scripts/localize.py --help`.

Do not hand-edit the `<meta>` provenance block. Editing a `<target>` by hand
is fine for a quick correction — run `publish` afterward and, ideally,
`translate` so the change gets a provenance entry.
