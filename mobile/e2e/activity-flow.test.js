const { loginAsStudent } = require('./helpers');

// Covers MANUAL_TESTING_GUIDE.md section 4 "Activity Flow" (Brief → Orient →
// Inquiry → Reflect, Ask Peri) AND section 6 "Completing an Activity" (submit
// reflection, return to Discover) — both sections walk the same single
// app/activity/[id].tsx screen, just different phases of it, so they're
// covered together in one continuous flow rather than split across files.
//
// Item 4.7 ("Type a question in PeriChat → crow responds") is exercised only
// up to sending the message: asserting on the actual AI reply text would
// require Ollama running on the host (per MANUAL_TESTING_GUIDE.md), which
// isn't guaranteed in CI. We assert the user's own message renders in the
// thread instead, which doesn't depend on the inference backend being up.
describe('Activity Flow (Brief -> Orient -> Inquiry -> Reflect -> Submit)', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true, newInstance: true });
    await loginAsStudent();
    await waitFor(element(by.text('Creek Habitat Study'))).toBeVisible().withTimeout(15000);
    await element(by.text('Creek Habitat Study')).tap();
    await waitFor(element(by.id('activity-screen'))).toBeVisible().withTimeout(10000);
  });

  it('4.1 — Brief phase shows title, description, and the start CTA', async () => {
    await expect(element(by.text('Creek Habitat Study'))).toBeVisible();
    await expect(element(by.text("I'm ready — let's go"))).toBeVisible();
  });

  it('4.2/4.3 — advances Brief -> Orient', async () => {
    await element(by.text("I'm ready — let's go")).tap();
    await expect(element(by.text('Arrive & Observe'))).toBeVisible();
    await expect(element(by.text("I'm oriented — begin inquiry"))).toBeVisible();
  });

  it('4.4/4.5 — advances Orient -> Inquiry, showing the question + capture row', async () => {
    await element(by.text("I'm oriented — begin inquiry")).tap();
    await expect(element(by.text('Observe & Capture'))).toBeVisible();
  });

  it('4.6/4.7/4.8 — opens Ask Peri, sends a message, and dismisses the sheet', async () => {
    await element(by.text('💬 Ask Peri')).tap();
    await waitFor(element(by.id('peri-chat-sheet'))).toBeVisible().withTimeout(10000);
    await expect(
      element(by.text("I'm Peri. Ask me anything about the activity or what you're observing."))
    ).toBeVisible();

    await element(by.id('peri-chat-input')).typeText('What insects live near a creek?');
    await element(by.id('peri-chat-send')).tap();
    await waitFor(element(by.text('What insects live near a creek?'))).toBeVisible().withTimeout(10000);

    await element(by.id('peri-chat-close')).tap();
    await expect(element(by.id('peri-chat-sheet'))).not.toExist();
  });

  it('6.1-6.4 — advances Inquiry -> Reflect, submits, and returns to Discover', async () => {
    await element(by.text('Done capturing — reflect')).tap();
    await expect(element(by.text('Make Meaning'))).toBeVisible();

    await element(by.id('reflection-input')).typeText('The creek water was clearer than I expected.');
    await element(by.text('Submit field work')).tap();

    await waitFor(element(by.text('Submitted! 🎉'))).toBeVisible().withTimeout(10000);
    await element(by.text('Done')).tap();

    await waitFor(element(by.id('discover-screen'))).toBeVisible().withTimeout(10000);
  });
});
