#!/usr/bin/env python3
# frontend/scripts/localization_qa_crawler.py
#
# Localization QA crawler — renders the app's routes in English and in each
# translated locale using a headless browser, both anonymously (public pages)
# and logged in as each built-in demo role (teacher/student/parent/admin/
# homeschool), and flags two classes of problems:
#
#   1. "Likely untranslated" — a rendered text node is byte-identical between
#      the English and target-locale versions of the same page. This is
#      free/instant (no LLM call) and catches the bug class this project has
#      hit repeatedly: a hardcoded string that never got wrapped in t(), so
#      it can't translate no matter how good the translation pipeline is.
#
#   2. "Flagged by evaluator" — for text that DID change between locales (a
#      real translation happened), the (source, target) pair is sent to a
#      local LLM acting as a translation quality estimator (Unbabel/
#      TowerInstruct via Ollama), using the error/span-analysis prompt style.
#
# DEV/TEST TOOL ONLY — not for production. Logs in using the same demo
# accounts as frontend/tests/e2e/auth.setup.ts (teacher@example.com etc.),
# which only exist in local/dev seed data; per GO_LIVE_RUNBOOK.md §9, these
# accounts are explicitly verified to NOT exist in production. This file
# lives under frontend/scripts/, which is gitignored by default (see
# .gitignore:422) unless force-added, so it stays local-only.
#
# REQUIREMENTS (not installed by this script — install once):
#     pip install playwright requests babel
#     playwright install chromium
#     ollama pull hf.co/s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF:Q4_K_M
#
# The frontend AND backend must already be running (this crawls a live app,
# it does not build/start one):
#     docker compose up -d          # backend + db, or however you run it locally
#     npm run dev                   # Vite dev server, default :3000
#
# USAGE:
#     python3 scripts/localization_qa_crawler.py
#     python3 scripts/localization_qa_crawler.py --locales ko,ar --routes /,/privacy
#     python3 scripts/localization_qa_crawler.py --roles teacher,student
#     python3 scripts/localization_qa_crawler.py --skip-protected   # public pages only
#     python3 scripts/localization_qa_crawler.py --max-pairs 15     # quick smoke test —
#         a 7B model on local hardware is slow; this caps LLM calls per
#         locale/role while still running the free untranslated-text check
#         on everything.
#
# Output: a JSON report under frontend/qa/ (also gitignored, see note above),
# plus a human-readable summary on stdout.

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

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Missing dependency. Install with:\n    pip install playwright\n    playwright install chromium")
    sys.exit(1)

FRONTEND_DIR = Path(__file__).parent.parent
APP_TSX = FRONTEND_DIR / "src" / "App.tsx"
LOCALES_DIR = FRONTEND_DIR / "public" / "locales"

DEFAULT_MODEL = "hf.co/s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF:Q4_K_M"
DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_BASE_URL = "http://localhost:3000"

# Directories under public/locales/ that exist but aren't real target
# locales — same rule translate_sync.py uses, kept in sync deliberately.
SKIP_LOCALE_DIRS = {"en", "tu", "_tu_backup"}

# Route wrappers that mean "requires a logged-in session."
PROTECTED_MARKER = "ProtectedRoute"

# Strings that are legitimately identical across every locale on purpose
# (brand names, acronyms) — never flag these as "untranslated."
ALLOWLIST_UNCHANGED = {
    "peri", "peripateticware", "ferpa", "coppa", "gdpr", "ccpa", "lgpd", "pipeda",
}

# Demo accounts, one per role — mirrors frontend/tests/e2e/auth.setup.ts
# exactly (same env var names, same defaults), so this tool and the E2E
# suite never drift out of sync with each other.
ROLE_CREDENTIALS = {
    "teacher":    ("TEST_TEACHER_EMAIL",    "teacher@example.com",    "TEST_TEACHER_PASSWORD",    "SecurePass123!"),
    "student":    ("TEST_STUDENT_EMAIL",    "student@example.com",    "TEST_STUDENT_PASSWORD",    "SecurePass123!"),
    "parent":     ("TEST_PARENT_EMAIL",     "parent@example.com",     "TEST_PARENT_PASSWORD",     "SecurePass123!"),
    "admin":      ("TEST_ADMIN_EMAIL",      "admin@example.com",      "TEST_ADMIN_PASSWORD",      "SecurePass123!"),
    "homeschool": ("TEST_HOMESCHOOL_EMAIL", "homeschool@example.com", "TEST_HOMESCHOOL_PASSWORD", "SecurePass123!"),
}


# ─── Route + locale discovery ──────────────────────────────────────────────

def _is_navigable_path(path: str) -> bool:
    """Excludes React Router patterns that aren't real, directly-loadable URLs:
    ":param" segments (no concrete value to substitute) and the "*" catch-all
    (matches everything — typically a 404 handler, not a page of its own)."""
    return ":" not in path and "*" not in path


def discover_public_routes(limit: int | None = None) -> list[str]:
    """Parse App.tsx for <Route path="..."> lines with no ProtectedRoute
    wrapper and no ":param"/"*" segment (no single real URL to navigate to)."""
    routes: list[str] = []
    if not APP_TSX.exists():
        print(f"WARNING: could not find {APP_TSX}")
        return routes
    for line in APP_TSX.read_text(encoding="utf-8").splitlines():
        m = re.search(r'<Route\s+path="([^"]+)"', line)
        if not m:
            continue
        path = m.group(1)
        if not _is_navigable_path(path) or PROTECTED_MARKER in line:
            continue
        routes.append(path)
    return _dedupe(routes)[:limit] if limit else _dedupe(routes)


def discover_protected_routes() -> dict[str, list[str]]:
    """Parse App.tsx for <Route path="..." ... requiredRole="X" ...> lines.
    Returns {role: [routes]}, e.g. {"teacher": ["/teacher", "/teacher/settings", ...]}.
    Parameterized routes (":id" etc) are skipped — no real value to crawl with."""
    by_role: dict[str, list[str]] = {}
    if not APP_TSX.exists():
        return by_role
    for line in APP_TSX.read_text(encoding="utf-8").splitlines():
        if PROTECTED_MARKER not in line:
            continue
        path_m = re.search(r'<Route\s+path="([^"]+)"', line)
        role_m = re.search(r'requiredRole="([^"]+)"', line)
        if not path_m or not role_m:
            continue
        path = path_m.group(1)
        if not _is_navigable_path(path):
            continue
        role = role_m.group(1).lower()
        by_role.setdefault(role, []).append(path)
    return {role: _dedupe(paths) for role, paths in by_role.items()}


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered = []
    for i in items:
        if i not in seen:
            seen.add(i)
            ordered.append(i)
    return ordered


def discover_locales() -> list[str]:
    """Every translated locale = a subdirectory under public/locales/ other
    than English/backup dirs — same rule the translation pipeline itself
    uses (translate_sync.py's get_target_languages)."""
    if not LOCALES_DIR.exists():
        return []
    return sorted(
        d.name for d in LOCALES_DIR.iterdir()
        if d.is_dir() and d.name.lower() not in SKIP_LOCALE_DIRS
    )


def lang_display_name(code: str) -> str:
    """Reuses the same dynamic resolver as translate_sync.py so this tool
    never needs a hardcoded language-name list either."""
    try:
        from babel import Locale
        name = Locale.parse(code, sep="-").get_display_name("en")
        if name:
            return name
    except Exception:
        pass
    return code.upper()


# ─── Auth — logs in the same way frontend/tests/e2e/auth.setup.ts does ────

def login_as_role(page, base_url: str, role: str) -> bool:
    creds = ROLE_CREDENTIALS.get(role)
    if not creds:
        print(f"  No demo credentials known for role '{role}' — skipping.")
        return False
    email_env, email_default, pass_env, pass_default = creds
    email = os.environ.get(email_env, email_default)
    password = os.environ.get(pass_env, pass_default)

    resp = page.request.post(
        f"{base_url}/api/v1/auth/login",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"email": email, "password": password}),
    )
    if not resp.ok:
        print(f"  Login failed for role '{role}' ({email}): {resp.status} {resp.text()[:200]}")
        return False

    data = resp.json()
    token = data.get("access_token")
    if not token:
        print(f"  No access_token in login response for role '{role}' ({email})")
        return False

    page.goto(f"{base_url}/", wait_until="domcontentloaded")
    page.evaluate(
        """({ tok, usr }) => {
            localStorage.setItem('auth_token', tok);
            if (usr) localStorage.setItem('auth_user', JSON.stringify(usr));
        }""",
        {
            "tok": token,
            "usr": {
                "user_id": data.get("user_id", data.get("id")),
                "email": data.get("email", email),
                "role": data.get("role"),
            },
        },
    )
    if role == "homeschool":
        # Skip the onboarding wizard so we land on the real dashboard,
        # same as auth.setup.ts does for the Playwright E2E suite.
        page.evaluate("() => localStorage.setItem('hs_onboarding_dismissed', '1')")
    return True


# ─── Browser text extraction ───────────────────────────────────────────────

EXTRACT_JS = """
() => {
  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (!text) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const style = window.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
    results.push(text);
  }
  return results;
}
"""


def set_locale(page, locale: str) -> None:
    """Force i18next's language via localStorage BEFORE the app boots — the
    only detector this app configures is localStorage/navigator (see
    frontend/src/config/i18n.ts), there's no URL query-param override."""
    page.add_init_script(f"window.localStorage.setItem('i18nextLng', '{locale}');")


def load_route(page, base_url: str, route: str) -> None:
    # "domcontentloaded" rather than "networkidle": some authenticated pages
    # (e.g. /admin/ai-config) poll or hold a live connection open, so the
    # network never truly goes idle and "networkidle" hangs until timeout.
    # i18next's namespace fetches are a couple of quick JSON requests that
    # finish well before the DOM is done rendering anyway, so this is both
    # faster and more reliable across the whole route list.
    page.goto(f"{base_url}{route}", wait_until="domcontentloaded", timeout=15000)
    page.wait_for_timeout(800)  # let i18next's async namespace load + render settle


def extract_texts(page) -> list[str]:
    return page.evaluate(EXTRACT_JS)


def safe_load_and_extract(page, base_url: str, route: str, locale: str) -> tuple[list[str] | None, str | None]:
    """Loads one route in one locale and extracts its text, tolerating a
    single bad page (timeout, crash, unexpected redirect, etc.) without
    taking down the whole crawl — a multi-role, multi-locale run can be a
    couple hundred page loads, and one flaky page (e.g. one that polls a
    live status endpoint and never fully settles) shouldn't lose everything
    that came before it. Returns (texts, None) on success, or
    (None, error_message) on failure — callers should record/skip the route
    rather than abort."""
    try:
        set_locale(page, locale)
        load_route(page, base_url, route)
        return extract_texts(page), None
    except Exception as e:
        return None, f"{type(e).__name__}: {str(e)[:200]}"


def looks_intentionally_unchanged(text: str) -> bool:
    lowered = text.strip().lower()
    if lowered in ALLOWLIST_UNCHANGED:
        return True
    if not re.search(r"[a-zA-Z]", text):
        return True  # pure numbers/emoji/punctuation — nothing to translate
    if re.match(r"^https?://", text) or ("@" in text and "." in text):
        return True  # URL or email address
    if len(text) <= 2:
        return True  # single letters/icons
    return False


# ─── TowerInstruct evaluation via Ollama ───────────────────────────────────

def build_qe_prompt(source: str, target: str, lang_name: str) -> str:
    return (
        f"[INST] Identify all translation errors and grammatical mistakes in the "
        f"following target text, which was translated from English to {lang_name}.\n"
        f'Source: "{source}"\n'
        f'Target: "{target}"\n'
        f"Output format: List the error, location, and severity. If there are no "
        f"errors, respond with exactly: NO ERRORS FOUND. [/INST]"
    )


def preflight_check(ollama_url: str, model: str, timeout: int = 120) -> bool:
    """One quick call before launching the whole browser crawl, so a missing
    model or unreachable Ollama fails fast with a clear message instead of
    erroring midway through a long crawl.

    A read-timeout here (connection succeeds, but no response in time) almost
    always means Ollama is busy loading the model's weights into memory for
    the first time — a 7B+ model can easily take well over 30s on a cold
    start (CPU-only, slow disk, first call after `ollama serve` just
    started, etc.), even though every call after that is fast. So this
    retries once with a much longer timeout and an explicit "still loading"
    message, rather than immediately reporting failure the way a 30s cap
    used to."""
    def _attempt(t: int):
        return requests.post(
            f"{ollama_url}/api/generate",
            json={"model": model, "prompt": "[INST] Say OK. [/INST]", "stream": False},
            timeout=t,
        )

    try:
        resp = _attempt(timeout)
        resp.raise_for_status()
        return True
    except requests.exceptions.ConnectionError:
        print(f"Cannot reach Ollama at {ollama_url} — is it running? (ollama serve)")
        return False
    except requests.exceptions.ReadTimeout:
        retry_timeout = max(timeout * 3, 180)
        print(f"No response from Ollama within {timeout}s — likely still loading '{model}' into "
              f"memory for the first time (normal for a 7B+ model on a cold start). "
              f"Retrying with a {retry_timeout}s timeout...")
        try:
            resp = _attempt(retry_timeout)
            resp.raise_for_status()
            print("Model responded — continuing.")
            return True
        except requests.exceptions.ReadTimeout:
            print(f"Still no response after {retry_timeout}s. Try running `ollama run {model}` "
                  f"directly in another terminal first to warm it up, then re-run this.")
            return False
        except Exception as e:
            print(f"Preflight check failed on retry: {e}")
            return False
    except requests.exceptions.HTTPError as e:
        print(f"Ollama returned an error for model '{model}': {e}\n"
              f"Have you pulled it? ollama pull {model}")
        return False
    except Exception as e:
        print(f"Preflight check failed: {e}")
        return False


def evaluate_pair(ollama_url: str, model: str, source: str, target: str, lang_name: str,
                   timeout: int = 180) -> str:
    """Ask the local QE model to judge one source/target pair.

    A local model can stall on a single generation now and then (it idled
    out of memory and needs reloading, a GC pause, brief CPU/GPU contention
    from something else on the box, etc.) even though `preflight_check`
    passed fine at the start of the run. Previously a single such stall
    raised an uncaught ReadTimeout that crashed the *entire* multi-hour,
    multi-locale crawl — losing everything past the last per-locale
    checkpoint. This retries once with a longer timeout before giving up on
    this pair; `compare_route` catches the eventual failure so one bad pair
    can't take down the whole run.
    """
    prompt = build_qe_prompt(source, target, lang_name)

    def _attempt(t: int) -> str:
        resp = requests.post(
            f"{ollama_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=t,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()

    try:
        return _attempt(timeout)
    except requests.exceptions.ReadTimeout:
        retry_timeout = max(timeout * 2, 300)
        print(f"(no response within {timeout}s, retrying with {retry_timeout}s timeout)... ",
              end="", flush=True)
        return _attempt(retry_timeout)


def is_clean_verdict(evaluator_response: str) -> bool:
    return "no errors found" in evaluator_response.strip().lower()


# ─── Comparison core (shared by public + protected crawling) ──────────────

def compare_route(en_texts: list[str], target_texts: list[str], locale: str,
                   lang_name: str, ollama_url: str, model: str,
                   max_pairs: int | None, pairs_evaluated: int,
                   route_label: str = "", locale_progress: str = "") -> tuple[dict, int]:
    result: dict = {"likely_untranslated": [], "evaluated": []}
    if len(en_texts) != len(target_texts):
        result["warning"] = (
            f"Text-node count mismatch (en={len(en_texts)}, {locale}={len(target_texts)}) "
            f"— page structure may differ between locales (e.g. conditional content); "
            f"the position-based comparison below may be misaligned for this route."
        )

    # First pass: split into the free/instant check and the pairs that will
    # actually need a (slow) evaluator call, so we can announce how many
    # calls are coming — the evaluator is the only slow part here (a local
    # 7B model can take real time per pair), and it used to run silently
    # with no output between pairs. Announcing counts up front means you're
    # never just staring at a blank terminal wondering if anything's
    # happening.
    to_evaluate: list[tuple[str, str]] = []
    for src, tgt in zip(en_texts, target_texts):
        if src == tgt:
            if not looks_intentionally_unchanged(src):
                result["likely_untranslated"].append(src)
            continue
        if max_pairs is not None and pairs_evaluated + len(to_evaluate) >= max_pairs:
            continue
        to_evaluate.append((src, tgt))

    if to_evaluate:
        print(f"    {locale_progress}{route_label}: {len(to_evaluate)} pair(s) need evaluator review "
              f"(this may take a while on local hardware)...")

    for i, (src, tgt) in enumerate(to_evaluate, start=1):
        print(f"      evaluating pair {i}/{len(to_evaluate)} "
              f"(locale total so far: {pairs_evaluated + i})... ", end="", flush=True)
        try:
            verdict = evaluate_pair(ollama_url, model, src, tgt, lang_name)
        except requests.exceptions.RequestException as e:
            # Ollama hiccupped on this one pair even after evaluate_pair's
            # internal retry. Don't let it take down the whole crawl (which
            # can be hours into an unrelated locale) — log it, mark it as
            # unevaluated/errored (NOT flagged — we don't actually know),
            # and move on to the next pair.
            print(f"ERROR ({e}) — skipping this pair")
            result["evaluated"].append({
                "source": src, "target": tgt,
                "evaluator_response": f"[evaluator error, not reviewed: {e}]",
                "flagged": False,
                "error": True,
            })
            continue
        flagged = not is_clean_verdict(verdict)
        print("FLAGGED" if flagged else "clean")
        result["evaluated"].append({
            "source": src, "target": tgt,
            "evaluator_response": verdict,
            "flagged": flagged,
        })
    pairs_evaluated += len(to_evaluate)
    return result, pairs_evaluated


def route_summary_line(route: str, result: dict) -> str:
    n_bad = len(result["likely_untranslated"])
    n_flagged = sum(1 for e in result["evaluated"] if e["flagged"])
    n_errored = sum(1 for e in result["evaluated"] if e.get("error"))
    suffix = f", {n_errored} evaluator error(s) (unreviewed)" if n_errored else ""
    return (f"  {route}: {n_bad} likely-untranslated, "
            f"{n_flagged}/{len(result['evaluated'])} flagged by evaluator{suffix}")


# ─── Main crawl ─────────────────────────────────────────────────────────────

def crawl(base_url: str, locales: list[str], public_routes: list[str],
          protected_routes: dict[str, list[str]], ollama_url: str, model: str,
          max_pairs: int | None, out_path: Path) -> dict:
    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "model": model,
        "locales": {},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ── Public routes: English baseline ──
        print(f"Crawling {len(public_routes)} public route(s) in English (baseline)...")
        en_public_texts: dict[str, list[str]] = {}
        page = browser.new_page()
        for route in public_routes:
            texts, err = safe_load_and_extract(page, base_url, route, "en")
            if err:
                print(f"  WARNING: skipping {route} (failed to load in English baseline): {err}")
                continue
            en_public_texts[route] = texts
        page.close()

        # ── Protected routes: English baseline, one fresh login per role ──
        en_protected_texts: dict[str, dict[str, list[str]]] = {}
        for role, routes in protected_routes.items():
            print(f"Crawling {len(routes)} '{role}' route(s) in English (baseline)...")
            context = browser.new_context()
            page = context.new_page()
            if not login_as_role(page, base_url, role):
                context.close()
                continue
            role_texts: dict[str, list[str]] = {}
            for route in routes:
                texts, err = safe_load_and_extract(page, base_url, route, "en")
                if err:
                    print(f"  WARNING: skipping [{role}] {route} (failed to load in English baseline): {err}")
                    continue
                role_texts[route] = texts
            en_protected_texts[role] = role_texts
            context.close()

        # ── Now each target locale, same structure ──
        total_locales = len(locales)
        for locale_idx, locale in enumerate(locales, start=1):
            lang_name = lang_display_name(locale)
            remaining_after = total_locales - locale_idx
            locale_progress = f"[{locale_idx}/{total_locales}] "
            print(f"\n{locale_progress}Crawling locale '{locale}' ({lang_name})... "
                  f"({remaining_after} locale(s) left after this one)")
            locale_result: dict = {
                "lang_name": lang_name,
                "public_routes": {},
                "protected_routes": {},
            }
            pairs_evaluated = 0

            page = browser.new_page()
            total_public = len(public_routes)
            for route_idx, route in enumerate(public_routes, start=1):
                if route not in en_public_texts:
                    continue  # English baseline failed to load, nothing to compare against
                route_label = f"route {route_idx}/{total_public} ({route})"
                target_texts, err = safe_load_and_extract(page, base_url, route, locale)
                if err:
                    print(f"  WARNING [{locale}] skipping {route}: {err}")
                    locale_result["public_routes"][route] = {"error": err, "likely_untranslated": [], "evaluated": []}
                    continue
                result, pairs_evaluated = compare_route(
                    en_public_texts[route], target_texts, locale, lang_name,
                    ollama_url, model, max_pairs, pairs_evaluated,
                    route_label=route_label, locale_progress=locale_progress,
                )
                locale_result["public_routes"][route] = result
                print(f"  {locale_progress}" + route_summary_line(route, result))
            page.close()

            for role, routes in protected_routes.items():
                if role not in en_protected_texts:
                    continue  # login failed during the baseline pass, already logged
                context = browser.new_context()
                page = context.new_page()
                if not login_as_role(page, base_url, role):
                    context.close()
                    continue
                role_result: dict = {}
                total_role_routes = len(routes)
                for route_idx, route in enumerate(routes, start=1):
                    if route not in en_protected_texts[role]:
                        continue  # English baseline failed to load, nothing to compare against
                    route_label = f"[{role}] route {route_idx}/{total_role_routes} ({route})"
                    target_texts, err = safe_load_and_extract(page, base_url, route, locale)
                    if err:
                        print(f"  WARNING [{locale}][{role}] skipping {route}: {err}")
                        role_result[route] = {"error": err, "likely_untranslated": [], "evaluated": []}
                        continue
                    result, pairs_evaluated = compare_route(
                        en_protected_texts[role][route], target_texts, locale, lang_name,
                        ollama_url, model, max_pairs, pairs_evaluated,
                        route_label=route_label, locale_progress=locale_progress,
                    )
                    role_result[route] = result
                    print(f"  {locale_progress}[{role}]" + route_summary_line(route, result))
                locale_result["protected_routes"][role] = role_result
                context.close()

            report["locales"][locale] = locale_result

            # Checkpoint after every locale (not just at the very end) so a
            # long multi-locale crawl leaves usable partial results on disk
            # if it's interrupted, and so `cat`-ing the report mid-run shows
            # real progress rather than nothing until the whole thing finishes.
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  {locale_progress}Checkpoint saved to {out_path.name} "
                  f"({total_locales - locale_idx} locale(s) remaining overall)")

        browser.close()

    print(f"\nFull report written to {out_path}")
    return report


def print_summary(report: dict) -> None:
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for locale, data in report["locales"].items():
        all_route_results = list(data["public_routes"].values())
        for role_routes in data["protected_routes"].values():
            all_route_results.extend(role_routes.values())

        total_untranslated = sum(len(r["likely_untranslated"]) for r in all_route_results)
        total_flagged = sum(sum(1 for e in r["evaluated"] if e["flagged"]) for r in all_route_results)
        total_evaluated = sum(len(r["evaluated"]) for r in all_route_results)
        print(f"{locale} ({data['lang_name']}): "
              f"{total_untranslated} likely-untranslated strings, "
              f"{total_flagged}/{total_evaluated} translated strings flagged by evaluator")


def main() -> None:
    ap = argparse.ArgumentParser(description="Crawl the app and flag localization problems.")
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL,
                    help=f"Running frontend URL (default: {DEFAULT_BASE_URL}, i.e. `npm run dev`)")
    ap.add_argument("--locales", default=None,
                    help="Comma-separated locale codes to test (default: every locale folder found)")
    ap.add_argument("--routes", default=None,
                    help="Comma-separated PUBLIC routes to test (default: auto-discovered from App.tsx)")
    ap.add_argument("--roles", default=None,
                    help="Comma-separated roles to crawl behind login (default: all discovered — "
                         "teacher, student, parent, admin, homeschool)")
    ap.add_argument("--skip-protected", action="store_true",
                    help="Only crawl public/anonymous routes, skip logging in as any role")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model tag for the evaluator")
    ap.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    ap.add_argument("--max-pairs", type=int, default=None,
                    help="Cap on LLM evaluations PER LOCALE (a 7B model on local hardware is "
                         "slow — use this for a quick smoke test; unset = evaluate everything)")
    ap.add_argument("--out", default=None,
                    help="Report output path (default: qa/localization_qa_<timestamp>.json)")
    ap.add_argument("--skip-preflight", action="store_true",
                    help="Skip the one-shot Ollama reachability check before crawling")
    ap.add_argument("--preflight-timeout", type=int, default=120,
                    help="Seconds to wait for the preflight check before retrying with a longer "
                         "timeout (default: 120). Raise this if you know your hardware is slow to "
                         "load large models.")
    args = ap.parse_args()

    locales = args.locales.split(",") if args.locales else discover_locales()
    public_routes = args.routes.split(",") if args.routes else discover_public_routes()

    protected_routes: dict[str, list[str]] = {}
    if not args.skip_protected:
        protected_routes = discover_protected_routes()
        if args.roles:
            wanted = {r.strip().lower() for r in args.roles.split(",")}
            protected_routes = {r: v for r, v in protected_routes.items() if r in wanted}

    if not locales:
        print("No target locales found under public/locales/ (or none passed via --locales).")
        sys.exit(1)
    if not public_routes and not protected_routes:
        print("No routes discovered/passed. Pass --routes explicitly, e.g. --routes /,/privacy")
        sys.exit(1)

    print(f"Public routes ({len(public_routes)}): {public_routes}")
    for role, routes in protected_routes.items():
        print(f"'{role}' routes ({len(routes)}): {routes}")
    print(f"Locales ({len(locales)}): {locales}")
    print(f"Evaluator model: {args.model} via {args.ollama_url}")

    if not args.skip_preflight:
        print("\nRunning preflight check against Ollama...")
        if not preflight_check(args.ollama_url, args.model, timeout=args.preflight_timeout):
            sys.exit(1)
        print("Preflight OK.")

    out_dir = FRONTEND_DIR / "qa"
    out_path = Path(args.out) if args.out else out_dir / f"localization_qa_{int(time.time())}.json"

    report = crawl(base_url=args.base_url, locales=locales, public_routes=public_routes,
                    protected_routes=protected_routes, ollama_url=args.ollama_url, model=args.model,
                    max_pairs=args.max_pairs, out_path=out_path)
    print_summary(report)


if __name__ == "__main__":
    main()
