// Smoke test — run FIRST, on the prod host, against loopback.
//   ~/.local/bin/k6 run -e K6_BASE_URL=http://127.0.0.1:8000 \
//     -e LT_TEACHER_PASS=... -e LT_HOMESCHOOL_PASS=... -e LT_STUDENT_PASS=... \
//     k6/smoke.js
//
// Goal: confirm every endpoint the load test touches returns 2xx, and observe
// how quickly the 200/min-per-IP global rate limit (backend/core/http_rate_limiter.py)
// starts returning 429. That result decides whether the capacity run needs the
// limit temporarily raised.
import { check } from 'k6';
import { USERS, think } from './lib/config.js';
import { login } from './lib/auth.js';
import './lib/metrics.js';
import { unauthFlow } from './scenarios/unauth.js';
import { teacherFlow } from './scenarios/teacher.js';
import { studentFlow } from './scenarios/student.js';
import { homeschoolFlow } from './scenarios/homeschool.js';

export const options = {
  vus: 5,
  duration: '60s',
  thresholds: {
    // Smoke is lenient — we want it to finish and report, not abort.
    http_req_failed: ['rate<0.35'],
    checks: ['rate>0.60'],
  },
};

export function setup() {
  const tokens = {
    teacher: login(USERS.teacher.email, USERS.teacher.password),
    homeschool: login(USERS.homeschool.email, USERS.homeschool.password),
    student: login(USERS.student.email, USERS.student.password),
  };
  check(tokens, {
    'teacher token': (t) => !!t.teacher,
    'homeschool token': (t) => !!t.homeschool,
    'student token': (t) => !!t.student,
  });
  return tokens;
}

export default function (tokens) {
  // One VU cycles through all four flows so a 60s smoke exercises everything.
  unauthFlow();
  teacherFlow(tokens.teacher);
  studentFlow(tokens.student);
  homeschoolFlow(tokens.homeschool);
  think(1, 2);
}

export function handleSummary(data) {
  const m = data.metrics;
  const line = (k) => (m[k] ? m[k].values : {});
  const summary = {
    checks_pass_rate: line('checks').rate,
    http_req_failed_rate: line('http_req_failed').rate,
    http_reqs_total: line('http_reqs').count,
    p95_ms: line('http_req_duration')['p(95)'],
    p99_ms: line('http_req_duration')['p(99)'],
    rate_limited_429: line('rate_limited_429').count || 0,
    server_error_5xx: line('server_error_5xx').count || 0,
  };
  return {
    stdout: '\n=== SMOKE SUMMARY ===\n' + JSON.stringify(summary, null, 2) + '\n',
    'k6-smoke-summary.json': JSON.stringify(data, null, 2),
  };
}
