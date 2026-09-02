// Shared config for the Peripateticware k6 load-test suite.
//
// BASE_URL:
//   - loopback (default, run ON the prod host):  http://127.0.0.1:8000
//   - edge (run from anywhere):                  https://peripateticware.com
// Override with:  -e K6_BASE_URL=https://peripateticware.com
import { sleep } from 'k6';

export const BASE_URL = (__ENV.K6_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

// Credentials come from the environment (see k6/.env.local.example).
// Never hard-code them here.
export const USERS = {
  teacher: {
    email: __ENV.LT_TEACHER_EMAIL || 'loadtest.teacher@thewordinbits.com',
    password: __ENV.LT_TEACHER_PASS || '',
  },
  homeschool: {
    email: __ENV.LT_HOMESCHOOL_EMAIL || 'loadtest.homeschool@thewordinbits.com',
    password: __ENV.LT_HOMESCHOOL_PASS || '',
  },
  student: {
    email: __ENV.LT_STUDENT_EMAIL || 'loadtest.student@thewordinbits.com',
    password: __ENV.LT_STUDENT_PASS || '',
  },
};

// Opt-in flags — default OFF so a plain run is read-only and AI-free.
export const ALLOW_WRITES = __ENV.LT_ALLOW_WRITES === '1';
export const ALLOW_AI = __ENV.LT_ALLOW_AI === '1';

// Randomised think-time between user actions (seconds).
export function think(min = 1, max = 3) {
  sleep(Math.random() * (max - min) + min);
}

export const JSON_HEADERS = { 'Content-Type': 'application/json' };
