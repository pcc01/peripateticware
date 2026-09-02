# Load Test Results — 2026-09-02

Run against production. Primary path: k6 on the prod host (`pcc@192.168.50.76`)
→ loopback `http://127.0.0.1:8000` (bypasses Cloudflare + tunnel). Edge overhead
measured separately vs `https://peripateticware.com`. Raw summaries in
`results/`. Bugs found → `FINDINGS.md`.

## Headline

- **The application handles ~200 concurrent users with enormous headroom.**
  15-minute sustained run, peak 209 concurrent VUs, 112,269 requests, **p95
  10.3 ms**, **zero 5xx**. Backend CPU ~78 % of 4 cores, memory < 1 GB / 6 GB,
  Postgres 43 / 100 connections. The real ceiling is far higher and was not
  reached.
- **What a real user experiences is ~95 % Cloudflare + tunnel latency, ~5 % app.**
  App: 5–12 ms/request. Public edge: +166 ms median on a warm connection,
  +350–580 ms on a cold one, p95 overhead +457 ms.
- **Rate limiting is not enforcing in production.** 112 k requests from one IP,
  plus a separate ~11 k through the public edge — zero 429s against a configured
  `200/minute` limit. (`FINDINGS.md` #6.)

## Runs

| Run | Where | Load | Result |
|---|---|---|---|
| Smoke | loopback | 5 VU × 60 s (325 req) | p95 24 ms, 0×429, found the 2 broken student endpoints |
| Capacity | loopback | ramp to 209 VU, 15 min (112 k req) | p95 10.3 ms, avg 6.4 ms, **0 5xx**, 124 req/s, 15 % `http_req_failed` = a test bug (student scenario hit a teacher route, 403 — since fixed) |
| Edge (warm) | host → both | 15 VU × 3 min | loopback med 11.9 / p95 61 ms · public med 178 / p95 518 ms |
| Edge (cold) | host → both | serial curl ×15 | loopback 3–7 ms · public 361–579 ms per endpoint |

## Resource ceilings observed (capacity peak)

| Container | Peak | Limit | Headroom |
|---|---|---|---|
| backend | CPU ~78 % of 4 cores · ~1.0 GB RAM | 4 CPU / 6 GB | large |
| postgres | CPU < 5 % · 2.0 GB RAM · 43 conns | 4 GB · 100 conns | large |
| redis | ~8 MB | 256 MB | vast |

## Recommended next runs (after the FINDINGS bugs are fixed)

1. Re-run `capacity.js` with the student-scenario fix for a clean `http_req_failed`
   < 2 %.
2. Push `-e LT_PEAK=3` … `5` (or raise the profile) to actually find the backend's
   knee.
3. `-e LT_ALLOW_WRITES=1` to add activity-create / signup write load, and
   `-e LT_ALLOW_AI=1` (small) to measure the inference path.
4. Re-check rate limiting once #6 is addressed — expect 429s to appear.

## Cloudflare tunnel — what can actually be done

Diagnostics on the host (2026-09-02):

- `cloudflared` 2026.6.1, **QUIC**, 4 HA connections, all to Seattle colos
  (`sea01/09/10`). **Origin↔edge RTT is 3–14 ms.** Host→`1.1.1.1` 7–25 ms.
- So the tunnel + origin leg is *fast*. The ~165 ms warm / ~400 ms cold that a
  user sees is **Cloudflare's edge proxy stack + edge→edge routing to the
  Seattle colo where the tunnel is pinned**, not the app and not the tunnel hop
  itself.

Options, roughly in order of value:

1. **Argo Smart Routing** (~$5/mo + usage). Routes edge→origin over Cloudflare's
   backbone with congestion-aware pathing. This is the direct lever for the
   "every request trombones to the Seattle colo" cost — biggest win if users are
   geographically spread.
2. **Edge-cache the cacheable traffic so it never enters the tunnel.**
   - Frontend is a static Vite build (`frontend` nginx) → make it ~100 %
     cache-hit: long `Cache-Control: immutable` on hashed assets + a Cloudflare
     Cache Rule ("Cache Everything") for the asset paths.
   - Public API GETs `/api/v1/blog/posts`, `/api/v1/pages/*/blocks` change rarely
     → emit `Cache-Control: public, s-maxage=300` from the backend + a matching
     Cache Rule. Removes those tunnel round-trips on hit.
3. **Fix the tunnel ingress rule** `path: ^/health$` → `^/health` (or
   `^/health(/.*)?$`). Right now `/health/` (trailing slash, which the app
   redirects to) does **not** match and falls through to the frontend nginx
   catch-all instead of the backend — skews health checks and monitoring.
4. **Trim Cloudflare features on the API hot path** — a Configuration Rule to
   disable Rocket Loader / Mirage / Email Obfuscation / Bot Fight Mode for
   `/api/*` shaves edge processing time.
5. **Run a second `cloudflared` replica** for the same tunnel on a small VPS
   near the bulk of users. Cloudflare load-balances to the closest healthy
   connection, so this cuts the edge→colo leg without Argo.
6. **Drop the tunnel, expose the origin directly** (port-forward 443, Cloudflare
   origin cert, orange-cloud DNS, firewall to Cloudflare IP ranges only). Lowest
   latency, but re-exposes the home IP and needs a stable address — the reason
   the tunnel exists. Only if 1–5 aren't enough.

Measure first: Cloudflare dash → Analytics → **Origin Response Time**. Our
numbers say it should read ~15–25 ms; if users still see 200 ms, the gap is edge
routing → do #1. Confirm with WebPageTest from 3–4 cities.

## Teardown (not yet done — accounts kept for re-runs)

- No rate-limit patch was applied, so nothing to revert there.
- To remove test data: deactivate/delete users `loadtest.teacher`,
  `loadtest.homeschool`, `loadtest.student` (+ their auto-created orgs), the
  `Load Test Classroom` (id `1a5abb2f-57e8-412c-85fc-1e373c432d1d`), and any
  `loadtest.signup+*` rows if `LT_ALLOW_WRITES` is ever used.
- `k6/` suite + `~/.local/bin/k6` on the host can stay for future runs.
