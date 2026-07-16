/**
 * GPS Live Map / Fieldwork Tracker E2E tests.
 *
 * Covers the feature described in GPS_MAP_HANDOFF.md:
 *   - Teacher session monitor "Fieldwork Map" link (gated on session.activity_id)
 *   - CourseFieldworkTracker (professor/teacher async GPS map)
 *   - Student GPS consent modal on the real session-start flow (13+ self-consent)
 *   - Homeschool GPS toggle + self-consent checkbox on activity creation
 *
 * These flows depend on specific backend state (a session tied to an
 * activity with submitted GPS snapshots, an activity with GPS capture
 * enabled, etc.) that isn't reliably present in every environment this
 * suite runs against. Rather than skip real behavioral coverage, these
 * tests mock the relevant API responses with page.route() and assert on
 * actual UI behavior — button visibility, map pin counts, consent POSTs —
 * instead of only checking "loads without crashing".
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAKE_SESSION_ID  = '11111111-1111-1111-1111-111111111111';
const FAKE_ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_A = '33333333-3333-3333-3333-333333333333';
const STUDENT_B = '44444444-4444-4444-4444-444444444444';

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: FAKE_SESSION_ID,
    session_id: FAKE_SESSION_ID,
    activity_id: FAKE_ACTIVITY_ID,
    student_id: STUDENT_A,
    started_at: new Date().toISOString(),
    status: 'active',
    title: 'GPS Test Session',
    location: { latitude: 40.7308, longitude: -73.9973, name: 'Washington Square Park' },
    inquiry_log: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Teacher — "Fieldwork Map" link on the Live Session Monitor
// ─────────────────────────────────────────────────────────────────────────

test.describe('Teacher — Fieldwork Map link on Session Monitor', () => {
  test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

  async function mockSessionMonitorApis(page: Page, session: Record<string, unknown>) {
    await page.route(`**/api/v1/sessions/${FAKE_SESSION_ID}`, (route) =>
      route.fulfill({ json: session }));
    await page.route(`**/api/v1/sessions/${FAKE_SESSION_ID}/events**`, (route) =>
      route.fulfill({ json: { events: [], count: 0 } }));
  }

  test('shows "Fieldwork Map" button when the session has an activity_id', async ({ page }) => {
    await mockSessionMonitorApis(page, baseSession());
    await page.goto(`/teacher/sessions/${FAKE_SESSION_ID}/monitor`);

    const fieldworkBtn = page.getByRole('button', { name: /fieldwork map/i });
    await expect(fieldworkBtn).toBeVisible({ timeout: 10_000 });

    await fieldworkBtn.click();
    await expect(page).toHaveURL(new RegExp(`/teacher/activities/${FAKE_ACTIVITY_ID}/fieldwork`));
  });

  test('hides "Fieldwork Map" button when the session has no activity_id', async ({ page }) => {
    await mockSessionMonitorApis(page, baseSession({ activity_id: null }));
    await page.goto(`/teacher/sessions/${FAKE_SESSION_ID}/monitor`);

    await expect(page.locator('main, .container').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /fieldwork map/i })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Teacher/Professor — CourseFieldworkTracker (async GPS map)
// ─────────────────────────────────────────────────────────────────────────

test.describe('Teacher — CourseFieldworkTracker (fieldwork map page)', () => {
  test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

  const twoStudentLocations = {
    activity_id: FAKE_ACTIVITY_ID,
    locations: [
      {
        student_id: STUDENT_A, student_name: 'Ada Lovelace',
        latitude: 40.7308, longitude: -73.9973, location_name: 'Washington Square Park',
        submitted_at: '2026-07-14T10:00:00Z', title: 'Field note 1', type: 'field_note',
      },
      {
        student_id: STUDENT_A, student_name: 'Ada Lovelace',
        latitude: 40.7318, longitude: -73.9983, location_name: null,
        submitted_at: '2026-07-14T11:00:00Z', title: 'Capture 1', type: 'capture',
      },
      {
        student_id: STUDENT_B, student_name: 'Grace Hopper',
        latitude: 40.7580, longitude: -73.9855, location_name: 'Times Square',
        submitted_at: '2026-07-14T12:00:00Z', title: 'Field note 2', type: 'field_note',
      },
    ],
    count: 3,
  };

  test('renders per-student pins and submission counts from the API', async ({ page }) => {
    await page.route(`**/api/v1/activities/${FAKE_ACTIVITY_ID}/fieldwork-locations`, (route) =>
      route.fulfill({ json: twoStudentLocations }));

    await page.goto(`/teacher/activities/${FAKE_ACTIVITY_ID}/fieldwork`);

    await expect(page.getByText(/students \(2\)/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText('Grace Hopper')).toBeVisible();
    await expect(page.getByText(/2 submissions/i)).toBeVisible();
    await expect(page.getByText(/3 total gps snapshots from 2 students/i)).toBeVisible();
  });

  test('clicking a student filters the map and shows a "Show all students" link', async ({ page }) => {
    await page.route(`**/api/v1/activities/${FAKE_ACTIVITY_ID}/fieldwork-locations`, (route) =>
      route.fulfill({ json: twoStudentLocations }));

    await page.goto(`/teacher/activities/${FAKE_ACTIVITY_ID}/fieldwork`);
    await expect(page.getByText('Ada Lovelace')).toBeVisible({ timeout: 10_000 });

    await page.getByText('Ada Lovelace').click();
    await expect(page.getByText(/show all students/i)).toBeVisible();

    // Toggling off returns to the unfiltered view
    await page.getByText(/show all students/i).click();
    await expect(page.getByText(/show all students/i)).toHaveCount(0);
  });

  test('shows an empty state when no GPS snapshots exist yet', async ({ page }) => {
    await page.route(`**/api/v1/activities/${FAKE_ACTIVITY_ID}/fieldwork-locations`, (route) =>
      route.fulfill({ json: { activity_id: FAKE_ACTIVITY_ID, locations: [], count: 0 } }));

    await page.goto(`/teacher/activities/${FAKE_ACTIVITY_ID}/fieldwork`);
    await expect(page.getByText(/no fieldwork submissions yet/i)).toBeVisible({ timeout: 10_000 });
  });

  test('shows an error state when the API call fails', async ({ page }) => {
    await page.route(`**/api/v1/activities/${FAKE_ACTIVITY_ID}/fieldwork-locations`, (route) =>
      route.fulfill({ status: 500, json: { detail: 'server error' } }));

    await page.goto(`/teacher/activities/${FAKE_ACTIVITY_ID}/fieldwork`);
    await expect(page.getByText(/failed to load fieldwork locations/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Student — GPS self-consent modal on the real activity flow (13+ path)
//
// NOTE: this deliberately targets /student/activities/:id
// (StudentActivityDetailPage), which is the route students are actually
// navigated to from the dashboard to start a session. There is a second,
// separate SessionPage component at /session/:id with its own GPS-consent
// UI, but nothing in the app ever navigates there — StudentDashboard links
// to /student/activities/:id — so it's not exercised here.
// ─────────────────────────────────────────────────────────────────────────

test.describe('Student — GPS consent modal on activity session start', () => {
  test.use({ storageState: path.join(__dirname, '.auth/student.json') });

  function activityDetail(gpsEnabled: boolean) {
    return {
      id: FAKE_ACTIVITY_ID,
      title: 'GPS Fieldtrip Activity',
      description: 'Explore the park and document what you find.',
      subject: 'Science',
      location: 'Washington Square Park',
      status: 'published',
      due_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      discovery_location_gps_capture_enabled: gpsEnabled,
    };
  }

  async function mockActivityAndStart(page: Page, gpsEnabled: boolean) {
    await page.route(`**/api/v1/student/activities/${FAKE_ACTIVITY_ID}`, (route) =>
      route.fulfill({ json: activityDetail(gpsEnabled) }));
    await page.route(`**/api/v1/student/activities/${FAKE_ACTIVITY_ID}/start`, (route) =>
      route.fulfill({
        json: {
          session_id: FAKE_SESSION_ID,
          activity_id: FAKE_ACTIVITY_ID,
          status: 'active',
          started_at: new Date().toISOString(),
        },
      }));
    await page.route(`**/api/v1/student/sessions/${FAKE_SESSION_ID}/evidence`, (route) =>
      route.fulfill({ json: { captures: [], total: 0 } }));
  }

  test('shows the "Location Sharing" modal after starting a GPS-enabled activity', async ({ page }) => {
    await mockActivityAndStart(page, true);
    await page.goto(`/student/activities/${FAKE_ACTIVITY_ID}`);

    await page.getByRole('button', { name: /start activity/i }).click();
    await expect(page.getByText(/location sharing/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^allow$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^decline$/i })).toBeVisible();
  });

  test('does not show the modal for an activity with GPS capture disabled', async ({ page }) => {
    await mockActivityAndStart(page, false);
    await page.goto(`/student/activities/${FAKE_ACTIVITY_ID}`);

    await page.getByRole('button', { name: /start activity/i }).click();
    await expect(page.getByRole('heading', { name: /add evidence/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/location sharing/i)).toHaveCount(0);
  });

  test('"Allow" posts consent to the backend and dismisses the modal', async ({ page }) => {
    await mockActivityAndStart(page, true);

    let consentBody: any = null;
    await page.route('**/api/v1/student/consent/gps', async (route) => {
      consentBody = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { recorded: true, consent_given: true } });
    });

    await page.goto(`/student/activities/${FAKE_ACTIVITY_ID}`);
    await page.getByRole('button', { name: /start activity/i }).click();
    await expect(page.getByText(/location sharing/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^allow$/i }).click();
    await expect(page.getByText(/location sharing/i)).toHaveCount(0);

    await expect.poll(() => consentBody).not.toBeNull();
    expect(consentBody).toMatchObject({ activity_id: FAKE_ACTIVITY_ID, consent_given: true });
  });

  test('"Decline" dismisses the modal without posting consent', async ({ page }) => {
    await mockActivityAndStart(page, true);

    let consentCalled = false;
    await page.route('**/api/v1/student/consent/gps', async (route) => {
      consentCalled = true;
      await route.fulfill({ status: 201, json: { recorded: true } });
    });

    await page.goto(`/student/activities/${FAKE_ACTIVITY_ID}`);
    await page.getByRole('button', { name: /start activity/i }).click();
    await expect(page.getByText(/location sharing/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^decline$/i }).click();
    await expect(page.getByText(/location sharing/i)).toHaveCount(0);
    expect(consentCalled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Homeschool — GPS toggle + self-consent checkbox at activity creation
// ─────────────────────────────────────────────────────────────────────────

test.describe('Homeschool — GPS toggle and self-consent on activity creation', () => {
  test.use({ storageState: path.join(__dirname, '.auth/homeschool.json') });

  test('GPS toggle reveals a self-consent checkbox for the homeschool role', async ({ page }) => {
    await page.goto('/homeschool/activities/new');
    await expect(page).not.toHaveURL(/\/login/);

    await page.getByRole('button', { name: /location/i }).click();

    const gpsToggle = page.getByText(/enable live gps tracking/i);
    await expect(gpsToggle).toBeVisible({ timeout: 10_000 });

    const consentCheckbox = page.getByText(/i consent to gps location capture for my child/i);
    await expect(consentCheckbox).toHaveCount(0);

    await gpsToggle.click();
    await expect(consentCheckbox).toBeVisible();
  });

  test('saving with GPS + self-consent checked posts consent for the new activity', async ({ page }) => {
    const NEW_ACTIVITY_ID = '55555555-5555-5555-5555-555555555555';

    await page.route('**/api/v1/activities', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 201, json: { id: NEW_ACTIVITY_ID } });
      } else {
        await route.continue();
      }
    });

    let consentBody: any = null;
    await page.route('**/api/v1/parent/consent/gps', async (route) => {
      consentBody = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { recorded: true } });
    });

    await page.goto('/homeschool/activities/new');
    await page.locator('#title').fill('E2E GPS Fieldtrip');

    await page.getByRole('button', { name: /location/i }).click();
    await page.getByText(/enable live gps tracking/i).click();
    await page.getByText(/i consent to gps location capture for my child/i).click();

    await page.getByRole('button', { name: /save draft/i }).click();

    await expect.poll(() => consentBody, { timeout: 10_000 }).not.toBeNull();
    expect(consentBody).toMatchObject({ activity_id: NEW_ACTIVITY_ID, consent_given: true });
  });
});
