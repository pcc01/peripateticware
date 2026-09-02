// Unauthenticated traffic: health, public content, geo hint.
// Optional signup behind LT_ALLOW_WRITES=1 (creates real rows + may block on
// SMTP — see k6/FINDINGS.md #3 — so it is OFF by default).
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, JSON_HEADERS, ALLOW_WRITES, think } from '../lib/config.js';
import { getTagged } from '../lib/auth.js';

export function unauthFlow() {
  getTagged('/health/', null, 'health');
  getTagged('/api/v1/blog/posts', null, 'blog/posts', [404]);
  getTagged('/api/v1/pages/home/blocks', null, 'pages/home/blocks', [404]);
  getTagged('/api/v1/geo/hint', null, 'geo/hint', [404]);

  if (ALLOW_WRITES) {
    const email = `loadtest.signup+${__VU}_${Date.now()}@thewordinbits.com`;
    const res = http.post(
      `${BASE_URL}/api/v1/auth/signup`,
      JSON.stringify({
        email,
        password: 'LoadTest!2026aX',
        password_confirm: 'LoadTest!2026aX',
        first_name: 'Load',
        last_name: 'Signup',
        role: 'TEACHER',
        invite_token: 'beta-2026-a',
        school_name: 'Load Test School',
      }),
      { headers: JSON_HEADERS, tags: { name: 'auth/signup' }, timeout: '150s' },
    );
    check(res, { 'signup -> 201/400/429': (r) => [201, 400, 429].includes(r.status) });
  }

  think(1, 3);
}
