#!/usr/bin/env python3
"""
Mobile app-string localization pipeline — parity with the web pipeline's
provenance model, WITHOUT shipping provenance to the device.

    en.json  ──►  mobile/i18n/xliff/{code}.xlf   (translate + review + redrive)
                        │   W3C-PROV graph per key: translator agent,
                        │   QualityAssessment, redrive wasRevisionOf, operator
                        ▼
             backend/locale_packs/{code}.json     (publish: <target> only,
             + manifest.json                       no <meta>, no PROV)
                        ▼
             device downloads from /api/v1/locale-packs at runtime

The .xlf files are the source of truth and the audit trail; they are
repo-tracked and NEVER bundled or downloaded. The JSON packs are a
mechanical projection of the .xlf `<target>` values.

Shared toolkit reused from frontend/scripts/ (read-only import — this
script never modifies the web pipeline's files):
  localization_provenance : Actor, QualityAssessment, build_prov_graph,
                            parse_existing_xliff_with_prov, write_xliff_prov_file
  model_registry          : choose_model, list_models  (live model discovery)
  qa_review_llamacpp      : TowerReviewer               (offline QA scorer)
  mt_fallback             : FallbackTranslator          (classic MT chain, opt-in)
  translate_sync          : looks_like_garbage, has_expected_script

MODES
  check      Extract t() keys from source, diff against en.json, and verify
             every en.json key is present + current in each .xlf. Exits 1 on
             a missing key or a stale .xlf (CI gate). --warn-only to soften.
  translate  Translate keys that are new / whose English changed, into every
             SUPPORTED_LOCALE. Writes the .xlf with a structured Translation
             activity + translator agent per key.
  review     Score each locale's current targets with the review model
             (TowerInstruct). Records a QualityAssessment per key; marks
             below-threshold keys for redrive.
  redrive    Re-translate the marked keys with the redrive model. New target
             version, wasRevisionOf + overwroteTranslationBy in the graph.
  publish    Project every .xlf's <target> into backend/locale_packs/{code}.json
             (nested, strings only) and rebuild manifest.json.
  migrate    One-off: seed mobile/i18n/xliff/*.xlf from the current
             backend/locale_packs/*.json + scripts/i18n_meta/*.meta.json.
  run-all    check -> translate -> review -> redrive -> publish

MODEL SELECTION  (all Ollama by default; nothing is required)
  --translation-model / --review-model / --redrive-model / --operator
  Omitted + interactive TTY  -> live chooser (model_registry.choose_model)
  Omitted + non-interactive  -> defaults below; last run's picks are cached
                                to scripts/i18n_meta/last_pipeline_config.json
  OLLAMA_HOST (default http://localhost:11434)

USAGE
  python scripts/localize.py check
  python scripts/localize.py run-all
  python scripts/localize.py translate --locale de
  python scripts/localize.py review --flagged-only
  python scripts/localize.py publish
  npm run i18n:run-all        (from mobile/)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
MOBILE_DIR = SCRIPT_DIR.parent
REPO_ROOT = MOBILE_DIR.parent
EN_JSON_PATH = MOBILE_DIR / "src" / "i18n" / "locales" / "en.json"
LOCALES_TS_PATH = MOBILE_DIR / "src" / "i18n" / "locales.ts"
META_DIR = SCRIPT_DIR / "i18n_meta"
XLIFF_DIR = MOBILE_DIR / "i18n" / "xliff"          # repo-tracked, NEVER bundled
BACKEND_PACKS_DIR = REPO_ROOT / "backend" / "locale_packs"
MANIFEST_PATH = BACKEND_PACKS_DIR / "manifest.json"
EXTRACTED_EN = META_DIR / "_extracted.en.json"
PIPELINE_CONFIG = META_DIR / "last_pipeline_config.json"

# ── shared toolkit (frontend/scripts, same monorepo) ────────────────────────
FRONTEND_SCRIPTS_DIR = REPO_ROOT / "frontend" / "scripts"
sys.path.insert(0, str(FRONTEND_SCRIPTS_DIR))

from localization_provenance import (  # type: ignore  # noqa: E402
    Actor,
    QualityAssessment,
    build_prov_graph,
    parse_existing_xliff_with_prov,
    write_xliff_prov_file,
    default_operator_name,
    get_timestamp,
)

try:
    from model_registry import choose_model, list_models  # type: ignore
except Exception:  # pragma: no cover
    choose_model = None
    list_models = None

try:
    from translate_sync import looks_like_garbage, has_expected_script  # type: ignore
except Exception:  # pragma: no cover
    looks_like_garbage = None
    has_expected_script = None

try:
    from mt_fallback import FallbackTranslator, UsageLedger  # type: ignore
except Exception:  # pragma: no cover
    FallbackTranslator = None
    UsageLedger = None

# ── config ──────────────────────────────────────────────────────────────────
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

DEFAULT_TRANSLATION_MODEL = os.getenv("OLLAMA_MODEL_TEXT", "mistral-nemo:12b")
DEFAULT_REVIEW_MODEL = os.getenv(
    "TOWER_OLLAMA_MODEL", "hf.co/s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF:Q4_K_M"
)
DEFAULT_REDRIVE_MODEL = os.getenv("OLLAMA_REDRIVE_MODEL", "qwen3:8b")
REVIEW_THRESHOLD = float(os.getenv("MOBILE_I18N_QA_THRESHOLD", "80"))

DISPLAY_NAMES = {
    "es": "Spanish", "fr": "French", "fr-CA": "Canadian French",
    "ar": "Arabic", "he": "Hebrew", "ja": "Japanese", "ko": "Korean",
    "pt-BR": "Brazilian Portuguese", "de": "German", "it": "Italian",
    "tr": "Turkish", "zh": "Simplified Chinese", "en": "English",
}
PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")
ORG = "TheWordInBits"

# ── flatten / io ────────────────────────────────────────────────────────────
def flatten(d: dict, prefix: str = "") -> dict:
    out: dict = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out


def unflatten(flat: dict) -> dict:
    out: dict = {}
    for key, value in flat.items():
        parts = key.split(".")
        node = out
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = value
    return out


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  WARN: could not parse {path.name}: {e}")
        return {}


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def source_hash(text: str) -> str:
    return hashlib.sha256(str(text).encode("utf-8")).hexdigest()[:16]


def get_supported_locales() -> list[str]:
    src = LOCALES_TS_PATH.read_text(encoding="utf-8")
    codes = re.findall(r"code:\s*'([^']+)'", src)
    assert codes, f"Found zero locale codes in {LOCALES_TS_PATH}"
    return [c for c in codes if c != "en"]


# ── model selection ─────────────────────────────────────────────────────────
def _load_pipeline_config() -> dict:
    return load_json(PIPELINE_CONFIG)


def _save_pipeline_config(cfg: dict) -> None:
    atomic_write_json(PIPELINE_CONFIG, cfg)


def resolve_model(role: str, cli_value: str | None, default: str) -> str:
    """cli flag > interactive chooser (TTY only) > cached last run > default."""
    if cli_value:
        return cli_value
    cache = _load_pipeline_config()
    cached = cache.get(role)
    if sys.stdin.isatty() and choose_model is not None:
        try:
            picked = choose_model(role, "OLLAMA", default=cached or default)
            if picked:
                cache[role] = picked
                _save_pipeline_config(cache)
                return picked
        except Exception as e:
            print(f"  (model chooser unavailable: {e})")
    return cached or default


def operator_actor(cli_operator: str | None) -> Actor:
    name = cli_operator or os.getenv("I18N_OPERATOR") or default_operator_name()
    return Actor.human(name=name, role="operator", organization=ORG)


def ai_actor(model: str, role: str, params: dict | None = None) -> Actor:
    return Actor.ai("OLLAMA", model, role=role, organization="Ollama",
                    parameters=params or {})


# ── translation ─────────────────────────────────────────────────────────────
def translate_via_ollama(text: str, target_lang_name: str, model: str) -> str | None:
    prompt = (
        f"Translate the following mobile app UI string from English to {target_lang_name}. "
        "Output ONLY the translation — no quotes, no explanation, no notes. "
        "Preserve every {{placeholder}} token exactly as written. "
        "If it is a proper noun or already correct for the target language, return it unchanged.\n\n"
        f"String: {text}"
    )
    try:
        resp = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False,
                  "options": {"temperature": 0.2}},
            timeout=90,
        )
        resp.raise_for_status()
        raw = resp.json().get("response", "").strip()
        first = next((ln.strip() for ln in raw.splitlines() if ln.strip()), "")
        return first.strip('"').strip() or None
    except Exception as e:
        print(f"    ollama error: {e}")
        return None


def placeholders_preserved(src: str, tgt: str) -> bool:
    return set(PLACEHOLDER_RE.findall(src)) <= set(PLACEHOLDER_RE.findall(tgt))


def valid_translation(tgt: str, src: str, locale: str) -> bool:
    if not tgt:
        return False
    if looks_like_garbage is not None and looks_like_garbage(tgt, src):
        return False
    if has_expected_script is not None and not has_expected_script(tgt, locale):
        return False
    return placeholders_preserved(src, tgt)


# ── xliff helpers ───────────────────────────────────────────────────────────
def xliff_path(code: str) -> Path:
    return XLIFF_DIR / f"{code}.xlf"


def read_xliff(code: str) -> dict:
    """-> {"strings": {k: {version, approved, source, status}}, "global_prov": {...}}"""
    return parse_existing_xliff_with_prov(xliff_path(code))


def write_xliff(code: str, en_flat: dict, tgt_flat: dict, meta: dict, graph: dict) -> None:
    XLIFF_DIR.mkdir(parents=True, exist_ok=True)
    write_xliff_prov_file(xliff_path(code), code, en_flat, tgt_flat, meta, graph)


# ── mode: check ─────────────────────────────────────────────────────────────
def run_extract() -> None:
    META_DIR.mkdir(parents=True, exist_ok=True)
    print("  running i18next-parser on app/ src/ components/ hooks/ …")
    subprocess.run(
        ["npx", "--yes", "i18next-parser", "--config", "i18next-parser.config.cjs", "--silent"],
        cwd=str(MOBILE_DIR), check=False, shell=(os.name == "nt"),
    )


def mode_check(args) -> int:
    problems = 0
    en_flat = flatten(load_json(EN_JSON_PATH))
    if not en_flat:
        print("FATAL: en.json is empty / unreadable")
        return 2

    # 1. source references vs en.json
    if not args.skip_extract:
        run_extract()
    extracted = flatten(load_json(EXTRACTED_EN)) if EXTRACTED_EN.exists() else {}
    if extracted:
        missing = sorted(k for k in extracted if k not in en_flat)
        orphan = sorted(k for k in en_flat if k not in extracted)
        if missing:
            problems += len(missing)
            print(f"\n  ✗ {len(missing)} key(s) referenced by t() but NOT in en.json:")
            for k in missing[:40]:
                print(f"      {k}")
        if orphan:
            print(f"\n  ⚠ {len(orphan)} key(s) in en.json with no t() reference "
                  f"(orphan candidates — prune manually + `translate --reset`):")
            for k in orphan[:40]:
                print(f"      {k}")
    else:
        print("  (no _extracted.en.json — run `npm run i18n:extract` once; skipping ref check)")

    # 2. en.json vs each .xlf  (is every key translated + from the current English?)
    print("\n  .xlf coverage vs en.json:")
    for code in get_supported_locales():
        xlf = read_xliff(code)
        strings = xlf["strings"]
        stale = [k for k, v in en_flat.items()
                 if k not in strings or (strings[k].get("source") or "") != v]
        untranslated = [k for k, v in strings.items()
                        if not (v.get("source") and strings.get(k))
                        or not _has_target(xlf, k)]
        tag = "OK" if not stale else f"{len(stale)} stale/missing"
        print(f"      {code:<6} {len(strings):>4} units   {tag}")
        if stale and args.verbose:
            for k in stale[:15]:
                print(f"          - {k}")
        if stale:
            problems += 0 if args.warn_only else len(stale)

    if problems and not args.warn_only:
        print(f"\n  FAIL — {problems} issue(s). Run `npm run i18n:run-all` to resolve.")
        return 1
    print("\n  OK" if not problems else f"\n  {problems} warning(s) (soft).")
    return 0


def _has_target(xlf: dict, key: str) -> bool:
    # parse_existing_xliff_with_prov doesn't return targets; treat presence in
    # strings as "has a unit". A deeper target check happens at publish time.
    return key in xlf["strings"]


# ── mode: translate ────────────────────────────────────────────────────────
def mode_translate(args) -> int:
    en_flat = {k: v for k, v in flatten(load_json(EN_JSON_PATH)).items() if isinstance(v, str)}
    locales = [args.locale] if args.locale else get_supported_locales()
    model = resolve_model("translation", args.translation_model, DEFAULT_TRANSLATION_MODEL)
    op = operator_actor(args.operator)
    translator = ai_actor(model, "translator", {"temperature": 0.2})
    mt = None
    if args.use_mt and FallbackTranslator is not None:
        mt = FallbackTranslator(ledger=UsageLedger(path=META_DIR / "mt_usage_state.json"),
                                use_lara=args.use_lara, use_deepl=args.use_deepl)

    print(f"translate: model={model} operator={op.name} locales={','.join(locales)}")
    for code in locales:
        xlf = read_xliff(code)
        strings, graph = xlf["strings"], xlf["global_prov"]
        # current targets (from the .xlf we just parsed — parse doesn't give
        # targets, so re-read raw for target text)
        cur_targets = _raw_targets(code)
        meta_tracking: dict = {}
        tgt_flat: dict = {}
        n_new = n_reused = n_flag = 0

        for key, en_val in en_flat.items():
            prev = strings.get(key)
            unchanged = prev and (prev.get("source") or "") == en_val and cur_targets.get(key)
            if unchanged and not args.reset:
                tgt_flat[key] = cur_targets[key]
                meta_tracking[key] = {"version": prev.get("version", 1),
                                      "status": prev.get("status") or "approved"}
                n_reused += 1
                continue

            ts = get_timestamp()
            out = translate_via_ollama(en_val, DISPLAY_NAMES.get(code, code), model)
            provider_used, actor_used = "ollama:" + model, translator
            if not (out and valid_translation(out, en_val, code)) and mt is not None:
                r = mt.translate_one(en_val, code)
                if r and valid_translation(r["translation"], en_val, code):
                    out, provider_used = r["translation"], r["engine"]
                    actor_used = Actor.from_legacy_label(r["engine"], role="translator")
            flagged = not (out and valid_translation(out, en_val, code))
            if flagged:
                out = en_val  # English fallback

            version = (prev.get("version", 0) + 1) if prev else 1
            tgt_flat[key] = out
            meta_tracking[key] = {"version": version,
                                  "status": "needs_review" if flagged else "new_translation"}
            graph = build_prov_graph(
                key, en_val, out,
                version=version, ts=ts, translator=actor_used, operators=[op],
                existing_graph=graph,
                activity_type="Translation",
                source_event="redrive" if prev else "initial",
                overwrite_reason=("machine-translation failed all engines; English fallback"
                                  if flagged else None),
            )
            n_new += 1
            n_flag += 1 if flagged else 0
            print(f"  [{code}] {key} -> {provider_used}{' [FLAG]' if flagged else ''}")

        write_xliff(code, en_flat, tgt_flat, meta_tracking, graph)
        print(f"  [{code}] {n_new} translated ({n_flag} flagged), {n_reused} reused -> {xliff_path(code).name}")
    return 0


def _raw_targets(code: str) -> dict:
    """Pull <target> text straight out of the .xlf (parse_existing_… omits it)."""
    import xml.etree.ElementTree as ET
    p = xliff_path(code)
    if not p.exists():
        return {}
    try:
        root = ET.parse(p).getroot()
        ns = {"x": "urn:oasis:names:tc:xliff:document:1.2"}
        out = {}
        for tu in root.findall(".//x:trans-unit", ns):
            t = tu.find("x:target", ns)
            out[tu.get("id")] = (t.text or "") if t is not None else ""
        return out
    except Exception as e:
        print(f"  WARN reading targets from {p.name}: {e}")
        return {}


# ── mode: review ───────────────────────────────────────────────────────────
def _tower():
    try:
        from qa_review_llamacpp import TowerReviewer  # type: ignore
        return TowerReviewer
    except Exception as e:
        print(f"  review model unavailable ({e}); skipping review")
        return None


def mode_review(args) -> int:
    TowerReviewer = _tower()
    if TowerReviewer is None:
        return 0
    model = resolve_model("review", args.review_model, DEFAULT_REVIEW_MODEL)
    reviewer = TowerReviewer(backend="ollama", ollama_model=model, ollama_url=OLLAMA_HOST)
    op = operator_actor(args.operator)
    en_flat = {k: v for k, v in flatten(load_json(EN_JSON_PATH)).items() if isinstance(v, str)}
    locales = [args.locale] if args.locale else get_supported_locales()
    marked_total = 0

    for code in locales:
        xlf = read_xliff(code)
        strings, graph = xlf["strings"], xlf["global_prov"]
        targets = _raw_targets(code)
        meta_tracking: dict = {}
        keys = [k for k, v in strings.items()
                if (not args.flagged_only) or v.get("status") in ("needs_review", "new_translation")]
        lang_name = DISPLAY_NAMES.get(code, code)
        marked = 0
        for key in keys:
            src, tgt = en_flat.get(key, ""), targets.get(key, "")
            if not src or not tgt or tgt == src:
                meta_tracking[key] = {"version": strings[key].get("version", 1),
                                      "status": strings[key].get("status") or "new_translation"}
                continue
            raw = reviewer.evaluate(src, tgt, lang_name)
            score = _parse_score(raw)
            qa = QualityAssessment(scorer=reviewer.as_actor(), score=score,
                                   reasons=[raw[:280]] if raw else [],
                                   assessed_version=strings[key].get("version", 1),
                                   ts=get_timestamp())
            graph = build_prov_graph(key, src, tgt,
                             version=strings[key].get("version", 1), ts=qa.ts,
                             translator=Actor.ai("OLLAMA", "review-noop", role="translator"),
                             operators=[op], existing_graph=graph,
                             activity_type="QualityAssessment", quality=qa)
            below = score is not None and score < REVIEW_THRESHOLD
            status = "needs_review" if below else "approved"
            meta_tracking[key] = {"version": strings[key].get("version", 1), "status": status}
            marked += 1 if below else 0
            if args.verbose or below:
                print(f"  [{code}] {key}  score={score}  -> {status}")
        # carry non-reviewed keys
        for key in strings:
            meta_tracking.setdefault(key, {"version": strings[key].get("version", 1),
                                           "status": strings[key].get("status") or "approved"})
        write_xliff(code, en_flat, targets, meta_tracking, graph)
        print(f"  [{code}] reviewed {len(keys)}; {marked} below {REVIEW_THRESHOLD} -> redrive")
        marked_total += marked
    print(f"review: {marked_total} key(s) marked for redrive")
    return 0


def _parse_score(raw: str) -> float | None:
    if not raw:
        return None
    m = re.search(r"\b(\d{1,3})(?:\s*/\s*100|\s*%)?\b", raw)
    if m:
        v = float(m.group(1))
        return v if 0 <= v <= 100 else None
    return None


# ── mode: redrive ──────────────────────────────────────────────────────────
def mode_redrive(args) -> int:
    model = resolve_model("redrive", args.redrive_model, DEFAULT_REDRIVE_MODEL)
    op = operator_actor(args.operator)
    redriver = ai_actor(model, "redriver", {"temperature": 0.1})
    en_flat = {k: v for k, v in flatten(load_json(EN_JSON_PATH)).items() if isinstance(v, str)}
    locales = [args.locale] if args.locale else get_supported_locales()
    n_total = 0
    for code in locales:
        xlf = read_xliff(code)
        strings, graph = xlf["strings"], xlf["global_prov"]
        targets = _raw_targets(code)
        meta_tracking: dict = {}
        flagged = [k for k, v in strings.items() if v.get("status") == "needs_review"]
        for key in strings:
            meta_tracking[key] = {"version": strings[key].get("version", 1),
                                  "status": strings[key].get("status") or "approved"}
        for key in flagged:
            src = en_flat.get(key, "")
            if not src:
                continue
            ts = get_timestamp()
            out = translate_via_ollama(src, DISPLAY_NAMES.get(code, code), model)
            if not (out and valid_translation(out, src, code)):
                print(f"  [{code}] {key}  redrive failed; leaving flagged")
                continue
            version = strings[key].get("version", 1) + 1
            targets[key] = out
            meta_tracking[key] = {"version": version, "status": "redriven"}
            graph = build_prov_graph(key, src, out, version=version, ts=ts,
                             translator=redriver, operators=[op], existing_graph=graph,
                             activity_type="Redrive", source_event="redrive",
                             overwrite_reason=f"QA score < {REVIEW_THRESHOLD}")
            n_total += 1
            print(f"  [{code}] {key} -> redriven via {model} (v{version})")
        write_xliff(code, en_flat, targets, meta_tracking, graph)
    print(f"redrive: {n_total} key(s) re-translated")
    return 0


# ── mode: publish ──────────────────────────────────────────────────────────
def mode_publish(args) -> int:
    BACKEND_PACKS_DIR.mkdir(parents=True, exist_ok=True)
    published = 0
    for code in get_supported_locales():
        if not xliff_path(code).exists():
            print(f"  [{code}] no .xlf — skipped (run translate first)")
            continue
        targets = _raw_targets(code)
        if not targets:
            print(f"  [{code}] .xlf has no targets — skipped")
            continue
        atomic_write_json(BACKEND_PACKS_DIR / f"{code}.json", unflatten(targets))
        published += 1
        print(f"  [{code}] {len(targets)} strings -> backend/locale_packs/{code}.json")
    _rebuild_manifest()
    print(f"publish: {published} locale pack(s) + manifest (no provenance in any of them)")
    return 0


def _rebuild_manifest() -> None:
    manifest = {}
    for p in sorted(BACKEND_PACKS_DIR.glob("*.json")):
        if p.name == "manifest.json":
            continue
        manifest[p.stem] = {
            "version": hashlib.sha256(p.read_bytes()).hexdigest()[:12],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
    atomic_write_json(MANIFEST_PATH, manifest)


# ── mode: migrate ──────────────────────────────────────────────────────────
def mode_migrate(args) -> int:
    """Seed .xlf files from the current packs + meta sidecars (one-off)."""
    en_flat = {k: v for k, v in flatten(load_json(EN_JSON_PATH)).items() if isinstance(v, str)}
    op = operator_actor(args.operator)
    for code in get_supported_locales():
        pack = flatten(load_json(BACKEND_PACKS_DIR / f"{code}.json"))
        meta = load_json(META_DIR / f"{code}.meta.json")
        if not pack:
            print(f"  [{code}] no existing pack — skipped")
            continue
        graph: dict = {}
        tgt_flat, meta_tracking = {}, {}
        for key, en_val in en_flat.items():
            tgt = pack.get(key, en_val)
            m = meta.get(key, {})
            provider_label = m.get("provider") or "unknown"
            flagged = bool(m.get("needsManualTranslation")) or tgt == en_val
            ts = m.get("translatedAt") or get_timestamp()
            translator = Actor.from_legacy_label(provider_label, role="translator")
            graph = build_prov_graph(key, en_val, tgt, version=1, ts=ts,
                             translator=translator, operators=[op],
                             existing_graph=graph, activity_type="Translation",
                             source_event="import",
                             overwrite_reason="seeded from legacy locale pack" )
            tgt_flat[key] = tgt
            meta_tracking[key] = {"version": 1,
                                  "status": "needs_review" if flagged else "approved"}
        write_xliff(code, en_flat, tgt_flat, meta_tracking, graph)
        print(f"  [{code}] seeded {len(tgt_flat)} units -> {xliff_path(code).name}")
    print("migrate: done. .xlf files are now the source of truth; "
          "backend/locale_packs is regenerated by `publish`.")
    return 0


# ── run-all ────────────────────────────────────────────────────────────────
def mode_run_all(args) -> int:
    for name, fn in (("check", mode_check), ("translate", mode_translate),
                     ("review", mode_review), ("redrive", mode_redrive),
                     ("publish", mode_publish)):
        print(f"\n=== {name} ===")
        rc = fn(args)
        if name == "check" and rc not in (0,) and not args.warn_only:
            # a failing check on missing source keys should stop the chain
            if rc == 2:
                return rc
        if rc not in (0, 1):
            return rc
    return 0


# ── CLI ────────────────────────────────────────────────────────────────────
def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["check", "translate", "review", "redrive",
                                    "publish", "migrate", "run-all"])
    p.add_argument("--locale", help="Restrict to one locale code")
    p.add_argument("--translation-model")
    p.add_argument("--review-model")
    p.add_argument("--redrive-model")
    p.add_argument("--operator", help="Human operator name for the PROV graph")
    p.add_argument("--flagged-only", action="store_true",
                   help="review: only score keys marked needs_review/new_translation")
    p.add_argument("--reset", action="store_true",
                   help="translate: re-translate every key, ignore reuse")
    p.add_argument("--use-mt", action="store_true",
                   help="translate: enable the classic MT fallback chain after Ollama")
    p.add_argument("--use-lara", action="store_true")
    p.add_argument("--use-deepl", action="store_true")
    p.add_argument("--warn-only", action="store_true", help="check: never exit non-zero on stale packs")
    p.add_argument("--skip-extract", action="store_true", help="check: skip the i18next-parser run")
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args()

    XLIFF_DIR.mkdir(parents=True, exist_ok=True)
    META_DIR.mkdir(parents=True, exist_ok=True)

    return {
        "check": mode_check, "translate": mode_translate, "review": mode_review,
        "redrive": mode_redrive, "publish": mode_publish, "migrate": mode_migrate,
        "run-all": mode_run_all,
    }[args.mode](args)


if __name__ == "__main__":
    sys.exit(main())
