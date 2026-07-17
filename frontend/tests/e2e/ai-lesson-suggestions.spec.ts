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
