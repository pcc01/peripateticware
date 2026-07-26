# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
On-demand link-health audit for every source URL the privacy engine relies on.

Distinct from the monthly auto-renew job (services/privacy_auto_renew.py),
which only flags an unreachable URL quietly in logs as a side effect of its
own re-check pass: this script is a direct, immediate audit you run whenever
you want a full picture right now, across all three places a source URL
lives:

  1. privacy_source_registry.source_url  -- the ~180-country IAPP-derived
     registry (Tier 2 of privacy_discovery_service.py's lookup order).
  2. privacy_regulation_catalog.source_url -- seed/admin/AI-discovered
     catalog rows.
  3. iapp_privacy_crawler.py's ~24 curated PrivacySource adapters -- the
     richest, hand-maintained tier.

Why this matters right now: testing the jurisdiction resolver for several
non-EU countries showed government source pages returning HTTP 403 to
automated fetches (Kenya, Thailand, Vietnam), which pushes discovery onto
the weakest recall-only AI tier -- and a bad recall-only result can drift
onto the wrong country's law entirely (see privacy_discovery_service.py's
_country_name_matches() rejection guard, added the same session as this
script). Every dead/blocked link found here is a country stuck on recall-only
until a human finds and adds a working replacement.

Sends one email report (or logs it, under EMAIL_DRY_RUN=true) via the same
ADMIN_EMAIL + PRIVACY_REPORT_CC_EMAIL recipients as the monthly report, and
also prints a plain-text summary to stdout so `docker exec` output alone is
useful without needing to check email.

Usage: docker exec peripateticware-backend python scripts/check_source_link_health.py
"""

import asyncio
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import text

from core.database import get_session_factory

_TIMEOUT = 15
_CONCURRENCY = 12
_HEADERS = {
    "User-Agent": "Peripateticware-PrivacyCrawler/1.0 (compliance-monitoring; contact: admin@peripateticware.com)"
}


async def _check_url(client: httpx.AsyncClient, url: str) -> Dict[str, Any]:
    try:
        resp = await client.get(url, timeout=_TIMEOUT, follow_redirects=True)
        return {"url": url, "ok": resp.status_code < 400, "detail": f"HTTP {resp.status_code}"}
    except httpx.TimeoutException:
        return {"url": url, "ok": False, "detail": "timeout"}
    except Exception as exc:
        return {"url": url, "ok": False, "detail": f"{type(exc).__name__}: {exc}"}


async def _check_all(urls: List[str]) -> Dict[str, Dict[str, Any]]:
    """De-duplicated URL -> result map, bounded concurrency."""
    unique = sorted(set(u for u in urls if u))
    sem = asyncio.Semaphore(_CONCURRENCY)
    results: Dict[str, Dict[str, Any]] = {}

    async with httpx.AsyncClient(headers=_HEADERS) as client:
        async def bound_check(u: str):
            async with sem:
                results[u] = await _check_url(client, u)

        await asyncio.gather(*(bound_check(u) for u in unique))
    return results


async def main() -> None:
    factory = get_session_factory()

    async with factory() as db:
        registry_rows = (await db.execute(text(
            "SELECT country_code, country_name, source_url FROM privacy_source_registry "
            "WHERE source_url IS NOT NULL"
        ))).all()
        catalog_rows = (await db.execute(text(
            "SELECT jurisdiction_code, short_name, source_url FROM privacy_regulation_catalog "
            "WHERE source_url IS NOT NULL"
        ))).all()

    from services.iapp_privacy_crawler import SOURCES
    adapter_rows = [(s.jurisdiction, s.source_id, s.url) for s in SOURCES if s.url]

    all_urls = (
        [r[2] for r in registry_rows] + [r[2] for r in catalog_rows] + [r[2] for r in adapter_rows]
    )
    print(f"Checking {len(set(u for u in all_urls if u))} unique URL(s) "
          f"({len(registry_rows)} registry, {len(catalog_rows)} catalog, {len(adapter_rows)} crawler adapter)...")

    results = await _check_all(all_urls)

    def _broken(rows, label: str) -> List[Dict[str, Any]]:
        out = []
        for code, name, url in rows:
            r = results.get(url)
            if r and not r["ok"]:
                out.append({"source": label, "code": code, "name": name, "url": url, "detail": r["detail"]})
        return out

    broken = (
        _broken(registry_rows, "privacy_source_registry")
        + _broken(catalog_rows, "privacy_regulation_catalog")
        + _broken(adapter_rows, "crawler_adapter")
    )

    total_checked = len(set(u for u in all_urls if u))
    total_broken = len(broken)

    print(f"\n{total_broken} of {total_checked} unique URLs are unreachable:\n")
    for b in broken:
        print(f"  [{b['source']}] {b['code']} ({b['name']}): {b['detail']}\n    {b['url']}")
    if not broken:
        print("  (none -- all links reachable)")

    _write_template_csv(broken)
    await _send_report(total_checked, broken)


_TEMPLATE_PATH = "/app/scripts/broken_source_links_template.csv"


def _write_template_csv(broken: List[Dict[str, Any]]) -> None:
    """
    Starter CSV for scripts/apply_source_url_corrections.py, pre-filled with
    every currently-broken privacy_source_registry row. Only that table is
    included -- it's the only one the correction script updates (catalog
    rows and crawler adapters are hand-maintained, out of scope for the bulk
    CSV flow). new_url is left blank for you to fill in; old_url/detail are
    reference-only context, ignored by the correction script.
    """
    import csv

    registry_broken = [b for b in broken if b["source"] == "privacy_source_registry"]
    if not registry_broken:
        return

    with open(_TEMPLATE_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["country_code", "country_name", "old_url", "detail", "new_url"])
        for b in registry_broken:
            writer.writerow([b["code"], b["name"] or "", b["url"], b["detail"], ""])

    print(f"\nStarter CSV written to {_TEMPLATE_PATH} ({len(registry_broken)} row(s)) -- "
          f"copy it out with `docker cp`, fill in new_url, then run "
          f"apply_source_url_corrections.py against it.")


async def _send_report(total_checked: int, broken: List[Dict[str, Any]]) -> None:
    from core.config import settings
    from services.email_service import send_notification

    rows_html = "".join(
        f"<li><strong>[{b['source']}] {b['code']}</strong> ({b['name'] or 'unnamed'}): "
        f"{b['detail']}<br><a href=\"{b['url']}\">{b['url']}</a></li>"
        for b in broken
    ) or "<li>None -- all links reachable.</li>"

    subject = (
        f"Privacy source link audit — {len(broken)} broken link(s) of {total_checked} checked"
        if broken else f"Privacy source link audit — all {total_checked} links reachable"
    )
    body_html = f"""
        <h2>Privacy source link health audit</h2>
        <p>Checked {total_checked} unique source URLs across privacy_source_registry,
           privacy_regulation_catalog, and the curated crawler adapters.</p>
        <p><strong>{len(broken)} unreachable</strong> (HTTP error, timeout, or connection failure).
           Countries/jurisdictions relying on these fall back to weaker recall-only AI discovery,
           which is more prone to drifting onto the wrong country's law (see the
           country-mismatch rejection guard in privacy_discovery_service.py) until a working
           replacement URL is added.</p>
        <ul>{rows_html}</ul>
    """

    try:
        primary = getattr(settings, "ADMIN_EMAIL", "") or getattr(settings, "EMAIL_FROM", "")
        cc_list = [c.strip() for c in getattr(settings, "PRIVACY_REPORT_CC_EMAIL", "").split(",") if c.strip()]
        recipients = [r for r in [primary, *cc_list] if r]
        if recipients:
            await send_notification(", ".join(recipients), subject, body_html)
            print(f"\nReport sent to: {', '.join(recipients)}")
        else:
            print("\nNo ADMIN_EMAIL/EMAIL_FROM/PRIVACY_REPORT_CC_EMAIL configured — report not sent.")
    except Exception as exc:
        print(f"\nFailed to send report: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
