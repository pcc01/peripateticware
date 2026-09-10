// mobile/i18next-parser.config.cjs
//
// Extracts every t('key') / <Trans i18nKey="…"> reference from the mobile
// app source into a STAGING file (scripts/i18n_meta/_extracted.en.json).
//
// This is NOT the source of truth — mobile/src/i18n/locales/en.json is, and
// it stays hand-maintained. The staging file exists only so
// `scripts/localize.py check` can diff "keys referenced in source" against
// "keys defined in en.json" and fail CI when a t('…') call has no matching
// entry (or when en.json carries an orphan nothing references any more).
//
//   npx i18next-parser --config i18next-parser.config.cjs   (or: npm run i18n:extract)
//
// keepRemoved:true — never let the parser decide a key is dead; orphan
// pruning is a deliberate manual step (remove from en.json, then
// `localize.py translate --reset`).

const fs = require('fs');
const path = require('path');

// i18next-parser 9.x throws ENOENT on a glob whose base dir is missing, so
// only include source roots that actually exist (mirrors the web config).
const roots = ['app', 'src', 'components', 'hooks', 'constants'].filter((d) =>
  fs.existsSync(path.resolve(__dirname, d)),
);
const input = roots
  .map((d) => `${d}/**/*.{js,jsx,ts,tsx}`)
  .concat(['!**/*.test.{js,jsx,ts,tsx}', '!**/__tests__/**', '!**/node_modules/**']);

module.exports = {
  createOldCatalogs: false,
  indentation: 2,
  keepRemoved: true,
  sort: true,
  locales: ['en'],

  lexers: {
    ts: ['JavascriptLexer'],
    tsx: ['JsxLexer'],
    js: ['JavascriptLexer'],
    jsx: ['JsxLexer'],
    default: ['JavascriptLexer'],
  },

  // Flat single-namespace output — mirrors en.json's shape (no namespaces
  // on mobile; the whole file is one `translation` bundle, see
  // src/i18n/index.ts).
  namespaceSeparator: false,
  keySeparator: '.',
  defaultNamespace: 'translation',

  input,
  output: 'scripts/i18n_meta/_extracted.$LOCALE.json',
};
