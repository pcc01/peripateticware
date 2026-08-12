#!/usr/bin/env node
// frontend/scripts/validate_locales.cjs
//
// Static, offline locale validator. Unlike scripts/localization_qa_crawler.py
// (needs a running app + Ollama + demo accounts) or scripts/translate_sync.py
// (calls a paid translation provider), this script only reads the committed
// JSON files under public/locales/ and needs nothing else — no network, no
// LLM, no live server — so it's cheap enough to run on every PR in CI.
//
// WHY THIS EXISTS: a manual audit (2026-08) found the following bug classes
// live on the landing page, none of which any existing tool catches:
//   - type mismatches: a key that's a string in en/ but an object in another
//     locale (or vice versa) — this is exactly what produced the reported
//     "key 'pricing (de)' returned an object instead of string" crash/warning
//   - literal pipeline artifacts (a JSON value that is a stringified Python
//     list like "['Marzameto']", stray fragments like "}, {", the bare word
//     "False")
//   - mojibake from UTF-8 double-encoding (e.g. "AktivitÃ¤t")
//   - leaked translator/LLM meta-commentary (e.g. "(Preserved template
//     variables exactly as given.)", "(Translation: ...)")
// These four are ERRORs and fail the build — they're always bugs, never a
// legitimate design choice.
//
// It also surfaces, as non-blocking WARNs (visibility only, doesn't fail CI):
//   - keys present in en/ but missing from a target locale, UNLESS the key
//     resolves through that locale's configured i18next fallback chain (see
//     FALLBACK_CHAINS below — fr-CA is *deliberately* sparse and falls back
//     to fr/ at runtime, per src/config/i18n.ts)
//   - values byte-identical to the English source (likely never translated)
//   - Latin-alphabet words injected into non-Latin-script locales (ar, he,
//     ja, ko, zh), beyond an allowlist of brand names/acronyms/template vars
// These are lower-confidence signals (a missing key just silently falls back
// to English at runtime rather than crashing; identical/Latin content is
// sometimes intentional — proper nouns, lorem-ipsum placeholders, see
// SKIP_KEY_PATTERNS) so they're reported but don't block CI.
//
// This intentionally does NOT do language-quality/fluency checking (that's
// what the Ollama-based i18n:qa crawler is for) — it only catches the class
// of *structural/pipeline* corruption bugs above, statically and instantly.
//
// USAGE:
//     node scripts/validate_locales.cjs             # scan public/locales/**/*.json
//     node scripts/validate_locales.cjs --quiet      # errors only, no per-key logging
//     node scripts/validate_locales.cjs --errors-only  # suppress WARN lines entirely
//
// Exit code 0 = clean, 1 = at least one ERROR found (WARNs never fail CI).

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "public", "locales");
const BASE_LOCALE = "en";

// Same skip set localization_qa_crawler.py uses, kept in sync deliberately.
const SKIP_LOCALE_DIRS = new Set(["en", "tu", "_tu_backup"]);

// Locales whose script is not Latin-based — Latin words found inside these
// (beyond the allowlist) are almost always an untranslated leak.
const NON_LATIN_LOCALES = new Set(["ar", "he", "ja", "ko", "zh"]);

// Mirrors the fallbackLng chains in src/config/i18n.ts (locale codes not
// listed here — most of them — only fall back to plain 'en', so a missing
// key for them always means "shows English"). Only list the non-English
// hop(s); every chain implicitly ends in 'en' via i18next's own default.
const FALLBACK_CHAINS = {
  "fr-CA": ["fr"],
  "pt-BR": ["pt"], // no pt/ directory exists, so this is a no-op today — still correct to encode
};

// Key paths that are deliberately identical/Latin-script across every
// locale: team_1 is the real founder's name (a proper noun); team_2..5 and
// testimonial_1..5 are placeholder lorem-ipsum content (per project
// convention: Latin lorem ipsum is intentional filler, never a translation
// bug). Matched as a prefix against the flattened key.
const SKIP_KEY_PATTERNS = [
  /^team_[1-9]_/,
  /^testimonial_[1-9]_/,
];

// Brand names, acronyms, and other strings that are legitimately identical
// or Latin-script across every locale on purpose. Mirrors
// localization_qa_crawler.py's ALLOWLIST_UNCHANGED, extended with common
// tokens/file extensions/tech terms that show up inside otherwise-translated
// strings.
const ALLOWLIST_WORDS = new Set([
  "peri", "peripateticware", "ferpa", "coppa", "gdpr", "ccpa", "lgpd", "pipeda", "pdpa",
  "ok", "id", "url", "api", "pdf", "csv", "png", "jpg", "mp4", "mp3", "txt", "sla", "gps",
  "email", "ios", "android", "postgresql", "pgvector",
]);

// Literal byte sequences that only show up when UTF-8 text gets decoded as
// Latin-1/CP1252 and re-encoded (the classic "double-encoding" mojibake).
// Substring checks, not a regex — the sequences are unambiguous artifacts on
// their own, no need for a fragile character-class range.
const MOJIBAKE_SEQUENCES = [
  "Ã¤", "Ã¶", "Ã¼", "Ã„", "Ã–", "Ãœ", "ÃŸ", // German
  "Ã©", "Ã¨", "Ãª", "Ã«", "Ã§", "Ã®", "Ã¯", "Ã´", "Ã¹", "Ã»", // French
  "Ã±", "Ã¡", "Ã­", "Ã³", "Ãº", // Spanish/Portuguese
  "â€™", "â€œ", "â€", "â€“", "â€”", "â€¦", // smart quotes/dashes/ellipsis
  "Â ", "Â©", "Â®", "Â°", // stray Â before punctuation/symbols
];
function hasMojibake(str) {
  return MOJIBAKE_SEQUENCES.some((seq) => str.includes(seq));
}
const META_LEAK_RE = /\((?:preserved|translation|translated|note:|as an ai|i cannot|i'm unable)/i;
// A string whose ENTIRE value is a stringified Python/JS list or a bare
// pipeline sentinel — e.g. "['Marzameto']" or "False" — never a legitimate
// translated string. Deliberately anchored (^...$) so real prose that merely
// contains a brace/bracket (JSON examples in help text, etc.) isn't flagged.
const LITERAL_ARTIFACT_RE = /^(False|True|None|null|undefined)$|^\[.*\]$|^\{.*\}$/;
// A stray fragment left behind when a pipeline joined/truncated a JSON array
// mid-string, e.g. `"Classes'}, {"`.
const JSON_FRAGMENT_RE = /},\s*\{|^\s*[\{\[]|['"]\s*\}\s*,\s*\{/;

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const errorsOnly = args.includes("--errors-only");

function flattenKeys(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenKeys(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // 'object' | 'string' | 'number' | 'boolean'
}

function isSkippedKey(key) {
  return SKIP_KEY_PATTERNS.some((re) => re.test(key));
}

function containsLatinWord(str) {
  const words = str.match(/[A-Za-z]{3,}/g);
  if (!words) return null;
  for (const w of words) {
    if (!ALLOWLIST_WORDS.has(w.toLowerCase())) return w;
  }
  return null;
}

const flatCache = new Map(); // "locale/ns" -> flattened keys, so fallback lookups don't re-read/re-parse files

function loadFlat(locale, ns) {
  const cacheKey = `${locale}/${ns}`;
  if (flatCache.has(cacheKey)) return flatCache.get(cacheKey);
  const file = path.join(LOCALES_DIR, locale, `${ns}.json`);
  let flat = null;
  if (fs.existsSync(file)) {
    try {
      flat = flattenKeys(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch {
      flat = null; // invalid JSON is reported separately where we parse it directly
    }
  }
  flatCache.set(cacheKey, flat);
  return flat;
}

// Does `key` resolve to something other than the English fallback, by
// walking this locale's configured non-English fallback chain? Returns the
// locale it resolved in, or null if it bottoms out at English.
function resolvesViaFallback(locale, ns, key) {
  const chain = FALLBACK_CHAINS[locale] || [];
  for (const fb of chain) {
    const flat = loadFlat(fb, ns);
    if (flat && key in flat) return fb;
  }
  return null;
}

function main() {
  const localeDirs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIP_LOCALE_DIRS.has(d.name))
    .map((d) => d.name)
    .sort();

  const baseDir = path.join(LOCALES_DIR, BASE_LOCALE);
  if (!fs.existsSync(baseDir)) {
    console.error(`Base locale directory not found: ${baseDir}`);
    process.exit(1);
  }
  const namespaces = fs
    .readdirSync(baseDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  let errorCount = 0;
  let warnCount = 0;

  for (const ns of namespaces) {
    const baseFile = path.join(baseDir, `${ns}.json`);
    let baseJson;
    try {
      baseJson = JSON.parse(fs.readFileSync(baseFile, "utf8"));
    } catch (e) {
      logError(`en/${ns}.json: FATAL — failed to parse (${e.message})`);
      errorCount++;
      continue;
    }
    const baseFlat = flattenKeys(baseJson);

    for (const locale of localeDirs) {
      const file = path.join(LOCALES_DIR, locale, `${ns}.json`);
      if (!fs.existsSync(file)) continue; // namespace not shipped for this locale — not our concern here

      const rel = `${locale}/${ns}.json`;
      let json;
      try {
        json = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        logError(`${rel}: invalid JSON — ${e.message}`);
        errorCount++;
        continue;
      }

      const flat = flattenKeys(json);

      for (const [key, baseVal] of Object.entries(baseFlat)) {
        if (isSkippedKey(key)) continue;
        const label = `${rel} :: ${key}`;

        if (!(key in flat)) {
          const via = resolvesViaFallback(locale, ns, key);
          if (!via) {
            logWarn(`${label}: missing — falls back to English at runtime`);
            warnCount++;
          }
          // else: resolves via the configured fallback locale by design, not an issue
          continue;
        }

        const val = flat[key];
        const baseType = typeOf(baseVal);
        const type = typeOf(val);

        if (baseType !== type) {
          logError(`${label}: type mismatch — en is ${baseType}, ${locale} is ${type} (the "returned an object instead of string" crash class)`);
          errorCount++;
          continue;
        }

        if (type !== "string") continue; // only string leaves get the content checks below
        const trimmed = val.trim();

        if (LITERAL_ARTIFACT_RE.test(trimmed) || JSON_FRAGMENT_RE.test(val)) {
          logError(`${label}: literal pipeline artifact — value is "${val}"`);
          errorCount++;
        }

        if (hasMojibake(val)) {
          logError(`${label}: likely mojibake (double-encoded UTF-8) — "${val.slice(0, 60)}"`);
          errorCount++;
        }

        if (META_LEAK_RE.test(val)) {
          logError(`${label}: leaked translator/LLM meta-commentary — "${val.slice(0, 80)}"`);
          errorCount++;
        }

        if (NON_LATIN_LOCALES.has(locale)) {
          const leaked = containsLatinWord(val);
          if (leaked) {
            logWarn(`${label}: Latin word "${leaked}" inside ${locale} value — "${val.slice(0, 60)}"`);
            warnCount++;
          }
        }

        if (trimmed.length > 0 && val === baseVal && baseVal.trim().length > 1) {
          const bareWord = trimmed.toLowerCase();
          if (!ALLOWLIST_WORDS.has(bareWord) && !/^\{\{.*\}\}$/.test(trimmed)) {
            logWarn(`${label}: identical to en — likely untranslated — "${val.slice(0, 60)}"`);
            warnCount++;
          }
        }
      }
    }
  }

  console.log("");
  console.log(`validate_locales: ${errorCount} error(s), ${warnCount} warning(s).`);
  process.exit(errorCount === 0 ? 0 : 1);
}

function logError(msg) {
  if (!quiet) console.log(`[ERROR] ${msg}`);
}
function logWarn(msg) {
  if (!quiet && !errorsOnly) console.log(`[WARN]  ${msg}`);
}

main();
