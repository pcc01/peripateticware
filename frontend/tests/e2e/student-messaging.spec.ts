/**
 * Student messaging E2E tests — read-only announcements + reply-only 1:1
 * conversations.
 *
 * Context: students previously had no dedicated messaging page on web (only
 * a small read-only announcements preview on StudentDashboard.tsx). This adds
 * StudentMessagesPage (/student/messages), combining an announcements
 * section (GET /student/announcements, read-only, no reply) with a messages
 * list (GET /student/messages) that opens into a full thread view (GET
 * /student/messages/:id, POST /student/messages/:id/reply) — mirroring
 * TeacherMessagesPage.tsx's Messages tab thread view. Unlike the teacher
 * side, there is no compose UI: a student can only reply within a
 * conversation a teacher already started (routes/student.py).
 *
 * These tests mock every network call via page.route() — no live backend —
 * matching the house style used in teacher-messaging.spec.ts / calendar.spec.ts.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const now = new Date().toISOString();

test.describe('Student — Announcements + Messages', () => {
  test.use({ storageState: path.join(__dirname, '.auth/student.json') });

  test('shows classroom announcements (read-only)', async ({ page }) => {
    await page.route('**/api/v1/student/messages', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.route('**/api/v1/student/announcements', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: [{
          id: 'ann-1', classroom_id: 'classroom-1', classroom_name: "Ms. Rivera's Class",
          teacher_id: 'teacher-1', teacher_name: 'Ms. Rivera',
          title: 'Field trip Friday', body: 'Permission slips due Thursday.',
          created_at: now,
        }],
      });
    });

    await page.goto('/student/messages');
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.getByTestId('announcements-section')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('student-announcement-item')).toBeVisible();
    await expect(page.getByText('Field trip Friday')).toBeVisible();
    await expect(page.getByText('Permission slips due Thursday.')).toBeVisible();

    // No reply affordance anywhere on an announcement — one-way broadcast.
    await expect(page.getByTestId('student-announcement-item').getByRole('button')).toHaveCount(0);
  });

  test('shows an empty state when there are no messages or announcements', async ({ page }) => {
    await page.route('**/api/v1/student/messages', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/v1/student/announcements', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.goto('/student/messages');

    await expect(page.getByText('No announcements yet.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No messages from teachers yet.')).toBeVisible();
  });

  test('opens a conversation thread and replies', async ({ page }) => {
    const conversation = {
      conversation_id: 'conv-1', other_user_id: 'teacher-1', other_user_name: 'Ms. Rivera',
      subject: 'Field notes feedback', last_message: 'Great observation on the second entry!',
      last_message_at: now, unread: true,
    };

    await page.route('**/api/v1/student/announcements', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [] });
    });

    await page.route('**/api/v1/student/messages', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: [conversation] });
    });

    await page.route('**/api/v1/student/messages/conv-1', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: [
          {
            id: 'm1', from_user_id: 'teacher-1', from_name: 'Ms. Rivera', is_mine: false,
            subject: 'Field notes feedback', body: 'Great observation on the second entry!', created_at: now,
          },
        ],
      });
    });

    await page.route('**/api/v1/student/messages/conv-1/reply', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({ status: 201, json: { success: true, message_id: 'm2', created_at: now } });
    });

    await page.goto('/student/messages');
    await expect(page.getByTestId('conversation-item')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('conversation-item').click();

    // getByRole('heading', ...), not getByText: the thread's message list
    // also attributes a bubble to the same contact ("Ms. Rivera · just
    // now"), so a bare getByText('Ms. Rivera') hits Playwright's
    // strict-mode multiple-match error (see teacher-messaging.spec.ts).
    await expect(page.getByRole('heading', { name: 'Ms. Rivera' })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('reply-body-input').fill('Thank you!');
    await page.getByTestId('send-reply-button').click();

    // After a successful reply the thread reloads via the mocked GET above;
    // no error banner should appear.
    await expect(page.locator('text=Could not send reply')).toHaveCount(0);

    await page.getByTestId('back-to-messages').click();
    await expect(page.getByTestId('conversation-item')).toBeVisible({ timeout: 10_000 });
  });
});
