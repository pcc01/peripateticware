import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for Peripateticware frontend.
 *
 * Before running tests, start the stack manually:
 *   1. cd C:\dev\pw && docker compose up -d   (backend + postgres)
 *   2. cd C:\dev\pw\frontend && npm run dev    (Vite dev server → localhost:5173)
 *   3. npx playwright test --ui                (in a third terminal)
 *
 * Environment variables:
 *   BASE_URL             - defaults to http://localhost:3000
 *   TEST_TEACHER_EMAIL   / TEST_TEACHER_PASSWORD
 *   TEST_STUDENT_EMAIL   / TEST_STUDENT_PASSWORD
 *   TEST_PARENT_EMAIL    / TEST_PARENT_PASSWORD
 *   TEST_ADMIN_EMAIL     / TEST_ADMIN_PASSWORD
 *   TEST_HOMESCHOOL_EMAIL / TEST_HOMESCHOOL_PASSWORD
 *   TEST_PLATFORM_EMAIL  / TEST_PLATFORM_PASSWORD
 *
 * To add Firefox / WebKit / mobile:
 *   npx playwright install firefox webkit
 *   Then uncomment the projects below.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    process.env.CI ? ['github'] : ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
    // { name: 'mobile-safari', use: { ...devices['iPhone 14'] }, dependencies: ['setup'] },
  ],
});
