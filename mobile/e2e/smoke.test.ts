/**
 * Mobile smoke tests — Detox E2E
 *
 * Run on Android emulator:
 *   npx detox build -c android.emu.debug
 *   npx detox test -c android.emu.debug
 *
 * Run on iOS simulator:
 *   npx detox build -c ios.sim.debug
 *   npx detox test -c ios.sim.debug
 *
 * These tests verify the critical paths without needing live AI:
 *  - App launches and shows login or dashboard
 *  - Login flow works
 *  - Student can see activity list
 *  - Student can open an activity detail
 *  - Activity screens don't crash on navigation
 */
import { device, element, by, expect as detoxExpect, waitFor } from 'detox';

const TEST_EMAIL    = process.env.TEST_STUDENT_EMAIL    ?? 'student@test.local';
const TEST_PASSWORD = process.env.TEST_STUDENT_PASSWORD ?? 'Test1234!';

beforeAll(async () => {
  await device.launchApp({ newInstance: true });
});

beforeEach(async () => {
  await device.reloadReactNative();
});

describe('App launch', () => {
  it('shows login screen or dashboard on first load', async () => {
    // Either the login screen or the dashboard should be visible
    try {
      await waitFor(element(by.text('Sign In'))).toBeVisible().withTimeout(8000);
    } catch {
      await waitFor(element(by.id('dashboard-root'))).toBeVisible().withTimeout(8000);
    }
  });
});

describe('Login flow', () => {
  it('logs in successfully with valid credentials', async () => {
    // If already logged in, skip
    const alreadyLoggedIn = await detoxExpect(element(by.id('dashboard-root'))).toBeVisible().then(() => true).catch(() => false);
    if (alreadyLoggedIn) return;

    await waitFor(element(by.id('email-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('email-input')).typeText(TEST_EMAIL);
    await element(by.id('password-input')).typeText(TEST_PASSWORD);
    await element(by.id('login-button')).tap();

    await waitFor(element(by.id('dashboard-root'))).toBeVisible().withTimeout(15000);
  });

  it('shows error message for wrong password', async () => {
    await device.launchApp({ newInstance: true, delete: true });
    await waitFor(element(by.id('email-input'))).toBeVisible().withTimeout(8000);
    await element(by.id('email-input')).typeText('wrong@email.com');
    await element(by.id('password-input')).typeText('wrongpassword');
    await element(by.id('login-button')).tap();

    await waitFor(element(by.id('login-error'))).toBeVisible().withTimeout(8000);
  });
});

describe('Student activity flow', () => {
  beforeEach(async () => {
    // Ensure logged in
    const loggedIn = await detoxExpect(element(by.id('dashboard-root'))).toBeVisible().then(() => true).catch(() => false);
    if (!loggedIn) {
      await element(by.id('email-input')).typeText(TEST_EMAIL);
      await element(by.id('password-input')).typeText(TEST_PASSWORD);
      await element(by.id('login-button')).tap();
      await waitFor(element(by.id('dashboard-root'))).toBeVisible().withTimeout(15000);
    }
  });

  it('can navigate to activities tab', async () => {
    await element(by.id('tab-activities')).tap();
    await waitFor(element(by.id('activities-list'))).toBeVisible().withTimeout(8000);
  });

  it('can open an activity without crashing', async () => {
    await element(by.id('tab-activities')).tap();
    await waitFor(element(by.id('activities-list'))).toBeVisible().withTimeout(8000);

    // Tap the first activity in the list
    await element(by.id('activity-item')).atIndex(0).tap();
    // Detail screen should appear — look for common elements
    await waitFor(element(by.id('activity-detail-root'))).toBeVisible().withTimeout(8000);
  });

  it('journal tab loads without crash', async () => {
    await element(by.id('tab-journal')).tap();
    await waitFor(element(by.id('journal-root'))).toBeVisible().withTimeout(8000);
  });
});
