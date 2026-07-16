#!/usr/bin/env python3
# frontend/scripts/mt_credential_check.py
#
# Credential validator for the MT fallback chain. Sends ONE tiny real request
# ("Hello", 5 source chars) to Lara and Microsoft and prints the raw outcome,
# so auth problems surface here — with the provider's actual error text —
# instead of mid-run as a confusing "quota exhausted" or batch failure.
#
# Also repairs the ledger: a failed auth error that LOOKED like a quota error
# can leave an engine marked [EXHAUSTED] in mt_usage_state.json; when a probe
# SUCCEEDS here, that engine's exhausted flag is cleared. The 5 probe chars
# are honestly recorded against the engine's budget.
#
# USAGE:
#   py -3.12 scripts/mt_credential_check.py                 # Lara + Microsoft
#   py -3.12 scripts/mt_credential_check.py --include-deepl # + DeepL (0 chars,
#                                                           # just reads usage)

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from mt_fallback import UsageLedger, MS_TRANSLATOR_ENDPOINT

PROBE_TEXT = "Hello"  # 5 chars


def _clear_exhausted(ledger: UsageLedger, engine: str) -> None:
    if ledger.state[engine].get("exhausted"):
        ledger.state[engine]["exhausted"] = False
        ledger.save()
        print(f"    ledger repair: cleared the [EXHAUSTED] flag on '{engine}' "
              f"(a previous auth failure was misread as a quota error)")


def check_lara(ledger: UsageLedger) -> bool:
    print("\n── Lara ─────────────────────────────────────────────")
    key_id = os.getenv("LARA_ACCESS_KEY_ID")
    secret = os.getenv("LARA_ACCESS_KEY_SECRET")
    if not key_id or not secret:
        print("  FAIL: LARA_ACCESS_KEY_ID / LARA_ACCESS_KEY_SECRET not set in this shell.")
        print("        (setx writes take effect in NEW terminal windows only.)")
        return False
    print(f"  key id: {key_id[:4]}...{key_id[-2:]}  secret: set ({len(secret)} chars)")
    try:
        from lara_sdk import Translator
        from mt_fallback import _make_lara_key
    except ImportError:
        print("  FAIL: lara-sdk not installed for this interpreter (py -3.12 -m pip install lara-sdk)")
        return False
    try:
        lara = Translator(_make_lara_key(key_id, secret))
        res = lara.translate(PROBE_TEXT, source="en-US", target="it-IT")
        print(f"  PASS: '{PROBE_TEXT}' -> '{res.translation}'")
        ledger.record("lara", len(PROBE_TEXT))
        _clear_exhausted(ledger, "lara")
        return True
    except Exception as e:
        print(f"  FAIL: {type(e).__name__}: {e}")
        print("  Likely causes, in order:")
        print("    1. Key ID and SECRET swapped, or from different key pairs — regenerate a")
        print("       pair together at app.laratranslate.com and copy both at once.")
        print("    2. Trailing whitespace/newline pasted into the env var.")
        print("    3. The account genuinely has 0 credits left this month.")
        return False


def check_microsoft(ledger: UsageLedger) -> bool:
    print("\n── Microsoft Translator ─────────────────────────────")
    key = os.getenv("MS_TRANSLATOR_KEY")
    region = os.getenv("MS_TRANSLATOR_REGION", "global")
    if not key:
        print("  FAIL: MS_TRANSLATOR_KEY not set in this shell.")
        return False
    print(f"  key: {key[:4]}...{key[-2:]} ({len(key)} chars)   region header: '{region}'")
    try:
        r = requests.post(
            f"{MS_TRANSLATOR_ENDPOINT}/translate?api-version=3.0&from=en&to=it",
            headers={"Ocp-Apim-Subscription-Key": key,
                     "Ocp-Apim-Subscription-Region": region,
                     "Content-type": "application/json"},
            json=[{"text": PROBE_TEXT}], timeout=30)
    except Exception as e:
        print(f"  FAIL (network): {type(e).__name__}: {e}")
        return False
    if r.ok:
        print(f"  PASS: '{PROBE_TEXT}' -> '{r.json()[0]['translations'][0]['text']}'")
        ledger.record("microsoft", len(PROBE_TEXT))
        _clear_exhausted(ledger, "microsoft")
        return True
    print(f"  FAIL: HTTP {r.status_code} — provider says: {r.text[:400]}")
    if r.status_code == 401:
        print("  A 401 from this endpoint is ALWAYS key/region, never quota. Check:")
        print("    1. REGION MISMATCH (most common): if the Azure resource was created in a")
        print("       region (e.g. 'eastus', 'westeurope'), MS_TRANSLATOR_REGION must be")
        print("       EXACTLY that region string — 'global' only works for global resources.")
        print("       Find it on the resource's Overview blade -> Location.")
        print("    2. Wrong key type: the key must come from a 'Translator' resource (or a")
        print("       multi-service 'Cognitive Services' resource) -> Keys and Endpoint blade.")
        print("       Keys from other Azure resources (OpenAI, Speech, ...) give 401 here.")
        print("    3. Key regenerated since you copied it, or whitespace pasted into the var.")
    elif r.status_code in (403, 429):
        print("  Quota-style rejection — the F0 monthly cap may genuinely be spent.")
    return False


def check_deepl(ledger: UsageLedger) -> bool:
    print("\n── DeepL (usage read only — costs 0 chars) ──────────")
    key = os.getenv("DEEPL_AUTH_KEY")
    if not key:
        print("  SKIP: DEEPL_AUTH_KEY not set.")
        return False
    try:
        import deepl
        usage = deepl.Translator(key).get_usage()
        count = usage.character.count if usage.character else "?"
        limit = usage.character.limit if usage.character else "?"
        print(f"  PASS: server-side usage {count} / {limit} chars")
        ledger.reconcile("deepl", int(count)) if isinstance(count, int) else None
        _clear_exhausted(ledger, "deepl")
        return True
    except Exception as e:
        print(f"  FAIL: {type(e).__name__}: {e}")
        print("  Note: DeepL API Free keys end in ':fx' — the whole string including ':fx'")
        print("  is the key. A Pro-endpoint key or a web-account password won't work.")
        return False


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate MT API credentials with one 5-char probe per engine")
    ap.add_argument("--include-deepl", action="store_true", help="Also check DeepL (reads usage, costs nothing)")
    args = ap.parse_args()

    ledger = UsageLedger()
    print(f"Ledger: {ledger.path}")
    print(ledger.summary())

    results = {"lara": check_lara(ledger), "microsoft": check_microsoft(ledger)}
    if args.include_deepl:
        results["deepl"] = check_deepl(ledger)

    print("\n" + "=" * 55)
    for engine, ok in results.items():
        print(f"  {engine:<10} {'READY' if ok else 'NOT READY'}")
    print("\nLedger after probes:")
    print(ledger.summary())
    sys.exit(0 if all(results.values()) else 1)


if __name__ == "__main__":
    main()
