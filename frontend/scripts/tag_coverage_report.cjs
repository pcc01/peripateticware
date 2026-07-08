// frontend/scripts/tag_coverage_report.cjs
//
// Business Source License 1.1 — see LICENSE
//
// READ-ONLY dry run. Does not write anything. Reports how many additional
// hardcoded strings ast_tagger.cjs would need to cover if its scope were
// widened, and where they live, so the blast radius can be seen before any
// actual code change is made.
//
// Why this exists: ast_tagger.cjs's two passes only ever catch —
//   Pass 1 (JSX_TAG_RE):     text INSIDE <label>, <h1>-<h4>, <p> tags
//   Pass 2 (PROP_RE):        JS object-literal properties named title/label/
//                             text/desc/placeholder/etc. — i.e. `key: 'value'`
//                             syntax inside data arrays/config objects
//
// Neither pass ever touches:
//   - JSX text inside <button>, <option>, <span>, <div>, <td>/<th>, <a>, <li>
//   - JSX ATTRIBUTE values — placeholder="...", aria-label="...", title="...",
//     alt="..." — which use `=` syntax, not the `:` syntax Pass 2 looks for.
//     (This is why `<input placeholder="Email">` is invisible to the tagger
//     even though 'placeholder' is literally in Pass 2's TRANSLATABLE_PROPS
//     list — that list only matches object-literal properties, not JSX attrs.)
//
// This script finds exactly those two structurally-missed categories and
// reports counts, without changing any files.
//
// Run: node scripts/tag_coverage_report.cjs

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');
const OUT_DIR = path.resolve(__dirname, '../qa');

// Tags NOT already covered by ast_tagger.cjs's Pass 1 (label|h1-4|p).
const UNCOVERED_TAGS = ['button', 'option', 'span', 'div', 'td', 'th', 'a', 'li'];
const TAG_RE = new RegExp(`<(${UNCOVERED_TAGS.join('|')})([^>]*)>([^<>{|}]+)<\\/\\1>`, 'g');

// JSX attribute names Pass 2 never touches (it only matches `key: 'value'`
// object-literal syntax, never `key="value"` JSX attribute syntax).
const UNCOVERED_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const ATTR_RE = new RegExp(
  `\\b(${UNCOVERED_ATTRS.join('|')})=["']([^"'{}]+)["']`,
  'g'
);

function isTechnicalString(s) {
  if (s.length <= 2) return true;
  if (!/[a-zA-Z]/.test(s)) return true;               // no letters at all
  if (/^[#/]/.test(s)) return true;                    // CSS color or path
  if (/^https?:\/\//.test(s)) return true;             // URL
  if (/^var\(/.test(s)) return true;                   // CSS variable
  if (/^[A-Z_]{2,}$/.test(s)) return true;              // ALL_CAPS constant
  if (/^[0-9\s\-+:.()●•]+$/.test(s)) return true;       // numerics/bullets
  if (/\.(png|svg|jpg|jpeg|gif|webp|css|js|ts)$/i.test(s)) return true;
  if (/^\{.*\}$/.test(s)) return true;                  // pure JS expression
  return false;
}

function scanFile(fileContent) {
  const findings = { tags: [], attrs: [] };

  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(fileContent)) !== null) {
    const [, tag, , rawText] = m;
    const text = rawText.trim();
    if (!text || /\bt\(/.test(text) || isTechnicalString(text)) continue;
    findings.tags.push({ tag, text: text.replace(/\s+/g, ' ') });
  }

  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(fileContent)) !== null) {
    const [, attr, value] = m;
    const text = value.trim();
    if (!text || isTechnicalString(text)) continue;
    findings.attrs.push({ attr, text: text.replace(/\s+/g, ' ') });
  }

  return findings;
}

function walk(dirPath, results) {
  for (const item of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!['node_modules', 'public', 'dist', '.git'].includes(item)) {
        walk(fullPath, results);
      }
    } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const findings = scanFile(content);
      const total = findings.tags.length + findings.attrs.length;
      if (total > 0) {
        results.push({ file: path.relative(SRC_DIR, fullPath), total, findings });
      }
    }
  }
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`SRC_DIR not found: ${SRC_DIR}`);
    process.exit(1);
  }

  const results = [];
  walk(SRC_DIR, results);
  results.sort((a, b) => b.total - a.total);

  const grandTotal = results.reduce((sum, r) => sum + r.total, 0);
  const tagTotal = results.reduce((sum, r) => sum + r.findings.tags.length, 0);
  const attrTotal = results.reduce((sum, r) => sum + r.findings.attrs.length, 0);

  // Per-tag-type / per-attribute-type breakdown
  const byTagType = {};
  const byAttrType = {};
  for (const r of results) {
    for (const f of r.findings.tags) byTagType[f.tag] = (byTagType[f.tag] || 0) + 1;
    for (const f of r.findings.attrs) byAttrType[f.attr] = (byAttrType[f.attr] || 0) + 1;
  }

  console.log('='.repeat(70));
  console.log('TAG COVERAGE DRY RUN — no files modified');
  console.log('='.repeat(70));
  console.log(`\nTotal uncovered strings found: ${grandTotal}`);
  console.log(`  In tag bodies (${UNCOVERED_TAGS.join(', ')}): ${tagTotal}`);
  console.log(`  In attributes (${UNCOVERED_ATTRS.join(', ')}): ${attrTotal}`);
  console.log(`\nAcross ${results.length} file(s) out of the whole src/ tree.\n`);

  console.log('By tag type:');
  for (const [tag, count] of Object.entries(byTagType).sort((a, b) => b[1] - a[1])) {
    console.log(`  <${tag}>: ${count}`);
  }
  console.log('\nBy attribute type:');
  for (const [attr, count] of Object.entries(byAttrType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${attr}=: ${count}`);
  }

  console.log('\nTop 20 files by count:');
  for (const r of results.slice(0, 20)) {
    console.log(`  ${String(r.total).padStart(4)}  ${r.file}`);
  }
  if (results.length > 20) {
    console.log(`  ... and ${results.length - 20} more file(s)`);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `tag_coverage_report_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    grand_total: grandTotal,
    tag_total: tagTotal,
    attr_total: attrTotal,
    by_tag_type: byTagType,
    by_attr_type: byAttrType,
    files: results,
  }, null, 2), 'utf-8');
  console.log(`\nFull report written to ${outPath}`);
}

main();
