const { loginAsStudent } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 2 "Navigation (Bottom Tab Bar)".
describe('Navigation (Bottom Tab Bar)', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true, newInstance: true });
    await loginAsStudent();
  });

  it('2.1-2.4 — taps each of the 4 tabs and shows the matching screen', async () => {
    await element(by.id('tab-discover')).tap();
    await expect(element(by.id('discover-screen'))).toBeVisible();

    await element(by.id('tab-journal')).tap();
    await expect(element(by.id('journal-screen'))).toBeVisible();

    await element(by.id('tab-progress')).tap();
    await expect(element(by.id('progress-screen'))).toBeVisible();

    await element(by.id('tab-settings')).tap();
    await expect(element(by.id('settings-screen'))).toBeVisible();
  });

  it('2.5 — only the 4 registered tabs are visible, no extra "Explore" tab', async () => {
    await expect(element(by.id('tab-discover'))).toBeVisible();
    await expect(element(by.id('tab-journal'))).toBeVisible();
    await expect(element(by.id('tab-progress'))).toBeVisible();
    await expect(element(by.id('tab-settings'))).toBeVisible();

    // app/(tabs)/explore.tsx exists as a file in the (tabs) route group, but
    // (tabs)/_layout.tsx only registers index/journal/progress/settings as
    // Tabs.Screen entries, so no 5th "Explore" tab should ever render.
    await expect(element(by.id('tab-explore'))).not.toExist();
    await expect(element(by.text('Explore'))).not.toExist();
  });
});
