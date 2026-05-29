// frontend/scripts/ast_tagger.cjs
//
// Business Source License 1.1 — see LICENSE
//
// What this script does:
//   1. Scans src/ for .tsx/.ts/.jsx/.js files
//   2. Replaces hardcoded JSX text in <h1–h4>, <p>, <label> with t("key", "fallback")
//   3. Ensures `import { useTranslation } from 'react-i18next'` is present in every
//      modified file (was missing — caused "Invalid hook call" crashes)
//   4. Ensures `const { t } = useTranslation('landing')` is injected into every
//      component body that calls t() (was missing — caused blank page / 65 broken files)
//   5. Updates public/locales/en/landing.json with all discovered keys
//
// Run: node scripts/ast_tagger.cjs

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');
const MASTER_EN_PATH = path.resolve(__dirname, '../public/locales/en/landing.json');

// ─── Locale catalog helpers ───────────────────────────────────────────────────

/**
 * Safely inserts a key into a deeply nested object without corrupting
 * existing parent/child relationships.
 */
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

// ─── Locale key harvesting (read-only, updates catalog) ───────────────────────

/**
 * Harvests keys from existing t() calls already present in the file.
 * Explicit:  t("auth.email_label", "Email Address")
 * Implicit:  t('nav.teacher.dashboard')
 */
function harvestExistingTCalls(fileContent, masterCatalog) {
  const explicitRe = /\bt\(\s*['"](?:landing:)?([a-zA-Z0-9_\-.]+)['"]\s*,\s*['"](.*?)['"]\s*\)/g;
  const implicitRe = /\bt\(\s*['"](?:landing:)?([a-zA-Z0-9_\-.]+)['"]\s*\)/g;

  let match;

  while ((match = explicitRe.exec(fileContent)) !== null) {
    const keyPath = match[1];
    const defaultText = match[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) =>
      String.fromCharCode(parseInt(grp, 16))
    );
    assignNestedKey(masterCatalog, keyPath, defaultText);
  }

  while ((match = implicitRe.exec(fileContent)) !== null) {
    const keyPath = match[1];
    // Only add if not already captured by the explicit pass
    const fallback = keyPath.split('.').pop().replace(/_/g, ' ');
    assignNestedKey(masterCatalog, keyPath, fallback);
  }
}

// ─── Source-file transformation helpers ───────────────────────────────────────

/**
 * Ensures `import { useTranslation } from 'react-i18next'` is present.
 * Inserts it after the last existing import statement.
 */
function ensureUseTranslationImport(content) {
  const importLine = "import { useTranslation } from 'react-i18next';";

  if (/import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/.test(content)) {
    return content; // already present
  }

  // Find the end of the last import block
  const importRe = /^import\s+.+$/gm;
  let lastImportEnd = 0;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    lastImportEnd = m.index + m[0].length;
  }

  if (lastImportEnd > 0) {
    return content.slice(0, lastImportEnd) + '\n' + importLine + content.slice(lastImportEnd);
  }
  return importLine + '\n' + content;
}

/**
 * Returns the index of the closing } that matches the { at openPos.
 */
function findMatchingClose(s, openPos) {
  let depth = 0;
  for (let i = openPos; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

/**
 * Injects `const { t } = useTranslation('landing');` as the first line inside
 * every React component body that:
 *   - calls t() somewhere inside it, AND
 *   - does not already have the hook declaration
 *
 * Handles both:
 *   Block-body:      const X = () => { ... }  /  function X() { ... }
 *   Expression-body: const X = () => <JSX />;  → converted to block form
 */
function ensureHookInComponents(content) {
  const HOOK_DECL = "  const { t } = useTranslation('landing');\n";
  const T_CALL_RE = /\bt\(['"]/;
  const HOOK_HAS_RE = /const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useTranslation/;

  // ── Pass 1: expression-body one-liners ──────────────────────────────────────
  // const Name = (...) => <JSX>;   →   const Name = (...) => {\n  hook;\n  return (<JSX>);\n};
  const EXPR_RE = /^((?:export\s+(?:default\s+)?)?const\s+[A-Z][A-Za-z0-9_]*(?:\s*:\s*\S+)?\s*=\s*(?:\([^)]*\)|\w+)\s*=>)\s*(<[^;]*);?\s*$/gm;

  content = content.replace(EXPR_RE, (_, decl, jsx) => {
    if (!T_CALL_RE.test(jsx)) return _;   // no t() — leave alone
    return `${decl} {\n${HOOK_DECL}  return (${jsx.trim()});\n};\n`;
  });

  // ── Pass 2: block-body components ───────────────────────────────────────────
  // Match component signatures (function or arrow) up to their opening {
  const BLOCK_RE = /(?:export\s+(?:default\s+)?)?(?:function\s+[A-Z][A-Za-z0-9_]*|const\s+[A-Z][A-Za-z0-9_]*(?:\s*:\s*(?:React\s*\.\s*)?(?:FC|VFC|ReactNode|ReactElement|FunctionComponent)(?:<[^>]*>)?)?\s*=\s*(?:\([^)]*\)|\w+)\s*=>)[^{]*\{/g;

  const injections = [];
  let m;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    const closeBrace = findMatchingClose(content, openBrace);
    const body = content.slice(openBrace + 1, closeBrace);

    if (T_CALL_RE.test(body) && !HOOK_HAS_RE.test(body)) {
      // Inject just after the newline following '{'
      let pos = openBrace + 1;
      if (content[pos] === '\n') pos++;
      injections.push(pos);
    }
  }

  // Apply injections from last → first to keep earlier positions valid
  for (const pos of injections.sort((a, b) => b - a)) {
    content = content.slice(0, pos) + HOOK_DECL + content.slice(pos);
  }

  return content;
}

// ─── Hardcoded-string replacement ────────────────────────────────────────────

/**
 * Replaces plaintext content inside JSX tags with t("scope.key", "Text").
 * Writes discovered keys into masterCatalog.
 * Returns [modifiedContent, didChange].
 */
function replaceHardcodedStrings(fileContent, filenameScope, masterCatalog) {
  const JSX_TAG_RE = /<(label|h1|h2|h3|h4|p)([^>]*)>([^<>{|}]+)<\/\1>/g;
  let changed = false;

  const result = fileContent.replace(JSX_TAG_RE, (full, tag, attrs, rawText) => {
    const text = rawText.trim();

    // Skip: empty, already a t() call, pure punctuation/numbers, or JSX expressions
    if (
      !text ||
      /^\{/.test(text) ||
      /\bt\(/.test(text) ||
      /^[0-9\s\-+:()!@#$%^&*]+$/.test(text)
    ) {
      return full;
    }

    // CRITICAL: normalize whitespace — collapse newlines and runs of spaces to a
    // single space. Without this, multiline JSX text produces an unterminated
    // string literal inside the t() fallback argument (esbuild/TypeScript error).
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

// ─── File scope derivation ────────────────────────────────────────────────────

/**
 * Derives a stable, dot-free scope token from a file path.
 * e.g. src/components/auth/LoginScreen.tsx → "loginscreen"
 */
function deriveScope(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ─── Main crawler ─────────────────────────────────────────────────────────────

function crawlAndTag() {
  console.log('🔍  ast_tagger: scanning src/ for hardcoded strings and t() calls...\n');

  let masterCatalog = {};
  if (fs.existsSync(MASTER_EN_PATH)) {
    try {
      masterCatalog = JSON.parse(fs.readFileSync(MASTER_EN_PATH, 'utf-8'));
    } catch {
      masterCatalog = {};
    }
  }

  let filesScanned = 0;
  let filesModified = 0;

  function processDirectory(dirPath) {
    for (const item of fs.readdirSync(dirPath)) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!['node_modules', 'public', 'dist', '.git'].includes(item)) {
          processDirectory(fullPath);
        }
      } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
        let content = fs.readFileSync(fullPath, 'utf-8');
        filesScanned++;

        // Step A: harvest existing t() calls into catalog (read-only)
        harvestExistingTCalls(content, masterCatalog);

        // Step B: replace hardcoded JSX strings with t() calls
        const scope = deriveScope(fullPath);
        const [tagged, didTag] = replaceHardcodedStrings(content, scope, masterCatalog);
        if (didTag) content = tagged;

        // Step C: if the file now contains any t() call, ensure proper hook setup
        if (/\bt\(['"]/.test(content)) {
          content = ensureUseTranslationImport(content);
          content = ensureHookInComponents(content);
        }

        // Step D: write back only if something changed
        const original = fs.readFileSync(fullPath, 'utf-8');
        if (content !== original) {
          fs.writeFileSync(fullPath, content, 'utf-8');
          filesModified++;
          console.log(`  ✏️  ${path.relative(SRC_DIR, fullPath)}`);
        }
      }
    }
  }

  if (fs.existsSync(SRC_DIR)) {
    processDirectory(SRC_DIR);
  }

  // Write updated locale catalog
  fs.mkdirSync(path.dirname(MASTER_EN_PATH), { recursive: true });
  fs.writeFileSync(MASTER_EN_PATH, JSON.stringify(masterCatalog, null, 2), 'utf-8');

  console.log(`\n✅  Done.`);
  console.log(`📂  Scanned : ${filesScanned} files`);
  console.log(`✏️   Modified: ${filesModified} files`);
  console.log(`🗝️   Locale keys in catalog: ${countKeys(masterCatalog)}`);
}

/** Recursively counts all leaf keys in a nested object. */
function countKeys(obj) {
  let n = 0;
  for (const v of Object.values(obj)) {
    n += (v && typeof v === 'object') ? countKeys(v) : 1;
  }
  return n;
}

crawlAndTag();