/**
 * Peri AI Activity Suggestions (OllamaLessonSuggestions) E2E tests.
 *
 * OllamaLessonSuggestions is mounted inside ActivityManager.tsx — the
 * component actually routed at /teacher/activities/new and
 * /teacher/activities/:id (see App.tsx) — behind the "Ask Peri" toggle in
 * the "Peri AI Activity Suggestions" section. It calls:
 *   - GET  /api/v1/inference/models   (populate the model picker)
 *   - GET  /api/v1/inference/health   (background diagnostics only)
 *   - POST /api/v1/inference/inquiry  (generate suggestions)
 *
 * These tests mock all three with page.route() rather than requiring a real
 * Ollama-backed backend, following the pattern in gps-fieldwork-map.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

const INQUIRY_RESPONSE_TEXT = [
  "1. Map the Park's Microhabitats (level: understand) — You will identify and sketch three distinct microhabitats, noting soil, light, and moisture differences.",
  '2. Classify Leaf Shapes by Function (level: analyze) — You will collect ten leaves, sort them by shape, and hypothesize how shape relates to sun exposure.',
  '3. Measure Canopy Cover with a Densiometer (level: apply) — You will take five canopy-cover readings and calculate the average percentage cover.',
  '4. Design a Follow-Up Investigation (level: create) — You will pose a testable question about the site and outline a method to answer it.',
].join('\n');

async function mockModels(page: Page, models: string[] = ['llama3.1', 'mistral']) {
  await page.route('**/api/v1/inference/models', (route) =>
    route.fulfill({ json: { models, default: models[0] } }));
}

async function mockHealth(page: Page, status: 'available' | 'unavailable' = 'available') {
  await page.route('**/api/v1/inference/health', (route) =>
    route.fulfill({ json: { llm_status: status, llm_provider: 'ollama' } }));
}

async function openPeriPanel(page: Page) {
  await page.goto('/teacher/activities/new');
  await expect(page).not.toHaveURL(/\/login/);
  await page.locator('#title').fill('Forest Ecosystem Field Study');
  await page.getByRole('button', { name: /ask peri/i }).click();
}

test.describe('Teacher — Peri AI Activity Suggestions (Ollama)', () => {
  test('generates and renders suggestion cards from the mocked inference response', async ({ page }) => {
    await mockModels(page);
    await mockHealth(page, 'available');
    await page.route('**/api/v1/inference/inquiry', async (route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({ json: { response: INQUIRY_RESPONSE_TEXT } });
    });

    await openPeriPanel(page);
    await page.getByRole('button', { name: /generate suggestions/i }).click();

    await expect(page.getByText(/map the park's microhabitats/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/classify leaf shapes by function/i)).toBeVisible();
    await expect(page.getByText(/design a follow-up investigation/i)).toBeVisible();
    await expect(page.getByText(/^understand$/i)).toBeVisible();
    await expect(page.getByText(/^analyze$/i)).toBeVisible();

    // Selecting a card adds it and flips the select indicator
    await page.getByText(/map the park's microhabitats/i).click();
    await expect(page.getByText(/added to description/i)).toBeVisible();
  });

  test('shows a loading state while suggestions are being generated', async ({ page }) => {
    await mockModels(page);
    await mockHealth(page, 'available');
    await page.route('**/api/v1/inference/inquiry', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ json: { response: INQUIRY_RESPONSE_TEXT } });
    });

    await openPeriPanel(page);
    await page.getByRole('button', { name: /generate suggestions/i }).click();

    await expect(page.getByText(/peri is thinking/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/map the park's microhabitats/i)).toBeVisible({ timeout: 10_000 });
  });

  test('shows a sane error message (not a blank screen) when the AI provider is down (503)', async ({ page }) => {
    await mockModels(page);
    await mockHealth(page, 'unavailable');
    await page.route('**/api/v1/inference/inquiry', async (route) => {
      await route.fulfill({
        status: 503,
        json: { detail: 'LLM provider unavailable: ollama connection refused' },
      });
    });

    await openPeriPanel(page);
    await page.getByRole('button', { name: /generate suggestions/i }).click();

    // Error banner surfaces the failure — never a blank/crashed panel.
    await expect(page.getByText(/ai unavailable/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/503/)).toBeVisible();

    // The component still falls back to curated suggestions rather than
    // leaving the teacher with nothing to work with.
    await expect(page.getByText(/observe and document/i)).toBeVisible();
    await expect(page.getByText(/design an investigation/i)).toBeVisible();
  });

  test('disables "Generate Suggestions" and shows a hint when no Ollama models are available', async ({ page }) => {
    await mockModels(page, []);
    await mockHealth(page, 'unavailable');

    await openPeriPanel(page);

    await expect(page.getByText(/no ollama models found/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /generate suggestions/i })).toBeDisabled();
  });
});

/**
 * AI Taxonomy Auto-classify (ActivityManager.tsx) and AI Rubric-Alignment
 * Suggestions (RubricBuilder.tsx) — two more AI-assisted prompts added
 * alongside the Peri lesson suggestions above, with no prior E2E coverage.
 *
 *   Auto-classify:  POST /api/v1/activities/classify-taxonomy
 *                   { text, classify_for: [taxonomyType] } →
 *                   { result: { [taxonomyType]: { level, rationale? } } }
 *                   Suggest-then-confirm: the teacher must explicitly click
 *                   "Accept" — it never auto-applies the suggested level.
 *
 *   Rubric alignment: POST /api/v1/rubrics/generate
 *                   { activity_title, activity_description,
 *                     learning_objectives[], subject, grade_level,
 *                     taxonomy_type, taxonomy_level,
 *                     existing_rubric_criteria } → { criteria[], error? }
 *                   Generated criteria are always appended, never replace
 *                   what the teacher already entered.
 */

test.describe('Teacher — AI Taxonomy Auto-classify (ActivityManager)', () => {
  test('suggests a taxonomy level; "Accept" applies it, and it never auto-applies on its own', async ({ page }) => {
    await page.route('**/api/v1/activities/classify-taxonomy', async (route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({ json: { result: { blooms: { level: 4, rationale: 'Involves comparing and contrasting habitats.' } } } });
    });

    await page.goto('/teacher/activities/new');
    await page.locator('#title').fill('Wetlands Comparative Study');

    // The taxonomy-level <select> is the one with a "remember" option — the
    // only Bloom's-specific value on the whole page.
    const levelSelect = page.locator('select:has(option[value="remember"])');
    await expect(levelSelect).toHaveValue('understand');

    await page.getByRole('button', { name: /auto-classify/i }).click();

    await expect(page.getByText(/ai suggests:/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/analyze — draw connections, break down information/i)).toBeVisible();
    await expect(page.getByText(/involves comparing and contrasting habitats/i)).toBeVisible();

    // Never auto-applies until the teacher explicitly accepts.
    await expect(levelSelect).toHaveValue('understand');

    await page.getByRole('button', { name: /^accept$/i }).click();
    await expect(levelSelect).toHaveValue('analyze');
    await expect(page.getByText(/ai suggests:/i)).toHaveCount(0);
  });

  test('"Dismiss" discards the suggestion without changing the taxonomy level', async ({ page }) => {
    await page.route('**/api/v1/activities/classify-taxonomy', async (route) => {
      await route.fulfill({ json: { result: { blooms: { level: 6, rationale: 'Requires original design work.' } } } });
    });

    await page.goto('/teacher/activities/new');
    await page.locator('#title').fill('Design a Trail Marker System');

    const levelSelect = page.locator('select:has(option[value="remember"])');
    await page.getByRole('button', { name: /auto-classify/i }).click();
    await expect(page.getByText(/ai suggests:/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^dismiss$/i }).click();
    await expect(page.getByText(/ai suggests:/i)).toHaveCount(0);
    await expect(levelSelect).toHaveValue('understand');
  });

  test('degrades gracefully (readable inline error, not a crash) when classify-taxonomy fails', async ({ page }) => {
    await page.route('**/api/v1/activities/classify-taxonomy', async (route) => {
      await route.fulfill({ status: 503, json: { detail: 'LLM provider unavailable' } });
    });

    await page.goto('/teacher/activities/new');
    await page.locator('#title').fill('Trailside Erosion Patterns');
    await page.getByRole('button', { name: /auto-classify/i }).click();

    await expect(page.getByText(/auto-classify failed\. set the taxonomy manually\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#title')).toBeVisible();
  });
});

test.describe('Teacher — AI Rubric-Alignment Suggestions (RubricBuilder)', () => {
  test('"Generate with AI" appends AI-suggested criteria to the rubric', async ({ page }) => {
    await page.route('**/api/v1/rubrics/generate', async (route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ activity_title: 'Riverbank Field Study', taxonomy_type: 'blooms' });
      await route.fulfill({
        json: {
          criteria: [
            {
              id: 'ai-crit-1',
              name: 'Observation Accuracy',
              description: 'Accurately records field observations with supporting evidence.',
              levels: [
                { score: 4, label: 'Exceeds', description: 'Detailed, precise observations with clear evidence.' },
                { score: 3, label: 'Meets', description: 'Accurate observations with some supporting evidence.' },
                { score: 2, label: 'Approaching', description: 'Observations lack detail or evidence.' },
                { score: 1, label: 'Beginning', description: 'Minimal or inaccurate observations.' },
              ],
            },
          ],
          error: null,
        },
      });
    });

    await page.goto('/teacher/rubrics/new');
    await page.getByRole('button', { name: /generate with ai/i }).click();

    await page.locator('xpath=//label[contains(., "Activity title")]/following-sibling::input').fill('Riverbank Field Study');

    await page.getByRole('button', { name: /^generate criteria$/i }).click();

    const criterionNameInputs = page.locator('input[placeholder="Criterion name…"]');
    // One empty criterion exists by default; the AI-generated one is appended.
    await expect(criterionNameInputs).toHaveCount(2, { timeout: 10_000 });
    await expect(criterionNameInputs.last()).toHaveValue('Observation Accuracy');
  });

  test('shows an inline error (not a blank panel) when rubric generation fails', async ({ page }) => {
    // apiFetch() throws `new Error(await res.text())` on a non-ok response,
    // so whatever the response body was becomes the displayed message —
    // there is no generic fallback text when the backend sends a body.
    await page.route('**/api/v1/rubrics/generate', async (route) => {
      await route.fulfill({ status: 503, json: { detail: 'LLM provider unavailable' } });
    });

    await page.goto('/teacher/rubrics/new');
    await page.getByRole('button', { name: /generate with ai/i }).click();
    await page.locator('xpath=//label[contains(., "Activity title")]/following-sibling::input').fill('Riverbank Field Study');
    await page.getByRole('button', { name: /^generate criteria$/i }).click();

    // The panel must show *some* readable error, not silently stay blank —
    // the raw response body text is what actually surfaces here.
    await expect(page.getByText(/llm provider unavailable/i)).toBeVisible({ timeout: 10_000 });
    // The rest of the form (and the rubric title field) must still be usable —
    // proof the app didn't crash/unmount.
    await expect(page.locator('input[placeholder*="Field Observation Rubric" i]')).toBeVisible();
  });
});
