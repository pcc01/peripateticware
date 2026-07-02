/**
 * Automated accessibility checks (WCAG 2.1 A/AA) via axe-core.
 *
 * Covers the public, no-auth pages. Extend PAGES / add authenticated flows as
 * the app grows. Requires the dev dependency:
 *   npm install --save-dev @axe-core/playwright axe-core
 *
 * Run: npx playwright test tests/e2e/accessibility.spec.ts
 *
 * NOTE: kept as its own spec so the a11y gate can be run/reported separately in
 * CI from the functional e2e suite.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  { path: '/', name: 'Landing' },
  { path: '/login', name: 'Login' },
  { path: '/signup', name: 'Signup' },
  { path: '/privacy', name: 'Privacy' },
  { path: '/terms', name: 'Terms' },
  { path: '/do-not-sell', name: 'Do Not Sell (CCPA)' },
  { path: '/privacy-engine', name: 'Privacy Engine' },
];

for (const { path, name } of PAGES) {
  test(`${name} — WCAG 2.1 A/AA (axe)`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Attach the full violation list to the report for triage.
    if (results.violations.length) {
      console.log(
        `[a11y] ${name} violations:\n` +
          results.violations
            .map(v => `  ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
            .join('\n'),
      );
    }

    expect(results.violations, `${name} has WCAG A/AA violations`).toEqual([]);
  });
}
