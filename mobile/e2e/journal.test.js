const { loginAsStudent } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 7 "Journal Screen", items 7.1/7.4.
//
// SKIPPED: 7.2/7.3 (tap an entry -> `/journal/[id]` detail screen with
// capture thumbnails/audio/note text). There is no app/journal/[id].tsx
// route in this repo (confirmed via glob over mobile/app/**/*.tsx), and the
// entry cards in app/(tabs)/journal.tsx are rendered as plain `<View>`s with
// no onPress/navigation at all — tapping one does nothing. This is
// aspirational per the manual guide, not implemented, so not testing it.
describe('Journal Screen', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true, newInstance: true });
    await loginAsStudent();
    await element(by.id('tab-journal')).tap();
  });

  it('7.1 — shows the Journal screen (entries list or empty state)', async () => {
    await waitFor(element(by.id('journal-screen'))).toBeVisible().withTimeout(10000);
    // Whether the seeded student account already has journal entries from a
    // prior activity submission depends on run history, so we only assert
    // the screen itself loaded (past the loading spinner) — both the
    // populated list and the "No field notes yet" empty state are valid.
  });

  it('7.4 — pull to refresh does not crash the list', async () => {
    await element(by.id('journal-list')).swipe('down', 'fast', 0.9);
    await expect(element(by.id('journal-screen'))).toBeVisible();
  });
});
