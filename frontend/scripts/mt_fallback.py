#!/usr/bin/env python3
# frontend/scripts/mt_fallback.py
#
# Free-tier machine-translation fallback chain for the localization QA loop:
#
#   Lara (Translated)  ->  [DeepL API Free, OPT-IN ONLY]  ->  Microsoft (Azure F0)
#
# The whole point of this module is the guarantee that NOTHING is ever
# submitted to an API that could push it over its free-tier character cap.
# Every request is budget-checked BEFORE it is sent, against a persistent
# ledger (frontend/qa/mt_usage_state.json), using exact source character
# counts. When an engine's effective budget (limit minus a safety margin)
# can't afford the next item, the chain moves to the next engine. When no
# engine has room, translation stops cleanly and the caller gets the
# untouched remainder back — it is never "attempted anyway".
#
# All three providers bill on SOURCE characters sent:
#   Lara       10,000 chars/MONTH free tier (+1,000 chars/sec throughput cap;
#                                    TM hits free — see notes at
#                                    LARA_MONTHLY_CHAR_LIMIT below)
#   DeepL Free 500,000 chars ONE-TIME total (user account: a single lifetime
#                                    allowance, NOT monthly — never resets).
#                                    DeepL is also EXCLUDED from the default
#                                    chain: it participates only when
#                                    explicitly requested (use_deepl=True /
#                                    retranslate_mt.py --use-deepl), so the
#                                    one-time budget is preserved until Paul
#                                    deliberately chooses to spend it.
#   Azure F0   2,000,000 chars/MONTH (https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)
#
# CREDENTIALS / CONFIG (environment variables):
#   LARA_ACCESS_KEY_ID        Lara access key ID       (lara-sdk standard name)
#   LARA_ACCESS_KEY_SECRET    Lara access key secret   (lara-sdk standard name)
#   LARA_MONTHLY_CHAR_LIMIT   default 60000
#   LARA_CHARS_REMAINING      first-ever ledger seed only: how many Lara chars
#                             are left THIS month (default 59900, per Paul,
#                             2026-07). Ignored once the ledger file exists;
#                             month rollover resets usage to 0 (full limit).
#   DEEPL_AUTH_KEY            DeepL API Free auth key  (same var translate_sync.py uses)
#   DEEPL_TOTAL_CHAR_LIMIT    default 500000 — LIFETIME total, never resets
#   MS_TRANSLATOR_KEY         Azure Translator key     (same var translate_sync.py uses)
#   MS_TRANSLATOR_REGION      default "global"         (same var translate_sync.py uses)
#   MS_MONTHLY_CHAR_LIMIT     default 2000000
#   MT_SAFETY_MARGIN          default 0.03 — never use the last 3% of any cap
#   MT_USAGE_STATE_FILE       default frontend/qa/mt_usage_state.json
#
# An engine whose credentials are missing is excluded from the chain with a
# startup warning rather than crashing — so this can run with any subset of
# keys configured.
#
# USAGE (as a library — retranslate_mt.py is the driver):
#     from mt_fallback import FallbackTranslator
#     ft = FallbackTranslator()                # Lara -> Microsoft (DeepL held back)
#     ft = FallbackTranslator(use_deepl=True)  # Lara -> DeepL -> Microsoft
#     results, deferred = ft.translate_all(items)   # items: [{"text", "locale"}, ...]
#
# SELF-TEST (no network, no credentials, temp ledger):
#     python scripts/mt_fallback.py --selftest
#     python scripts/mt_fallback.py --status      # print the live ledger

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

FRONTEND_DIR = Path(__file__).parent.parent
QA_DIR = FRONTEND_DIR / "qa"

# ─── Config (all overridable via environment) ───────────────────────────────

# Lara Free tier (per Lara docs, confirmed in production 2026-07):
#   - 10,000 characters per MONTH (enforced on submitted chars; the run that
#     assumed 60k got benched at almost exactly 10,000)
#   - up to 1,000 characters per SECOND throughput
#   - translation-memory hits are FREE and work even when the monthly quota
#     is spent — which is why a tiny "Hello" probe can PASS while real
#     translation calls fail. Don't trust a probe alone; trust the ledger.
LARA_MONTHLY_CHAR_LIMIT = int(os.getenv("LARA_MONTHLY_CHAR_LIMIT", "10000"))
LARA_CHARS_REMAINING = int(os.getenv("LARA_CHARS_REMAINING", "10000"))
LARA_CHARS_PER_SECOND = int(os.getenv("LARA_CHARS_PER_SECOND", "1000"))
# One-time lifetime allowance (never resets). DEEPL_MONTHLY_CHAR_LIMIT is
# honored as a legacy alias so an already-exported env var still works.
DEEPL_TOTAL_CHAR_LIMIT = int(os.getenv("DEEPL_TOTAL_CHAR_LIMIT",
                                       os.getenv("DEEPL_MONTHLY_CHAR_LIMIT", "500000")))
MS_MONTHLY_CHAR_LIMIT = int(os.getenv("MS_MONTHLY_CHAR_LIMIT", "2000000"))
MT_SAFETY_MARGIN = float(os.getenv("MT_SAFETY_MARGIN", "0.03"))
MT_USAGE_STATE_FILE = Path(os.getenv("MT_USAGE_STATE_FILE", str(QA_DIR / "mt_usage_state.json")))

MS_TRANSLATOR_ENDPOINT = "https://api.cognitive.microsofttranslator.com"

# Max items per API request for the batching engines (Lara's SDK sample is
# single-text, so it always translates one at a time regardless).
BATCH_CAP = 25

# ─── Locale mapping ─────────────────────────────────────────────────────────
# Repo locale code -> per-API target code. None = engine can't serve this
# locale, which is a fallback trigger exactly like an exhausted budget.
#
# fr-CA: DeepL has no French-Canada variant, and base FR is translated first
# (fr-CA carries only Canada-unique overrides), so fr-CA deliberately skips
# DeepL: Lara -> Microsoft (decision, plan Part 7 #6).
# DeepL support is additionally verified live at startup when a client is
# available (get_target_languages()), so this static map is a fallback, not
# the sole source of truth.

LOCALE_MAP: dict[str, dict[str, str | None]] = {
    #  repo     lara        deepl     microsoft
    "ar":     {"lara": "ar-SA", "deepl": "AR",    "ms": "ar"},
    "de":     {"lara": "de-DE", "deepl": "DE",    "ms": "de"},
    "es":     {"lara": "es-ES", "deepl": "ES",    "ms": "es"},
    "fr":     {"lara": "fr-FR", "deepl": "FR",    "ms": "fr"},
    "fr-CA":  {"lara": "fr-CA", "deepl": None,    "ms": "fr-ca"},
    "he":     {"lara": "he-IL", "deepl": "HE",    "ms": "he"},
    "it":     {"lara": "it-IT", "deepl": "IT",    "ms": "it"},
    "ja":     {"lara": "ja-JP", "deepl": "JA",    "ms": "ja"},
    "ko":     {"lara": "ko-KR", "deepl": "KO",    "ms": "ko"},
    "pt-BR":  {"lara": "pt-BR", "deepl": "PT-BR", "ms": "pt"},
    "tr":     {"lara": "tr-TR", "deepl": "TR",    "ms": "tr"},
    "zh":     {"lara": "zh-CN", "deepl": "ZH",    "ms": "zh-Hans"},
}

SOURCE_LOCALE = {"lara": "en-US", "deepl": "EN", "ms": "en"}


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _atomic_write_json(path: Path, data: dict) -> None:
    """Same temp-file + os.replace pattern translate_sync.save_json uses, so
    an interrupted run can never leave a truncated ledger on disk."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


# ─── Usage ledger ───────────────────────────────────────────────────────────

class UsageLedger:
    """Character-usage state for all three engines, persisted after every
    successful API call so a crash/kill can't lose spend history (losing it
    would risk re-spending the same budget next run).

    Scopes differ per engine:
      lara       month    — resets to 0 each calendar month (UTC)
      deepl      lifetime — ONE-TIME 500k allowance, never resets
      microsoft  month    — resets to 0 each calendar month (UTC)
    """

    ENGINES = ("lara", "deepl", "microsoft")
    ENGINE_SCOPES = {"lara": "month", "deepl": "lifetime", "microsoft": "month"}

    def __init__(self, path: Path = MT_USAGE_STATE_FILE,
                 limits: dict[str, int] | None = None,
                 safety_margin: float = MT_SAFETY_MARGIN):
        self.path = path
        self.safety_margin = safety_margin
        self.limits = limits or {
            "lara": LARA_MONTHLY_CHAR_LIMIT,
            "deepl": DEEPL_TOTAL_CHAR_LIMIT,
            "microsoft": MS_MONTHLY_CHAR_LIMIT,
        }
        self.state = self._load()

    def _fresh_entry(self, engine: str, used: int = 0) -> dict:
        entry = {
            "scope": self.ENGINE_SCOPES[engine],
            "limit": self.limits[engine],
            "used": used,
            "exhausted": False,  # set when the API itself said "quota" — belt and braces
        }
        if entry["scope"] == "month":
            entry["month"] = _current_month()
        return entry

    def _fresh_state(self, seed_lara_used: int = 0) -> dict:
        return {engine: self._fresh_entry(engine, seed_lara_used if engine == "lara" else 0)
                for engine in self.ENGINES}

    def _load(self) -> dict:
        if self.path.exists():
            try:
                state = json.loads(self.path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                print(f"WARNING: could not parse ledger {self.path} — starting fresh (conservative Lara seed).")
                state = self._fresh_state(seed_lara_used=self.limits["lara"] - LARA_CHARS_REMAINING)
        else:
            # First-ever ledger: Paul has LARA_CHARS_REMAINING left this month,
            # so record the difference as already-used. Future months reset to 0.
            state = self._fresh_state(seed_lara_used=max(0, self.limits["lara"] - LARA_CHARS_REMAINING))
        return self._rollover(state)

    def _rollover(self, state: dict) -> dict:
        """Month-scoped engines reset when the calendar month changes.
        Lifetime-scoped engines (DeepL) NEVER reset — their `used` only grows.
        Also migrates any pre-existing ledger where deepl was month-scoped."""
        month = _current_month()
        for engine in self.ENGINES:
            entry = state.get(engine) or {}
            scope = self.ENGINE_SCOPES[engine]
            if not entry:
                state[engine] = self._fresh_entry(engine)
                continue
            if scope == "month":
                if entry.get("month") != month:
                    state[engine] = self._fresh_entry(engine)
                    continue
            else:  # lifetime: keep used forever; drop a stale month field if migrating
                entry["scope"] = "lifetime"
                entry.pop("month", None)
            # Limits may have been re-configured since the ledger was written.
            entry["limit"] = self.limits[engine]
            entry.setdefault("used", 0)
            entry.setdefault("exhausted", False)
        return state

    def effective_budget(self, engine: str) -> int:
        return int(self.state[engine]["limit"] * (1 - self.safety_margin))

    def remaining(self, engine: str) -> int:
        if self.state[engine].get("exhausted"):
            return 0
        return max(0, self.effective_budget(engine) - self.state[engine]["used"])

    def can_spend(self, engine: str, chars: int) -> bool:
        return chars <= self.remaining(engine)

    def record(self, engine: str, chars: int) -> None:
        self.state[engine]["used"] += chars
        self.save()

    def reconcile(self, engine: str, server_used: int) -> None:
        """Adopt the provider's own server-side count when it's HIGHER than
        ours (e.g. someone used the same key elsewhere). Never lower ours —
        the local count is the conservative truth for in-flight requests,
        and for DeepL's lifetime budget a lower server number (their counter
        is billing-period-scoped) must never un-spend the one-time allowance."""
        if server_used > self.state[engine]["used"]:
            print(f"  Ledger reconciled from server: {engine} used {server_used} "
                  f"(local ledger said {self.state[engine]['used']})")
            self.state[engine]["used"] = server_used
            self.save()

    def mark_exhausted(self, engine: str) -> None:
        self.state[engine]["exhausted"] = True
        self.save()

    def save(self) -> None:
        _atomic_write_json(self.path, self.state)

    def summary(self) -> str:
        lines = []
        for engine in self.ENGINES:
            e = self.state[engine]
            scope = f"month {e['month']}" if e.get("scope") == "month" else "ONE-TIME, never resets"
            flag = " [EXHAUSTED - API said quota]" if e.get("exhausted") else ""
            note = {"deepl": " [opt-in: only used with --use-deepl]",
                    "lara": " [opt-in: only used with --use-lara]"}.get(engine, "")
            lines.append(f"  {engine:<10} {e['used']:>9,} / {e['limit']:>9,} chars used "
                         f"({self.remaining(engine):,} spendable after {self.safety_margin:.0%} margin, "
                         f"{scope}){flag}{note}")
        return "\n".join(lines)


def _make_lara_key(key_id: str, key_secret: str):
    """lara-sdk credential object across SDK versions: newer SDKs use
    AccessKey(id=..., secret=...); older ones use Credentials(access_key_id=
    ..., access_key_secret=...) (now deprecated)."""
    try:
        from lara_sdk import AccessKey
        return AccessKey(id=key_id, secret=key_secret)
    except ImportError:
        from lara_sdk import Credentials
        return Credentials(access_key_id=key_id, access_key_secret=key_secret)


# ─── Engine wrappers ────────────────────────────────────────────────────────
# Uniform surface: .name (ledger key), .label (provenance actor string),
# .configured, .supports(repo_locale), .translate_batch(texts, repo_locale).

class LaraEngine:
    name = "lara"
    label = "LARA-translate-api"

    def __init__(self):
        self.client = None
        key_id = os.getenv("LARA_ACCESS_KEY_ID")
        key_secret = os.getenv("LARA_ACCESS_KEY_SECRET")
        self.configured = bool(key_id and key_secret)
        if not self.configured:
            return
        try:
            from lara_sdk import Translator
            self.client = Translator(_make_lara_key(key_id, key_secret))
        except ImportError:
            print("WARNING: lara-sdk not installed (pip install lara-sdk) — Lara excluded from chain.")
            self.configured = False

    def supports(self, repo_locale: str) -> bool:
        return LOCALE_MAP.get(repo_locale, {}).get("lara") is not None

    def translate_batch(self, texts: list[str], repo_locale: str) -> list[str]:
        target = LOCALE_MAP[repo_locale]["lara"]
        out = []
        for text in texts:  # SDK sample is single-text; keep it simple and exact
            res = self.client.translate(text, source=SOURCE_LOCALE["lara"], target=target)
            out.append(res.translation)
            # Lara Free tier processes up to 1,000 characters/second. Spend
            # that time budget explicitly after every call (chars/1000 s, min
            # 0.1s) so a burst of sequential calls can never trip the limiter.
            time.sleep(max(0.1, len(text) / max(1, LARA_CHARS_PER_SECOND)))
        return out


class DeepLEngine:
    name = "deepl"
    label = "DEEPL-API-Free"

    def __init__(self):
        self.client = None
        self._live_targets: set[str] | None = None
        key = os.getenv("DEEPL_AUTH_KEY")
        self.configured = bool(key)
        if not self.configured:
            return
        try:
            import deepl
            self.client = deepl.Translator(key)
            try:
                self._live_targets = {l.code.upper() for l in self.client.get_target_languages()}
            except Exception as e:
                print(f"WARNING: couldn't fetch DeepL supported languages ({e}) — using static map.")
        except ImportError:
            print("WARNING: deepl not installed (pip install deepl) — DeepL excluded from chain.")
            self.configured = False

    def server_used_chars(self) -> int | None:
        """DeepL reports its own character count — free self-correction for the ledger."""
        try:
            usage = self.client.get_usage()
            if usage.character and usage.character.count is not None:
                return int(usage.character.count)
        except Exception:
            pass
        return None

    def supports(self, repo_locale: str) -> bool:
        code = LOCALE_MAP.get(repo_locale, {}).get("deepl")
        if code is None:
            return False
        if self._live_targets is not None:
            return code.upper() in self._live_targets
        return True

    def translate_batch(self, texts: list[str], repo_locale: str) -> list[str]:
        target = LOCALE_MAP[repo_locale]["deepl"]
        results = self.client.translate_text(texts, source_lang=SOURCE_LOCALE["deepl"], target_lang=target)
        if not isinstance(results, list):
            results = [results]
        return [r.text for r in results]


class MicrosoftEngine:
    name = "microsoft"
    label = "MICROSOFT-Azure-Cognitive-v3-F0"

    def __init__(self):
        self.key = os.getenv("MS_TRANSLATOR_KEY")
        self.region = os.getenv("MS_TRANSLATOR_REGION", "global")
        self.configured = bool(self.key and self.key != "YOUR_MICROSOFT_AZURE_KEY")

    def supports(self, repo_locale: str) -> bool:
        return LOCALE_MAP.get(repo_locale, {}).get("ms") is not None

    def translate_batch(self, texts: list[str], repo_locale: str) -> list[str]:
        target = LOCALE_MAP[repo_locale]["ms"]
        url = (f"{MS_TRANSLATOR_ENDPOINT}/translate?api-version=3.0"
               f"&from={SOURCE_LOCALE['ms']}&to={target}")
        headers = {
            "Ocp-Apim-Subscription-Key": self.key,
            "Ocp-Apim-Subscription-Region": self.region,
            "Content-type": "application/json",
        }
        resp = requests.post(url, headers=headers, json=[{"text": t} for t in texts], timeout=60)
        resp.raise_for_status()
        return [r["translations"][0]["text"] for r in resp.json()]


def _is_quota_error(exc: Exception) -> bool:
    """True ONLY for a spent monthly/character allowance (DeepL 456, Azure
    403001, explicit character/credit messages). Rate limiting is checked
    FIRST and always wins: providers often word their 429s with 'quota'-ish
    language ('quota exceeded, retry later'), and misreading one benched Lara
    for the whole month two minutes into a run — a rate limit is transient
    and must be retried, never recorded as exhaustion."""
    s = str(exc).upper()
    if any(tok in s for tok in ("429", "TOO MANY REQUESTS", "RATE LIMIT", "RATE-LIMIT", "RETRY LATER", "RETRY AFTER")):
        return False
    return any(tok in s for tok in ("456", "403001", "CHARACTER LIMIT", "CHARACTERS LIMIT",
                                    "MONTHLY QUOTA", "QUOTA EXCEEDED", "INSUFFICIENT CREDIT",
                                    "NO CREDIT", "OUT OF CREDIT"))


def _is_transient_error(exc: Exception) -> bool:
    s = str(exc).upper()
    return any(tok in s for tok in ("429", "TIMEOUT", "TIMED OUT", "CONNECTION", "500", "502", "503", "504",
                                    "RATE", "TEMPORARILY"))


# ─── Fallback chain ─────────────────────────────────────────────────────────

class FallbackTranslator:
    """Strict-priority chain with pre-call budget enforcement.

    Default chain: Microsoft only (2M chars/month F0 — the workhorse).
    Lara joins at the FRONT only with use_lara=True (its free tier is just
    10,000 chars/month, so it's opt-in for small, targeted runs). DeepL
    joins in the MIDDLE only with use_deepl=True (its 500k allowance is
    ONE-TIME and never resets). Both hold-backs apply even to injected
    engine lists, so nothing can spend those budgets by accident.

    `engines` and `ledger` are injectable for --selftest."""

    def __init__(self, ledger: UsageLedger | None = None, engines: list | None = None,
                 max_retries: int = 3, use_deepl: bool = False, use_lara: bool = False):
        self.ledger = ledger or UsageLedger()
        self.use_deepl = use_deepl
        self.use_lara = use_lara
        engines = engines if engines is not None else [LaraEngine(), DeepLEngine(), MicrosoftEngine()]
        if not use_lara:
            held = [e for e in engines if e.name == "lara"]
            engines = [e for e in engines if e.name != "lara"]
            if held:
                print("NOTE: Lara held back (only 10,000 free chars/month) — "
                      "pass --use-lara to include it at the front of the chain.")
        if not use_deepl:
            held = [e for e in engines if e.name == "deepl"]
            engines = [e for e in engines if e.name != "deepl"]
            if held:
                print("NOTE: DeepL held in reserve (one-time 500k budget) — "
                      "pass --use-deepl to include it in the chain.")
        self.engines = engines
        self.max_retries = max_retries

        for eng in self.engines:
            if not eng.configured:
                print(f"NOTE: {eng.name} has no credentials configured — excluded from the chain this run.")

        # Free ledger self-correction: DeepL tells us its own server-side count.
        for eng in self.engines:
            if eng.name == "deepl" and eng.configured and hasattr(eng, "server_used_chars"):
                server_used = eng.server_used_chars()
                if server_used is not None:
                    self.ledger.reconcile("deepl", server_used)

    # -- engine selection ----------------------------------------------------

    def usable_engines(self, repo_locale: str) -> list:
        return [e for e in self.engines if e.configured and e.supports(repo_locale)]

    def pick_engine(self, repo_locale: str, needed_chars: int, exclude: set[str] = frozenset()):
        for eng in self.usable_engines(repo_locale):
            if eng.name in exclude:
                continue
            if self.ledger.can_spend(eng.name, needed_chars):
                return eng
        return None

    # -- translation ----------------------------------------------------------

    def _call_with_retries(self, eng, texts: list[str], repo_locale: str) -> list[str]:
        delay = 2
        for attempt in range(self.max_retries):
            try:
                return eng.translate_batch(texts, repo_locale)
            except Exception as exc:
                if _is_quota_error(exc):
                    raise  # handled by caller: mark exhausted, next engine
                if _is_transient_error(exc) and attempt < self.max_retries - 1:
                    print(f"    transient {eng.name} error ({exc}); retrying in {delay}s...")
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
        raise RuntimeError("unreachable")

    def translate_one(self, text: str, repo_locale: str,
                      exclude: set[str] = frozenset()) -> dict | None:
        """Single-item translation with optional engine exclusion — used by the
        driver to retry an item on the NEXT engine when the first engine's
        output failed post-validation (garbage/wrong-script/altered email).
        Budget rules are identical to translate_all."""
        excluded = set(exclude)
        while True:
            eng = self.pick_engine(repo_locale, len(text), exclude=excluded)
            if eng is None:
                return None
            try:
                translations = self._call_with_retries(eng, [text], repo_locale)
            except Exception as exc:
                if _is_quota_error(exc):
                    print(f"    {eng.name} allowance is spent — benching it in the ledger. "
                          f"Provider said: {type(exc).__name__}: {str(exc)[:200]}")
                    self.ledger.mark_exhausted(eng.name)
                else:
                    excluded.add(eng.name)
                continue
            if len(translations) != 1:
                excluded.add(eng.name)
                continue
            self.ledger.record(eng.name, len(text))
            return {"translation": translations[0], "engine": eng.label, "engine_name": eng.name}

    def translate_all(self, items: list[dict]) -> tuple[list[dict | None], list[dict]]:
        """items: [{"text": str, "locale": str, ...}, ...] — processed in the
        order given (the driver passes them worst-QA-score first, so if budget
        runs out, it ran out on the least important strings).

        Returns (results, deferred):
          results[i] = {"translation": str, "engine": label} or None if deferred
          deferred   = the original item dicts that no engine could serve
        """
        results: list[dict | None] = [None] * len(items)
        deferred: list[dict] = []

        i = 0
        while i < len(items):
            item = items[i]
            locale = item["locale"]
            text = item["text"]
            failed_engines: set[str] = set()

            while True:
                eng = self.pick_engine(locale, len(text), exclude=failed_engines)
                if eng is None:
                    deferred.append(item)
                    break

                # Greedy batching: pull in the following items that share this
                # locale and still fit this engine's remaining budget.
                batch_idx = [i]
                batch_chars = len(text)
                j = i + 1
                while (j < len(items) and len(batch_idx) < BATCH_CAP
                       and items[j]["locale"] == locale
                       and self.ledger.can_spend(eng.name, batch_chars + len(items[j]["text"]))):
                    batch_chars += len(items[j]["text"])
                    batch_idx.append(j)
                    j += 1
                batch_texts = [items[k]["text"] for k in batch_idx]

                try:
                    translations = self._call_with_retries(eng, batch_texts, locale)
                except Exception as exc:
                    if _is_quota_error(exc):
                        print(f"    {eng.name} allowance is spent — benching it in the ledger. "
                              f"Provider said: {type(exc).__name__}: {str(exc)[:200]}")
                        self.ledger.mark_exhausted(eng.name)
                    else:
                        print(f"    {eng.name} failed for this batch ({exc}) — trying next engine.")
                        failed_engines.add(eng.name)
                    continue  # re-pick engine for the same leading item

                if len(translations) != len(batch_texts):
                    print(f"    {eng.name} returned {len(translations)} results for "
                          f"{len(batch_texts)} inputs — trying next engine.")
                    failed_engines.add(eng.name)
                    continue

                # Success: spend is recorded ONLY for what was actually sent.
                self.ledger.record(eng.name, batch_chars)
                for k, translation in zip(batch_idx, translations):
                    results[k] = {"translation": translation, "engine": eng.label,
                                  "engine_name": eng.name}
                i = batch_idx[-1]  # outer loop's i += 1 moves past the batch
                break

            i += 1

        return results, deferred


# ─── Self-test (offline, no credentials, temp ledger) ───────────────────────

class _FakeEngine:
    def __init__(self, name: str, label: str, fail_locales: set[str] = frozenset(),
                 quota_after_calls: int | None = None):
        self.name, self.label = name, label
        self.configured = True
        self._fail_locales = fail_locales
        self._quota_after = quota_after_calls
        self.calls = 0

    def supports(self, repo_locale: str) -> bool:
        return repo_locale not in self._fail_locales

    def translate_batch(self, texts: list[str], repo_locale: str) -> list[str]:
        self.calls += 1
        if self._quota_after is not None and self.calls > self._quota_after:
            raise RuntimeError("456 Quota Exceeded")
        return [f"[{self.name}:{repo_locale}] {t}" for t in texts]


def _selftest() -> int:
    import tempfile
    failures = []

    def check(cond: bool, msg: str):
        print(("  PASS  " if cond else "  FAIL  ") + msg)
        if not cond:
            failures.append(msg)

    with tempfile.TemporaryDirectory() as td:
        ledger_path = Path(td) / "ledger.json"

        # 1. Fresh ledger seeds Lara used = limit - remaining (100 for 60k/59.9k)
        ledger = UsageLedger(path=ledger_path, limits={"lara": 60000, "deepl": 500000, "microsoft": 2000000})
        check(ledger.state["lara"]["used"] == 60000 - LARA_CHARS_REMAINING,
              f"fresh ledger seeds lara.used={ledger.state['lara']['used']} (limit-remaining)")
        check(ledger.state["deepl"]["used"] == 0, "fresh ledger seeds deepl.used=0")
        check(ledger.state["deepl"]["scope"] == "lifetime" and "month" not in ledger.state["deepl"],
              "deepl entry is lifetime-scoped (no month field)")

        # 2. Safety margin: effective budget < limit; can_spend refuses over-budget
        eff = ledger.effective_budget("lara")
        check(eff == int(60000 * 0.97), f"3% margin -> lara effective budget {eff}")
        check(not ledger.can_spend("lara", ledger.remaining("lara") + 1), "can_spend refuses 1 char over budget")
        check(ledger.can_spend("lara", ledger.remaining("lara")), "can_spend allows exactly the remainder")

        # 3. Month rollover resets lara/microsoft but NEVER deepl (one-time budget)
        ledger.state["lara"]["month"] = "2000-01"
        ledger.state["lara"]["used"] = 59999
        ledger.state["microsoft"]["month"] = "2000-01"
        ledger.state["microsoft"]["used"] = 123456
        ledger.state["deepl"]["used"] = 250000
        ledger.save()
        ledger2 = UsageLedger(path=ledger_path, limits=ledger.limits)
        check(ledger2.state["lara"]["used"] == 0 and ledger2.state["lara"]["month"] == _current_month(),
              "month rollover resets lara usage to 0 for the new month")
        check(ledger2.state["microsoft"]["used"] == 0, "month rollover resets microsoft usage to 0")
        check(ledger2.state["deepl"]["used"] == 250000,
              "deepl usage SURVIVES month rollover (one-time allowance never resets)")

        # 3b. Migration: a legacy ledger where deepl was month-scoped keeps its spend
        legacy = json.loads(ledger_path.read_text(encoding="utf-8"))
        legacy["deepl"] = {"scope": "month", "month": "2000-01", "limit": 500000, "used": 42000}
        _atomic_write_json(ledger_path, legacy)
        ledger2b = UsageLedger(path=ledger_path, limits=ledger.limits)
        check(ledger2b.state["deepl"]["used"] == 42000 and ledger2b.state["deepl"]["scope"] == "lifetime",
              "legacy month-scoped deepl entry migrates to lifetime WITHOUT resetting spend")

        # 4. Fallback WITH --use-deepl: tiny Lara budget forces spill to DeepL mid-worklist
        ledger3 = UsageLedger(path=Path(td) / "l3.json", limits={"lara": 20, "deepl": 1000, "microsoft": 1000},
                              safety_margin=0.0)
        ledger3.state["lara"]["used"] = 0
        lara = _FakeEngine("lara", "LARA")
        deepl = _FakeEngine("deepl", "DEEPL")
        ms = _FakeEngine("microsoft", "MS")
        ft = FallbackTranslator(ledger=ledger3, engines=[lara, deepl, ms], use_deepl=True, use_lara=True)
        items = [{"text": "aaaaaaaaaa", "locale": "it"},   # 10 chars -> lara
                 {"text": "bbbbbbbbbb", "locale": "it"},   # 10 chars -> lara (exactly exhausts 20)
                 {"text": "cccccccccc", "locale": "it"}]   # 10 chars -> deepl
        results, deferred = ft.translate_all(items)
        check(results[0]["engine"] == "LARA" and results[1]["engine"] == "LARA",
              "first 20 chars go to lara")
        check(results[2]["engine"] == "DEEPL", "--use-deepl: next item spills to deepl when lara is exact-full")
        check(ledger3.state["lara"]["used"] == 20 and ledger3.state["deepl"]["used"] == 10,
              "ledger records exactly what each engine was sent")
        check(not deferred, "nothing deferred while budget remains")

        # 4b. Default (NO --use-deepl): deepl is held back even when injected;
        #     the same overflow goes to microsoft instead.
        ledger3b = UsageLedger(path=Path(td) / "l3b.json", limits={"lara": 20, "deepl": 1000, "microsoft": 1000},
                               safety_margin=0.0)
        deepl_b = _FakeEngine("deepl", "DEEPL")
        ft_default = FallbackTranslator(ledger=ledger3b,
                                        engines=[_FakeEngine("lara", "LARA"), deepl_b,
                                                 _FakeEngine("microsoft", "MS")], use_lara=True)
        results_b, deferred_b = ft_default.translate_all(items)
        check(results_b[2]["engine"] == "MS" and not deferred_b,
              "default run: overflow goes to microsoft, NOT deepl")
        check(deepl_b.calls == 0 and ledger3b.state["deepl"]["used"] == 0,
              "default run: deepl never called, one-time budget untouched")

        # 4c. Fully-default run: Lara is held back too — Microsoft does everything.
        ledger3c = UsageLedger(path=Path(td) / "l3c.json", limits={"lara": 1000, "deepl": 1000, "microsoft": 1000},
                               safety_margin=0.0)
        lara_c = _FakeEngine("lara", "LARA")
        ft_plain = FallbackTranslator(ledger=ledger3c,
                                      engines=[lara_c, _FakeEngine("deepl", "DEEPL"),
                                               _FakeEngine("microsoft", "MS")])
        results_c, _ = ft_plain.translate_all([{"text": "hello there", "locale": "it"}])
        check(results_c[0]["engine"] == "MS" and lara_c.calls == 0,
              "fully-default run: lara held back (10k/month), microsoft is the workhorse")

        # 5. Unsupported locale skips the engine (fr-CA-style)
        ledger4 = UsageLedger(path=Path(td) / "l4.json", limits={"lara": 1000, "deepl": 1000, "microsoft": 1000},
                              safety_margin=0.0)
        deepl_no_frca = _FakeEngine("deepl", "DEEPL", fail_locales={"fr-CA"})
        lara_broke = _FakeEngine("lara", "LARA")
        lara_broke.configured = False
        ft2 = FallbackTranslator(ledger=ledger4, engines=[lara_broke, deepl_no_frca, _FakeEngine("microsoft", "MS")],
                                 use_deepl=True, use_lara=True)
        results2, _ = ft2.translate_all([{"text": "x" * 30, "locale": "fr-CA"}])
        check(results2[0]["engine"] == "MS", "fr-CA (unsupported by deepl, lara unconfigured) lands on microsoft")

        # 6. All budgets exhausted -> clean deferral, no calls attempted
        ledger5 = UsageLedger(path=Path(td) / "l5.json", limits={"lara": 5, "deepl": 5, "microsoft": 5},
                              safety_margin=0.0)
        counting = [_FakeEngine("lara", "LARA"), _FakeEngine("deepl", "DEEPL"), _FakeEngine("microsoft", "MS")]
        ft3 = FallbackTranslator(ledger=ledger5, engines=counting, use_deepl=True, use_lara=True)
        results3, deferred3 = ft3.translate_all([{"text": "toolongforanyone", "locale": "it"}])
        check(results3[0] is None and len(deferred3) == 1, "item too big for every budget is deferred")
        check(all(e.calls == 0 for e in counting), "no API call is ever attempted when budget can't cover it")

        # 7. Mid-run quota error (belt & braces): engine marked exhausted, item retried on next
        ledger6 = UsageLedger(path=Path(td) / "l6.json", limits={"lara": 1000, "deepl": 1000, "microsoft": 1000},
                              safety_margin=0.0)
        lara_quota = _FakeEngine("lara", "LARA", quota_after_calls=1)
        ft4 = FallbackTranslator(ledger=ledger6, engines=[lara_quota, _FakeEngine("deepl", "DEEPL"),
                                                          _FakeEngine("microsoft", "MS")],
                                 use_deepl=True, use_lara=True)
        r4, _ = ft4.translate_all([{"text": "one", "locale": "de"}])
        r5, _ = ft4.translate_all([{"text": "two", "locale": "de"}])
        check(r4[0]["engine"] == "LARA" and r5[0]["engine"] == "DEEPL",
              "surprise quota error marks engine exhausted and falls through")
        check(ledger6.state["lara"].get("exhausted") is True, "exhausted flag persisted to ledger")

    print()
    if failures:
        print(f"SELFTEST FAILED: {len(failures)} check(s) failed.")
        return 1
    print("SELFTEST PASSED: all checks green.")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="MT fallback chain (Lara -> Microsoft, DeepL opt-in) with free-tier budget ledger")
    ap.add_argument("--selftest", action="store_true", help="Run offline self-tests (no network, no credentials)")
    ap.add_argument("--status", action="store_true", help="Print the current usage ledger and exit")
    ap.add_argument("--set-used", metavar="ENGINE=CHARS", default=None,
                     help="Manually reconcile the ledger to the provider dashboard's billed number "
                          "(e.g. --set-used lara=72). Use when the local conservative count "
                          "(submitted chars) drifts above what the provider actually billed "
                          "(Lara doesn't bill translation-memory hits). Also clears the "
                          "engine's exhausted flag.")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(_selftest())
    if args.set_used:
        try:
            engine, chars = args.set_used.split("=")
            engine = engine.strip().lower()
            chars = int(chars)
            assert engine in UsageLedger.ENGINES and chars >= 0
        except (ValueError, AssertionError):
            print(f"Bad --set-used value '{args.set_used}' — expected e.g. lara=72 "
                  f"(engines: {', '.join(UsageLedger.ENGINES)})")
            sys.exit(1)
        ledger = UsageLedger()
        before = ledger.state[engine]["used"]
        ledger.state[engine]["used"] = chars
        ledger.state[engine]["exhausted"] = False
        ledger.save()
        print(f"'{engine}' used: {before:,} -> {chars:,} chars (exhausted flag cleared)")
        print(ledger.summary())
        return
    if args.status:
        ledger = UsageLedger()
        print(f"Ledger: {ledger.path}")
        print(ledger.summary())
        return
    ap.print_help()


if __name__ == "__main__":  # pragma: no cover
    main()
