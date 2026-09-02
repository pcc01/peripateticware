// Student read flow — portfolio, competencies, notebook, available activities.
import { think } from '../lib/config.js';
import { getTagged } from '../lib/auth.js';

// NOTE: /student/portfolio and /student/competencies are DISABLED here — they
// 500 unconditionally on prod (schema drift: student_competencies.description
// missing — see k6/FINDINGS.md #5). Re-enable once that's fixed; keeping them in
// would just pin http_req_failed high and tell us nothing new.
export function studentFlow(token) {
  if (!token) return;
  getTagged('/api/v1/student/notebook', token, 'student/notebook', [404]);
  getTagged('/api/v1/student/activities', token, 'student/activities', [404]);
  think(2, 5);
}
