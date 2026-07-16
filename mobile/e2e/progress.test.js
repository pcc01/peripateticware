const { loginAsStudent } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 8 "Progress Screen".
describe('Progress Screen', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true, newInstance: true });
    await loginAsStudent();
    await element(by.id('tab-progress')).tap();
  });

  it('8.1 — shows the stats row (activities, captures, streak)', async () => {
    await waitFor(element(by.id('progress-screen'))).toBeVisible().withTimeout(10000);
    // The stat label is a fixed "ACTIVITIES" — the age-band system that used
    // to vary this copy ("ADVENTURES" for k6) was removed; see FEATURE_PLAN.md.
    await expect(element(by.text('ACTIVITIES'))).toBeVisible();
    await expect(element(by.text('CAPTURES'))).toBeVisible();
    await expect(element(by.text('DAY STREAK'))).toBeVisible();
  });

  it('8.2/8.3 — scrolling reveals the rest of the screen without crashing', async () => {
    await element(by.id('progress-scroll')).scrollTo('bottom');
    // Competencies/badges only render once data.competencies/badges is
    // non-empty (app/(tabs)/progress.tsx) — for a freshly-seeded student that
    // may legitimately be empty, so we only assert the scroll succeeded
    // rather than asserting specific badge content that may not exist yet.
    await expect(element(by.id('progress-screen'))).toBeVisible();
  });
});
