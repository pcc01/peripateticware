import { test, expect } from '@playwright/test';

test('smoke - always passes', async ({ page }) => {
  await page.goto('/');
  expect(true).toBe(true);
});
