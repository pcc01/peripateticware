// Capacity test — run on the prod host against loopback, AFTER the smoke test
// and after deciding what to do about the rate limit.
//
//   ~/.local/bin/k6 run -e K6_BASE_URL=http://127.0.0.1:8000 \
//     -e LT_TEACHER_PASS=... -e LT_HOMESCHOOL_PASS=... -e LT_STUDENT_PASS=... \
//     --summary-export k6-capacity-summary.json \
//     k6/capacity.js
//
// NOTE: with the stock 200/min-per-IP global limit still in place, every VU
// here shares one bucket (loopback => rate-limit key is 127.0.0.1) and the run
// will be dominated by 429s. Either raise default_limits in
// backend/core/http_rate_limiter.py for the test window, or read this run as
// "throughput under the current cap" only. Scale the profile with LT_PEAK
// (default 1.0) while iterating: -e LT_PEAK=0.25
import { check } from 'k6';
import { USERS } from './lib/config.js';
import { login } from './lib/auth.js';
import './lib/metrics.js';
import { unauthFlow } from './scenarios/unauth.js';
import { teacherFlow } from './scenarios/teacher.js';
import { studentFlow } from './scenarios/student.js';
import { homeschoolFlow } from './scenarios/homeschool.js';

const PEAK = parseFloat(__ENV.LT_PEAK || '1.0');
const t = (n) => Math.max(1, Math.round(n * PEAK));

export const options = {
  scenarios: {
    unauth: {
      executor: 'ramping-vus',
      exec: 'unauthScenario',
      startVUs: 0,
      stages: [
        { duration: '2m', target: t(20) },
        { duration: '5m', target: t(20) },
        { duration: '1m', target: 0 },
      ],
    },
    teachers: {
      executor: 'ramping-vus',
      exec: 'teacherScenario',
      startVUs: 0,
      stages: [
        { duration: '2m', target: t(30) },
        { duration: '3m', target: t(60) },
        { duration: '3m', target: t(80) },
        { duration: '5m', target: t(80) },
        { duration: '2m', target: 0 },
      ],
    },
    students: {
      executor: 'ramping-vus',
      exec: 'studentScenario',
      startVUs: 0,
      stages: [
        { duration: '3m', target: t(60) },
        { duration: '4m', target: t(100) },
        { duration: '5m', target: t(100) },
        { duration: '2m', target: 0 },
      ],
    },
    homeschool: {
      executor: 'ramping-vus',
      exec: 'homeschoolScenario',
      startVUs: 0,
      stages: [
        { duration: '2m', target: t(10) },
        { duration: '8m', target: t(20) },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{scenario:unauth}': ['p(95)<1000'],
    'http_req_duration{scenario:teachers}': ['p(95)<2000'],
    'http_req_duration{scenario:students}': ['p(95)<1500'],
    'http_req_duration{scenario:homeschool}': ['p(95)<3000'],
    http_req_failed: ['rate<0.02'],
    server_error_5xx: ['count<5'],
  },
};

export function setup() {
  return {
    teacher: login(USERS.teacher.email, USERS.teacher.password),
    homeschool: login(USERS.homeschool.email, USERS.homeschool.password),
    student: login(USERS.student.email, USERS.student.password),
  };
}

export function unauthScenario() {
  unauthFlow();
}
export function teacherScenario(data) {
  teacherFlow(data.teacher);
}
export function studentScenario(data) {
  studentFlow(data.student);
}
export function homeschoolScenario(data) {
  homeschoolFlow(data.homeschool);
}
