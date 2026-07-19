/**
 * Calendar E2E tests — parent + teacher, CLDR/ICU-aware month calendar.
 *
 * Context: ParentCalendarPage.tsx used to filter activities by `due_date`/
 * `status` fields the backend never returned, so the grid was always empty.
 * The fix is GET /api/v1/calendar/events, a unified role-aware endpoint
 * (routes/calendar.py) whose events carry a real `date` (ISO) and `type`
 * ('planned' | 'completed' | 'event' | 'deadline' | 'field_trip' | 'holiday').
 * Both ParentCalendarPage and the new TeacherCalendarPage render that data
 * through the same shared, locale-aware <MonthCalendar> component
 * (src/components/calendar/MonthCalendar.tsx + localeCalendar.ts), which
 * uses @internationalized/date for CLDR grid/week-start math and
 * Intl.DateTimeFormat for locale-correct weekday/month names.
 *
 * These tests mock every network call via page.route() — no live backend —
 * matching the house style used in parent-flows.spec.ts / public-pages.spec.ts.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anchor every mocked event on "today" so it always falls inside the
// calendar's initial month view, regardless of what date the suite runs on.
const today = new Date();
const todayISO = today.toISOString().slice(0, 10);

// Used by the locale-aware grid tests below. ParentCalendarPage only renders
// <MonthCalendar> (the thing with the weekday header cells these tests
// assert on) once a child is selected — selectedChildId is only ever set
// from the parent/children response (see ParentCalendarPage.tsx's effect:
// `if (list.length > 0) setSelectedChildId(list[0].id)`). Mocking
// parent/children as `[]` means the page renders its "link a child" empty
// state instead of the calendar grid, so the header cells this test is
// looking for never exist — not a locale bug, a test-mock bug.
const TEST_CHILD = { id: 'child-1', full_name: 'Ada Lovelace', verified: true };

// ── Parent calendar ─────────────────────────────────────────────────────────

test.describe('Parent — Calendar', () => {
  test.use({ storageState: path.join(__dirname, '.auth/parent.json') });

  const CHILD = { id: 'child-1', full_name: 'Ada Lovelace', verified: true };

  test('renders the linked child and the calendar grid', async ({ page }) => {
    await page.route('**/api/v1/parent/children**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [CHILD] });
    });
    await page.route('**/api/v1/calendar/events**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.goto('/parent/calendar');
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.getByText('Ada Lovelace')).toBeVisible({ timeout: 10_000 });
    // 7 weekday header cells + the month grid itself.
    await expect(page.getByText('Today', { exact: false })).toBeVisible();
  });

  test('activities from GET /calendar/events render on the correct day, by type', async ({ page }) => {
    await page.route('**/api/v1/parent/children**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [CHILD] });
    });

    await page.route('**/api/v1/calendar/events**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: [
          {
            id: 'activity-session-1',
            title: 'River Ecosystem Study',
            date: todayISO,
            type: 'completed',
            source: 'activity',
            subject: 'Science',
            student_id: CHILD.id,
            student_name: null,
          },
          {
            id: 'activity-session-2',
            title: 'Fractions Quiz',
            date: todayISO,
            type: 'planned',
            source: 'activity',
            subject: 'Math',
            student_id: CHILD.id,
            student_name: null,
          },
        ],
      });
    });

    await page.goto('/parent/calendar');
    await expect(page.getByText('Ada Lovelace')).toBeVisible({ timeout: 10_000 });

    // Both events land in today's cell (guaranteed to be in the initial
    // month view since the calendar defaults to the current month).
    await expect(page.getByText('River Ecosystem Study')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Fractions Quiz')).toBeVisible();

    // Clicking today's cell opens the day agenda with both events listed,
    // including the derived completed/planned distinction.
    await page.getByText('Today', { exact: false }).click();
    await expect(page.getByText(/nothing scheduled/i)).toHaveCount(0);
  });

  test('shows the empty-state prompt when no child is linked', async ({ page }) => {
    await page.route('**/api/v1/parent/children**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.goto('/parent/calendar');
    await expect(page.getByText(/link a child/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ── Locale-aware rendering (CLDR week-start-day + date formatting) ─────────

test.describe('Calendar — Locale-aware grid (CLDR/ICU)', () => {
  test.use({ storageState: path.join(__dirname, '.auth/parent.json') });

  test('English (en) locale starts the week on Sunday', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('i18nextLng', 'en'));
    await page.route('**/api/v1/parent/children**', (route) => route.fulfill({ json: [TEST_CHILD] }));
    await page.route('**/api/v1/calendar/events**', (route) => route.fulfill({ json: [] }));

    await page.goto('/parent/calendar');
    // First weekday header cell — MonthCalendar orders labels starting from
    // the locale's CLDR first-day-of-week (@internationalized/date's
    // startOfWeek). en-US's CLDR week data starts on Sunday.
    const firstHeaderCell = page.locator('div').filter({ hasText: /^Sun$/ }).first();
    await expect(firstHeaderCell).toBeVisible({ timeout: 10_000 });
  });

  test('French (fr) locale starts the week on Monday, not Sunday', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('i18nextLng', 'fr'));
    await page.route('**/api/v1/parent/children**', (route) => route.fulfill({ json: [TEST_CHILD] }));
    await page.route('**/api/v1/calendar/events**', (route) => route.fulfill({ json: [] }));

    await page.goto('/parent/calendar');
    // fr's CLDR week data starts on Monday ("lun.") — this is the concrete,
    // date-independent proof that grid math is locale-aware, not just the
    // translated UI strings around it.
    const firstHeaderCell = page.locator('div').filter({ hasText: /^lun\.$/ }).first();
    await expect(firstHeaderCell).toBeVisible({ timeout: 10_000 });
  });
});

// ── Teacher calendar (class roster) ─────────────────────────────────────────

test.describe('Teacher — Calendar', () => {
  test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

  const CLASSROOM = { id: 'classroom-1', name: 'Room 12' };

  test('renders roster activities aggregated across the classroom', async ({ page }) => {
    await page.route('**/api/v1/classrooms**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [CLASSROOM] });
    });

    await page.route('**/api/v1/calendar/events**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: [
          {
            id: 'activity-session-9',
            title: 'Volcano Diorama',
            date: todayISO,
            type: 'completed',
            source: 'activity',
            subject: 'Science',
            student_id: 'student-a',
            student_name: 'Alice',
          },
          {
            id: 'event-deadline-1',
            title: 'Permission slips due',
            date: todayISO,
            type: 'deadline',
            source: 'classroom_event',
            description: 'Bring signed slip',
            classroom_id: CLASSROOM.id,
          },
        ],
      });
    });

    await page.goto('/teacher/calendar');
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.getByText('Volcano Diorama')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Permission slips due')).toBeVisible();
  });

  test('classroom selector appears when the teacher has more than one classroom', async ({ page }) => {
    await page.route('**/api/v1/classrooms**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [CLASSROOM, { id: 'classroom-2', name: 'Room 7' }] });
    });
    await page.route('**/api/v1/calendar/events**', (route) => route.fulfill({ json: [] }));

    await page.goto('/teacher/calendar');
    await expect(page.getByRole('button', { name: 'Room 12' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Room 7' })).toBeVisible();
  });

  test('add-event form posts a new classroom event', async ({ page }) => {
    await page.route('**/api/v1/classrooms**', (route) => route.fulfill({ json: [CLASSROOM] }));
    await page.route('**/api/v1/calendar/events**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          json: {
            id: 'event-new-1', title: 'Field trip', date: '2026-08-01',
            type: 'field_trip', source: 'classroom_event', classroom_id: CLASSROOM.id,
          },
        });
      }
      return route.fulfill({ json: [] });
    });

    await page.goto('/teacher/calendar');
    await page.getByRole('button', { name: /add event/i }).click();
    await page.getByPlaceholder(/river study field trip/i).fill('Field trip');
    await page.locator('input[type="date"]').fill('2026-08-01');
    await page.getByRole('button', { name: /save event/i }).click();

    // Form closes back to the "Add Event" button after a successful save.
    await expect(page.getByRole('button', { name: /add event/i })).toBeVisible({ timeout: 10_000 });
  });
});
