// frontend/i18next-parser.config.cjs
const fs = require('fs');
const path = require('path');

// Base workspace targets
const targetInputs = ['src/**/*.{js,jsx,ts,tsx}'];

// Optional mobile sibling folders
const mobileAppPath = path.resolve(__dirname, '../mobile/app');
const mobileComponentsPath = path.resolve(__dirname, '../mobile/components');

// Only inject the mobile search patterns if the directories actually exist
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
    ts: ['JsxLexer'],
    tsx: ['JsxLexer'],
    js: ['JavascriptLexer'],
    jsx: ['JavascriptLexer'],
    default: ['JavascriptLexer']
  },
  locales: ['en'],
  output: 'public/locales/$LOCALE/landing.json',

  // Uses the dynamically verified target path array
  input: targetInputs,

  sort: true,
  keepRemoved: false
}