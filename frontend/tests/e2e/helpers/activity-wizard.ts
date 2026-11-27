/**
 * Helpers for the guided Create/Edit Activity wizard (ActivityManager.tsx +
 * components/teacher/wizard/*).
 *
 * The old single long form is now: a "what do you want to start from?" chooser,
 * then sliding steps (Basics, Experience, Assessment, Outcomes, Review). Whatever
 * the teacher starts from becomes the first step; the rest follow in that
 * canonical order. Basics is validated when leaving it with Next.
 */
import { expect, type Page } from '@playwright/test';

export type WizardStart = 'location' | 'type' | 'assessment' | 'outcomes';
export type WizardStep = 'Basics' | 'Experience' | 'Assessment' | 'Outcomes' | 'Review';

// StartPicker.tsx's own StartKey values, exposed via a stable data-start-key
// attribute on each card button -- NOT translated text. A translated-text
// regex here (the previous approach) broke the instant any test switched
// the locale before calling startWizard (ja-locale-regression in
// location-enrichment.spec.ts): the rendered button text is Japanese, not
// English, so getByRole(..., {name}) matches nothing and .click() spins for
// the full 30s timeout -- the same underlying failure mode as the astral-
// emoji regex bug this session already fixed once, just triggered by a
// locale switch instead of a missing `u` flag.
const START_CARD: Record<WizardStart, string> = {
  location: 'basics',
  type: 'experience',
  assessment: 'assessment',
  outcomes: 'outcomes',
};

/** The pane that is currently showing (the others are `inert`). */
export const activePane = (page: Page) => page.locator('section[aria-label]:not([inert])');

export const pane = (page: Page, step: WizardStep) => page.locator(`section[aria-label="${step}"]`);

/** Open /…/activities/new and pick a start point. */
export async function startWizard(page: Page, start: WizardStart = 'location', url = '/teacher/activities/new') {
  await page.goto(url);
  await expect(page).not.toHaveURL(/\/login/);
  await page.locator(`button[data-start-key="${START_CARD[start]}"]`).click();
}

/** The step the progress rail says we are on. */
export const currentStep = (page: Page) => page.locator('nav[aria-label="Progress"] [aria-current="step"]');

export async function next(page: Page) {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

/** Click Next until the rail shows `step`. */
export async function advanceTo(page: Page, step: WizardStep) {
  for (let i = 0; i < 5; i++) {
    if (((await currentStep(page).textContent()) ?? '').includes(step)) return;
    await next(page);
    await page.waitForTimeout(450); // slide transition
  }
  await expect(currentStep(page)).toContainText(step);
}

/** Fill the fields Basics requires so Next / Create is allowed. */
export async function fillRequiredBasics(page: Page, title: string, opts: { location?: string; description?: string } = {}) {
  await page.locator('#title').fill(title);
  await page.locator('#description').fill(opts.description ?? 'An end-to-end test activity description.');
  await page.locator('#location-name').fill(opts.location ?? 'Test Park');
}

/** From the Basics step: fill the required fields, walk to Review and press Create Activity. */
export async function createFromBasics(page: Page, title: string, opts: { location?: string; description?: string } = {}) {
  await fillRequiredBasics(page, title, opts);
  await advanceTo(page, 'Review');
  await page.getByRole('button', { name: /^create activity$/i }).click();
}

/** Open a collapsing chapter (native <details>) by its title, in the showing pane. */
export async function openChapter(page: Page, title: string | RegExp) {
  const summary = activePane(page).locator('summary', { hasText: title });
  const details = summary.locator('xpath=..');
  if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) await summary.click();
}
