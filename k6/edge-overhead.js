// Edge-overhead test — quantifies Cloudflare + cloudflared tunnel latency by
// running the SAME read-only requests two ways and diffing per-endpoint timings.
//
// Run it TWICE with the same VU/duration, changing only K6_BASE_URL:
//
//   # A) loopback, on the prod host
//   ~/.local/bin/k6 run -e K6_BASE_URL=http://127.0.0.1:8000 \
//     -e LT_TEACHER_PASS=... --summary-export edge-loopback.json k6/edge-overhead.js
//
//   # B) through the public edge (also fine to run from the host)
//   ~/.local/bin/k6 run -e K6_BASE_URL=https://peripateticware.com \
//     -e LT_TEACHER_PASS=... --summary-export edge-public.json k6/edge-overhead.js
//
// Then compare http_req_duration and the ep_* per-endpoint trends between the two
// summary files: public - loopback = the Cloudflare + tunnel overhead per route.
// Kept deliberately small so the public run doesn't trip Cloudflare protection.
import { Trend } from 'k6/metrics';
import { USERS, think } from './lib/config.js';
import { login, getTagged } from './lib/auth.js';
import './lib/metrics.js';

export const options = {
  vus: parseInt(__ENV.LT_EDGE_VUS || '20', 10),
  duration: __ENV.LT_EDGE_DURATION || '5m',
  thresholds: { http_req_failed: ['rate<0.05'] },
};

// Endpoint list: [path, needsAuth, metricName]. Defined here so the Trends are
// created in init context and always land in --summary-export.
const ENDPOINTS = [
  ['/health/', false, 'health'],
  ['/api/v1/blog/posts', false, 'blog_posts'],
  ['/api/v1/geo/hint', false, 'geo_hint'],
  ['/api/v1/pages/home/blocks', false, 'pages_home_blocks'],
  ['/api/v1/activities', true, 'activities_list'],
  ['/api/v1/standards', true, 'standards_list'],
];
const TRENDS = {};
for (const [, , name] of ENDPOINTS) TRENDS[name] = new Trend(`ep_${name}`, true);

export function setup() {
  return { teacher: login(USERS.teacher.email, USERS.teacher.password) };
}

export default function (data) {
  for (const [path, needsAuth, name] of ENDPOINTS) {
    const res = getTagged(path, needsAuth ? data.teacher : null, name, [404]);
    TRENDS[name].add(res.timings.duration);
  }
  think(1, 2);
}
