// frontend/i18next-parser.config.cjs
//
// Extracts t() keys from source into public/locales/en.json (landing namespace).
// Run directly: npm run i18n:extract
// NOT in the i18n:run-all chain (ast_tagger handles en.json directly).
//
// IMPORTANT: keepRemoved: true — source (English) keys are never auto-deleted.
// To remove a key from the English source, do it manually and then run a
// translate_sync --reset to prune stale keys from non-English locales.

const fs = require('fs');
const path = require('path');

const targetInputs = ['src/**/*.{js,jsx,ts,tsx}'];

const mobileAppPath = path.resolve(__dirname, '../mobile/app');
const mobileComponentsPath = path.resolve(__dirname, '../mobile/components');

if (fs.existsSync(mobileAppPath)) {
  targetInputs.push('../mobile/app/**/*.{js,jsx,ts,tsx}');
}
if (fs.existsSync(mobileComponentsPath)) {
  targetInputs.push('../mobile/components/**/*.{js,jsx,ts,tsx}');
}

module.exports = {
  createOldCatalogs: false,
  indentation: 2,
  lexers: {
    ts:      ['JsxLexer'],
    tsx:     ['JsxLexer'],
    js:      ['JavascriptLexer'],
    jsx:     ['JavascriptLexer'],
    default: ['JavascriptLexer'],
  },
  locales: ['en'],

  // Output into the merged flat file under the 'landing' namespace key.
  // i18next-parser writes the full file; we use a custom transform to wrap
  // extracted keys under the landing namespace before save.
  // For now, output to a staging file — ast_tagger merges into en.json directly.
  output: 'public/locales/en/landing.json',

  input: targetInputs,
  sort: true,

  // NEVER auto-delete source keys. Removing an English key removes it from
  // every locale build. Delete keys manually and run translate_sync --reset.
  keepRemoved: true,
}
