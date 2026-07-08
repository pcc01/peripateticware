// frontend/scripts/ast_tagger.cjs
//
// Business Source License 1.1 — see LICENSE
//
// What this script does:
//   1. Scans src/ for .tsx/.ts/.jsx/.js files
//   2. Replaces hardcoded JSX text in <h1-h4>, <p>, <label>, <button>, <option>,
//      <span>, <div>, <td>, <th>, <a>, <li> with t("key", "fallback") — only
//      when the tag's entire content is a single plain-text run (no nested
//      tags or {expressions}), so layout containers with children are untouched
//   2b. Replaces hardcoded JSX ATTRIBUTE values — placeholder="...",
//      aria-label="...", title="...", alt="..." — with the same t() pattern.
//      Distinct from #2/#5's object-property pass: attributes use `attr="x"`
//      syntax, never the `key: 'x'` syntax the property pass matches, so this
//      is its own regex/pass (see replaceAttrStrings).
//   3. Ensures `import { useTranslation } from 'react-i18next'` is present in every
//      modified file
//   4. Ensures `const { t } = useTranslation('landing')` is injected into component
//      bodies that call t() — ONLY if no useTranslation hook already exists
//      (prevents clobbering files that use a different namespace like 'auth')
//   5. Merges discovered keys into the 'landing' namespace of public/locales/en.json
//
// Risk 2 (scope collision): scope is derived from the full relative path,
//   e.g. src/components/auth/LoginScreen.tsx → "components_auth_loginscreen"
//   This prevents two different index.tsx files from sharing keys.
//
// Risk 3 (expression-body misfires): EXPR_RE now requires the JSX to start
//   with < and end before a semicolon, and the function name must be PascalCase
//   with a minimum 2-char name. No generics in the return type position.
//
// Run: node scripts/ast_tagger.cjs

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC_DIR       = path.resolve(__dirname, '../src');
const LOCALES_EN    = path.resolve(__dirname, '../public/locales/en.json');
const LANDING_NS    = 'landing';

// ─── Locale catalog helpers ───────────────────────────────────────────────────

function assignNestedKey(targetObj, keyPath, fallbackValue) {
  const pieces = keyPath.split('.');
  let current = targetObj;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (i === pieces.length - 1) {
      if (!current[piece] || current[piece] === fallbackValue) {
        current[piece] = fallbackValue;
      }
    } else {
      if (!current[piece] || typeof current[piece] !== 'object') {
        current[piece] = {};
      }
      current = current[piece];
    }
  }
}

// ─── Key harvesting ───────────────────────────────────────────────────────────

function harvestExistingTCalls(fileContent, masterCatalog) {
  const explicitRe = /\bt\(\s*['"](?:landing:)?([a-zA-Z0-9_\-.]+)['"]\s*,\s*['"](.*?)['"]\s*\)/g;
  const implicitRe = /\bt\(\s*['"](?:landing:)?([a-zA-Z0-9_\-.]+)['"]\s*\)/g;
  let match;

  while ((match = explicitRe.exec(fileContent)) !== null) {
    const keyPath    = match[1];
    const defaultText = match[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, g) =>
      String.fromCharCode(parseInt(g, 16))
    );
    assignNestedKey(masterCatalog, keyPath, defaultText);
  }
  while ((match = implicitRe.exec(fileContent)) !== null) {
    const keyPath  = match[1];
    const fallback = keyPath.split('.').pop().replace(/_/g, ' ');
    assignNestedKey(masterCatalog, keyPath, fallback);
  }
}

// ─── Source transformation helpers ───────────────────────────────────────────

function ensureUseTranslationImport(content) {
  const importLine = "import { useTranslation } from 'react-i18next';";
  if (/import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/.test(content)) {
    return content;
  }
  const importRe = /^import\s+.+$/gm;
  let lastEnd = 0, m;
  while ((m = importRe.exec(content)) !== null) lastEnd = m.index + m[0].length;
  return lastEnd > 0
    ? content.slice(0, lastEnd) + '\n' + importLine + content.slice(lastEnd)
    : importLine + '\n' + content;
}

function findMatchingClose(s, openPos) {
  let depth = 0;
  for (let i = openPos; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return s.length - 1;
}

function ensureHookInComponents(content) {
  const HOOK_DECL  = "  const { t } = useTranslation('landing');\n";
  const T_CALL_RE  = /\bt\(['"]/;

  // FIX (Risk 1): Check for ANY useTranslation call, not just 'landing'.
  // This prevents clobbering files that already use a different namespace.
  //
  // FIX (task #11, post-LocaleSwitcher.tsx incident): the previous version of
  // this regex only checked whether SOME useTranslation() call existed in the
  // body — but a component can legitimately call useTranslation() for other
  // bindings only, e.g. `const { i18n } = useTranslation()`. Pass 1/Pass 3
  // would then inject a bare `t('key', 'default')` call into that component
  // (correctly, since t() calls were genuinely absent before tagging), the
  // hook-injection guard would see the existing useTranslation() call and
  // wrongly assume `t` was already in scope, and skip injecting the hook —
  // producing a runtime `ReferenceError: t is not defined`. Now we require
  // `t` specifically to be one of the destructured names.
  const HOOK_HAS_RE = /const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useTranslation\s*\(/;

  // Pass 1: expression-body one-liners (narrowed — Risk 3)
  // Only matches PascalCase names with ≥2 chars, no generic type params on LHS
  const EXPR_RE = /^((?:export\s+(?:default\s+)?)?const\s+[A-Z][A-Za-z][A-Za-z0-9_]*(?:\s*:\s*React\.FC)?\s*=\s*(?:\([^)]*\)|\w+)\s*=>)\s*(<[^;{]*);?\s*$/gm;

  content = content.replace(EXPR_RE, (_, decl, jsx) => {
    if (!T_CALL_RE.test(jsx)) return _;
    return `${decl} {\n${HOOK_DECL}  return (${jsx.trim()});\n};\n`;
  });

  // Pass 2: block-body components
  //
  // FIX (2026-07): the old version matched up through `[^{]*\{` in one regex,
  // which grabs the FIRST brace after the signature as "the body open brace."
  // That's wrong whenever the parameter list itself contains braces — e.g. a
  // destructured prop with an inline type annotation:
  //   function PlatformSecretGate({ onDone }: { onDone: () => void }) { ... }
  // The `{ onDone }` (or its type `{ onDone: () => void }`) gets mistaken for
  // the body, so the real body is never inspected for t() calls and the hook
  // silently fails to get injected. Now we only match up to the parameter
  // list's opening '(' here, then walk paren-depth (ignoring braces
  // entirely) to find its true matching ')', and look for the real body
  // brace after that.
  const BLOCK_RE = /(?:export\s+(?:default\s+)?)?(?:function\s+[A-Z][A-Za-z0-9_]*|const\s+[A-Z][A-Za-z0-9_]*(?:\s*:\s*(?:React\s*\.\s*)?(?:FC|VFC|ReactNode|ReactElement|FunctionComponent)(?:<[^>]*>)?)?\s*=)\s*(?=\()/g;

  // Given the index of a parameter list's opening '(', walks paren-depth
  // (braces are irrelevant here — we only care about matching parens) to
  // find where the parameter list actually ends, then looks for the next
  // '{' within a short bounded window (handles ": ReturnType =>" or " =>"
  // in between). Returns -1 if no brace body follows nearby — e.g. an
  // expression-bodied arrow (`=> <jsx/>`), which Pass 1 handles separately.
  function findBodyOpenBrace(text, parenStart) {
    let depth = 0;
    let i = parenStart;
    for (; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const windowEnd = Math.min(text.length, i + 200);
    const tail = text.slice(i, windowEnd);
    const braceMatch = tail.match(/^[^{]*?\{/);
    if (!braceMatch) return -1;
    return i + braceMatch[0].length - 1;
  }

  const injections = [];
  let m;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    const parenStart = m.index + m[0].length; // lookahead didn't consume the '('
    const openBrace   = findBodyOpenBrace(content, parenStart);
    if (openBrace === -1) continue;
    const closeBrace = findMatchingClose(content, openBrace);
    const body       = content.slice(openBrace + 1, closeBrace);
    if (T_CALL_RE.test(body) && !HOOK_HAS_RE.test(body)) {
      let pos = openBrace + 1;
      if (content[pos] === '\n') pos++;
      injections.push(pos);
    }
  }

  for (const pos of injections.sort((a, b) => b - a)) {
    content = content.slice(0, pos) + HOOK_DECL + content.slice(pos);
  }
  return content;
}

// ─── Hardcoded-string replacement ────────────────────────────────────────────

function replaceHardcodedStrings(fileContent, filenameScope, masterCatalog) {
  // Widened from the original (label|h1-4|p) set — see tag_coverage_report.cjs,
  // which found 261 hardcoded strings sitting in exactly these additional tags
  // across the app's dashboard pages. Still requires the tag's ENTIRE content
  // to be one plain-text run ([^<>{|}]+, no nested tags/expressions), so a
  // <div> or <span> used as a layout container with children is never touched
  // — only ones whose sole content is literal text.
  const JSX_TAG_RE = /<(label|h1|h2|h3|h4|p|button|option|span|div|td|th|a|li)([^>]*)>([^<>{|}]+)<\/\1>/g;
  let changed = false;

  const result = fileContent.replace(JSX_TAG_RE, (full, tag, attrs, rawText) => {
    const text = rawText.trim();
    if (
      !text ||
      /^\{/.test(text) ||
      /\bt\(/.test(text) ||
      /^[0-9\s\-+:()!@#$%^&*]+$/.test(text)
    ) return full;

    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const cleanKey = normalizedText
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 40);

    if (!cleanKey) return full;

    const scopedKey = `${filenameScope}.${cleanKey}`;
    assignNestedKey(masterCatalog, scopedKey, normalizedText);
    changed = true;
    return `<${tag}${attrs}>{t('${scopedKey}', '${normalizedText.replace(/'/g, "\\'")}')}</${tag}>`;
  });

  return [result, changed];
}

// ─── Object property string replacement ──────────────────────────────────────
//
// Catches user-facing strings assigned to known prop names in JS object literals,
// e.g. inside data arrays like `personaCarousels`:
//   title: 'Barton Springs Trail'  →  title: t('scope.title_barton_springs_trail', '...')
//
// Only props whose names appear in TRANSLATABLE_PROPS are touched.
// Technical strings (URLs, CSS values, ALL_CAPS constants, short tokens) are skipped.
// Already-tagged values (followed by `t(`) are skipped via negative lookahead.

const TRANSLATABLE_PROPS = new Set([
  'title', 'subtitle', 'label', 'text', 'desc', 'description',
  'prompt', 'response', 'badge', 'headline', 'intro', 'cta',
  'secondary_cta', 'placeholder', 'message', 'tooltip',
  'summary', 'caption', 'heading',
]);

function isTechnicalString(s) {
  if (s.length < 3) return true;
  if (/^[#/]/.test(s)) return true;            // CSS color or path
  if (/^https?:\/\//.test(s)) return true;     // URL
  if (/^var\(/.test(s)) return true;           // CSS variable
  if (/^[A-Z_]{2,}$/.test(s)) return true;    // ALL_CAPS constant
  if (/^[0-9\s\-+:.()●•]+$/.test(s)) return true; // Numerics / bullets
  if (/\.(png|svg|jpg|jpeg|gif|webp|css|js|ts)$/i.test(s)) return true;
  return false;
}

function replaceObjectStringProps(fileContent, filenameScope, masterCatalog) {
  const propPattern = [...TRANSLATABLE_PROPS].join('|');
  // Match:  propName: 'value'  or  propName: "value"
  // Skip if immediately followed by t( (already tagged)
  const PROP_RE = new RegExp(
    `\\b(${propPattern})\\s*:\\s*(?!t\\s*\\()(['"])((?:(?!\\3)[^\\\\]|\\\\.)*)\\3`,
    'g'
  );

  let changed = false;
  const result = fileContent.replace(PROP_RE, (full, prop, quote, rawValue) => {
    const value = rawValue.trim();
    if (isTechnicalString(value)) return full;

    const normalizedText = value.replace(/\s+/g, ' ').trim();
    const cleanKey = normalizedText
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 40);

    if (!cleanKey) return full;

    const scopedKey = `${filenameScope}.${prop}_${cleanKey}`;
    assignNestedKey(masterCatalog, scopedKey, normalizedText);
    changed = true;
    return `${prop}: t('${scopedKey}', '${normalizedText.replace(/'/g, "\\'")}')`;
  });

  return [result, changed];
}

// ─── JSX attribute string replacement ────────────────────────────────────────
//
// Catches user-facing strings in specific JSX attributes — placeholder="...",
// aria-label="...", title="...", alt="..." — which Pass 1 and Pass 2 never
// touch: Pass 1 only matches tag-body text, Pass 2 only matches JS
// object-literal `key: 'value'` syntax. JSX attributes use `attr="value"`
// syntax (no colon), so they need their own pattern.
//
// `placeholder={t('key','x')}` is valid JSX exactly like a tag body would be,
// so the replacement template just swaps quotes for a t() call the same way.
// The regex requires the value to start with a literal quote character, so
// an attribute already using an expression (placeholder={something}) can
// never match — this pass is naturally idempotent on a second run.

const TRANSLATABLE_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

function replaceAttrStrings(fileContent, filenameScope, masterCatalog) {
  const attrPattern = TRANSLATABLE_ATTRS.join('|');
  const ATTR_RE = new RegExp(
    `\\b(${attrPattern})=(['"])((?:(?!\\2)[^\\\\]|\\\\.)*)\\2`,
    'g'
  );

  let changed = false;
  const result = fileContent.replace(ATTR_RE, (full, attr, quote, rawValue) => {
    const value = rawValue.trim();
    if (isTechnicalString(value)) return full;

    const normalizedText = value.replace(/\s+/g, ' ').trim();
    const cleanKey = normalizedText
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 40);

    if (!cleanKey) return full;

    const attrSlug = attr.replace(/-/g, '_');
    const scopedKey = `${filenameScope}.${attrSlug}_${cleanKey}`;
    assignNestedKey(masterCatalog, scopedKey, normalizedText);
    changed = true;
    return `${attr}={t('${scopedKey}', '${normalizedText.replace(/'/g, "\\'")}')}`;
  });

  return [result, changed];
}

// ─── Scope from full relative path (Risk 2 fix) ───────────────────────────────
// e.g. src/components/auth/LoginScreen.tsx → "components_auth_loginscreen"
// Two different index.tsx files → "pages_index" vs "components_index"

function deriveScope(filePath) {
  const rel = path.relative(SRC_DIR, filePath);
  return rel
    .replace(/\.[^/.]+$/, '')      // strip extension
    .split(path.sep)
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

// ─── Main crawler ─────────────────────────────────────────────────────────────

function crawlAndTag() {
  console.log('🔍  ast_tagger: scanning src/ for hardcoded strings and t() calls...\n');

  // Load existing merged en.json, extract the landing namespace
  let mergedCatalog = {};
  if (fs.existsSync(LOCALES_EN)) {
    try { mergedCatalog = JSON.parse(fs.readFileSync(LOCALES_EN, 'utf-8')); }
    catch { mergedCatalog = {}; }
  }
  if (!mergedCatalog[LANDING_NS] || typeof mergedCatalog[LANDING_NS] !== 'object') {
    mergedCatalog[LANDING_NS] = {};
  }
  const masterCatalog = mergedCatalog[LANDING_NS];

  let filesScanned = 0, filesModified = 0;

  function processDirectory(dirPath) {
    for (const item of fs.readdirSync(dirPath)) {
      const fullPath = path.join(dirPath, item);
      const stat     = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!['node_modules', 'public', 'dist', '.git'].includes(item)) {
          processDirectory(fullPath);
        }
      } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
        const original = fs.readFileSync(fullPath, 'utf-8');
        let content    = original;
        filesScanned++;

        harvestExistingTCalls(content, masterCatalog);

        const scope = deriveScope(fullPath);

        // Passes 1 and 3 both produce `{t(...)}` — valid ONLY inside real JSX.
        // A plain .ts/.js file can never contain real JSX, but it CAN contain
        // a string or template literal with HTML-looking text in it (e.g. a
        // Leaflet attribution string, or a banner built via `.innerHTML =`
        // outside React) — the tag/attribute regexes below don't know the
        // difference between "real JSX" and "HTML sitting inside a string",
        // so on a .ts/.js file that distinction is exactly backwards: it
        // would corrupt the string (this broke constants.ts and
        // useSessionSecurity.ts on 2026-07-06 — reverted, see git history).
        // Restricting these two passes to .tsx/.jsx closes that off; Pass 2's
        // `prop: t(...)` output is valid in any JS/TS context so it still
        // runs everywhere.
        const isJsxCapable = /\.(tsx|jsx)$/.test(item);

        let did = false, tagged = content;
        if (isJsxCapable) {
          [tagged, did] = replaceHardcodedStrings(content, scope, masterCatalog);
        }
        if (did) content = tagged;

        // Pass 2: object property strings (e.g. carousel data, config arrays)
        const [propTagged, propDid] = replaceObjectStringProps(content, scope, masterCatalog);
        if (propDid) content = propTagged;

        // Pass 3: JSX attribute values (placeholder, aria-label, title, alt)
        if (isJsxCapable) {
          const [attrTagged, attrDid] = replaceAttrStrings(content, scope, masterCatalog);
          if (attrDid) content = attrTagged;
        }

        if (/\bt\(['"]/.test(content)) {
          content = ensureUseTranslationImport(content);
          content = ensureHookInComponents(content);
        }

        if (content !== original) {
          // Safety check: transformed output must not be suspiciously shorter
          // than the original.  If it is, something went wrong in the regex
          // passes — skip this file and warn rather than silently truncating it.
          if (content.length < original.length * 0.85) {
            console.warn(
              `  ⚠️  SKIP (output ${content.length}B < 85% of original ${original.length}B): ` +
              path.relative(SRC_DIR, fullPath)
            );
            continue;  // processed inside a for-loop via processDirectory
          }

          // Atomic write: write to a temp file then rename so a mid-write
          // failure can never leave the source file truncated.
          const tmpPath = fullPath + '.ast_tmp';
          try {
            fs.writeFileSync(tmpPath, content, 'utf-8');
            fs.renameSync(tmpPath, fullPath);
          } catch (writeErr) {
            // Clean up temp file if rename failed
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            console.error(`  ✖  Write failed for ${path.relative(SRC_DIR, fullPath)}: ${writeErr.message}`);
            continue;
          }
          filesModified++;
          console.log(`  ✏️  ${path.relative(SRC_DIR, fullPath)}`);
        }
      }
    }
  }

  if (fs.existsSync(SRC_DIR)) processDirectory(SRC_DIR);

  // Write back — update ONLY the landing namespace, preserve others
  mergedCatalog[LANDING_NS] = masterCatalog;
  fs.mkdirSync(path.dirname(LOCALES_EN), { recursive: true });
  fs.writeFileSync(LOCALES_EN, JSON.stringify(mergedCatalog, null, 2), 'utf-8');

  console.log(`\n✅  Done.`);
  console.log(`📂  Scanned : ${filesScanned} files`);
  console.log(`✏️   Modified: ${filesModified} files`);
  console.log(`🗝️   Landing keys in catalog: ${countKeys(masterCatalog)}`);
}

function countKeys(obj) {
  let n = 0;
  for (const v of Object.values(obj)) n += (v && typeof v === 'object') ? countKeys(v) : 1;
  return n;
}

crawlAndTag();
