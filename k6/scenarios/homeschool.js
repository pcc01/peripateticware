// Homeschool flow — children list + the coverage dashboard, which
// LOAD_TEST_PLAN.md calls out as the most expensive read (standards JOIN).
import { think } from '../lib/config.js';
import { getTagged } from '../lib/auth.js';

export function homeschoolFlow(token) {
  if (!token) return;
  getTagged('/api/v1/homeschool/children', token, 'homeschool/children', [404]);
  getTagged('/api/v1/homeschool/coverage', token, 'homeschool/coverage', [404]);
  think(3, 6);
}
