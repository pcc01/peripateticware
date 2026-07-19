/**
 * Location Enrichment Pipeline E2E tests.
 *
 * Covers the WikiLocationInfo panel (components/teacher/WikiLocationInfo.tsx),
 * mounted inside ActivityManager.tsx behind the "📖 Background Info About
 * This Location" toggle, and the persisted-background-info rendering on
 * StudentActivityDetailPage.tsx.
 *
 * The panel's primary data path is:
 *   POST /api/v1/locations/search              — find a nearby indexed POI
 *   GET  /api/v1/locations/{place_id}/enrich    — Wikidata/Wikipedia metadata
 *       (query params: subject?, refresh=true to bypass the backend cache)
 *
 * If the backend pipeline throws, the component silently falls back to a
 * client-side Nominatim + Wikipedia lookup — every test here mocks (or
 * aborts) those external hosts too, so the suite never depends on real
 * internet access and the assertions stay deterministic.
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LAT = 47.6062;
const LNG = -122.3321;

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('chrome-extension') && !text.includes('net::ERR')) {
        errors.push(text);
      }
    }
  });
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Teacher — WikiLocationInfo panel inside ActivityManager
// ─────────────────────────────────────────────────────────────────────────

test.describe('Teacher — Location Enrichment (WikiLocationInfo panel)', () => {
  test.use({ storageState: path.join(__dirname, '.auth/teacher.json') });

  async function stubAncillary(page: Page) {
    await page.route('**/api/v1/activities/check-compliance', (route) =>
      route.fulfill({ json: { status: 'compliant', issues: [], warnings: [] } }));
    await page.route('**/api/v1/rubrics', (route) => route.fulfill({ json: { rubrics: [] } }));
    // Never let these tests depend on real internet access — WikiLocationInfo
    // falls back to Nominatim/Wikipedia client-side if the backend pipeline
    // throws, and ActivityManager's own lat/lng inputs debounce a reverse-
    // geocode call to Nominatim too.
    await page.route('**nominatim.openstreetmap.org/**', (route) => route.abort());
    await page.route('**en.wikipedia.org/**', (route) => route.abort());
  }

  async function openLocationPanel(page: Page, opts: { locationName?: string } = {}) {
    await page.goto('/teacher/activities/new');
    await expect(page).not.toHaveURL(/\/login/);
    await page.locator('#title').fill('Location Enrichment Test Activity');

    // Type the location name FIRST so it's already committed to formData
    // before the lat/lng inputs mount WikiLocationInfo — the panel's fetch
    // effect only depends on [latitude, longitude], so locationName must be
    // settled by the time it fires (mirrors real teacher usage: type a name,
    // then the coordinates get filled in).
    if (opts.locationName) {
      await page.locator('input[placeholder*="Lincoln Park" i]').fill(opts.locationName);
    }
    await page.locator('input[aria-label="Location latitude"]').fill(String(LAT));
    await page.locator('input[aria-label="Location longitude"]').fill(String(LNG));

    await page.getByRole('button', { name: /background info about this location/i }).click();
  }

  test('renders synopsis, learn-about-this-place fields, and the nearby POI list from a successful /enrich response', async ({ page }) => {
    await stubAncillary(page);

    const searchResults = [
      { place_id: 'poi-1', name: 'Discovery Park', location_type: 'park', latitude: LAT, longitude: LNG, address: 'Seattle, WA', is_cached: false },
      { place_id: 'poi-2', name: 'West Point Lighthouse', location_type: 'landmark', latitude: LAT, longitude: LNG, address: 'Seattle, WA', is_cached: false },
      { place_id: 'poi-3', name: 'Daybreak Star Cultural Center', location_type: 'museum', latitude: LAT, longitude: LNG, address: 'Seattle, WA', is_cached: false },
    ];

    await page.route('**/api/v1/locations/search', (route) => {
      expect(route.request().method()).toBe('POST');
      return route.fulfill({ json: searchResults });
    });
    await page.route('**/api/v1/locations/poi-1/enrich**', (route) =>
      route.fulfill({
        json: {
          place_id: 'poi-1',
          name: 'Discovery Park',
          description: "Discovery Park is Seattle's largest park, featuring old-growth forest and beach access on Puget Sound.",
          subjects: ['Science'],
          grade_levels: [6, 7, 8],
          learning_opportunities: ['Tide pool observation', 'Forest ecology transects'],
          image_url: 'https://example.com/discovery-park.jpg',
          enrichment_quality: 'high',
          source: 'wikidata',
          wikidata_id: 'Q5372079',
          architect_or_artist: null,
          construction_date: null,
          historical_significance: 'Former Fort Lawton military site.',
          keywords: ['old-growth forest', 'tide pools', 'lighthouse'],
        },
      }));

    await openLocationPanel(page, { locationName: 'Discovery Park' });

    await expect(page.getByRole('heading', { name: 'Discovery Park' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/discovery park is seattle's largest park/i)).toBeVisible();
    await expect(page.getByText(/former fort lawton military site/i)).toBeVisible();
    await expect(page.getByText('old-growth forest')).toBeVisible();
    await expect(page.getByRole('link', { name: /view on wikidata/i })).toBeVisible();

    // Nearby POI list — /locations/search returned two other real places
    // besides the matched one; WikiLocationInfo surfaces them instead of
    // discarding them (previously only searchResults[0] was ever used).
    await expect(page.getByText(/nearby points of interest/i)).toBeVisible();
    await expect(page.getByText('West Point Lighthouse')).toBeVisible();
    await expect(page.getByText('Daybreak Star Cultural Center')).toBeVisible();
  });

  test('shows a readable error state — not a blank panel — when /locations/search 500s', async ({ page }) => {
    await stubAncillary(page);
    await page.route('**/api/v1/locations/search', (route) =>
      route.fulfill({ status: 500, json: { detail: 'enrichment pipeline error' } }));

    await openLocationPanel(page);

    await expect(page.getByText(/could not fetch location information/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/using basic fallback information/i)).toBeVisible();
  });

  test('shows a readable error state — not a blank panel — when /locations/search 403s', async ({ page }) => {
    await stubAncillary(page);
    await page.route('**/api/v1/locations/search', (route) =>
      route.fulfill({ status: 403, json: { detail: 'forbidden' } }));

    await openLocationPanel(page);

    await expect(page.getByText(/could not fetch location information/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/using basic fallback information/i)).toBeVisible();
  });

  test('"Refresh Information" re-fetches with refresh=true and replaces the stale data on screen', async ({ page }) => {
    await stubAncillary(page);

    await page.route('**/api/v1/locations/search', (route) =>
      route.fulfill({ json: [{ place_id: 'poi-1', name: 'Discovery Park', location_type: 'park', latitude: LAT, longitude: LNG, address: '', is_cached: true }] }));

    let refreshRequested = false;
    await page.route('**/api/v1/locations/poi-1/enrich**', (route) => {
      const url = new URL(route.request().url());
      const isRefresh = url.searchParams.get('refresh') === 'true';
      if (isRefresh) refreshRequested = true;
      return route.fulfill({
        json: {
          place_id: 'poi-1',
          name: 'Discovery Park',
          description: isRefresh ? 'FRESH: updated synopsis from a live refetch.' : 'STALE: cached synopsis from a week ago.',
          subjects: [], grade_levels: [], learning_opportunities: [],
          image_url: null, enrichment_quality: 'medium', source: 'wikidata',
          wikidata_id: null, architect_or_artist: null, construction_date: null,
          historical_significance: null, keywords: [],
        },
      });
    });

    await openLocationPanel(page);

    await expect(page.getByText(/stale: cached synopsis/i)).toBeVisible({ timeout: 10_000 });
    expect(refreshRequested).toBe(false);

    await page.getByRole('button', { name: /refresh information/i }).click();

    await expect(page.getByText(/fresh: updated synopsis/i)).toBeVisible({ timeout: 10_000 });
    expect(refreshRequested).toBe(true);
  });

  test('enriches the location the teacher typed, not just the nearest indexed POI', async ({ page }) => {
    await stubAncillary(page);

    // Two results at the same coordinates: a small on-site cafe (returned
    // first / geographically "nearest") and the actual landmark the teacher
    // typed. pickBestMatch() must prefer the name match over index 0.
    await page.route('**/api/v1/locations/search', (route) =>
      route.fulfill({
        json: [
          { place_id: 'poi-cafe', name: 'Museum Cafe', location_type: 'cafe', latitude: LAT, longitude: LNG, address: '', is_cached: false },
          { place_id: 'poi-museum', name: 'Burke Museum of Natural History and Culture', location_type: 'museum', latitude: LAT, longitude: LNG, address: '', is_cached: false },
        ],
      }));
    await page.route('**/api/v1/locations/poi-cafe/enrich**', (route) =>
      route.fulfill({
        json: {
          place_id: 'poi-cafe', name: 'Museum Cafe',
          description: 'WRONG: this is the cafe, not the landmark.',
          subjects: [], grade_levels: [], learning_opportunities: [], image_url: null,
          enrichment_quality: 'low', source: 'osm', wikidata_id: null,
          architect_or_artist: null, construction_date: null, historical_significance: null, keywords: [],
        },
      }));
    await page.route('**/api/v1/locations/poi-museum/enrich**', (route) =>
      route.fulfill({
        json: {
          place_id: 'poi-museum', name: 'Burke Museum of Natural History and Culture',
          description: 'RIGHT: this is the museum the teacher actually typed.',
          subjects: [], grade_levels: [], learning_opportunities: [], image_url: null,
          enrichment_quality: 'high', source: 'wikidata', wikidata_id: 'Q4984469',
          architect_or_artist: null, construction_date: null, historical_significance: null, keywords: [],
        },
      }));

    await openLocationPanel(page, { locationName: 'Burke Museum' });

    await expect(page.getByText(/right: this is the museum the teacher actually typed/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/wrong: this is the cafe/i)).toHaveCount(0);
  });

  // Regression guard for a literal `\n` leaking into a translated string
  // (found in ja/landing.json and zh/landing.json's
  // `use_this_location_information_to_create_` key — the English source
  // string's line-wrap escape got baked into the translated value instead
  // of being treated as whitespace). Switches to the `ja` locale, where the
  // bug was confirmed, and asserts the rendered panel never shows a literal
  // backslash-n.
  test('does not render a literal "\\n" in a translated string (ja locale regression)', async ({ page }) => {
    await stubAncillary(page);
    await page.addInitScript(() => window.localStorage.setItem('i18nextLng', 'ja'));

    await page.route('**/api/v1/locations/search', (route) =>
      route.fulfill({ json: [{ place_id: 'poi-1', name: 'Discovery Park', location_type: 'park', latitude: LAT, longitude: LNG, address: '', is_cached: false }] }));
    await page.route('**/api/v1/locations/poi-1/enrich**', (route) =>
      route.fulfill({
        json: {
          place_id: 'poi-1', name: 'Discovery Park', description: 'A large urban park.',
          subjects: [], grade_levels: [], learning_opportunities: [], image_url: null,
          enrichment_quality: 'medium', source: 'wikidata', wikidata_id: null,
          architect_or_artist: null, construction_date: null, historical_significance: null, keywords: [],
        },
      }));

    await openLocationPanel(page);

    // Wait for the ja bundle to actually load — this key is translated
    // distinctly from English ("Teaching Tip:" → "「教え方のヒント」"), so its
    // presence confirms the locale swap (not just the English default
    // string) is what's on screen before we check for the bug.
    await expect(page.getByText('「教え方のヒント」')).toBeVisible({ timeout: 15_000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('\\n');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Student — persisted location background info (offline-safe)
// ─────────────────────────────────────────────────────────────────────────

test.describe('Student — Persisted location background info on activity detail', () => {
  test.use({ storageState: path.join(__dirname, '.auth/student.json') });

  const ACTIVITY_ID = '66666666-6666-6666-6666-666666666666';

  test('renders activity.location_wiki_data (incl. nearby POIs) without calling the live enrich endpoint', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    let enrichCalled = false;
    await page.route('**/api/v1/locations/**', (route) => { enrichCalled = true; return route.abort(); });

    await page.route(`**/api/v1/student/activities/${ACTIVITY_ID}`, (route) =>
      route.fulfill({
        json: {
          id: ACTIVITY_ID,
          title: 'Puget Sound Tide Pools',
          description: 'Explore the tide pools at low tide.',
          subject: 'Science',
          location: 'Discovery Park',
          status: 'published',
          due_date: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          location_wiki_data: {
            name: 'Discovery Park',
            description: 'A large urban park with tide pools and old-growth forest.',
            features: ['Tide pools', 'Old-growth forest'],
            architectOrArtist: null,
            constructionDate: null,
            historicalSignificance: 'Former Fort Lawton military site.',
            keywords: ['tide pools', 'forest'],
            learningOpportunities: ['Observe intertidal organisms'],
            nearbyPoints: [
              { name: 'West Point Lighthouse', type: 'landmark' },
              { name: 'Daybreak Star Cultural Center', type: 'museum' },
            ],
          },
        },
      }));

    await page.goto(`/student/activities/${ACTIVITY_ID}`);
    await expect(page.getByRole('heading', { name: 'Puget Sound Tide Pools' })).toBeVisible({ timeout: 10_000 });

    const bgBtn = page.getByRole('button', { name: /background info/i });
    await expect(bgBtn).toBeVisible();
    await bgBtn.click();

    await expect(page.getByRole('heading', { name: 'Discovery Park' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/large urban park with tide pools/i)).toBeVisible();
    await expect(page.getByText('Former Fort Lawton military site.')).toBeVisible();
    await expect(page.getByText('Nearby Points of Interest')).toBeVisible();
    await expect(page.getByText('West Point Lighthouse')).toBeVisible();
    await expect(page.getByText('Daybreak Star Cultural Center')).toBeVisible();

    expect(enrichCalled, 'no live /locations/* enrich call should fire — the info was already persisted on the activity').toBe(false);
    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toHaveLength(0);
  });

  test('"Background Info" button is absent when no wiki data or location_info was ever saved', async ({ page }) => {
    await page.route(`**/api/v1/student/activities/${ACTIVITY_ID}`, (route) =>
      route.fulfill({
        json: {
          id: ACTIVITY_ID,
          title: 'Untitled Field Trip',
          description: 'No background info was saved for this one.',
          subject: 'Science',
          location: null,
          status: 'published',
          due_date: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }));

    await page.goto(`/student/activities/${ACTIVITY_ID}`);
    await expect(page.getByRole('heading', { name: 'Untitled Field Trip' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /background info/i })).toHaveCount(0);
  });
});
