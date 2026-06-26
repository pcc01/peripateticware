/**
 * Auth setup — runs once before all tests.
 * Saves auth state for each persona so tests skip the login UI.
 *
 * Uses direct API calls (not UI login) for reliability.
 * The Vite proxy rewrites /auth/* → /api/v1/auth/* on the backend.
 */
import { test as setup, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEACHER_FILE    = path.join(__dirname, '.auth/teacher.json');
const STUDENT_FILE    = path.join(__dirname, '.auth/student.json');
const PARENT_FILE     = path.join(__dirname, '.auth/parent.json');
const ADMIN_FILE      = path.join(__dirname, '.auth/admin.json');
const HOMESCHOOL_FILE = path.join(__dirname, '.auth/homeschool.json');
const PLATFORM_FILE   = path.join(__dirname, '.auth/platform.json');

async function loginAs(
  page: Page,
  email: string,
  password: string,
  stateFile: string,
) {
  // Call the login API directly — more reliable than filling the UI form.
  // The Vite dev server proxies /auth/* to /api/v1/auth/* on the backend.
  const resp = await page.request.post('/auth/login', {
    headers: { 'Content-Type': 'application/json' },
    data: { email, password },
  });

  if (!resp.ok()) {
    const body = await resp.text();
    throw new Error(`Login API failed for ${email}: ${resp.status()} ${body}`);
  }

  const data = await resp.json();
  const token: string = data.access_token;
  if (!token) throw new Error(`No access_token in login response for ${email}`);

  // Inject auth into browser storage so the React app treats us as logged in
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ tok, usr }) => {
    localStorage.setItem('auth_token', tok);
    if (usr) localStorage.setItem('auth_user', JSON.stringify(usr));
  }, {
    tok: token,
    usr: {
      user_id: data.user_id ?? data.id,
      email:   data.email   ?? email,
      role:    data.role,
    },
  });

  await page.context().storageState({ path: stateFile });
}

setup('authenticate as teacher', async ({ page }) => {
  await loginAs(page,
    process.env.TEST_TEACHER_EMAIL    ?? 'teacher@example.com',
    process.env.TEST_TEACHER_PASSWORD ?? 'SecurePass123!',
    TEACHER_FILE);
});

setup('authenticate as student', async ({ page }) => {
  await loginAs(page,
    process.env.TEST_STUDENT_EMAIL    ?? 'student@example.com',
    process.env.TEST_STUDENT_PASSWORD ?? 'SecurePass123!',
    STUDENT_FILE);
});

setup('authenticate as parent', async ({ page }) => {
  await loginAs(page,
    process.env.TEST_PARENT_EMAIL    ?? 'parent@example.com',
    process.env.TEST_PARENT_PASSWORD ?? 'SecurePass123!',
    PARENT_FILE);
});

setup('authenticate as admin', async ({ page }) => {
  await loginAs(page,
    process.env.TEST_ADMIN_EMAIL    ?? 'admin@example.com',
    process.env.TEST_ADMIN_PASSWORD ?? 'SecurePass123!',
    ADMIN_FILE);
});

setup('authenticate as homeschool', async ({ page }) => {
  await loginAs(page,
    process.env.TEST_HOMESCHOOL_EMAIL    ?? 'homeschool@example.com',
    process.env.TEST_HOMESCHOOL_PASSWORD ?? 'SecurePass123!',
    HOMESCHOOL_FILE);
  // Mark onboarding as dismissed so tests land on the dashboard, not the welcome wizard.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('hs_onboarding_dismissed', '1'));
  await page.context().storageState({ path: HOMESCHOOL_FILE });
});

setup('authenticate as platform admin', async ({ page }) => {
  await loginAs(page,
    process.env.TEST_PLATFORM_EMAIL    ?? 'admin@example.com',
    process.env.TEST_PLATFORM_PASSWORD ?? 'SecurePass123!',
    PLATFORM_FILE);
});
