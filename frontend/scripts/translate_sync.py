#!/usr/bin/env python3
# frontend/scripts/translate_sync.py
import argparse
from datetime import datetime, timezone
import json
import os
import re
import sys
import time
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET
import xml.dom.minidom as minidom
import requests

# Ensure the scripts directory is on the path so sync_locales is importable
# regardless of the working directory the pipeline is launched from.
sys.path.insert(0, str(Path(__file__).parent))
from sync_locales import run as _sync_namespaces

# Microsoft Translator Endpoint Configuration
MS_TRANSLATOR_REGION = os.getenv("MS_TRANSLATOR_REGION", "global")
MS_TRANSLATOR_ENDPOINT = "https://api.cognitive.microsofttranslator.com"

LOCALES_DIR = Path(__file__).parent.parent / "public" / "locales"
SOURCE_LANG_CODE = "en"

# =====================================================================
# OUTPUT SANITIZATION — reject/clean garbage before it ever reaches disk
# =====================================================================
# Root cause of the corruption found across es/it/ja/etc locale files:
# the Ollama CLI fallback path (subprocess.run(["ollama", "run", ...])) can
# leak raw terminal control codes, and both local and hosted models
# occasionally hallucinate repeated placeholder-token spam, wrong-script
# output, or non-string JSON values (which used to get silently str()'d —
# e.g. Python's str(False) == "False", which is exactly the literal "False"
# card text found in the Japanese privacy compliance cards). None of this
# was validated before being written to public/locales/*.json.

_ANSI_ESCAPE_RE = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
_CONTROL_CHAR_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def strip_control_sequences(text: str) -> str:
    """Strips ANSI escape codes and other non-printable control characters
    that leak in from CLI subprocess output. Newlines are preserved."""
    if not isinstance(text, str):
        return text
    text = _ANSI_ESCAPE_RE.sub('', text)
    text = _CONTROL_CHAR_RE.sub('', text)
    return text


# Unicode block ranges used to sanity-check that a translation actually
# landed in the expected script for non-Latin target languages. Latin-script
# languages (es, fr, de, it, ...) have no entry and are skipped — there's no
# cheap reliable script check for those (a wrong-language Latin-script
# response, e.g. French text saved for Spanish, isn't caught here, only
# wrong-SCRIPT output is).
_SCRIPT_RANGES: dict[str, list[tuple[int, int]]] = {
    "ja": [(0x3040, 0x30FF), (0x4E00, 0x9FFF), (0xFF66, 0xFF9F)],
    "zh": [(0x4E00, 0x9FFF)],
    "ko": [(0xAC00, 0xD7A3), (0x1100, 0x11FF)],
    "ar": [(0x0600, 0x06FF), (0x0750, 0x077F)],
    "he": [(0x0590, 0x05FF)],
}


def has_expected_script(text: str, lang_code: str) -> bool:
    """Returns False when a non-Latin-script target locale's translation
    contains none of the expected script's characters — e.g. the exact bug
    found where ja.json literally contained Spanish and English text for
    two of the five 'meet_peri.exchange' keys (Ollama answered in the wrong
    language for those batch items, and nothing checked the output)."""
    base = lang_code.split('-')[0].lower()
    ranges = _SCRIPT_RANGES.get(base)
    if not ranges:
        return True
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 8:
        # Too short to meaningfully judge — most short acronyms/technical
        # terms (GDPR, API, JSON, "OK") are legitimately Latin-script even in
        # a non-Latin target locale. Real prose translations are almost
        # always longer than this, so the false-negative risk here is low.
        return True
    return any(any(lo <= ord(c) <= hi for lo, hi in ranges) for c in letters)


def looks_like_garbage(text, src: str) -> bool:
    """Catches the concrete corruption patterns found in production locale
    files: non-string JSON values stringified (str(False) == 'False'),
    repeated placeholder-token hallucination spam ('%s', '$t{...}'), a
    translation wrapped in a stringified list/array repr, or a response
    wildly longer than anything a real translation of the source would be."""
    if not isinstance(text, str):
        return True
    stripped = text.strip()
    if not stripped:
        return True
    if stripped in ("False", "True", "None", "null", "undefined", "[]", "{}"):
        return True
    if stripped.count('%s') >= 3 or stripped.count('$t{') >= 2:
        return True
    if (stripped.startswith('["') and stripped.endswith('"]')) or \
       (stripped.startswith("['") and stripped.endswith("']")):
        return True
    if len(stripped) > max(80, len(src) * 4):
        return True
    return False


# =====================================================================
# DO-NOT-TRANSLATE ENFORCEMENT
# =====================================================================
# Mirrors frontend/src/constants/i18n-do-not-translate.md, which previously
# existed only as documentation — nothing in the pipeline actually read or
# enforced it. Keys matched here are copied verbatim into every locale
# instead of being sent to the LLM.
DO_NOT_TRANSLATE_EXACT_KEYS = {
    "peripateticware",
    "layouts_dashboardshell.peripateticware",
    "homeschool.layouts_dashboardshell.peripateticware",
    "footer.brand_title",
    "footer.company_name",
    "privacy.ferpa_card_title",
    "privacy.coppa_card_title",
    "privacy.gdpr_card_title",
    "privacy.ccpa_card_title",
    "privacy_engine.ferpa_card_title",
    "privacy_engine.coppa_card_title",
    "privacy_engine.gdpr_card_title",
    "privacy_engine.ccpa_card_title",
}

DO_NOT_TRANSLATE_KEY_PATTERNS = [
    # Testimonial author/quote fields are placeholder lorem ipsum, not real
    # people — must not be "translated" into fabricated-sounding content.
    re.compile(r'(^|\.)testimonial_\d+_(author|text)$'),
    # Team member proper names — never translated (real or placeholder).
    re.compile(r'(^|\.)team_\d+_name$'),
    # team_2/3/4 are mockup placeholders used to build the page (per Paul,
    # 2026-07) — only team_1 (Paul, real) is genuine content. Lock the
    # mockup members' role/initial/bio as lorem ipsum; team_1_bio is
    # deliberately NOT matched here so it translates normally once written.
    re.compile(r'(^|\.)team_[234]_(role|initial|bio)$'),
    # Terms & Conditions: product decision (2026-07) to keep this page
    # English-only for now regardless of site locale.
    re.compile(r'^termspage\.'),
]

# ─── Legal content lock (product decision, 2026-07, Paul) ───────────────────
# ALL T&C / legal copy stays English in every locale FOR NOW — not just the
# termspage. Matched as whole key segments (dot- or underscore-delimited) so
# e.g. "footer.terms_link", "privacy.policy_title", "eula.section2" are all
# locked, but unrelated words containing these fragments are not. When the
# English-only policy is lifted, remove (or trim) this pattern and re-run the
# review — the keys become translatable again automatically.
LEGAL_DNT_KEY_RE = re.compile(
    r'(^|[._])(termspage|terms|tos|legal|eula|policy|policies|agreement|clause|disclaimer)([._]|$)',
    re.IGNORECASE)

# ─── Latin / lorem-ipsum placeholder detection (by VALUE, not key) ──────────
# Paul uses Latin filler wherever real content doesn't exist yet. Filler must
# never be machine-translated (it would become fabricated-sounding content),
# and it must not show up in QA reports as "untranslated". Detection is
# content-based on the ENGLISH source: the moment a Latin string is replaced
# with real English text, the key automatically becomes translatable — no
# list to maintain. Vocabulary covers the classic lorem-ipsum corpus plus the
# Cicero-derived filler most generators draw from; deliberately excludes
# Latin words that are also common English ("in", "sit", "id", "et", ...).
_LATIN_FILLER_WORDS = frozenset("""
lorem ipsum dolor amet consectetur adipiscing elit eiusmod tempor incididunt
labore dolore magna aliqua enim minim veniam quis nostrud exercitation ullamco
laboris nisi aliquip commodo consequat duis aute irure reprehenderit voluptate
velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat
proident sunt culpa officia deserunt mollit anim laborum curabitur vestibulum
sodales pellentesque habitant morbi tristique senectus netus malesuada fames
turpis egestas vitae sapien ultricies luctus donec fringilla vulputate
porttitor rhoncus dapibus felis euismod semper auctor neque penatibus magnis
dis parturient montes nascetur ridiculus mus etiam ultrices posuere cubilia
curae suspendisse potenti fusce faucibus scelerisque quam fermentum imperdiet
praesent blandit lacinia erat venenatis viverra ornare quisque aliquam nunc
lectus integer maecenas mauris natoque aenean ligula porta taciti sociosqu
litora torquent conubia nostra inceptos himenaeos vivamus dictum placerat
eleifend cras justo condimentum nibh sagittis gravida laoreet dictumst aliquet
atque quibus omnis ipsa voluptas voluptatem quia numquam eius modi tempora
aliquid quaerat beatae dicta explicabo nemo ipsam aspernatur odit fugit magni
dolores ratione sequi nesciunt porro quisquam dolorem adipisci eos accusamus
iusto dignissimos ducimus blanditiis praesentium voluptatum deleniti corrupti
quos molestias excepturi occaecati provident similique mollitia animi dolorum
fuga harum quidem rerum facilis expedita distinctio libero cumque impedit
minus quod maxime placeat facere possimus assumenda repellendus temporibus
quibusdam officiis debitis necessitatibus saepe eveniet voluptates repudiandae
recusandae itaque earum tenetur sapiente delectus reiciendis voluptatibus
maiores alias perferendis doloribus asperiores repellat sed perspiciatis unde
iste natus accusantium doloremque laudantium totam aperiam eaque quae illo
inventore veritatis quasi architecto nihil molestiae illum corporis suscipit
laboriosam autem vel eum iure magnam consequuntur nequeporro quia
""".split())


def looks_like_latin_placeholder(text) -> bool:
    """True when a source string is lorem-ipsum / Latin filler rather than
    real English content. Needs at least two distinct-word hits AND 40% of
    the words to be Latin filler, so an English sentence that happens to
    mention 'Magna Carta' or 'lorem ipsum' in passing is not locked."""
    if not isinstance(text, str):
        return False
    words = re.findall(r"[a-zA-Z]+", text.lower())
    if len(words) < 2:
        return False
    hits = sum(1 for w in words if w in _LATIN_FILLER_WORDS)
    return hits >= 2 and hits / len(words) >= 0.4


# =====================================================================
# UNICODE / CLDR CONVENTIONS — plural categories & capitalization
# =====================================================================
# i18next pluralizes via key suffixes (key_one, key_few, key_many, ...).
# WHICH suffixes a locale needs is defined by CLDR plural rules and differs
# per language (ar needs six forms; ja/zh/ko need only 'other'). babel ships
# the CLDR data, so the requirement set is derived at runtime — no table to
# maintain. A static fallback covers a babel-less environment.

PLURAL_SUFFIX_RE = re.compile(r"_(zero|one|two|few|many|other)$")

_STATIC_PLURAL_CATEGORIES = {
    "ar": {"zero", "one", "two", "few", "many", "other"},
    "he": {"one", "two", "many", "other"},
    "ja": {"other"}, "ko": {"other"}, "zh": {"other"},
    # everything else in this repo: one/other
}


def required_plural_categories(locale_code: str) -> set[str]:
    """CLDR plural categories the locale must provide (always incl. 'other').
    Uses babel's bundled CLDR data when available; falls back to a static map."""
    try:
        from babel import Locale as _BL
        pf = _BL.parse(locale_code.replace("-", "_")).plural_form
        return set(pf.rules.keys()) | {"other"}
    except Exception:
        base = locale_code.split("-")[0].lower()
        return _STATIC_PLURAL_CATEGORIES.get(base, {"one", "other"})


# Scripts without letter case — capitalization checks don't apply.
_CASELESS_BASES = {"ja", "zh", "ko", "ar", "he"}
# Languages whose convention is sentence case for headings/titles (copying
# English Title Case into them is a CLDR-style-convention violation). German
# is deliberately absent: its capitalized nouns look like title case to a
# ratio check and are correct.
_SENTENCE_CASE_BASES = {"fr", "es", "it", "pt", "tr", "nl", "pl", "ru", "cs", "sv", "da", "nb", "fi"}


def cldr_capitalization_issues(src: str, tgt: str, locale_code: str) -> list[str]:
    """Deterministic capitalization-convention checks:
      - leading_case_mismatch: source starts upper, target starts lower (or
        vice versa) in a caseful script;
      - title_case_leakage: English Title Case copied into a language whose
        convention is sentence case (>=3 words, >=75% capitalized in BOTH
        source and target — proper-noun-heavy strings won't trip both)."""
    base = locale_code.split("-")[0].lower()
    if base in _CASELESS_BASES or not isinstance(tgt, str) or not tgt or not src:
        return []
    issues = []
    s0, t0 = src.strip()[:1], tgt.strip()[:1]
    if s0 and t0 and s0.isalpha() and t0.isalpha():
        if s0.isupper() and t0.islower():
            issues.append("leading_case_mismatch")
        elif s0.islower() and t0.isupper():
            issues.append("leading_case_mismatch")
    if base in _SENTENCE_CASE_BASES:
        def _title_ratio(text: str) -> tuple[int, float]:
            words = [w for w in re.findall(r"[^\W\d_]+", text) if len(w) > 1]
            if not words:
                return 0, 0.0
            return len(words), sum(1 for w in words if w[:1].isupper()) / len(words)
        n_s, r_s = _title_ratio(src)
        n_t, r_t = _title_ratio(tgt)
        if n_s >= 3 and n_t >= 3 and r_s >= 0.75 and r_t >= 0.75:
            issues.append("title_case_leakage")
    return issues

# Demo/placeholder emails (you@example.com, teacher@example.com, ...) and the
# real contact address must be byte-for-byte identical in every locale.
#
# Two separate patterns on purpose:
#  - DEMO_EMAIL_FULL_RE: the value is NOTHING BUT an email address (e.g. the
#    key "youexamplecom": "you@example.com") — safe to lock the whole value.
#  - EMBEDDED_EMAIL_RE: an email address sitting inside a larger translatable
#    sentence (e.g. "demo_teacher": "Teacher: teacher@example.com", or the
#    localization_notice paragraph). Locking the WHOLE value here would freeze
#    the surrounding label/sentence in English forever in every locale — the
#    actual production bug was the opposite: the LOCAL PART of the email
#    itself was getting mistranslated ("tú@example.com", "あなた@example.com",
#    "you@example.com.tr" with a mangled TLD, one literally wrapped in JSON
#    list syntax). So compound strings are still translated normally, but the
#    exact email substring is verified present in the output afterward (see
#    email_addresses_preserved, used alongside looks_like_garbage) — if the
#    LLM altered it, that's treated as a bad translation and retried/rejected
#    exactly like any other corruption.
DEMO_EMAIL_FULL_RE = re.compile(r'^[\w.+-]+@(example\.com|peripateticware\.com)$', re.IGNORECASE)
EMBEDDED_EMAIL_RE = re.compile(r'[\w.+-]+@(?:example\.com|peripateticware\.com)', re.IGNORECASE)


def bad_reasons(text, src: str, lang_code: str) -> list[str]:
    """Returns the list of validation checks a candidate translation failed —
    used both to decide whether to retry/reject it and to explain why in the
    debug log, since 'suspect output' alone doesn't say what was wrong with it."""
    reasons = []
    if looks_like_garbage(text, src):
        reasons.append("garbage_pattern")
    if isinstance(text, str) and not has_expected_script(text, lang_code):
        reasons.append("wrong_script")
    if not email_addresses_preserved(src, text):
        reasons.append("email_altered")
    return reasons


# =====================================================================
# DEBUG LOG — raw before/after for every suspect translation
# =====================================================================
# Console output used to print one "Suspect output ... retrying" line per key,
# which is unreadable at scale (a single Ollama/Arabic run flagged 150+ keys).
# Now the console only prints a one-line summary per locale, and every suspect
# case's actual raw model output (both the failed batch candidate and the
# retry) is written here so it can be inspected and shared for debugging —
# printing "suspect" to the console never told anyone what the model actually
# returned.
DEBUG_LOG_PATH = Path(__file__).parent / "translation_debug.jsonl"
_debug_log_initialized = False


def init_debug_log():
    """Marks the start of a run with a separator line instead of truncating
    the file — past runs' raw model output is kept for later review (the
    per-key 'still English' status already persists forever in each locale's
    .xlf; this keeps the raw-output detail alongside it too)."""
    global _debug_log_initialized
    if not _debug_log_initialized:
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps({"run_started": datetime.now(timezone.utc).isoformat()}) + "\n")
        _debug_log_initialized = True


def log_suspect_translation(lang_code: str, key: str, src: str,
                             raw_candidate, reasons: list[str],
                             raw_retry=None, retry_reasons: list[str] | None = None,
                             final_status: str = "") -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "lang": lang_code,
        "key": key,
        "source_text": src,
        "batch_output_raw": raw_candidate,
        "batch_output_failed_checks": reasons,
        "retry_output_raw": raw_retry,
        "retry_output_failed_checks": retry_reasons,
        "final_status": final_status,
    }
    with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def is_do_not_translate(key: str, value: str) -> bool:
    if key in DO_NOT_TRANSLATE_EXACT_KEYS:
        return True
    if any(p.search(key) for p in DO_NOT_TRANSLATE_KEY_PATTERNS):
        return True
    # Legal content: English-only in every locale for now (see LEGAL_DNT_KEY_RE).
    if LEGAL_DNT_KEY_RE.search(key):
        return True
    if isinstance(value, str) and DEMO_EMAIL_FULL_RE.match(value.strip()):
        return True
    # Latin filler = no real content yet; becomes translatable automatically
    # once the English source is replaced with real text.
    if looks_like_latin_placeholder(value):
        return True
    return False


def email_addresses_preserved(src: str, translated: str) -> bool:
    """False if src contains a demo/contact email address and the translated
    text doesn't contain that exact same address — i.e. the LLM translated or
    otherwise altered the local part of the email instead of leaving it as-is.
    Requires a boundary right after the match (not just substring containment)
    so "you@example.com.tr" doesn't falsely pass as containing
    "you@example.com" — a real corruption found in the Turkish locale file."""
    if not isinstance(translated, str):
        return False
    src_emails = {m.group(0).lower() for m in EMBEDDED_EMAIL_RE.finditer(src)}
    if not src_emails:
        return True
    translated_lower = translated.lower()
    for email in src_emails:
        if not re.search(re.escape(email) + r'(?![\w.-])', translated_lower):
            return False
    return True


def protect_emails(text: str) -> tuple[str, dict[str, str]]:
    """Swaps embedded demo/contact emails for a {email_N} placeholder — the
    same {count}/%s/$t(...) template-variable style the system prompt already
    instructs every model to preserve verbatim — before the text is sent for
    translation. The model never sees the real address, so it can't
    mistranslate it (e.g. "localization@peripateticware.com" becoming
    "localización@peripateticware.com"), and the surrounding sentence still
    gets translated normally instead of the whole line falling back to
    English just because the email inside it got altered. Returns the
    protected text and a map to restore the real address afterward."""
    if not isinstance(text, str):
        return text, {}
    email_map: dict[str, str] = {}

    def _sub(m: re.Match) -> str:
        placeholder = f"{{email_{len(email_map) + 1}}}"
        email_map[placeholder] = m.group(0)
        return placeholder

    return EMBEDDED_EMAIL_RE.sub(_sub, text), email_map


def restore_emails(text, email_map: dict[str, str]):
    if not isinstance(text, str) or not email_map:
        return text
    for placeholder, email in email_map.items():
        text = text.replace(placeholder, email)
    return text


def extract_list_from_json(parsed_obj, texts: list[str]) -> list[str] | None:
    """
    Recursively searches a parsed JSON structure for any list matching 
    the exact expected length. Perfect for handling models that wrap 
    arrays in objects like {"translations": [...]}, map key-values,
    or map index strings.
    """
    # NOTE: non-string JSON scalars (bool/None/int/dict/list) are mapped to ""
    # rather than str()-coerced — str(False) == "False" is exactly the literal
    # "False" text found rendered in the Japanese privacy compliance cards.
    # An empty string is caught downstream by looks_like_garbage() and
    # triggers a retry instead of silently saving the wrong value.
    def _as_str(x):
        return x if isinstance(x, str) else ""

    expected_len = len(texts)
    if isinstance(parsed_obj, list) and len(parsed_obj) == expected_len:
        return [_as_str(x) for x in parsed_obj]
    if isinstance(parsed_obj, dict):
        # Case A: Dict with expected_len keys. Keys might be original strings or indices.
        if len(parsed_obj) == expected_len:
            # 1. Try mapping keys to texts normalized
            key_map = {str(k).strip().lower(): _as_str(v) for k, v in parsed_obj.items()}
            mapped_results = []
            for t in texts:
                t_norm = str(t).strip().lower()
                if t_norm in key_map:
                    mapped_results.append(key_map[t_norm])
            if len(mapped_results) == expected_len:
                return mapped_results

            # 2. Try sorting keys numerically if they look like indices
            try:
                sorted_keys = sorted(parsed_obj.keys(), key=lambda x: int(re.sub(r'\D', '', str(x))))
                if len(sorted_keys) == expected_len:
                    return [_as_str(parsed_obj[k]) for k in sorted_keys]
            except Exception:
                pass

            # 3. Fallback: Return raw values in order of iteration
            return [_as_str(v) for v in parsed_obj.values()]
        
        # Case B: Nested search in dict values
        for val in parsed_obj.values():
            res = extract_list_from_json(val, texts)
            if res:
                return res
    return None


def parse_json_defensively(cleaned_text: str, texts: list[str]) -> list[str]:
    """
    Defensively parses JSON strings, searching for arrays, objects, or 
    even raw quotes to extract translated tokens robustly.
    """
    text = cleaned_text.strip()
    expected_len = len(texts)
    
    # Try loading directly
    try:
        parsed = json.load(text) if hasattr(text, "read") else json.loads(text)
        extracted = extract_list_from_json(parsed, texts)
        if extracted:
            return extracted
    except json.JSONDecodeError:
        pass

    # Try searching for array outermost bounds
    array_match = re.search(r'\[\s*.*?\s*\]', text, re.DOTALL)
    if array_match:
        try:
            parsed = json.loads(array_match.group(0))
            extracted = extract_list_from_json(parsed, texts)
            if extracted:
                return extracted
        except json.JSONDecodeError:
            pass

    # Try searching for object outermost bounds
    brace_match = re.search(r'\{\s*.*?\s*\}', text, re.DOTALL)
    if brace_match:
        try:
            parsed = json.loads(brace_match.group(0))
            extracted = extract_list_from_json(parsed, texts)
            if extracted:
                return extracted
        except json.JSONDecodeError:
            pass
    
    # Line-by-line fallback: strip JSON key patterns ("key":) first, then extract
    # remaining quoted string values. Avoids lookahead backtracking artifacts.
    text_values_only = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"\s*:', '', text)
    strings = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', text_values_only)
    if len(strings) == expected_len:
        return strings

    # Partial recovery: if the model truncated its output and returned fewer strings
    # than expected, return what we have padded with empty strings so the caller can
    # fill the gaps sequentially rather than retranslating the whole batch.
    if 0 < len(strings) < expected_len:
        return strings + [""] * (expected_len - len(strings))

    raise ValueError(f"Could not extract a JSON list of expected length ({expected_len}) from LLM response.")


def classify_key_and_get_config(key: str, text: str) -> tuple[str, str, float]:
    """
    Analyzes translation keys dynamically and maps them to specialized
    temperatures and instructions matching their structural role.
    """
    k_lower = key.lower()
    text_len = len(text)
    
    # Category 1: Technical & Legal Documentation (TOS, Privacy Policies, COPPA/FERPA sections)
    if any(x in k_lower for x in ["privacy", "terms", "policy", "tos", "coppa", "ferpa", "audit", "config", "legal", "clause", "agreement"]) or text_len > 250:
        return (
            "Technical/Legal Documentation",
            "Maintain technical accuracy and engineering or legal syntax clarity. Use official industry standard terms for data architectures, permissions, legal terms, and compliance metrics.",
            0.1
        )
    
    # Category 2: Marketing & Highly Creative Copy (Hero modules, testimonials, tour guides)
    if any(x in k_lower for x in ["marketing", "hero", "feature", "testimonial", "pricing", "landing", "tour", "why_us", "benefits"]):
        return (
            "Marketing/Creative Content",
            "Focus on natural marketing flow, emotional connection, and brand resonance. Do not translate word-for-word if a localized idiom works better.",
            0.6
        )
        
    # Category 3: Concise Application UI Strings (Buttons, small headers, short labels, alerts)
    if text_len < 20 or any(x in k_lower for x in ["button", "label", "placeholder", "nav", "auth", "common", "error", "tooltip", "menu", "tab", "action", "status"]):
        return (
            "Application UI Strings",
            "Be extremely concise, literal, and direct. Match the brief structure of UI buttons, labels, and placeholders perfectly.",
            0.0
        )
        
    # Category 4: Balanced Fallback
    return (
        "General Balanced Content",
        "Provide a balanced, highly natural software translation matching typical business-platform conventions.",
        0.3
    )


class UniversalOrchestrator:
    def __init__(self, provider: str, content_type: str, style: str):
        self.provider = provider.upper()
        self.content_type = content_type
        self.style = style
        self.last_llm_call_time = 0.0  # Tracks global pacing timeline
        
        # Safe default values which can be dynamically overriden in Scalpel Mode
        style_instruction = self._get_style_instruction(style)
        temperature = self._get_temperature(style)
        
        # Configures baseline values
        self.set_dynamic_override(content_type, style_instruction, temperature)
        
        # Initialize selected environment parameters safely with live fallback key prompts
        if self.provider == "DEEPL":
            import deepl
            key = os.getenv("DEEPL_AUTH_KEY")
            if not key:
                key = input("🔑 DEEPL_AUTH_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing DEEPL_AUTH_KEY token.")
            self.client = deepl.Translator(key)
            self.active_model = "DeepL-API"
            
        elif self.provider == "CLAUDE":
            from anthropic import Anthropic
            key = os.getenv("ANTHROPIC_API_KEY")
            if not key:
                key = input("🔑 ANTHROPIC_API_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing ANTHROPIC_API_KEY token.")
            self.client = Anthropic(api_key=key)
            self.active_model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
            
        elif self.provider == "GEMINI":
            from google import genai
            key = os.getenv("GEMINI_API_KEY")
            if not key:
                key = input("🔑 GEMINI_API_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing GEMINI_API_KEY token.")
            self.client = genai.Client(api_key=key)
            # Default upgraded to gemini-2.5-flash to fix the v1beta 404 deprecation error
            self.active_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            
        elif self.provider == "GOOGLE_TRANSLATE":
            from deep_translator import GoogleTranslator
            self.client = GoogleTranslator
            self.active_model = "Google-Translate-Classic-v4"
            
        elif self.provider == "MICROSOFT":
            key = os.getenv("MS_TRANSLATOR_KEY")
            if not key or key == "YOUR_MICROSOFT_AZURE_KEY":
                key = input("🔑 MS_TRANSLATOR_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing MS_TRANSLATOR_KEY token.")
            self.ms_key = key
            self.active_model = "Azure-Cognitive-v3"
            
        elif self.provider == "OLLAMA":
            self.active_model = os.getenv("OLLAMA_MODEL_TEXT", "mistral")

    def _get_style_instruction(self, style: str) -> str:
        if "Concise & Accurate" in style:
            return "Be extremely concise, literal, and direct. Match the brief structure of UI buttons, labels, and placeholders perfectly."
        elif "Creative & Fluent" in style:
            return "Focus on natural marketing flow, emotional connection, and brand resonance. Do not translate word-for-word if a localized idiom works better."
        elif "Technical Precision" in style:
            return "Maintain technical accuracy and engineering syntax clarity. Use official industry standard terms for data architectures, permissions, and compliance metrics."
        else:
            return "Provide a balanced, highly natural software translation matching typical business-platform conventions."

    def _get_temperature(self, style: str) -> float:
        if "Concise & Accurate" in style:
            return 0.0
        elif "Creative & Fluent" in style:
            return 0.6
        elif "Technical Precision" in style:
            return 0.1
        else:
            return 0.3

    def set_dynamic_override(self, content_type: str, style_instruction: str, temperature: float):
        """Allows dynamic configuration of system prompts and temperatures per classified batch."""
        self.content_type = content_type
        self.temperature = temperature
        self.system_prompt = (
            f"You are an expert localization engine specialized in processing software context fields type: '{content_type}'.\n"
            f"Mandatory Style Guide: {style_instruction}\n"
            f"CRITICAL RULES:\n"
            f"1. Preserve template variables (e.g. {{count}}, %s, $t(...)) exactly with no syntax alterations.\n"
            f"2. Provide ONLY the translated value string text. Never include Markdown fences, quotes, notes, formatting, or introductions.\n"
            f"3. Do not append explanation copy or repeat the input key text framework back.\n"
            f"4. Follow the target language's standard Unicode/CLDR capitalization conventions: "
            f"use sentence case where the language customarily does (e.g. French, Spanish, Italian) "
            f"instead of copying English Title Case, and apply locale-correct casing rules (e.g. Turkish dotted/dotless I)."
        )

    def get_method_string(self) -> str:
        return f"{self.provider}-{self.active_model} [Profile: {self.content_type} | Temp: {self.temperature}]"

    def _pace_llm_call(self):
        """Paces API calls to LLM providers to strictly stay under Rate Limits (max 13 requests per minute)."""
        if self.provider in ["OLLAMA", "CLAUDE", "GEMINI"]:
            elapsed = time.time() - self.last_llm_call_time
            min_interval = 4.5  # Guarantees staying comfortably under the 15 RPM threshold
            if elapsed < min_interval:
                time.sleep(min_interval - elapsed)
            self.last_llm_call_time = time.time()

    def retry_call(self, api_func):
        """Exponential backoff scheduler retrying on transient errors with clean pacing and user notifications."""
        delays = [2, 4, 8, 16, 32]
        for attempt, delay in enumerate(delays):
            try:
                return api_func()
            except Exception as e:
                err_str = str(e).upper()
                is_rate_limit = any(x in err_str for x in ["429", "RESOURCE_EXHAUSTED", "RATE_LIMIT", "QUOTA", "LIMIT EXCEEDED"])
                if is_rate_limit:
                    sleep_time = delay
                    # Dynamically parse a literal wait instruction if the engine tells us to wait longer
                    match = re.search(r'(?:retry in|retryDelay[:\s"\'\{\}]+|after\s+)(\d+\.?\d*)', str(e), re.IGNORECASE)
                    if match:
                        sleep_time = int(float(match.group(1))) + 2
                    print(f"\n⏳ [Rate Limit Detected] Pausing for {sleep_time}s to let the API window reset...")
                    time.sleep(sleep_time)
                else:
                    print(f"\n⚠️  [API Warning] Attempt {attempt + 1} failed with error: {e}. Retrying in {delay}s...")
                    time.sleep(delay)
        # Final, unshielded attempts which throws explicit errors downstream if depleted
        return api_func()

    def clean_llm_chatter(self, raw_output: str) -> str:
        """Defensive string filter matrix to wipe clean any conversational chatter or markdown fences."""
        text = strip_control_sequences(raw_output).strip()
        if not text:
            return ""
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n|```$", "", text).strip()
        if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
            text = text[1:-1].strip()
        chatter_prefixes = [
            r"^here\s+is\s+the\s+translation:?", r"^translation:?", 
            r"^spanish:?", r"^french:?", r"^localized\s+text:?"
        ]
        for prefix in chatter_prefixes:
            text = re.sub(prefix, "", text, flags=re.IGNORECASE).strip()
        return text

    def translate_single(self, text: str, lang_name: str, lang_code: str) -> str:
        """Fallback translation loop for generative LLM providers requiring sequential prompts."""
        protected_text, email_map = protect_emails(text)
        prompt = (
            f"{self.system_prompt}\n\n"
            f"Target Language: Translate directly into fluent, natural {lang_name} (Code: '{lang_code.lower()}').\n"
            f"Input Value String To Translate:\n\"{protected_text}\""
        )

        self._pace_llm_call()  # Force safe chronological separation

        if self.provider == "CLAUDE":
            msg = self.client.messages.create(
                model=self.active_model, max_tokens=1024, system=self.system_prompt,
                temperature=self.temperature,
                messages=[{"role": "user", "content": f"Translate this text directly: {protected_text}"}]
            )
            return restore_emails(self.clean_llm_chatter(msg.content[0].text), email_map)

        elif self.provider == "GEMINI":
            res = self.client.models.generate_content(
                model=self.active_model, contents=prompt,
                config={"system_instruction": self.system_prompt, "temperature": self.temperature}
            )
            return restore_emails(self.clean_llm_chatter(res.text), email_map)

        elif self.provider == "OLLAMA":
            # Direct API request to avoid CLI escape crashes
            try:
                url = "http://localhost:11434/api/generate"
                payload = {
                    "model": self.active_model,
                    "prompt": prompt,
                    "system": self.system_prompt,
                    "options": {
                        "temperature": float(self.temperature)
                    },
                    "stream": False
                }
                res = requests.post(url, json=payload, timeout=120)
                res.raise_for_status()
                return restore_emails(self.clean_llm_chatter(res.json().get("response", "")), email_map)
            except Exception:
                # Fallback to CLI using standard input (stdin) to prevent WinError 206 command-line limits
                cmd = ["ollama", "run", self.active_model]
                result = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", check=True)
                return restore_emails(self.clean_llm_chatter(result.stdout), email_map)

        return text

    def translate_llm_batch(self, texts: list[str], lang_name: str, lang_code: str) -> list[str]:
        """Translates multiple texts in a single roundtrip to bypass strict free tier limitations."""
        protected_pairs = [protect_emails(t) for t in texts]
        protected_texts = [p[0] for p in protected_pairs]
        email_maps = [p[1] for p in protected_pairs]
        prompt = (
            f"{self.system_prompt}\n\n"
            f"Target Language: Translate directly into fluent, natural {lang_name} (Code: '{lang_code.lower()}').\n"
            f"You are translating a batch of strings. You MUST return a JSON object with a single key 'translations' containing the list of translated strings matching the input array order and size exactly.\n"
            f"Example output structure:\n{{\"translations\": [\"translation_1\", \"translation_2\", \"translation_3\"]}}\n\n"
            f"Input JSON Array of strings to translate:\n{json.dumps(protected_texts, ensure_ascii=False)}"
        )
        
        def run_call():
            self._pace_llm_call()  # Ensure batch calls are spaced
            if self.provider == "CLAUDE":
                msg = self.client.messages.create(
                    model=self.active_model, max_tokens=4096, system=self.system_prompt,
                    temperature=self.temperature,
                    messages=[{"role": "user", "content": prompt}]
                )
                return msg.content[0].text
            elif self.provider == "GEMINI":
                res = self.client.models.generate_content(
                    model=self.active_model, contents=prompt,
                    config={
                        "system_instruction": self.system_prompt, 
                        "temperature": self.temperature,
                        "response_mime_type": "application/json"
                    }
                )
                return res.text
            elif self.provider == "OLLAMA":
                # Use /api/chat with assistant pre-seeding to anchor Tower/instruction-tuned
                # models into valid JSON before they generate a single token.
                pre_seed = '{"translations": ['
                ollama_result = ""
                try:
                    url = "http://localhost:11434/api/chat"
                    payload = {
                        "model": self.active_model,
                        "messages": [
                            {"role": "system", "content": self.system_prompt},
                            {"role": "user", "content": prompt},
                            {"role": "assistant", "content": pre_seed}
                        ],
                        "stream": False,
                        "format": "json",
                        "options": {"temperature": float(self.temperature)}
                    }
                    res = requests.post(url, json=payload, timeout=300)
                    res.raise_for_status()
                    continuation = res.json().get("message", {}).get("content", "")
                    ollama_result = self.clean_llm_chatter(continuation)
                except Exception:
                    # Fallback to CLI using standard input (stdin) to prevent WinError 206 command-line limits
                    try:
                        cmd = ["ollama", "run", self.active_model]
                        cli = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", check=True)
                        ollama_result = self.clean_llm_chatter(cli.stdout)
                    except Exception:
                        pass
                # Empty check is outside both try blocks so it propagates to retry_call
                if not ollama_result.strip():
                    raise ValueError("Ollama returned empty response (API and CLI both failed) — will retry")
                return ollama_result
            return ""

        cleaned = ""
        try:
            # Execute with structured exponential retries
            raw_response = self.retry_call(run_call)
            cleaned = self.clean_llm_chatter(raw_response)

            # Use robust defensive JSON parser to locate the list even if nested in objects
            parsed = parse_json_defensively(cleaned, texts)
            return [restore_emails(t, email_maps[i]) for i, t in enumerate(parsed)]
        except Exception as e:
            # Gracefully self-heal: Fallback sequentially if batch compilation failed
            print(f"   ⚠️  Batch compilation failed ({e}). Self-healing with paced sequential fallback...")
            print(f"   [DEBUG] Failed response (first 600 chars): {repr(cleaned[:600])}")
            results = []
            for text in texts:
                translated = self.retry_call(lambda: self.translate_single(text, lang_name, lang_code))
                results.append(translated)
            return results

    def translate_batch(self, texts: list[str], lang_name: str, lang_code: str) -> list[str]:
        """Highly optimized translation pipeline that groups multiple text blocks to minimize API requests."""
        if not texts:
            return []

        if self.provider == "GOOGLE_TRANSLATE":
            # Uses deep_translator to securely fetch grouped translations safely under Python 3.13
            translator = self.client(source='en', target=lang_code.lower())
            return self.retry_call(lambda: translator.translate_batch(texts))

        elif self.provider == "DEEPL":
            # Automatically batch list inputs to minimize roundtrips
            results = self.retry_call(lambda: self.client.translate_text(texts, source_lang="EN", target_lang=lang_code.upper()))
            return [res.text for res in results]

        elif self.provider == "MICROSOFT":
            # Groups up to 100 elements in a single POST body
            path = '/translate?api-version=3.0'
            params = f'&from=en&to={lang_code.lower()}'
            constructed_url = MS_TRANSLATOR_ENDPOINT + path + params
            headers = {
                'Ocp-Apim-Subscription-Key': self.ms_key,
                'Ocp-Apim-Subscription-Region': MS_TRANSLATOR_REGION,
                'Content-type': 'application/json'
            }
            body = [{'text': t} for t in texts]
            request = requests.post(constructed_url, headers=headers, json=body)
            request.raise_for_status()
            response = request.json()
            return [res['translations'][0]['text'] for res in response]

        elif self.provider == "OLLAMA":
            # The /api/chat + assistant-pre-seed JSON batching in
            # translate_llm_batch was found (via translation_debug.jsonl on a
            # live --reset run) to reliably produce well-formed-but-EMPTY JSON
            # arrays from mistral-nemo — e.g. {"translations": ["", "", "",
            # "", ""]}. Because that parses successfully as valid JSON of the
            # right length, parse_json_defensively never raises, so the
            # internal self-healing fallback inside translate_llm_batch never
            # triggers either — every key in the batch silently comes back as
            # "", gets flagged suspect downstream, and is re-translated one at
            # a time anyway via the (reliable) /api/generate call in
            # translate_single. That happened for essentially 100% of keys in
            # the "Application UI Strings" category, meaning the batch call
            # was pure overhead: an extra network round trip that never once
            # produced usable output before the real translation happened via
            # the single-string retry path. Skip the batch attempt entirely
            # for Ollama and go straight to the proven single-call path —
            # this halves latency and eliminates the noise at the source
            # instead of just logging it more quietly.
            return [self.retry_call(lambda t=t: self.translate_single(t, lang_name, lang_code)) for t in texts]

        # For Generative AI models, optimize via structured list prompts
        return self.translate_llm_batch(texts, lang_name, lang_code)


# =====================================================================
# NESTING UTILITY MAPS
# =====================================================================
def flatten_json(nested_dict: dict, separator: str = '.') -> dict:
    flat_dict = {}
    def recurse(current_item, parent_key=''):
        if isinstance(current_item, dict):
            for k, v in current_item.items():
                new_key = f"{parent_key}{separator}{k}" if parent_key else k
                recurse(v, new_key)
        else: flat_dict[parent_key] = current_item
    recurse(nested_dict)
    return flat_dict

def unflatten_json(flat_dict: dict, separator: str = '.') -> dict:
    nested_dict = {}
    for composite_key, value in flat_dict.items():
        parts = composite_key.split(separator)
        current = nested_dict
        for i, part in enumerate(parts[:-1]):
            if part not in current or not isinstance(current[part], dict): current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    return nested_dict

# =====================================================================
# SYSTEM PARSERS & WRITERS
# =====================================================================
def load_json(path: Path) -> dict:
    if not path.exists(): return {}
    with open(path, "r", encoding="utf-8") as f:
        try: return json.load(f)
        except json.JSONDecodeError: return {}

def save_json(path: Path, data: dict):
    """Atomic write: json.dump into a sibling temp file, then os.replace() over
    the real path. A plain open(path, "w") + json.dump() leaves a truncated,
    unparseable file on disk if the process is interrupted mid-write (killed,
    disk full, terminal closed) — which is exactly what corrupted en.json and
    23 other locale files before scripts/repair_locale_json.py fixed them.
    os.replace() is a single filesystem rename, so the destination file is
    always either the old complete version or the new complete version —
    never a partial one."""
    tmp_path = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)

def get_timestamp() -> str: return datetime.now(timezone.utc).isoformat()

def build_or_update_prov_graph(key: str, src: str, tgt: str, actor: str, ts: str, version: int, existing_graph: dict = None) -> dict:
    if not existing_graph or not isinstance(existing_graph, dict) or "@graph" not in existing_graph:
        existing_graph = {"@context": {"prov": "[http://www.w3.org/ns/prov#](http://www.w3.org/ns/prov#)", "xsd": "[http://www.w3.org/2001/XMLSchema#](http://www.w3.org/2001/XMLSchema#)", "actor": "prov:wasAssociatedWith", "generated_by": "prov:wasGeneratedBy", "used_source": "prov:used", "derived_from": "prov:wasDerivedFrom"}, "@graph": []}
    g_list = existing_graph["@graph"]
    agent_id = f"agent:{actor.replace(' ', '_').replace(':', '_').replace('[', '').replace(']', '')}"
    if not any(isinstance(node, dict) and node.get("@id") == agent_id for node in g_list):
        g_list.append({"@id": agent_id, "@type": "prov:Agent", "prov:label": f"Translation Engine Profile: {actor}"})
    activity_id = f"activity:translation-{key}-{ts}"
    g_list.append({"@id": activity_id, "@type": "prov:Activity", "prov:startTime": ts, "actor": {"@id": agent_id}})
    source_entity_id = f"entity:source-{key}"
    if not any(isinstance(node, dict) and node.get("@id") == source_entity_id for node in g_list):
        g_list.append({"@id": source_entity_id, "@type": "prov:Entity", "prov:value": str(src)})
    target_entity_id = f"entity:target-{key}-v{version}"
    target_node = {"@id": target_entity_id, "@type": "prov:Entity", "prov:value": str(tgt), "generated_by": {"@id": activity_id}, "used_source": {"@id": source_entity_id}}
    if version > 1: target_node["derived_from"] = {"@id": f"entity:target-{key}-v{version-1}"}
    g_list.append(target_node)
    return existing_graph

def parse_existing_xliff_with_prov(path: Path) -> dict:
    res = {"strings": {}, "global_prov": {"@context": {}, "@graph": []}}
    if not path.exists(): return res
    try:
        tree = ET.parse(path)
        root = tree.getroot()
        ns = {'xliff': 'urn:oasis:names:tc:xliff:document:1.2'}
        for tu in root.findall('.//xliff:trans-unit', ns):
            k = tu.get('id')
            note_el = tu.find('xliff:note', ns)
            n_txt = note_el.text if note_el is not None else ""
            v = 1
            if "Version: " in n_txt:
                try: v = int(n_txt.split("Version: ")[1].split()[0])
                except: pass
            # The actual status string (e.g. "needs_manual_translation"),
            # not just the "approved" yes/no attribute — write_xliff_prov_file
            # collapses every non-"approved" status to approved="no", so
            # "needs_manual_translation" and ordinary "pending_review" were
            # otherwise indistinguishable on the next run. Without this, a key
            # that got the English fallback saved after a failed retry looked
            # identical to a normal successful translation next run (its
            # saved value matches its source, same as any do-not-translate or
            # coincidentally-identical key) — is_new/text_changed both came
            # back False, so it was silently never retried again.
            status_txt = None
            if "Status: " in n_txt:
                try: status_txt = n_txt.split("Status: ")[1].split(" |")[0].strip()
                except: pass
            # Source text as of the last time this key was translated — used
            # to detect real English-text changes (see sync_pipeline) instead
            # of comparing the translation's current value to today's source.
            source_el = tu.find('xliff:source', ns)
            src_txt = source_el.text if source_el is not None and source_el.text is not None else None
            res["strings"][k] = {
                "version": v,
                "approved": tu.get("approved") == "yes",
                "source": src_txt,
                "status": status_txt,
            }
        m_el = root.find('.//xliff:meta[@type="provenance-graph"]', ns)
        if m_el is not None and m_el.text and m_el.text.strip():
            try:
                parsed_prov = json.loads(m_el.text.strip())
                if isinstance(parsed_prov, dict): res["global_prov"] = parsed_prov
            except json.JSONDecodeError: pass
    except Exception as e: print(f"⚠️  Parsing warning for XLIFF: {e}")
    return res

def write_xliff_prov_file(path: Path, lang: str, en_flat_strings: dict, target_flat_strings: dict, meta_tracking: dict, prov_graph: dict):
    # FIX (Bug 2): Register namespace so ElementTree uses it properly and
    # parse_existing_xliff_with_prov can find elements via the ns prefix.
    ET.register_namespace('', 'urn:oasis:names:tc:xliff:document:1.2')
    root = ET.Element("{urn:oasis:names:tc:xliff:document:1.2}xliff", version="1.2")
    file_el = ET.SubElement(root, "{urn:oasis:names:tc:xliff:document:1.2}file", {"source-language": SOURCE_LANG_CODE, "target-language": lang.lower(), "datatype": "plaintext", "original": f"{lang.lower()}.json"})
    header_el = ET.SubElement(file_el, "header")
    meta_group = ET.SubElement(header_el, "meta-group", category="w3c-prov-jsonld")
    meta_prov_node = ET.SubElement(meta_group, "meta", type="provenance-graph")
    meta_prov_node.text = str(json.dumps(prov_graph, ensure_ascii=False, indent=2)) if isinstance(prov_graph, dict) else "{}"
    body_el = ET.SubElement(file_el, "body")
    for k, src in en_flat_strings.items():
        tgt = target_flat_strings.get(k, "")
        m = meta_tracking.get(k, {"version": 1, "status": "new_translation"})
        tu = ET.SubElement(body_el, "trans-unit", {"id": k, "approved": "yes" if m["status"] == "approved" else "no"})
        ET.SubElement(tu, "source").text = str(src)
        ET.SubElement(tu, "target").text = str(tgt)
        ET.SubElement(tu, "note").text = str(f"Status: {m['status']} | Version: {m['version']}")
    raw_xml_bytes = ET.tostring(root, encoding="utf-8")
    try:
        parsed = minidom.parseString(raw_xml_bytes)
        with open(path, "w", encoding="utf-8") as f: f.write(parsed.toprettyxml(indent="  "))
    except Exception:
        with open(path, "wb") as f: f.write(b'<?xml version="1.0" encoding="utf-8"?>\n' + raw_xml_bytes)

# Directories under public/locales/ that exist but aren't real target locales.
SKIP_LOCALE_DIRS = {"en", "tu", "_tu_backup"}

# Safety-net names, used only if the `babel` package isn't installed or can't
# parse a given code. NOT meant to be maintained per-language — babel (see
# _resolve_language_name) covers virtually every real ISO 639-1 / BCP-47 code
# dynamically. Adding a language should never require touching this file.
_STATIC_FALLBACK_NAMES = {
    "es": "Spanish", "fr": "French", "de": "German", "ja": "Japanese",
    "ar": "Arabic", "he": "Hebrew", "it": "Italian", "zh": "Chinese",
    "tr": "Turkish", "pt-br": "Portuguese", "ko": "Korean",
}

try:
    from babel import Locale as _BabelLocale
    _HAS_BABEL = True
except ImportError:
    _HAS_BABEL = False
    print("⚠️  'babel' not installed (pip install babel) — falling back to a small "
          "static language-name list for the translation prompt. Install babel so "
          "new locale codes resolve automatically.")


def _resolve_language_name(code: str) -> str:
    """Resolve an ISO/BCP-47 locale code ('ko', 'pt-BR', 'zh-TW', ...) to its
    English display name for the translation prompt. Uses babel when available
    (covers essentially any real code with no maintenance); falls back to the
    small static list, then to the raw uppercased code if all else fails."""
    if _HAS_BABEL:
        try:
            display_name = _BabelLocale.parse(code, sep='-').get_display_name('en')
            if display_name:
                return display_name
        except Exception:
            pass
    return _STATIC_FALLBACK_NAMES.get(code.lower(), code.upper())


def get_target_languages() -> list[str]:
    """
    The trigger for "this is a locale we support" is a SUBDIRECTORY under
    public/locales/ (e.g. public/locales/ko/) — matching what sync_locales.py
    already requires to exist before it'll distribute translations into it.
    Adding a new language is therefore just: create the folder.

    If a locale folder exists with no matching flat {code}.json seed file yet
    (the file translate_sync.py actually writes translations into), one is
    created automatically here. Language names are resolved dynamically
    (see _resolve_language_name) instead of a hardcoded map.
    """
    languages = []
    if not LOCALES_DIR.exists(): return languages
    for entry in sorted(LOCALES_DIR.iterdir()):
        if not entry.is_dir():
            continue
        code = entry.name
        if code.lower() in SKIP_LOCALE_DIRS:
            continue
        json_path = LOCALES_DIR / f"{code}.json"
        if not json_path.exists():
            json_path.write_text("{}\n", encoding="utf-8")
            print(f"🆕 New locale folder detected: {code}/ — created {json_path.name} to seed it")
        languages.append((code, _resolve_language_name(code)))
    return languages

# =====================================================================
# INTERACTIVE SETUP WIZARD
# =====================================================================
def run_interactive_wizard() -> tuple[str, str, str, str, bool]:
    print("=" * 60)
    print("🌐  Peripateticware Advanced Localization Wizard")
    print("=" * 60)
    
    print("🤖  Select your active Translation Provider engine:")
    engines = ["OLLAMA", "CLAUDE", "GEMINI", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"]
    for idx, eng in enumerate(engines, start=1):
        label = eng + " (Classic Translation Engine)" if "DEEPL" in eng or "GOOGLE" in eng or "MICROSOFT" in eng else eng + " (Generative LLM Model)"
        print(f"  [{idx}] {label}")
        
    eng_choice = input("👉 Enter provider number (1-6) [default: OLLAMA]: ").strip()
    provider = engines[int(eng_choice) - 1] if (eng_choice.isdigit() and 1 <= int(eng_choice) <= 6) else "OLLAMA"

    print("\n🔄  Select translation execution mode:")
    print("  [1] Incremental Sync (Skip already translated keys) [Recommended]")
    print("  [2] Clean Reset (Wipe existing target locale keys and translate everything from scratch)")
    exec_choice = input("👉 Enter choice number (1-2) [default: 1]: ").strip()
    reset_languages = True if exec_choice == "2" else False

    print("\n📦  Select translation orchestration mode:")
    print("  [1] Smart Scalpel Mode (Dynamic Routing based on key namespaces & text length) [Recommended]")
    print("  [2] Global Override Machete Mode (Apply one style to all strings)")
    orch_choice = input("👉 Enter choice number (1-2) [default: 1]: ").strip()
    
    if orch_choice == "2":
        mode = "MACHETE"
        print("\n📦  What type of material are you currently processing?")
        content_types = [
            "Application UI Strings (Keys, Labels, Placeholders)",
            "Marketing Content (Landing Pages, Features, Testimonials)",
            "Legal & Policy Documentation (Privacy Page, COPPA, FERPA)",
            "General Content Assets"
        ]
        for idx, c_type in enumerate(content_types, start=1):
            print(f"  [{idx}] {c_type}")
        ct_choice = input("👉 Enter choice number (1-4) [default: 1]: ").strip()
        content_type = content_types[int(ct_choice) - 1] if (ct_choice.isdigit() and 1 <= int(ct_choice) <= 4) else content_types[0]

        print("\n🎭  Select required translation style layout configuration:")
        styles = [
            "Concise & Accurate (UI/UX) [Temperature: 0.0 - Strictly Literal]",
            "Balanced Translation [Temperature: 0.3 - Natural & Safe]",
            "Creative & Fluent (Marketing) [Temperature: 0.6 - Highly Idiomatic]",
            "Technical Precision (Documentation) [Temperature: 0.1 - Rigid Engineering Context]"
        ]
        for idx, st in enumerate(styles, start=1):
            print(f"  [{idx}] {st}")
        st_choice = input("👉 Enter style number (1-4) [default: 2]: ").strip()
        style = styles[int(st_choice) - 1].split(" [")[0] if (st_choice.isdigit() and 1 <= int(st_choice) <= 4) else styles[1].split(" [")[0]
    else:
        mode = "SCALPEL"
        content_type = "Dynamic Routing"
        style = "Dynamic Pacing"

    print("\n" + "-" * 60)
    return provider, content_type, style, mode, reset_languages

def sync_pipeline():
    init_debug_log()
    print(f"🪵  Suspect-translation details will be logged to: {DEBUG_LOG_PATH}")

    # Setup argparse to allow command-line automation and reset flags
    parser = argparse.ArgumentParser(description="Peripateticware Advanced Localization & Reset Wizard")
    parser.add_argument("--reset", action="store_true", help="Clean reset: wipes existing target translations and re-translates from scratch")
    parser.add_argument("--provider", type=str, choices=["OLLAMA", "CLAUDE", "GEMINI", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"], help="Translation provider engine")
    parser.add_argument("--mode", type=str, choices=["SCALPEL", "MACHETE"], help="Orchestration mode")
    parser.add_argument("--content-type", type=str, help="Content type for Machete mode")
    parser.add_argument("--style", type=str, help="Style configuration for Machete mode")
    parser.add_argument("--non-interactive", action="store_true", help="Skip the interactive setup wizard")
    parser.add_argument("--languages", type=str, default=None,
                         help="Comma-separated locale codes to restrict this run to (e.g. "
                              "'ja,pt-BR,tr,zh'). Matched case-insensitively against the "
                              "locale folder names under public/locales/. Defaults to every "
                              "locale folder found (previous behavior) when omitted.")

    args, unknown = parser.parse_known_args()
    
    # Determine if we open the interactive menu or use command-line defaults
    if args.non_interactive or (args.reset and (args.provider or args.mode)):
        provider = args.provider or "OLLAMA"
        mode = args.mode or "SCALPEL"
        content_type = args.content_type or "Dynamic Routing"
        style = args.style or "Dynamic Pacing"
        reset_languages = args.reset
    else:
        # Open the interactive menu
        provider, content_type, style, mode, reset_languages = run_interactive_wizard()

    try:
        engine = UniversalOrchestrator(provider, content_type, style)
    except Exception as e:
        print(f"❌ Core engine initialization error: {e}")
        return

    en_full = load_json(LOCALES_DIR / "en.json")
    en_nested = en_full.get("landing", {})
    if not en_nested:
        print("❌ Error: en.json 'landing' namespace is missing or empty.")
        return

    en_strings = flatten_json(en_nested)
    target_langs = get_target_languages()

    # Restrict to a specific subset of locales for this run (e.g. resuming
    # only the languages that haven't been done yet, without re-touching
    # locales that are already complete or intentionally left for later).
    # Everything downstream — the incremental delta detection, XLIFF
    # provenance history, do-not-translate locking — is untouched, so a
    # filtered run behaves exactly like a full run scoped to fewer folders.
    if args.languages:
        requested = [c.strip() for c in args.languages.split(",") if c.strip()]
        requested_lower = {c.lower() for c in requested}
        matched = [(code, name) for code, name in target_langs if code.lower() in requested_lower]
        matched_lower = {code.lower() for code, _ in matched}
        missing = [c for c in requested if c.lower() not in matched_lower]
        if missing:
            print(f"⚠️  --languages requested locale(s) with no matching folder under "
                  f"public/locales/, skipping: {', '.join(missing)}")
        if not matched:
            print("❌ None of the requested --languages match an existing locale folder. Nothing to do.")
            return
        target_langs = matched
        print(f"🎯 Restricting this run to: {', '.join(f'{c} ({n})' for c, n in target_langs)}")

    print(f"🚀 Launching Production Pipeline via: {engine.get_method_string()}\n")

    # --- TELEMETRY ACCUMULATORS ---
    grand_total_characters = 0
    locale_telemetry_report = {}

    for lang_code, lang_name in target_langs:
        # New flat structure: public/locales/fr.json (merged namespaces file)
        # XLF lives alongside: public/locales/fr.xlf
        json_path = LOCALES_DIR / f"{lang_code}.json"
        xlf_path  = LOCALES_DIR / f"{lang_code}.xlf"

        # Load or reset locale targets defensively
        if reset_languages:
            target_json = {}
            xlf_dataset = {"strings": {}, "global_prov": {"@context": {}, "@graph": []}}
            print(f"🧹 Clean Reset: Wiped previous target translations and provenance dataset for: [{lang_code}] ({lang_name})")
        else:
            # Read only the 'landing' namespace from the merged file
            full_merged = load_json(json_path)
            target_json = flatten_json(full_merged.get("landing", {}))
            xlf_dataset = parse_existing_xliff_with_prov(xlf_path)
            
        global_prov = xlf_dataset["global_prov"]
        historical_strings = xlf_dataset["strings"]
        meta_tracking = {}

        locale_character_count = 0
        delta_keys = []
        delta_texts = []

        # Regional-variant fallback (e.g. fr-CA falls back to fr, pt-BR-style
        # variants to pt, zh-TW to zh): i18next's own fallbackLng chain (see
        # frontend/src/config/i18n.ts) already resolves a missing key in a
        # variant locale by looking it up in its base language at runtime.
        # So the pipeline's job here is NOT to copy the base language's text
        # into the variant's file — that would duplicate ~everything on disk
        # and in the bundle, and freeze it stale the moment the base locale's
        # translation is later improved. Instead: any key the base locale
        # already covers is simply left OUT of the variant's saved file
        # entirely, so it's resolved live via the fallback chain. Only keys
        # missing from BOTH the variant and its base are genuinely new and
        # get machine-translated — and any key the variant already has its
        # own explicit value for (a real region-specific override, whether
        # hand-edited or from a prior run) is always preserved untouched.
        base_lang_code = lang_code.split('-')[0] if '-' in lang_code else None
        base_target_json = {}
        if base_lang_code and base_lang_code != lang_code:
            base_json_path = LOCALES_DIR / f"{base_lang_code}.json"
            if base_json_path.exists():
                base_target_json = flatten_json(load_json(base_json_path).get("landing", {}))

        deferred_to_fallback_count = 0
        legacy_no_source_count = 0
        retry_from_failure_count = 0
        suspect_count = 0
        fixed_on_retry_count = 0
        still_bad_count = 0
        placeholder_default = lambda key: key.split('.')[-1].replace('_', ' ')

        # Step 1: Filter out the translation delta to process
        locked_count = 0
        for k, src in en_strings.items():
            # Do-not-translate enforcement (brand name, legal acronyms, demo
            # emails, testimonial/team-name fields, Terms & Conditions) — see
            # frontend/src/constants/i18n-do-not-translate.md. Copied verbatim,
            # never sent to the LLM, in every locale.
            if is_do_not_translate(k, src):
                if target_json.get(k) != src:
                    target_json[k] = src
                    locked_count += 1
                meta_tracking[k] = {
                    "version": historical_strings.get(k, {}).get("version", 1),
                    "status": "locked_do_not_translate",
                }
                continue

            current_target_val = target_json.get(k, "")
            is_new = k not in target_json or current_target_val == "" or current_target_val == placeholder_default(k)

            # A key needs re-translation when the ENGLISH SOURCE TEXT it was
            # translated from has changed — not when the existing translation
            # happens to read the same as the English text. That second
            # condition is common and legitimate (brand names, numbers, short
            # cognates, acronyms), and comparing against it flagged those keys
            # as "changed" and re-sent them to the LLM on every single run,
            # forever, even with zero real edits. Compare instead against the
            # source text recorded in the XLIFF the last time this key was
            # translated (see parse_existing_xliff_with_prov).
            hist = historical_strings.get(k)
            if is_new:
                text_changed = False
            elif hist is not None and hist.get("source") is not None:
                text_changed = hist["source"] != src
            else:
                # No recorded source (XLIFF predates this tracking, or the
                # key was added by hand outside the pipeline). Can't tell if
                # the source changed, so don't force a retranslation on a
                # guess — this run records its source and future runs will
                # track real changes correctly from here on.
                text_changed = False
                legacy_no_source_count += 1

            # A key left as the English fallback last run (both the batch and
            # single-retry translations failed validation) has a saved value
            # identical to its source — so is_new and text_changed both come
            # back False forever unless we also check the recorded status.
            # Without this, a key that failed once was silently never retried
            # again on any future run, incremental or reset.
            needs_retry_from_last_run = hist is not None and hist.get("status") == "needs_manual_translation"
            if needs_retry_from_last_run:
                retry_from_failure_count += 1

            if (is_new or text_changed or needs_retry_from_last_run) and base_target_json:
                base_val = base_target_json.get(k, "")
                base_is_usable = bool(base_val) and base_val != src and base_val != placeholder_default(k)
                if base_is_usable:
                    # Base locale already covers this key — defer to the
                    # runtime fallback chain instead of translating or
                    # copying. Remove any stale placeholder that may already
                    # be sitting in target_json (e.g. from before this
                    # locale had a base to fall back to) so it doesn't get
                    # written out and shadow the fallback.
                    target_json.pop(k, None)
                    deferred_to_fallback_count += 1
                    meta_tracking[k] = {
                        "version": historical_strings.get(k, {}).get("version", 0) + 1,
                        "status": f"fallback_to_{base_lang_code}",
                    }
                    continue

            if is_new or text_changed or needs_retry_from_last_run:
                delta_keys.append(k)
                delta_texts.append(str(src))

                # Add source length to the character counter
                string_length = len(str(src))
                locale_character_count += string_length
                grand_total_characters += string_length
                meta_tracking[k] = {
                    "version": historical_strings.get(k, {}).get("version", 0) + 1,
                    "status": "new_translation" if is_new else "pending_review",
                }
            else:
                meta_tracking[k] = {"version": historical_strings.get(k, {}).get("version", 1), "status": "approved" if historical_strings.get(k, {}).get("approved") else "pending_review"}

        if deferred_to_fallback_count:
            print(f"  \U0001f501 [{lang_code}] {deferred_to_fallback_count} key(s) left out of the saved "
                  f"file — resolved at runtime via the fallback chain to '{base_lang_code}' "
                  f"(see i18n.ts). No LLM call, no duplication. To make one of these keys "
                  f"read differently in {lang_code}, add it explicitly to {lang_code}.json — "
                  f"future runs will preserve that override.")

        if legacy_no_source_count:
            print(f"  ℹ️  [{lang_code}] {legacy_no_source_count} key(s) had no recorded source text "
                  f"(XLIFF predates source-change tracking) — left untouched this run; source-text "
                  f"changes will be detected correctly for them from now on.")

        if locked_count:
            print(f"  🔒 [{lang_code}] {locked_count} do-not-translate key(s) locked to the English "
                  f"source (brand name, legal acronyms, demo emails, testimonials, Terms & Conditions).")

        if retry_from_failure_count:
            print(f"  \U0001f504 [{lang_code}] {retry_from_failure_count} key(s) previously marked "
                  f"'needs_manual_translation' (failed validation last run) queued for another attempt.")

        # Step 2: Translate in grouped batches to eliminate rate-limiting
        if delta_keys:
            # Group keys by their dynamically derived style configurations in Scalpel Mode
            grouped_deltas = {}  # (cat_name, style_inst, temp) -> list of (key, text)
            
            for key, text in zip(delta_keys, delta_texts):
                if mode == "SCALPEL":
                    cat, inst, temp = classify_key_and_get_config(key, text)
                else:
                    cat = content_type
                    inst = engine._get_style_instruction(style)
                    temp = engine._get_temperature(style)
                    
                cfg_key = (cat, inst, temp)
                if cfg_key not in grouped_deltas:
                    grouped_deltas[cfg_key] = []
                grouped_deltas[cfg_key].append((key, text))
            
            # Translate each classified group sequentially
            for (cat, inst, temp), items in grouped_deltas.items():
                group_keys = [item[0] for item in items]
                group_texts = [item[1] for item in items]
                
                print(f"⏳ Target [{lang_code}] ({lang_name}) - Category: '{cat}' (Temp: {temp}) - {len(group_keys)} keys...")
                
                # Update orchestrator overrides dynamically for this batch
                engine.set_dynamic_override(cat, inst, temp)
                
                # Determine batch size dynamically based on provider type to prevent LLM alignment errors
                # OLLAMA uses 5 (not 10) — local models truncate output on long/dense batches
                batch_size = 5 if engine.provider == "OLLAMA" else (10 if engine.provider in ["CLAUDE", "GEMINI"] else 50)
                translated_results = []
                
                for i in range(0, len(group_keys), batch_size):
                    batch_keys = group_keys[i:i + batch_size]
                    batch_texts = group_texts[i:i + batch_size]
                    
                    try:
                        ts = get_timestamp()
                        print(f"   📦 Sending batch {i // batch_size + 1} ({len(batch_texts)} keys)...")
                        
                        batch_translations = engine.translate_batch(batch_texts, lang_name, lang_code)
                        translated_results.extend(batch_translations)
                        
                        # Update XLIFF metadata inline for this batch
                        for idx, key in enumerate(batch_keys):
                            if idx < len(batch_translations):
                                tgt = batch_translations[idx]
                                v = meta_tracking[key]["version"]
                                global_prov = build_or_update_prov_graph(key, batch_texts[idx], tgt, engine.get_method_string(), ts, v, global_prov)
                    except Exception as e:
                        print(f"   ❌ Batch translation error: {e}")
                        # Fill failed translations with fallback empty text so alignment doesn't break
                        translated_results.extend([""] * len(batch_texts))
                
                # Map translated strings back into the localized JSON tracking
                # dictionary — but validate each one first. This is the fix for
                # the corruption found in production locale files: ANSI escape
                # codes and hallucinated chatter leaking in from the Ollama CLI
                # fallback, non-string JSON values silently str()-coerced
                # ("False" showing up as literal card text), and — the exact
                # cause of the Japanese "Meet Peri" modal showing Spanish and
                # English lines — a translation landing in entirely the wrong
                # script with nothing checking it before it was saved.
                for idx, key in enumerate(group_keys):
                    if idx >= len(translated_results):
                        continue
                    original_src = group_texts[idx]
                    raw_output = translated_results[idx]
                    candidate = strip_control_sequences(raw_output) \
                        if isinstance(raw_output, str) else raw_output

                    reasons = bad_reasons(candidate, original_src, lang_code)
                    if reasons:
                        suspect_count += 1
                        raw_retry = engine.retry_call(
                            lambda: engine.translate_single(original_src, lang_name, lang_code)
                        )
                        retried = strip_control_sequences(raw_retry) if isinstance(raw_retry, str) else raw_retry
                        retry_reasons = bad_reasons(retried, original_src, lang_code)

                        if not retry_reasons:
                            candidate = retried
                            fixed_on_retry_count += 1
                            final_status = "fixed_on_retry"
                        else:
                            candidate = original_src
                            meta_tracking[key]["status"] = "needs_manual_translation"
                            still_bad_count += 1
                            final_status = "left_as_english_fallback"

                        log_suspect_translation(
                            lang_code, key, original_src, raw_output, reasons,
                            raw_retry=raw_retry, retry_reasons=retry_reasons,
                            final_status=final_status,
                        )

                    target_json[key] = candidate

        if suspect_count:
            print(f"  🔎 [{lang_code}] {suspect_count} suspect translation(s) caught — "
                  f"{fixed_on_retry_count} fixed on single-string retry, "
                  f"{still_bad_count} left as English fallback (needs manual translation). "
                  f"Raw model output for all of these: {DEBUG_LOG_PATH}")

        # Step 3: Prune stale keys (keys in target that no longer exist in English source)
        stale = [k for k in target_json if k not in en_strings]
        if stale:
            print(f"\n  ⚠️  WARNING [{lang_code}]: {len(stale)} stale key(s) will be removed from the build.")
            print(f"      These keys exist in the translation but not in the English source.")
            print(f"      Removing them means those strings will fall back to English at runtime.")
            for k in stale:
                print(f"        - {k}")
            for k in stale:
                del target_json[k]

        # Save — update only the 'landing' namespace in the merged file
        full_merged = load_json(json_path) if json_path.exists() else {}
        full_merged["landing"] = unflatten_json(target_json)
        save_json(json_path, full_merged)
        write_xliff_prov_file(xlf_path, lang_code, en_strings, target_json, meta_tracking, global_prov)
        
        # Save results for final metrics telemetry
        locale_telemetry_report[lang_name] = locale_character_count
        
    # --- FINAL METRIC ANALYTICS REPORT ---
    print("\n" + "=" * 60)
    print("\n" + "=" * 60)
    print("\U0001f4ca FINAL EXECUTION LOCALIZATION TELEMETRY REPORT")
    print("=" * 60)
    print(f"Engine Architecture utilized: {engine.get_method_string()}")
    print(f"Total billing-eligible characters handled across the complete call: {grand_total_characters:,} characters")
    print("\nBreakdown Per Target Locale Workspace:")
    for loc_name, loc_count in locale_telemetry_report.items():
        print(f"  \u2022 {loc_name.ljust(15)} : {loc_count:,} characters out to translation network")
    print("=" * 60)
    print("\n\U0001f3c1 Translation and provenance synchronization complete.")

    # Auto-chain: distribute root flat translations into i18next namespace subdirectories.
    # Only keys that differ from English are written (override pattern — no duplication).
    print("\n\U0001f504 Running namespace sync...")
    try:
        _sync_namespaces(locales_dir=LOCALES_DIR)
    except Exception as e:
        print(f"  WARNING: Namespace sync failed: {e}")
        print("  Run manually: python3 scripts/sync_locales.py")

if __name__ == "__main__":
    sync_pipeline()
