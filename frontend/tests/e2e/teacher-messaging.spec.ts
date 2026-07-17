/**
 * Teacher messaging E2E tests — announcements (broadcast) + 1:1 conversations.
 *
 * Context: teachers previously had no way to originate communication at all
 * (only reply-to-existing on the parent side, in ParentMessagesPage.tsx).
 * This adds TeacherMessagesPage (/teacher/messages) with two tabs:
 *   - Announcements: POST/GET /teacher/classrooms/:id/announcements, a new
 *     classroom_announcements table distinct from 1:1 messages.
 *   - Messages: 1:1 threads via /teacher/messages[/:conversation_id[/reply]],
 *     reusing the same parent_messages table the parent portal already reads
 *     (routes/teacher_communication.py).
 * Parent-side surfacing: GET /parent/announcements, rendered as a banner on
 * ParentMessagesPage.tsx.
 *
 * These tests mock every network call via page.route() — no live backend —
 * matching the house style used in calendar.spec.ts / parent-flows.spec.ts.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLASSROOM = { id: 'classroom-1', name: "Ms. Rivera's Class" };
const now = new Date().toISOString();

// ── Teacher — Announcements tab ─────────────────────────────────────────────

test.describe('Teacher — Announcements', () => {
  test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

  test('composes and posts a new announcement', async ({ page }) => {
    let created = false;

    await page.route('**/api/v1/classrooms', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [CLASSROOM] });
    });

    await page.route(`**/api/v1/teacher/classrooms/${CLASSROOM.id}/announcements`, async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        return route.fulfill({
          json: created
            ? [{
                id: 'ann-1', classroom_id: CLASSROOM.id, classroom_name: CLASSROOM.name,
                teacher_id: 'teacher-1', teacher_name: 'Ms. Rivera',
                title: 'Field trip Friday', body: 'Permission slips due Thursday.',
                created_at: now,
              }]
            : [],
        });
      }
      if (method === 'POST') {
        created = true;
        return route.fulfill({
          status: 201,
          json: {
            id: 'ann-1', classroom_id: CLASSROOM.id, classroom_name: CLASSROOM.name,
            teacher_id: 'teacher-1', teacher_name: 'Ms. Rivera',
            title: 'Field trip Friday', body: 'Permission slips due Thursday.',
            created_at: now,
          },
        });
      }
      return route.fallback();
    });

    await page.route('**/api/v1/teacher/messages', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.goto('/teacher/messages');
    await expect(page).not.toHaveURL(/\/login/);

    // Announcements tab is the default.
    await expect(page.getByTestId('announcements-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No announcements yet for this classroom.')).toBeVisible();

    await page.getByTestId('new-announcement-button').click();
    await page.getByTestId('announcement-title-input').fill('Field trip Friday');
    await page.getByTestId('announcement-body-input').fill('Permission slips due Thursday.');
    await page.getByTestId('send-announcement-button').click();

    await expect(page.getByTestId('announcement-item')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Field trip Friday')).toBeVisible();
    await expect(page.getByText('Permission slips due Thursday.')).toBeVisible();
  });
});

// ── Teacher — Messages tab (1:1) ─────────────────────────────────────────────

test.describe('Teacher — Messages', () => {
  test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

  test('starts a new 1:1 thread with a student\'s parent', async ({ page }) => {
    let sent = false;

    await page.route('**/api/v1/classrooms', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [CLASSROOM] });
    });

    await page.route(`**/api/v1/teacher/classrooms/${CLASSROOM.id}/announcements`, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.route(`**/api/v1/teacher/classrooms/${CLASSROOM.id}/recipients`, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: {
          students: [{ id: 'student-1', name: 'Grace Hopper', email: 'grace@example.com' }],
          parents: [{ id: 'parent-1', name: 'Pat Hopper', email: 'pat@example.com', student_id: 'student-1', student_name: 'Grace Hopper' }],
        },
      });
    });

    await page.route('**/api/v1/teacher/messages', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        return route.fulfill({ json: sent ? [{
          conversation_id: 'conv-1', other_user_id: 'parent-1', other_user_name: 'Pat Hopper',
          subject: 'Field trip reminder', last_message: 'Don\'t forget the permission slip.',
          last_message_at: now, unread: false,
        }] : [] });
      }
      if (method === 'POST') {
        sent = true;
        return route.fulfill({
          status: 201,
          json: { success: true, classroom_name: CLASSROOM.name, sent_count: 1, recipients: [{ recipient_id: 'parent-1', recipient_name: 'Pat Hopper', conversation_id: 'conv-1' }] },
        });
      }
      return route.fallback();
    });

    await page.goto('/teacher/messages');
    await page.getByTestId('tab-messages').click();
    await expect(page.getByTestId('messages-panel')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('new-message-button').click();
    await page.getByTestId('message-audience-select').selectOption('parent');
    await page.getByTestId('message-subject-input').fill('Field trip reminder');
    await page.getByTestId('message-body-input').fill("Don't forget the permission slip.");
    await page.getByTestId('send-message-button').click();

    await expect(page.getByTestId('message-send-ok')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('conversation-item')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Pat Hopper')).toBeVisible();
  });

  test('replies within an existing conversation thread', async ({ page }) => {
    const conversation = {
      conversation_id: 'conv-2', other_user_id: 'parent-2', other_user_name: 'Jordan Ada',
      subject: 'Homework question', last_message: 'Any updates?', last_message_at: now, unread: true,
    };

    await page.route('**/api/v1/teacher/messages', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [conversation] });
    });

    await page.route('**/api/v1/teacher/messages/conv-2', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: [
          { id: 'm1', from_user_id: 'parent-2', from_name: 'Jordan Ada', is_mine: false, subject: 'Homework question', body: 'Any updates?', created_at: now },
        ],
      });
    });

    await page.route('**/api/v1/teacher/messages/conv-2/reply', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({ status: 201, json: { success: true, message_id: 'm2', created_at: now } });
    });

    await page.goto('/teacher/messages');
    await page.getByTestId('tab-messages').click();
    await page.getByTestId('conversation-item').click();

    await expect(page.getByText('Jordan Ada')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('reply-body-input').fill('Yes — graded and returned today.');
    await page.getByTestId('send-reply-button').click();

    // After a successful reply the thread reloads via the mocked GET above;
    // no error banner should appear.
    await expect(page.locator('text=Could not send reply')).toHaveCount(0);
  });
});

// ── Parent — sees announcements ─────────────────────────────────────────────

test.describe('Parent — Announcements banner', () => {
  test.use({ storageState: path.join(__dirname, '.auth/parent.json') });

  test('shows an announcement banner on the Messages page', async ({ page }) => {
    await page.route('**/api/v1/parent/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.route('**/api/v1/parent/announcements**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: [{
          id: 'ann-1', classroom_id: CLASSROOM.id, classroom_name: CLASSROOM.name,
          teacher_id: 'teacher-1', teacher_name: 'Ms. Rivera',
          child_id: 'student-1', child_name: 'Grace Hopper',
          title: 'Field trip Friday', body: 'Permission slips due Thursday.',
          created_at: now,
        }],
      });
    });

    await page.goto('/parent/messages');
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.getByTestId('announcements-section')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('announcement-banner-item')).toBeVisible();
    await expect(page.getByText('Field trip Friday')).toBeVisible();
    await expect(page.getByText(/Permission slips due Thursday/)).toBeVisible();
  });
});
