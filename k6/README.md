# Peripateticware — k6 Load Test Suite

Runnable version of `../LOAD_TEST_PLAN.md`, adapted to the real prod topology
(`peripateticware.com` → Cloudflare → `cloudflared` → loopback `127.0.0.1:8000`
on `pcc@192.168.50.76`, gunicorn 8 workers).

**First run: 2026-09-02.** Results in `RESULTS.md`, bugs found (all fixed +
deployed) in `FINDINGS.md`. Headline: the app handles ~200 concurrent users at
p95 10 ms with zero errors and large headroom; the rate limiter did not bite at
any level (see `FINDINGS.md` #6); user-visible latency is dominated by the
Cloudflare edge + tunnel, not the app.

## Layout

| Path | What |
|---|---|
| `lib/config.js` | `BASE_URL`, credentials from env, `think()` helper, opt-in flags |
| `lib/auth.js` | `login()`, `authHeaders()`, `getTagged()` (tagged GET + 429/5xx counters) |
| `lib/metrics.js` | shared `rate_limited_429` / `server_error_5xx` counters |
| `scenarios/*.js` | per-role request flows (`unauthFlow`, `teacherFlow`, `studentFlow`, `homeschoolFlow`) |
| `smoke.js` | 5 VU / 60 s — verify endpoints + observe 429 onset. **Run first.** |
| `capacity.js` | ramping-VUs capacity run (LOAD_TEST_PLAN.md profile, scale with `LT_PEAK`) |
| `edge-overhead.js` | identical read set, run vs loopback and vs public URL, diff the timings |
| `run-loopback.sh` | wrapper: `./run-loopback.sh smoke` \| `capacity` |
| `run-edge.sh` | wrapper: `./run-edge.sh loopback` \| `public` |
| `FINDINGS.md` | bug tracker — issues found during build/run, fix after |

## Prereqs

- **k6** on the prod host (no sudo needed):
  ```bash
  V=0.52.0; cd /tmp && curl -sSL -o k6.tgz \
    https://github.com/grafana/k6/releases/download/v$V/k6-v$V-linux-amd64.tar.gz \
    && tar xzf k6.tgz && mkdir -p ~/.local/bin && cp k6-v$V-linux-amd64/k6 ~/.local/bin/
  ```
  (Already installed at `~/.local/bin/k6` as of 2026-09-02.)
- **Load-test accounts** (provisioned 2026-09-02):
  `loadtest.teacher@thewordinbits.com`, `loadtest.homeschool@thewordinbits.com`,
  `loadtest.student@thewordinbits.com`. Passwords go in `k6/.env.local`
  (git-ignored — `cp .env.local.example .env.local` and fill in).

## Run order

```bash
# on pcc@192.168.50.76
cd /home/pcc/peripateticware/k6
cp .env.local.example .env.local && $EDITOR .env.local      # add passwords

./run-loopback.sh smoke        # 1. smoke — check endpoints, see when 429s start
# 2. DECISION: raise the 200/min global limit for the test window? (see below)
./run-loopback.sh capacity     # 3. full capacity run (~22 min)
./run-edge.sh loopback         # 4a. edge baseline (on host)
# from a laptop:
./run-edge.sh public           # 4b. same test through peripateticware.com
```

## The rate-limit decision

`backend/core/http_rate_limiter.py` sets `default_limits=["200/minute"]` per
client IP (Redis-backed, shared across workers), plus `POST /auth/login` at
`5/minute` (`backend/routes/auth.py`). On loopback the rate-limit key is
`127.0.0.1` for **all** VUs, so ~200 req/min total before 429s dominate — the
suite logs in once in `setup()` and shares tokens specifically to avoid the
5/min login cap.

After the smoke test, decide:

- **Leave limits as-is** → `capacity.js` measures "throughput under the current
  cap". Honest for a single-IP client, but won't find the app's real ceiling.
- **Raise for the test window** → bump `default_limits` (e.g. `50000/minute`) and
  the `/auth/login` limit, `docker compose -f docker-compose.yml -f
  docker-compose.prod.yml up -d backend`, run, then **revert + redeploy**.

## Metrics to capture during the capacity run

```bash
# second SSH session on the host
watch -n5 'docker stats --no-stream peripateticware-backend peripateticware-postgres peripateticware-redis'
watch -n5 'docker exec peripateticware-postgres psql -U peripateticware_user -d peripateticware -c "SELECT count(*) FROM pg_stat_activity;"'
docker logs -f peripateticware-backend 2>&1 | grep -E "ERROR|Traceback|500"
```

## Teardown (after the run)

- If limits were raised: revert `http_rate_limiter.py` + `auth.py`, redeploy backend, confirm 429 returns after ~200 quick reqs.
- Deactivate / delete the 3 `loadtest.*` users + their auto-created orgs, the
  `Load Test Classroom`, and any rows created with `LT_ALLOW_WRITES=1`
  (activities, `loadtest.signup+*` users).
- Confirm `docker stats` back to baseline.
