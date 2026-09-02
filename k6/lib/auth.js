// Auth helpers. Login is rate-limited to 5/min per IP on the server
// (backend/routes/auth.py), so scenarios log in ONCE in setup() and share the
// token across VUs/iterations rather than logging in per iteration.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, JSON_HEADERS } from './config.js';
import { rl429, se5xx } from './metrics.js';

export function login(email, password) {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS, tags: { name: 'auth/login' } },
  );
  const ok = check(res, {
    'login -> 200': (r) => r.status === 200,
    'login -> has token': (r) => !!(r.json && r.json('access_token')),
  });
  if (!ok) {
    console.error(`login failed for ${email}: ${res.status} ${String(res.body).slice(0, 200)}`);
    return null;
  }
  return res.json('access_token');
}

export function authHeaders(token) {
  return {
    headers: Object.assign({}, JSON_HEADERS, { Authorization: `Bearer ${token}` }),
  };
}

// GET with a stable metric tag + a lenient check (2xx/3xx = pass, 4xx/5xx = fail
// but recorded, not fatal). Returns the response for callers that need the body.
export function getTagged(path, token, name, extraOkStatuses = []) {
  const params = token ? authHeaders(token) : { headers: JSON_HEADERS };
  params.tags = { name: name || path };
  const res = http.get(`${BASE_URL}${path}`, params);
  check(res, {
    [`${name} -> 2xx`]: (r) =>
      (r.status >= 200 && r.status < 300) || extraOkStatuses.includes(r.status),
  });
  // Surface rate-limiting / server errors explicitly for the summary.
  if (res.status === 429) {
    rl429.add(1, { name });
    console.warn(`429 on ${name}`);
  }
  if (res.status >= 500) {
    se5xx.add(1, { name });
    console.error(`${res.status} on ${name}: ${String(res.body).slice(0, 200)}`);
  }
  return res;
}
