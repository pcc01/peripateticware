#!/usr/bin/env python3
# frontend/scripts/qa_review_llamacpp.py
#
# Offline, file-based localization QA reviewer — stage 1 of the improved loop.
#
# Reads every (en, target) string pair straight from the locale FILES (no
# running app, no Playwright), scores translation quality with Unbabel's
# TowerInstruct-7B-v0.1 (Q4_K_M GGUF), and writes a RANKED report of ALL
# keys — worst first, across all locales — to
# frontend/qa/retranslation_keys_<ts>.json (+ a human-readable .md twin).
#
# IMPORTANT: this report contains every reviewed key with its score. It does
# NOT apply a cutoff — the retranslation cutoff is chosen later, at API time,
# via retranslate_mt.py --score-threshold. Review once, translate many.
#
# BACKENDS (env TOWER_BACKEND or --backend: auto | llamacpp | ollama):
#   auto     (default) use llama-cpp-python if it imports cleanly, otherwise
#            fall back to the local Ollama server — the same TowerInstruct
#            Q4_K_M tag the crawler already uses, so scores stay comparable.
#            (llama-cpp-python's prebuilt CUDA wheels on Windows need CUDA
#            runtime DLLs that are fiddly to satisfy; Ollama bundles its own
#            CUDA and just works on the same GPU.)
#   llamacpp force llama-cpp-python (error if unusable)
#   ollama   force Ollama at TOWER_OLLAMA_URL (default http://localhost:11434)
#            with model TOWER_OLLAMA_MODEL
#            (default hf.co/s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF:Q4_K_M)
#
# Because keys are read from files (not scraped off rendered pages), each
# report item is already addressed as (locale, namespace, key) — the fragile
# display-string reverse index retranslate_flagged.py needs is unnecessary.
# The Playwright crawler (localization_qa_crawler.py) stays alive alongside
# this: its DOM diff is still the only detector for hardcoded strings that
# were never wrapped in t().
#
# SCORING (0-100):
#   Deterministic pre-checks (free, no model call) set floor scores:
#     0   untranslated        target missing or byte-identical to English
#     0   placeholder_broken  {{var}} / %s / $t(...) lost or mutated
#     0   garbage_pattern     stringified bools/arrays, token spam, absurd length
#     5   wrong_script        ja/zh/ko/ar/he translation with no expected-script chars
#     5   email_altered       embedded demo/contact email mutated
#   Surviving pairs go to TowerInstruct with the same error-span QE prompt the
#   crawler uses (proven with this exact model), asking for severities:
#     score = max(0, 100 - 25*critical - 10*major - 3*minor)
#     "NO ERRORS FOUND" -> 100
#   Unparseable twice -> score = null, needs_review: true (never silently
#   flagged or passed).
#
# MODEL (12 GB VRAM available -> full GPU offload by default):
#   TOWER_GGUF_REPO    default "s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF"
#                      ("Unbabel/TowerInstruct-7B-v0.1-GGUF" does not exist on
#                      Hugging Face — quants are third-party)
#   TOWER_GGUF_FILE    default: auto-pick the Q4_K_M file from the repo
#   TOWER_N_GPU_LAYERS default -1 (everything on GPU; set 0 for CPU-only)
#   TOWER_N_CTX        default 2048
#   (llama-cpp backend only — Ollama manages its own GPU offload.)
#
# USAGE:
#   python scripts/qa_review_llamacpp.py                       # everything
#   python scripts/qa_review_llamacpp.py --locales it --max-keys 20   # smoke test
#   python scripts/qa_review_llamacpp.py --backend ollama --locales ja,ar
#   python scripts/qa_review_llamacpp.py --no-llm              # deterministic checks only (instant)
#
# The report file is (re)written after EVERY locale, so a multi-hour run that
# dies at locale 9 of 12 still leaves a usable ranked report for 1-8.

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from translate_sync import (
    flatten_json,
    load_json,
    has_expected_script,
    looks_like_garbage,
    email_addresses_preserved,
    is_do_not_translate,
    _resolve_language_name,
    SKIP_LOCALE_DIRS,
    required_plural_categories,
    PLURAL_SUFFIX_RE,
    cldr_capitalization_issues,
)
from retranslate_flagged import NS_MAP

FRONTEND_DIR = Path(__file__).parent.parent
LOCALES_DIR = FRONTEND_DIR / "public" / "locales"
QA_DIR = FRONTEND_DIR / "qa"

SCORE_WEIGHTS = {"critical": 25, "major": 10, "minor": 3}

TOWER_BACKEND = os.getenv("TOWER_BACKEND", "auto")  # auto | llamacpp | ollama
TOWER_GGUF_REPO = os.getenv("TOWER_GGUF_REPO", "s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF")
TOWER_GGUF_FILE = os.getenv("TOWER_GGUF_FILE", "")  # empty = auto-pick Q4_K_M from the repo
TOWER_N_GPU_LAYERS = int(os.getenv("TOWER_N_GPU_LAYERS", "-1"))
TOWER_N_CTX = int(os.getenv("TOWER_N_CTX", "2048"))
TOWER_OLLAMA_URL = os.getenv("TOWER_OLLAMA_URL", "http://localhost:11434")
# Same tag the crawler's DEFAULT_MODEL uses — identical weights and quant.
TOWER_OLLAMA_MODEL = os.getenv("TOWER_OLLAMA_MODEL",
                               "hf.co/s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF:Q4_K_M")

# Namespace priority for tie-breaking equal scores: landing is public-facing
# marketing surface, so it wins budget first.
NS_PRIORITY = {"landing": 0, "common": 1, "curriculum": 2, "student": 3, "teacher": 4}

# Template-variable syntaxes the system prompt tells every engine to preserve.
PLACEHOLDER_RE = re.compile(r"\{\{[^}]*\}\}|\{[^{}]+\}|%[sd]|\$t\([^)]*\)")

# ─── Do-not-translate enforcement ───────────────────────────────────────────
# Mirrors frontend/src/constants/i18n-do-not-translate.md (the pipeline's
# source of truth), which is BROADER than translate_sync.is_do_not_translate's
# key-based checks: it also locks VALUES regardless of which key holds them —
# the product name, legal/regulatory acronyms, external brands, technical
# proper nouns, and the AI guide's name. A locale value equal to one of these
# is CORRECT ENGLISH-EVERYWHERE content, not a missed translation; a locale
# value that DIFFERS is a real bug (the "Peripatetische Ware" class of
# corruption) and is flagged as dnt_violation for restoration.
LOCKED_EN_VALUES = {
    # §1/§7 product name
    "Peripateticware",
    # §2 legal/regulatory acronyms (standalone card titles / badges)
    "FERPA", "COPPA", "GDPR", "CCPA", "PIPEDA", "LGPD", "PDPA", "SOC 2", "APP",
    # §4 external brands / license names / the AI guide's name
    "Google", "Apple", "McGraw-Hill Education",
    "Apache 2.0", "Business Source License 1.1", "BSL 1.1", "Peri",
    # §5 technical proper nouns
    "API", "GPS", "UUID", "JSON", "HTTP", "HTTPS", "LMS", "EdTech",
    # §8 added 2026-07-12: found permanently stuck in mt_retranslation_log —
    # a real MT engine correctly leaves these unchanged in every locale
    # (stack/tooling name, named instructional framework), so the blanket
    # "identical-to-English = untranslated" check was flagging them score 0
    # forever and re-spending MT budget on them every single run with no
    # possible passing outcome.
    "PostgreSQL 16 + pgvector", "Marzano",
}


def locked_value(en_text: str) -> bool:
    return en_text.strip() in LOCKED_EN_VALUES


def extract_placeholders(text: str) -> list[str]:
    return PLACEHOLDER_RE.findall(text or "")


def looks_intentionally_unchanged(text: str) -> bool:
    """Same spirit as the crawler's check: byte-identical values that are
    legitimately identical in every locale, not missed translations."""
    t = (text or "").strip()
    if not t or not any(c.isalpha() for c in t):
        return True  # pure numbers/emoji/punctuation
    if re.match(r"^https?://", t) or ("@" in t and "." in t and " " not in t):
        return True  # URL or bare email
    if len(t) <= 2:
        return True  # single letters/icons
    return False


# ─── Deterministic pre-checks (free — run before any model call) ────────────
# Three tiers, modeled on standard localization-QA check suites:
#   HARD (score 0):        untranslated, garbage, broken template placeholders
#   STRUCTURAL (5-10):     wrong script, altered emails/URLs/timezone IDs,
#                          HTML tag mismatch, missing numbers, truncation
#   COSMETIC/CLDR (85):    whitespace, newlines, terminal punctuation,
#                          capitalization conventions, number-format
#                          separators, date order, imperial units
# Cosmetic issues score 85 so they sit above the usual 80 cutoff — raise the
# threshold past 85 when you want a run that also sweeps convention fixes.

_CJK_BASES = {"ja", "zh", "ko"}
_HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
_URL_RE = re.compile(r"https?://[^\s\"'<>]+")
_TZID_RE = re.compile(r"\b(?:America|Europe|Asia|Africa|Australia|Pacific|Atlantic|Indian|Etc)/[A-Za-z_+\-]+\b")
_DIGIT_RUN_RE = re.compile(r"\d+")
_EASTERN_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_DECIMAL_NUM_RE = re.compile(r"\d+\.\d+")
_GROUPED_NUM_RE = re.compile(r"\d{1,3}(?:,\d{3})+")
_DATE_TOKEN_RE = re.compile(r"\bMM?/DD?(?:/Y{2,4})?\b")
_AMBIG_DATE_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})/\d{2,4}\b")
_IMPERIAL_RE = re.compile(
    r"(?<!\w)(miles?|mph|lbs?|pounds?|ounces?|oz|inch(?:es)?|feet|foot|yards?|"
    r"°F|Fahrenheit|acres?|gallons?)(?!\w)", re.IGNORECASE)
# Wrong-script contamination in Latin-script locales (reverse of
# has_expected_script): CJK / Hangul / Arabic / Hebrew / Cyrillic blocks.
_NONLATIN_RANGES = [(0x0400, 0x04FF), (0x0590, 0x05FF), (0x0600, 0x06FF),
                    (0x3040, 0x30FF), (0x4E00, 0x9FFF), (0xAC00, 0xD7A3)]
_END_PUNCT_CLASSES = [{".", "。", "۔"}, {"?", "؟", "？"}, {"!", "！"}, {":", "："}]


def _locale_number_symbols(locale: str) -> tuple[str, str]:
    try:
        from babel import Locale as _BL
        syms = _BL.parse(locale.replace("-", "_")).number_symbols
        if "decimal" not in syms and "latn" in syms:  # babel >= 2.15 shape
            syms = syms["latn"]
        return syms.get("decimal", "."), syms.get("group", ",")
    except Exception:
        return ".", ","


def _locale_day_first(locale: str) -> bool | None:
    try:
        from babel import Locale as _BL
        p = _BL.parse(locale.replace("-", "_")).date_formats["short"].pattern
        return p.index("d") < p.index("M")
    except Exception:
        return None


def _end_punct_class(text: str) -> int | None:
    t = text.rstrip().rstrip("\"'»«”“’‘)]}‎‏")
    if not t:
        return None
    if t.endswith("...") or t.endswith("…"):
        return 99
    for i, cls in enumerate(_END_PUNCT_CLASSES):
        if t[-1] in cls:
            return i
    return None


def deterministic_score(en_text: str, target_text, locale: str) -> tuple[int | None, list[str]]:
    """Returns (floor_score, reasons) when a free check already decides the
    verdict, or (None, []) when the pair needs the LLM's judgment."""
    if target_text is None or (isinstance(target_text, str) and target_text.strip() == ""):
        return 0, ["untranslated"]
    if not isinstance(target_text, str):
        return 0, ["garbage_pattern"]
    if target_text == en_text:
        return 0, ["untranslated"]

    src_ph = extract_placeholders(en_text)
    if src_ph and any(ph not in target_text for ph in src_ph):
        return 0, ["placeholder_broken"]
    if looks_like_garbage(target_text, en_text):
        return 0, ["garbage_pattern"]

    base = locale.split("-")[0].lower()
    tgt_norm = target_text.translate(_EASTERN_DIGITS)
    structural: list[tuple[int, str]] = []

    if not has_expected_script(target_text, locale):
        structural.append((5, "wrong_script"))
    if base not in ("ja", "zh", "ko", "ar", "he"):
        foreign = sum(1 for c in target_text
                      if any(lo <= ord(c) <= hi for lo, hi in _NONLATIN_RANGES))
        if foreign > 2:
            structural.append((5, "wrong_script"))
    if not email_addresses_preserved(en_text, target_text):
        structural.append((5, "email_altered"))
    if any(url not in target_text for url in _URL_RE.findall(en_text)):
        structural.append((5, "url_altered"))
    if any(tz not in target_text for tz in _TZID_RE.findall(en_text)):
        structural.append((5, "timezone_id_altered"))
    if sorted(_HTML_TAG_RE.findall(en_text)) != sorted(_HTML_TAG_RE.findall(target_text)):
        structural.append((10, "html_tag_mismatch"))
    # Numbers compared as digit runs, so "1,000" == "1.000" == "1 000" — a
    # correctly RE-FORMATTED number is not a mismatch, a MISSING one is.
    src_runs = _DIGIT_RUN_RE.findall(en_text)
    tgt_runs = _DIGIT_RUN_RE.findall(tgt_norm)
    if src_runs:
        remaining = list(tgt_runs)
        for run in src_runs:
            if run in remaining:
                remaining.remove(run)
            else:
                structural.append((10, "number_mismatch"))
                break
    if base not in _CJK_BASES and len(en_text) >= 30 and \
            len(target_text.strip()) < max(4, int(0.15 * len(en_text))):
        structural.append((10, "suspicious_truncation"))

    if structural:
        return min(s for s, _ in structural), sorted({r for _, r in structural})

    # ── Cosmetic / CLDR-convention tier ──
    cosmetic: list[str] = []
    if (en_text[:1].isspace() != target_text[:1].isspace()) or \
       (en_text[-1:].isspace() != target_text[-1:].isspace()):
        cosmetic.append("whitespace_mismatch")
    if en_text.count("\n") != target_text.count("\n"):
        cosmetic.append("newline_count_mismatch")
    if _end_punct_class(en_text) != _end_punct_class(target_text):
        cosmetic.append("end_punctuation_mismatch")
    cosmetic += cldr_capitalization_issues(en_text, target_text, locale)

    # Locale number-format conventions (CLDR separators via babel): a decimal
    # or grouped number copied verbatim into a locale with different symbols.
    dec, grp = _locale_number_symbols(locale)
    if dec == ",":
        if any(m in target_text for m in _DECIMAL_NUM_RE.findall(en_text)):
            cosmetic.append("number_format_convention")
    if grp != ",":
        if any(m in target_text for m in _GROUPED_NUM_RE.findall(en_text)):
            cosmetic.append("number_format_convention")

    # Calendar conventions: US month-first date tokens/dates surviving into a
    # day-first locale.
    if _locale_day_first(locale):
        if _DATE_TOKEN_RE.search(target_text):
            cosmetic.append("date_order_convention")
        else:
            for m, d in _AMBIG_DATE_RE.findall(target_text):
                if int(m) <= 12 and int(d) > 12:  # unambiguously month-first
                    cosmetic.append("date_order_convention")
                    break

    # Unit system: imperial units surviving into (all-metric) target locales —
    # flagged for review, conversion needs a human/LLM decision.
    if _IMPERIAL_RE.search(target_text):
        cosmetic.append("unit_system_review")

    if cosmetic:
        return 85, sorted(set(cosmetic))

    return None, []


# ─── TowerInstruct evaluation ────────────────────────────────────────────────

def build_qe_prompt(source: str, target: str, lang_name: str) -> str:
    """Same error-span QE prompt localization_qa_crawler.py uses with this
    exact model via Ollama — proven output shape, kept verbatim so the two
    reviewers' judgments stay comparable."""
    return (
        f"[INST] Identify all translation errors and grammatical mistakes in the "
        f"following target text, which was translated from English to {lang_name}.\n"
        f'Source: "{source}"\n'
        f'Target: "{target}"\n'
        f"Output format: List each error with its location and a severity of "
        f"Minor, Major, or Critical. If there are no errors, respond with "
        f"exactly: NO ERRORS FOUND. [/INST]"
    )


_SEVERITY_RE = re.compile(r"\b(critical|major|minor)\b", re.IGNORECASE)


def parse_verdict(response: str) -> tuple[int | None, list[dict]]:
    """Turns the model's error list into (score, errors). Returns (None, [])
    when the response is unparseable — neither clean nor containing a single
    recognizable severity — so the caller can retry / mark needs_review."""
    text = (response or "").strip()
    if not text:
        return None, []
    if "no errors found" in text.lower():
        return 100, []

    severities = [m.group(1).lower() for m in _SEVERITY_RE.finditer(text)]
    if not severities:
        return None, []

    counts = {"critical": 0, "major": 0, "minor": 0}
    for s in severities:
        counts[s] += 1
    score = max(0, 100 - sum(SCORE_WEIGHTS[s] * n for s, n in counts.items()))
    errors = [{"severity": s, "count": n} for s, n in counts.items() if n]
    return score, errors


def _add_cuda_dll_dirs() -> None:
    """Windows + prebuilt CUDA wheels: llama.dll links against NVIDIA runtime
    DLLs (cudart64_12.dll, cublas64_12.dll, ...) that the wheel does NOT
    bundle. pip-installed runtimes (nvidia-cuda-runtime-cu12, nvidia-cublas-
    cu12) land in site-packages\\nvidia\\*\\bin, which is not on Windows'
    DLL search path — register those dirs (plus CUDA_PATH\\bin if a full
    Toolkit exists) before llama_cpp is imported."""
    if os.name != "nt":
        return
    import site
    roots: set[Path] = set()
    try:
        roots.update(Path(p) for p in site.getsitepackages())
    except Exception:
        pass
    try:
        roots.add(Path(site.getusersitepackages()))
    except Exception:
        pass
    cuda_path = os.getenv("CUDA_PATH")
    dll_dirs = [Path(cuda_path) / "bin"] if cuda_path else []
    for root in roots:
        dll_dirs.extend((root / "nvidia").glob("*/bin"))
    for d in dll_dirs:
        if d.is_dir():
            try:
                os.add_dll_directory(str(d))
            except Exception:
                pass


class TowerReviewer:
    """Lazy loader — nothing is downloaded/loaded until at least one pair
    actually survives the deterministic pre-checks. Backend is resolved on
    first use: llama-cpp-python when importable, else the local Ollama server
    (same model tag the crawler uses)."""

    def __init__(self, backend: str = TOWER_BACKEND,
                 n_gpu_layers: int = TOWER_N_GPU_LAYERS, n_ctx: int = TOWER_N_CTX):
        self.backend = backend  # auto | llamacpp | ollama -> resolved on _load
        self.n_gpu_layers = n_gpu_layers
        self.n_ctx = n_ctx
        self.label = "TowerInstruct-7B-v0.1 Q4_K_M (backend not loaded)"
        self._llm = None
        self._ollama_ready = False

    # -- llama-cpp-python path -------------------------------------------------

    def _load_llamacpp(self):
        _add_cuda_dll_dirs()  # must run BEFORE llama_cpp is imported
        from llama_cpp import Llama  # may raise ImportError/RuntimeError (DLLs)
        from huggingface_hub import hf_hub_download, list_repo_files

        filename = TOWER_GGUF_FILE
        if not filename:
            candidates = [f for f in list_repo_files(TOWER_GGUF_REPO)
                          if "q4_k_m" in f.lower() and f.lower().endswith(".gguf")]
            if not candidates:
                raise RuntimeError(f"No Q4_K_M .gguf found in {TOWER_GGUF_REPO} — "
                                   f"set TOWER_GGUF_FILE explicitly.")
            filename = candidates[0]

        print(f"Loading model {TOWER_GGUF_REPO} :: {filename} "
              f"(n_gpu_layers={self.n_gpu_layers}, n_ctx={self.n_ctx})...")
        model_path = hf_hub_download(repo_id=TOWER_GGUF_REPO, filename=filename)
        self._llm = Llama(model_path=model_path, n_ctx=self.n_ctx,
                          n_gpu_layers=self.n_gpu_layers, verbose=False)
        self.label = "TowerInstruct-7B-v0.1 Q4_K_M (llama-cpp-python)"
        print("Model loaded (llama-cpp-python).")

    # -- Ollama path -------------------------------------------------------------

    def _ensure_ollama(self):
        """Preflight once: fail fast with a clear message instead of erroring
        midway through a long run. Cold model load can take >60s, so retry
        a read-timeout with a much longer window (crawler-proven pattern)."""
        if self._ollama_ready:
            return

        def _attempt(t: int):
            r = requests.post(f"{TOWER_OLLAMA_URL}/api/generate",
                              json={"model": TOWER_OLLAMA_MODEL,
                                    "prompt": "[INST] Say OK. [/INST]", "stream": False,
                                    "keep_alive": "60m"},
                              timeout=t)
            r.raise_for_status()

        try:
            _attempt(120)
        except requests.exceptions.ConnectionError:
            raise RuntimeError(f"Cannot reach Ollama at {TOWER_OLLAMA_URL} — is it running? (ollama serve)")
        except requests.exceptions.ReadTimeout:
            print(f"No response within 120s — likely a cold model load, retrying with 360s...")
            _attempt(360)
        except requests.exceptions.HTTPError as e:
            raise RuntimeError(f"Ollama error for model '{TOWER_OLLAMA_MODEL}': {e}\n"
                               f"Have you pulled it? ollama pull {TOWER_OLLAMA_MODEL}")
        self._ollama_ready = True
        self.label = f"TowerInstruct-7B-v0.1 Q4_K_M (Ollama: {TOWER_OLLAMA_MODEL})"
        print(f"Ollama backend ready ({TOWER_OLLAMA_URL}, {TOWER_OLLAMA_MODEL}).")

    def _evaluate_ollama(self, prompt: str) -> str:
        def _attempt(t: int) -> str:
            resp = requests.post(f"{TOWER_OLLAMA_URL}/api/generate",
                                 json={"model": TOWER_OLLAMA_MODEL, "prompt": prompt,
                                       "stream": False,
                                       "keep_alive": "60m",  # don't unload between evals
                                       "options": {"temperature": 0.0, "num_predict": 384}},
                                 timeout=t)
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
        try:
            return _attempt(180)
        except requests.exceptions.ReadTimeout:
            print("(no response within 180s, retrying with 360s)... ", end="", flush=True)
            return _attempt(360)

    # -- shared -------------------------------------------------------------------

    def _load(self):
        if self._llm is not None or self._ollama_ready:
            return
        if self.backend in ("auto", "llamacpp"):
            try:
                self._load_llamacpp()
                self.backend = "llamacpp"
                return
            except Exception as e:
                if self.backend == "llamacpp":
                    raise
                print(f"llama-cpp-python unavailable ({type(e).__name__}: {str(e)[:120]}...)"
                      if len(str(e)) > 120 else
                      f"llama-cpp-python unavailable ({type(e).__name__}: {e})")
                print("Falling back to the Ollama backend (same model, GPU via Ollama).")
        self._ensure_ollama()
        self.backend = "ollama"

    def evaluate(self, source: str, target: str, lang_name: str) -> str:
        self._load()
        prompt = build_qe_prompt(source, target, lang_name)
        if self.backend == "llamacpp":
            out = self._llm(prompt, max_tokens=384, temperature=0.0,
                            stop=["[INST]", "</s>"])
            return out["choices"][0]["text"].strip()
        return self._evaluate_ollama(prompt)


# ─── Report writing ─────────────────────────────────────────────────────────

def rank_items(items: list[dict]) -> list[dict]:
    """Global rank: worst score first across ALL locales (decision, plan
    Part 7 #2); unscored (needs_review) items sort to the end. Ties break by
    namespace priority (landing first), then longer source first (more
    visible content)."""
    def sort_key(it):
        score = it["score"] if it["score"] is not None else 101
        return (score, NS_PRIORITY.get(it["namespace"], 9), -len(it["source_en"]))
    ranked = sorted(items, key=sort_key)
    for rank, it in enumerate(ranked, start=1):
        it["rank"] = rank
    return ranked


def write_reports(json_path: Path, items: list[dict], threshold_hint: float,
                  started_at: str, complete: bool, reviewer_label: str) -> None:
    items = rank_items(items)
    per_locale: dict[str, dict] = {}
    for it in items:
        e = per_locale.setdefault(it["locale"], {"reviewed": 0, "flagged_at_hint": 0, "source_chars_at_hint": 0})
        e["reviewed"] += 1
        if it["score"] is not None and it["score"] < threshold_hint:
            e["flagged_at_hint"] += 1
            e["source_chars_at_hint"] += len(it["source_en"])

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at,
        "reviewer": reviewer_label,
        "complete": complete,
        "scoring": {"scale": "0-100 (lower = worse)",
                    "threshold_hint": threshold_hint,
                    "weights": SCORE_WEIGHTS,
                    "note": "No cutoff applied here — every reviewed key is listed. "
                            "Choose the real cutoff in retranslate_mt.py --score-threshold. "
                            "threshold_hint only drives the summary counts below."},
        "summary": {
            "per_locale": per_locale,
            "total_reviewed": len(items),
            "total_flagged_at_hint": sum(e["flagged_at_hint"] for e in per_locale.values()),
            "total_source_chars_at_hint": sum(e["source_chars_at_hint"] for e in per_locale.values()),
        },
        "items": items,
    }
    tmp = json_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, json_path)

    # Human-readable twin: worst 200 rows as a markdown table.
    md_path = json_path.with_suffix(".md")
    lines = [
        f"# Localization review — ranked worst first",
        "",
        f"Generated: {report['generated_at']}  |  Reviewer: {reviewer_label}  |  "
        f"Complete: {complete}",
        "",
        f"Reviewed {len(items)} keys. At an example cutoff of {threshold_hint}, "
        f"{report['summary']['total_flagged_at_hint']} keys "
        f"({report['summary']['total_source_chars_at_hint']:,} source chars) would be retranslated. "
        f"Pick the real cutoff with `retranslate_mt.py --score-threshold N`.",
        "",
        "| rank | score | locale | ns | key | reasons | source (en) |",
        "|---|---|---|---|---|---|---|",
    ]
    for it in items[:200]:
        src = it["source_en"][:60].replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {it['rank']} | {it['score'] if it['score'] is not None else 'n/a'} "
                     f"| {it['locale']} | {it['namespace']} | `{it['key']}` "
                     f"| {','.join(it['reasons']) or '-'} | {src} |")
    if len(items) > 200:
        lines.append(f"\n... and {len(items) - 200} more rows (see the JSON report).")
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ─── Main ───────────────────────────────────────────────────────────────────

def discover_locales() -> list[str]:
    return sorted(d.name for d in LOCALES_DIR.iterdir()
                  if d.is_dir() and d.name.lower() not in SKIP_LOCALE_DIRS)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--locales", default=None, help="Comma-separated locales (default: every locale folder)")
    ap.add_argument("--namespaces", default=None,
                     help=f"Comma-separated namespaces (default: all of {', '.join(NS_MAP)})")
    ap.add_argument("--max-keys", type=int, default=None, help="Stop after N LLM evaluations per locale (smoke tests)")
    ap.add_argument("--threshold-hint", type=float, default=80.0,
                     help="Example cutoff used ONLY for the report's summary counts (no filtering)")
    ap.add_argument("--backend", default=TOWER_BACKEND, choices=["auto", "llamacpp", "ollama"],
                     help="Model backend: auto tries llama-cpp-python, falls back to Ollama (default: auto)")
    ap.add_argument("--no-llm", action="store_true",
                     help="Deterministic checks only — instant, no model download/load. "
                          "Pairs needing LLM judgment are marked needs_review.")
    ap.add_argument("--n-gpu-layers", type=int, default=TOWER_N_GPU_LAYERS)
    ap.add_argument("--n-ctx", type=int, default=TOWER_N_CTX)
    ap.add_argument("--out", default=None,
                     help="Report path (default: frontend/qa/retranslation_keys_<ts>.json)")
    args = ap.parse_args()

    locales = ([l.strip() for l in args.locales.split(",")] if args.locales else discover_locales())
    namespaces = ([n.strip() for n in args.namespaces.split(",")] if args.namespaces else list(NS_MAP))
    bad_ns = [n for n in namespaces if n not in NS_MAP]
    if bad_ns:
        print(f"Unknown namespace(s): {', '.join(bad_ns)} (known: {', '.join(NS_MAP)})")
        sys.exit(1)

    started_at = datetime.now(timezone.utc).isoformat()
    ts_now = int(time.time())
    json_path = Path(args.out) if args.out else QA_DIR / f"retranslation_keys_{ts_now}.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)

    reviewer = TowerReviewer(args.backend, args.n_gpu_layers, args.n_ctx)
    if args.no_llm:
        reviewer.label = "deterministic checks only (--no-llm)"
    all_items: list[dict] = []

    print("=" * 60)
    print(f"Offline localization review — {len(locales)} locale(s) x {len(namespaces)} namespace(s)")
    print(f"  Locales:  {', '.join(locales)}")
    print(f"  Backend:  {'none (--no-llm: deterministic checks only)' if args.no_llm else args.backend + ' (resolved on first model call)'}")
    print(f"  Report:   {json_path}  (checkpointed after every locale — safe to Ctrl+C)")
    print("=" * 60)

    run_start = time.monotonic()
    total_evals_all = 0

    for li, locale in enumerate(locales, start=1):
        lang_name = _resolve_language_name(locale)
        locale_start = time.monotonic()
        llm_evals_done = 0
        locale_items: list[dict] = []

        # Variant locales (fr-CA, and any future en-*/es-* etc.): i18next falls
        # back to the BASE locale, not English, so a key missing from the
        # variant's files is NOT untranslated — it inherits the base value,
        # which gets reviewed under the base locale. Rule: a hyphenated code
        # whose base folder exists is a variant; only its own overrides are
        # reviewed here. (pt-BR is NOT a variant — there is no base 'pt'
        # folder; it is the primary Portuguese locale and is fully reviewed.)
        base_locale = locale.split("-")[0]
        is_variant = "-" in locale and base_locale != locale and (LOCALES_DIR / base_locale).is_dir()
        inherited_keys = 0

        print(f"\n[{li}/{len(locales)}] Locale '{locale}' ({lang_name}) — reviewing...")
        if is_variant:
            print(f"    '{locale}' is a fallback variant of '{base_locale}': only "
                  f"{locale}-specific overrides are reviewed; everything else inherits "
                  f"'{base_locale}' and is reviewed there.")

        for ns in namespaces:
            en_flat = flatten_json(load_json(LOCALES_DIR / "en" / NS_MAP[ns]))
            ns_path = LOCALES_DIR / locale / NS_MAP[ns]
            tgt_flat = flatten_json(load_json(ns_path)) if ns_path.exists() else {}

            # ── CLDR plural-category completeness (per key family) ──
            # i18next needs key_<category> for every CLDR category the locale
            # uses (ar: zero/one/two/few/many/other; ja: other only; ...).
            # Missing required forms are real bugs (score 10 — the driver
            # CREATES those keys); extra forms the locale never uses are dead
            # keys (score 85, report-only, never sent to MT). Variants are
            # skipped — they inherit the base locale per key.
            if not is_variant:
                required = required_plural_categories(locale)
                en_families: dict[str, dict[str, str]] = {}
                for k, v in en_flat.items():
                    m = PLURAL_SUFFIX_RE.search(k)
                    if m and isinstance(v, str) and v.strip():
                        en_families.setdefault(k[:m.start()], {})[m.group(1)] = v
                tgt_cats: dict[str, set] = {}
                for k in tgt_flat:
                    m = PLURAL_SUFFIX_RE.search(k)
                    if m:
                        tgt_cats.setdefault(k[:m.start()], set()).add(m.group(1))
                for fam, en_forms in en_families.items():
                    sample_en = en_forms.get("other") or next(iter(en_forms.values()))
                    if is_do_not_translate(fam, sample_en) or locked_value(sample_en):
                        continue
                    have = tgt_cats.get(fam, set())
                    if not have:
                        continue  # family entirely untranslated — per-key checks handle it
                    for cat in sorted(required - have):
                        src_form = en_forms.get(cat) or sample_en
                        locale_items.append({
                            "locale": locale, "namespace": ns, "key": f"{fam}_{cat}",
                            "source_en": src_form, "current_target": None,
                            "source_chars": len(src_form),
                            "score": 10, "reasons": ["cldr_plural_missing"], "errors": [],
                            "needs_review": False,
                            "evaluator_response": f"'{locale}' requires CLDR plural category "
                                                  f"'{cat}' for this key family but it is missing "
                                                  f"— retranslate_mt.py will create it",
                        })
                    for cat in sorted(have - required - set(en_forms) - {"zero"}):
                        locale_items.append({
                            "locale": locale, "namespace": ns, "key": f"{fam}_{cat}",
                            "source_en": sample_en, "current_target": tgt_flat.get(f"{fam}_{cat}"),
                            "source_chars": len(sample_en),
                            "score": 85, "reasons": ["cldr_plural_extra"], "errors": [],
                            "needs_review": False,
                            "evaluator_response": f"'{locale}' never uses CLDR plural category "
                                                  f"'{cat}' — dead key, safe to delete (report-only, "
                                                  f"never sent to MT)",
                        })

            pending_llm: list[tuple[str, str, str]] = []
            for key, en_text in en_flat.items():
                if not isinstance(en_text, str) or not en_text.strip():
                    continue
                target = tgt_flat.get(key)
                if target is None and is_variant:
                    inherited_keys += 1
                    continue  # inherits the base locale's value — reviewed under the base

                # Do-not-translate: key-locked (translate_sync rules) or
                # value-locked (i18n-do-not-translate.md). Identical-to-English
                # is CORRECT here; a differing value is a real violation that
                # retranslate_mt.py restores to English without any API call.
                if is_do_not_translate(key, en_text) or locked_value(en_text):
                    if isinstance(target, str) and target.strip() and target.strip() != en_text.strip():
                        locale_items.append({
                            "locale": locale, "namespace": ns, "key": key,
                            "source_en": en_text, "current_target": target,
                            "source_chars": len(en_text),
                            "score": 0, "reasons": ["dnt_violation"], "errors": [],
                            "needs_review": False,
                            "evaluator_response": "locked do-not-translate value was altered "
                                                  "(see i18n-do-not-translate.md) — must be "
                                                  "restored to the English value verbatim",
                        })
                    continue

                if (target is None or target == en_text) and looks_intentionally_unchanged(en_text):
                    continue  # legitimately identical in every locale

                floor, reasons = deterministic_score(en_text, target, locale)
                if floor is not None:
                    locale_items.append({
                        "locale": locale, "namespace": ns, "key": key,
                        "source_en": en_text, "current_target": target,
                        "source_chars": len(en_text),
                        "score": floor, "reasons": reasons, "errors": [],
                        "needs_review": False, "evaluator_response": None,
                    })
                else:
                    pending_llm.append((key, en_text, target))

            if args.max_keys is not None:
                pending_llm = pending_llm[:max(0, args.max_keys - llm_evals_done)]

            if pending_llm and args.no_llm:
                for key, en_text, target in pending_llm:
                    locale_items.append({
                        "locale": locale, "namespace": ns, "key": key,
                        "source_en": en_text, "current_target": target,
                        "source_chars": len(en_text),
                        "score": None, "reasons": [], "errors": [],
                        "needs_review": True, "evaluator_response": None,
                    })
                continue

            if pending_llm:
                print(f"  {locale}/{ns}: {len(pending_llm)} pair(s) need model review "
                      f"(first call loads the model — can take ~1 min)...")
            ns_flagged = 0
            ns_start = time.monotonic()
            for pi, (key, en_text, target) in enumerate(pending_llm, start=1):
                response = None
                score, errors = None, []
                for attempt in (1, 2):  # one retry on unparseable output
                    try:
                        response = reviewer.evaluate(en_text, target, lang_name)
                    except Exception as e:
                        print(f"    model call failed for {key}: {e}")
                        break
                    score, errors = parse_verdict(response)
                    if score is not None:
                        break
                llm_evals_done += 1
                total_evals_all += 1
                if score is not None and score < args.threshold_hint:
                    ns_flagged += 1
                if pi % 10 == 0 or pi == len(pending_llm):
                    elapsed = time.monotonic() - ns_start
                    pace = elapsed / pi
                    eta_s = int(pace * (len(pending_llm) - pi))
                    print(f"    {locale}/{ns}: {pi}/{len(pending_llm)} evaluated | "
                          f"{ns_flagged} flagged so far | {pace:.1f}s/pair | "
                          f"ETA {eta_s // 60}m {eta_s % 60:02d}s")
                locale_items.append({
                    "locale": locale, "namespace": ns, "key": key,
                    "source_en": en_text, "current_target": target,
                    "source_chars": len(en_text),
                    "score": score,
                    "reasons": ["evaluator_flagged"] if (score is not None and score < 100) else [],
                    "errors": errors,
                    "needs_review": score is None,
                    "evaluator_response": response,
                })

        all_items.extend(locale_items)
        # Checkpoint after EVERY locale so a long run is never a total loss.
        write_reports(json_path, all_items, args.threshold_hint, started_at,
                      complete=(li == len(locales)), reviewer_label=reviewer.label)
        flagged = sum(1 for it in locale_items if it["score"] is not None and it["score"] < args.threshold_hint)
        loc_elapsed = int(time.monotonic() - locale_start)
        total_elapsed = int(time.monotonic() - run_start)
        inherit_note = f", {inherited_keys} inherited from '{base_locale}' (skipped)" if inherited_keys else ""
        print(f"[{li}/{len(locales)}] '{locale}' DONE in {loc_elapsed // 60}m {loc_elapsed % 60:02d}s: "
              f"{len(locale_items)} key(s) reviewed, {flagged} below {args.threshold_hint:g}, "
              f"{llm_evals_done} model eval(s){inherit_note}. Checkpoint saved.")
        print(f"    Overall: {len(all_items)} keys reviewed, {len(locales) - li} locale(s) remaining, "
              f"{total_elapsed // 60}m elapsed.")

    # ── Final summary ──
    total_elapsed = int(time.monotonic() - run_start)
    reason_counts: dict[str, int] = {}
    for it in all_items:
        for r in (it["reasons"] or (["needs_review"] if it["needs_review"] else [])):
            reason_counts[r] = reason_counts.get(r, 0) + 1
    print("\n" + "=" * 60)
    print(f"REVIEW COMPLETE — {len(all_items)} key(s) reviewed across {len(locales)} locale(s) "
          f"in {total_elapsed // 60}m {total_elapsed % 60:02d}s ({total_evals_all} model evals).")
    if reason_counts:
        print("Problems found: " + ", ".join(f"{r}: {n}" for r, n in
                                             sorted(reason_counts.items(), key=lambda x: -x[1])))
    print("\nHow many keys each cutoff would send to translation:")
    for cutoff in (30, 50, 80, 95):
        picked = [i for i in all_items if i["score"] is not None and i["score"] < cutoff]
        chars = sum(len(i["source_en"]) for i in picked)
        print(f"  --score-threshold {cutoff:>3}  ->  {len(picked):>5} key(s), {chars:>8,} source chars")
    print(f"\nFull ranked report: {json_path}")
    print(f"Human-readable twin: {json_path.with_suffix('.md')}")
    print("\nNext steps:")
    print("  1. Open the .md twin, eyeball the ranking, choose a cutoff.")
    print("  2. Menu option [3] (or: python scripts/retranslate_mt.py --score-threshold <cutoff> --dry-run)")
    print("  3. Confirm the budget forecast, then run for real.")


if __name__ == "__main__":
    main()
