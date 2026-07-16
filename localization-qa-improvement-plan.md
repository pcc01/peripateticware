# Localization QA Pipeline Improvement Plan

Generated 2026-07-09 by planning agent (repo explored: `C:\dev\peripateticware`). Updated 2026-07-09 with user decisions (see Part 7).

## Part 1 — What actually exists in the repo

The repo already has a three-model localization loop under `frontend\scripts\` (gitignored by default unless force-added — local-only tools).

### Localization data files and formats

| Artifact | Path | Format |
|---|---|---|
| English source (flat root) | `frontend\public\locales\en.json` (165 KB) | Nested JSON, dot-flattened keys like `landing.auth.login_btn` |
| English namespace files | `frontend\public\locales\en\{landing,common,curriculum,STUDENT,TEACHER}.json` | i18next namespaces |
| Per-locale flat root files | `frontend\public\locales\{code}.json` for `ar, de, es, fr, fr-CA, he, it, ja, ko, pt-BR, tr, zh` | Same nested JSON |
| Per-locale namespace files (what i18next reads) | `frontend\public\locales\{code}\{ns}.json` | Override pattern — only keys differing from English; fallback via `fallbackLng` |
| **Locale XML with provenance** | `frontend\public\locales\{code}.xlf` (~2.9 MB each) and `{code}\landing.xlf` | **XLIFF 1.2** with W3C-PROV JSON-LD graph in `<header><meta-group category="w3c-prov-jsonld">`. Per key: `entity:source-{key}`, `entity:target-{key}-vN`, `activity:translation-{key}-{ts}` (with `prov:startTime`, `actor`), `agent:` nodes (engine labels). Each `<trans-unit id="{key}" approved="yes/no">` carries `<source>`, `<target>`, `<note>Status: ... | Version: N</note>`. |

### Existing pipeline scripts (`frontend\scripts\`)

- **`translate_sync.py`** (1,383 lines) — bulk EN→locale translation. `UniversalOrchestrator` supports OLLAMA / CLAUDE / GEMINI / DEEPL / GOOGLE_TRANSLATE / MICROSOFT (env vars: `DEEPL_AUTH_KEY`, `MS_TRANSLATOR_KEY`, `MS_TRANSLATOR_REGION`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`). Also holds the reusable XLIFF/provenance toolkit (`build_or_update_prov_graph`, `parse_existing_xliff_with_prov`, `write_xliff_prov_file`), `flatten_json`/`unflatten_json`, atomic `save_json`, output sanitizers (`has_expected_script`, `looks_like_garbage`, `email_addresses_preserved`), and `is_do_not_translate` (backed by `frontend\src\constants\i18n-do-not-translate.md`).
- **`localization_qa_crawler.py`** (697 lines) — Playwright-crawls the *live* app per locale/role; flags `likely_untranslated` and `flagged` pairs judged by TowerInstruct via Ollama (`DEFAULT_MODEL = "hf.co/s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF:Q4_K_M"`) using an error-span QE prompt (`build_qe_prompt`, `is_clean_verdict`). Writes `frontend\qa\localization_qa_<timestamp>.json`.
- **`retranslate_flagged.py`** (453 lines) — reverse-maps report display-strings to `(namespace, key)`, retranslates with one chosen provider, writes namespace + root files (`write_namespace_value`), updates `{code}.xlf` provenance (`apply_xliff_overwrites` adds `prov:overwroteTranslationBy`, `prov:overwriteReason`, `prov:qaEvaluatorNote`).
- **`review_pipeline.py`** (398 lines) — interactive orchestrator: review → retranslate → re-review; already defaults to the TowerInstruct Q4_K_M GGUF via Ollama.
- **`sync_locales.py`** — distributes root flat files into namespace subdirectories.
- Context doc: `localization-content-audit.md`.

### Gap analysis vs. requirements

1. **Review**: exists, but (a) requires a running app + Playwright + Ollama; (b) binary flagged/clean, not ranked scores; (c) outputs display strings, forcing a fragile reverse-index back to keys. Needed: llama-cpp-python + GGUF directly, ranked key-level document.
2. **Translation**: DeepL and Microsoft engines exist; **Lara does not**, and there is **no character-budget tracking or pre-limit fallback** anywhere.
3. **Write-back**: largely exists, but `apply_xliff_overwrites` takes one actor label per run — a fallback chain that switches engines mid-run needs **per-key** actor attribution.

### Fact checks

- **HF repo correction:** `Unbabel/TowerInstruct-7B-v0.1-GGUF` **does not exist** on Hugging Face. Unbabel publishes only fp16; GGUF quants are third-party. **Decision: use `s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF`** — identical weights/quant to TheBloke's, and it's exactly what the existing crawler already pulls via Ollama, so scores stay comparable across both reviewers.
- **DeepL API Free: 500,000 chars/month — confirmed** ([DeepL API plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans), [usage & limits](https://developers.deepl.com/docs/resources/usage-limits)). Caveat: DeepL API Free reportedly can no longer be newly purchased — fine if the key already exists.
- **Microsoft Translator F0: 2,000,000 chars/month — confirmed**, permanent; over-limit returns 429/403 until month reset ([pricing](https://azure.microsoft.com/en-us/pricing/details/translator/), [service limits](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)).
- **Lara SDK**: `lara-sdk` on PyPI, official repo [translated/lara-python](https://github.com/translated/lara-python); SDK-standard env vars `LARA_ACCESS_KEY_ID` / `LARA_ACCESS_KEY_SECRET` match the provided sample.

## Part 2 — Architecture and module layout

```
locale JSON files (+ .xlf last-translated source)          [no live app needed]
        │
        ▼
[NEW] scripts/qa_review_llamacpp.py  ── TowerInstruct-7B Q4_K_M via llama-cpp-python
        │
        ▼
frontend/qa/retranslation_keys_<ts>.json  (+ .md twin)   ← ranked deliverable
        │
        ▼
[NEW] scripts/retranslate_mt.py ──uses──> [NEW] scripts/mt_fallback.py
        │                                   (Lara → DeepL → Microsoft + UsageLedger)
        │                                   ledger: frontend/qa/mt_usage_state.json
        ▼
write-back: reuse write_namespace_value()  → {code}/{ns}.json + {code}.json
xlf update: apply_xliff_overwrites() [MODIFIED for per-key actor] → {code}.xlf
        │
        ▼
optional re-review (same reviewer) to confirm
```

**Files to create** (under `frontend\scripts\`):

1. `qa_review_llamacpp.py` — stage 1 reviewer/ranker.
2. `mt_fallback.py` — engine wrappers + `UsageLedger` + `FallbackTranslator`.
3. `retranslate_mt.py` — stage 2+3 driver.

**Files to modify:**

4. `retranslate_flagged.py` — generalize `apply_xliff_overwrites` to accept a per-key actor label (add `"actor"` to `updates[key]`; keep old single-label param as default for backward compat).
5. `review_pipeline.py` — add menu entries: "[offline] file-based review (llama.cpp)" and "MT fallback retranslate (Lara→DeepL→Microsoft)".
6. `translate_sync.py` — optionally add `"LARA"` to `UniversalOrchestrator` (low priority).

Dependencies to add: `llama-cpp-python`, `huggingface_hub`, `lara-sdk`, `deepl` (already used), `requests`, `babel`.

## Part 3 — Stage 1: QA/review with TowerInstruct via llama-cpp-python

`qa_review_llamacpp.py`:

1. **Model load** — `hf_hub_download(repo_id="s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF", filename=<Q4_K_M gguf>)`; `llama_cpp.Llama(model_path=..., n_ctx=2048, n_gpu_layers=-1)`. **GPU: 12 GB VRAM available** — Q4_K_M 7B (~4.4 GB) fully offloads, so default `TOWER_N_GPU_LAYERS=-1`. Env vars: `TOWER_GGUF_REPO`, `TOWER_GGUF_FILE`, `TOWER_N_GPU_LAYERS`, `TOWER_N_CTX`. Windows: use prebuilt CUDA wheel to avoid local CMake build.
2. **Input iteration** — walk keys directly from files (output is already keyed — no reverse index). Per locale × namespace: flatten `en/{ns}.json` and `{code}/{ns}.json` (reuse `flatten_json`); root-only keys from `{code}.json`. Skip `is_do_not_translate` keys and `SKIP_LOCALE_DIRS`.
3. **Deterministic pre-checks (free, before any LLM call)** — automatic floor scores:
   - target missing or byte-identical to English (not allowlisted) → score 0, `untranslated`
   - template variables (`{{count}}`, `%s`, `$t(...)`) lost/mutated → score 0, `placeholder_broken`
   - wrong script for ja/zh/ko/ar/he → score 5 (reuse `has_expected_script`)
   - embedded email mutated → score 5 (reuse `email_addresses_preserved`)
4. **LLM evaluation** — same TowerInstruct `[INST]...[/INST]` error-span prompt as `build_qe_prompt` (proven with this model), asking for errors with severity (minor/major/critical). `score = max(0, 100 − 25·critical − 10·major − 3·minor)`; `NO ERRORS FOUND` → 100. One retry on unparseable output; twice unparseable → `score = null`, `needs_review: true`.
5. **Filtering/ranking** — **first run reports ALL keys with scores (no cutoff)**; Paul reviews the first ranked report before a threshold is fixed. Thereafter `--score-threshold` selects the deliverable set. Sorting: worst score first across all locales (global rank), tie-broken by namespace priority (`landing` first) then source length.
6. **Checkpointing** — write report after every locale; `--locales`, `--namespaces`, `--max-keys` flags for smoke tests.

### Retranslation-keys document format (deliverable)

`frontend/qa/retranslation_keys_<timestamp>.json`:

```json
{
  "generated_at": "2026-07-09T...Z",
  "reviewer": "TowerInstruct-7B-v0.1 Q4_K_M (llama-cpp-python)",
  "scoring": {"scale": "0-100", "threshold": 80, "weights": {"critical": 25, "major": 10, "minor": 3}},
  "summary": {
    "per_locale": {"es": {"flagged": 41, "source_chars": 3120}},
    "total_flagged": 512,
    "total_source_chars": 38400
  },
  "items": [
    {
      "rank": 1, "locale": "ja", "namespace": "landing", "key": "privacy.summary_desc",
      "source_en": "…", "current_target": "…", "source_chars": 118,
      "score": 0, "reasons": ["placeholder_broken"],
      "errors": [{"severity": "critical", "span": "…", "note": "…"}],
      "evaluator_response": "raw model text (when LLM was consulted)"
    }
  ]
}
```

Plus a human-readable `.md` twin. `summary.total_source_chars` lets you see **before** stage 2 whether work fits the Lara budget or spills into DeepL/Microsoft.

## Part 4 — Stage 2: MT translation with strict fallback and budget tracking

`mt_fallback.py`:

**Engine wrappers** (uniform interface `translate_batch(texts, source_locale, target_locale)`, `supports(target_locale)`, `engine_label` for provenance):

- `LaraEngine` — SDK sample verbatim: `Credentials(access_key_id=..., access_key_secret=...)`, `Translator(credentials)`, `lara.translate(text, source="en-US", target=...)`. Label: `LARA-translate-api`.
- `DeepLEngine` — reuse existing `deepl.Translator(DEEPL_AUTH_KEY)` pattern; call `translator.get_usage()` at startup to **reconcile the local ledger with DeepL's server-side count**. Label: `DEEPL-API-Free`.
- `MicrosoftEngine` — reuse existing REST call with `MS_TRANSLATOR_KEY` + `MS_TRANSLATOR_REGION`. Label: `MICROSOFT-Azure-Cognitive-v3-F0`.

**Locale mapping table** (repo locale → per-API code): e.g. `pt-BR` → Lara `pt-BR`, DeepL `PT-BR`, MS `pt-BR`; `zh` → DeepL `ZH`, MS `zh-Hans`; `fr-CA` — DeepL has no FR-CA variant → "target unsupported" is a fallback trigger, verified at startup against each API's supported-languages endpoint.

**`UsageLedger`** — persisted at `frontend/qa/mt_usage_state.json` (atomic write, temp-file + `os.replace`):

```json
{
  "lara":      {"scope": "month", "month": "2026-07", "limit": 60000, "used": 100},
  "deepl":     {"scope": "lifetime", "limit": 500000, "used": 0},
  "microsoft": {"scope": "month", "month": "2026-07", "limit": 2000000, "used": 0}
}
```

Month rollover resets Lara and Microsoft — **Lara is 60,000 chars/month** (59,900 remaining at first seed for 2026-07, so `used: 100`). **DeepL is a ONE-TIME 500,000-char allowance that never resets** (`scope: lifetime`), and is additionally **held out of the default chain**: the default order is Lara → Microsoft, and DeepL joins (between them) only with `retranslate_mt.py --use-deepl`. Ledger written after every successful call; `used` incremented by **source characters sent** (all three bill on input chars).

**`FallbackTranslator` selection (switch BEFORE the limit):**

```
effective_budget(engine) = limit_or_budget * (1 - SAFETY_MARGIN)
for each batch: needed = sum(len(src) for src in batch)
pick first engine in [lara, deepl, microsoft] where
    engine.configured AND engine.supports(target) AND used + needed <= effective_budget
if none fits whole batch → split batch / move to next engine
if no engine has room → stop cleanly, write remainder to
    frontend/qa/retranslation_deferred_<ts>.json
```

Budget check happens **before** any request, on exact char counts — nothing can cross a cap.

**Config variables** (env vars; `MT_` config block at top of `mt_fallback.py`):

| Purpose | Env var | Default |
|---|---|---|
| Lara credentials | `LARA_ACCESS_KEY_ID`, `LARA_ACCESS_KEY_SECRET` | — (SDK-standard) |
| Lara monthly limit | `LARA_MONTHLY_CHAR_LIMIT` | **60000** |
| DeepL key | `DEEPL_AUTH_KEY` | — (existing convention) |
| DeepL one-time limit | `DEEPL_TOTAL_CHAR_LIMIT` | **500000** (lifetime; opt-in via `--use-deepl`) |
| Microsoft key + region | `MS_TRANSLATOR_KEY`, `MS_TRANSLATOR_REGION` | — / `global` (existing) |
| Microsoft monthly limit | `MS_MONTHLY_CHAR_LIMIT` | **2000000** |
| Safety margin | `MT_SAFETY_MARGIN` | `0.03` (Lara ≈ 58,200; DeepL 485k; MS 1.94M effective) |
| Ledger path | `MT_USAGE_STATE_FILE` | `frontend/qa/mt_usage_state.json` |

**Per-API limit table:**

| API | Priority | Limit | Basis |
|---|---|---|---|
| Lara (Translated) | 1 | 10,000 chars/month free tier (+1,000 chars/sec throughput cap; TM hits free) | Lara docs, confirmed in production 2026-07 |
| DeepL API Free | opt-in only (`--use-deepl`, slots between Lara and Microsoft) | 500,000 chars ONE-TIME, never resets | user-stated allowance |
| Microsoft Translator F0 | 2 (default fallback) | 2,000,000 chars/month | confirmed via Azure docs, permanent |

**Error/fallback handling matrix:**

| Event | Action |
|---|---|
| Budget check fails pre-call | next engine (no API call made) |
| DeepL 456 quota / MS 429·403 quota | mark engine exhausted-for-month in ledger (belt-and-braces), retry batch on next engine |
| Transient 5xx / timeout / rate limit | exponential backoff (existing `retry_call` pattern); final failure → next engine |
| Target unsupported by engine | next engine (decided at startup per locale) |
| Empty/unchanged/garbage output | run deterministic validators on output; reject → next engine for that item; all fail → keep old value, log |
| All engines exhausted mid-run | stop, persist ledger, write `retranslation_deferred_<ts>.json` (worst-ranked items processed first, so budget goes to worst strings) |
| Credentials missing | engine excluded from chain with startup warning (run Lara-less before keys arrive) |

`retranslate_mt.py` (driver): reads ranked doc, processes **in rank order** (worst first), respects `is_do_not_translate`, protects emails/placeholders (`protect_emails`/`restore_emails`), supports `--dry-run` (per-engine char consumption forecast, no API calls), `--locales`, `--max-chars`; writes audit log `frontend/qa/mt_retranslation_log_<ts>.json` (same shape as existing audit entries, plus per-item `"engine"`).

## Part 5 — Stage 3: Write-back and provenance

1. **JSON write-back** — reuse `write_namespace_value(locale, ns, key, value)` unchanged: writes `{code}/{ns}.json`, mirrors `landing` keys into root `{code}.json`. Run `sync_locales.py` at the end.
2. **XLIFF provenance** — modify `apply_xliff_overwrites`: each `updates[key]` record carries its own `"actor"` (a run can span engines when fallback switches). Existing machinery already records: new `prov:Activity` with `prov:startTime` (the *when*), agent node (the *which engine*), version bump, `prov:overwroteTranslationBy` (previous engine via `find_actor_for_version`), `prov:overwriteReason` (pass QA reason + score, e.g. `"qa_score=12: placeholder_broken"`), `prov:qaEvaluatorNote` (TowerInstruct's error analysis).
3. **Namespace coverage — DECIDED: extend.** Only root/landing has `.xlf` today. `retranslate_mt.py` will seed `{code}/{ns}.xlf` for `common/STUDENT/TEACHER/curriculum` via `write_xliff_prov_file` (namespace-agnostic already), so every retranslated key gets an XLIFF provenance record regardless of namespace.

## Part 6 — Implementation sequence

1. **`mt_fallback.py`** first (no deps on other new work): `UsageLedger` + engine wrappers + `FallbackTranslator` + locale-mapping + `--selftest` mode (budget math, month rollover, offline). Testable without credentials.
2. **Modify `apply_xliff_overwrites`** for per-key actors (small, backward-compatible).
3. **`retranslate_mt.py`** — wire ranked-doc → `FallbackTranslator` → `write_namespace_value` → `apply_xliff_overwrites`. Test with `--dry-run`, then one locale.
4. **`qa_review_llamacpp.py`** — deterministic checks first (immediately useful, zero model cost), then llama-cpp evaluation + severity parsing + ranking + outputs. Validate on `--max-keys 20 --locales it`.
5. **`review_pipeline.py`** menu integration + doc updates.
6. Full run: offline review (all locales) → inspect ranked doc + char totals → `--dry-run` → real run → re-review to confirm scores improved.

Rationale: budget/ledger correctness is the highest-risk requirement ("nothing fails"), so it's built and self-tested first.

## Part 7 — Decisions (resolved 2026-07-09)

1. **GGUF repo**: `s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF` Q4_K_M. No quality difference vs TheBloke (same weights, same quant); s3nh keeps scores comparable with the existing Ollama-based crawler.
2. **Budget order**: worst score first, ranked globally across all locales.
3. **Crawler**: keep both — the crawler's DOM check remains the only detector for hardcoded strings never wrapped in `t()`.
4. **XLIFF provenance**: extend to all namespaces (see Part 5 §3).
5. **Lara allowance**: 60,000 chars/month, monthly reset; 59,900 remaining for 2026-07.
6. **`fr-CA`**: skip DeepL (Lara→Microsoft). Base FR is translated first; fr-CA carries only Canada-unique overrides.
7. **Score threshold**: first run reports all keys with scores; cutoff fixed after Paul reviews the first ranked report.
8. **Hardware**: 12 GB VRAM GPU — full GPU offload (`n_gpu_layers=-1`), CUDA build of llama-cpp-python.

## Sources

[DeepL API plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans) · [DeepL usage and limits](https://developers.deepl.com/docs/resources/usage-limits) · [Azure Translator pricing](https://azure.microsoft.com/en-us/pricing/details/translator/) · [Azure Translator service limits](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits) · [translated/lara-python](https://github.com/translated/lara-python) · [lara-sdk on PyPI](https://pypi.org/project/lara-sdk/) · [Lara API key guide](https://support.laratranslate.com/en/api-key-for-laras-api)
