#!/usr/bin/env node
// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1
//
// Static prerendering for the public marketing/legal routes.
//
// Why this exists: this app is a client-rendered React SPA (Vite, no SSR
// framework). A plain HTTP fetch of any route returns an almost-empty
// `<div id="root"></div>` — the real content only appears after React runs
// in a browser. Most crawlers and link-preview bots either don't run
// JavaScript at all, or do it as a slow, unreliable second pass, which is a
// real risk for a low-authority, newly-launched site trying to get indexed.
//
// This script is a pragmatic, framework-agnostic fix: it boots a real
// browser (Playwright, already a devDependency for e2e tests), visits each
// public route against a running preview server, waits for React to finish
// rendering, and writes the fully-rendered HTML to disk as a static file at
// the matching path (e.g. dist/about/origin/index.html). The web server then
// serves that static file directly for that route — real content on the
// very first byte, for bots and slow connections alike — while real users'
// browsers still load the JS bundle and React takes over exactly as before
// (see index.js: ReactDOM.createRoot(...).render(...), a full client
// render, not hydrateRoot — so the prerendered markup is just a fast first
// paint, not something React needs to reconcile against).
//
// This only prerenders PUBLIC routes — logged-in app routes (student,
// teacher, admin, etc.) are behind auth, aren't meant to be indexed, and are
// left as pure client-rendered SPA routes untouched.
//
// Usage:
//   npm run build            # produces dist/
//   npm run prerender        # boots dist/, snapshots routes into dist/
//
// Requirements / gotchas:
//   - Run this against a build where the backend API is reachable at the
//     same origin (or update BACKEND_PROXY below), because some public pages
//     fetch live data on mount:
//       * /privacy-engine calls GET /api/v1/privacy/status and has no
//         fallback UI if that call never resolves — prerender this route
//         with the backend actually running, or its snapshot will capture
//         a permanent loading state.
//       * /privacy also calls a privacy-status endpoint but degrades
//         gracefully to static content if the call fails, so it's safe to
//         prerender without a backend if you have to.
//   - Re-run this after every deploy. A stale snapshot is worse than no
//     snapshot — the standard field footgun with this technique is
//     forgetting to regenerate it and shipping stale content to bots.
//     Wire `npm run prerender` into whatever runs after `npm run build` in
//     your deploy pipeline so it can never be skipped by hand.

import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Public, indexable routes only. Keep this in sync with the public <Route>
// entries in src/App.tsx — anything wrapped in <ProtectedRoute> does NOT
// belong here.
const ROUTES = [
  '/',
  '/about/origin',
  '/privacy',
  '/privacy-engine',
  '/terms',
  '/cookies',
  '/licensing',
  '/request-beta',
  '/login',
  '/signup',
];

/**
 * Every page starts from index.html's static, sitewide <title>/<meta
 * description>/OG tags (see src/components/Seo.tsx). A page that also
 * renders <Seo ...> adds its OWN page-specific versions of those same tags
 * via React 19's native <head> hoisting — but React only manages tags IT
 * rendered, so the original static ones stay in the DOM too. Left alone,
 * page.content() would capture BOTH, and it's genuinely ambiguous which one
 * search engines and link-preview bots would pick. This collapses each tag
 * down to a single, correct copy: keep the LAST occurrence of each one,
 * since the page-specific <Seo> tags are always appended after the static
 * ones once React mounts.
 */
function dedupeHeadTags(html) {
  const headOpenMatch = html.match(/<head[^>]*>/i);
  const headCloseIdx = html.search(/<\/head>/i);
  if (!headOpenMatch || headCloseIdx === -1) return html;

  const headStart = headOpenMatch.index + headOpenMatch[0].length;
  const head = html.slice(headStart, headCloseIdx);

  const TAG_RE =
    /<title>[\s\S]*?<\/title>|<meta\s+name="description"[^>]*>|<link\s+rel="canonical"[^>]*>|<meta\s+property="og:[a-z:]+"[^>]*>|<meta\s+name="twitter:[a-z:]+"[^>]*>/gi;
  const matches = [...head.matchAll(TAG_RE)];
  if (matches.length === 0) return html;

  function keyFor(tag) {
    if (tag.startsWith('<title')) return 'title';
    if (tag.includes('name="description"')) return 'description';
    if (tag.includes('rel="canonical"')) return 'canonical';
    const og = tag.match(/property="(og:[a-z:]+)"/i);
    if (og) return og[1];
    const tw = tag.match(/name="(twitter:[a-z:]+)"/i);
    if (tw) return tw[1];
    return tag;
  }

  // React 19 special-cases <title>: since a document can only meaningfully
  // have one, and browsers/crawlers use the FIRST <title> in the document,
  // React inserts its managed title at the very front of <head> — ahead of
  // the static one already in index.html — rather than appending it like it
  // does for <meta>/<link> tags. So the winning occurrence is FIRST for
  // title, but LAST for everything else (meta description, canonical,
  // og:*, twitter:*), where the static/sitewide fallback comes first in the
  // document and the page-specific <Seo> version is appended after it once
  // React mounts. Verified empirically against page.title() — don't
  // "simplify" this to one consistent rule without re-checking that.
  const winnerIndexForKey = new Map();
  matches.forEach((m, i) => {
    const key = keyFor(m[0]);
    if (key === 'title') {
      if (!winnerIndexForKey.has(key)) winnerIndexForKey.set(key, i);
    } else {
      winnerIndexForKey.set(key, i);
    }
  });

  // Rebuild in a single linear pass over the original indices so nothing
  // shifts underneath us — no string-content-based replace() calls, which
  // would be unsafe here since several of these tags are byte-for-byte
  // identical to each other (e.g. two copies of the same og:site_name tag).
  let rebuilt = '';
  let cursor = 0;
  matches.forEach((m, i) => {
    rebuilt += head.slice(cursor, m.index);
    if (winnerIndexForKey.get(keyFor(m[0])) === i) {
      rebuilt += m[0];
    }
    cursor = m.index + m[0].length;
  });
  rebuilt += head.slice(cursor);

  return html.slice(0, headStart) + rebuilt + html.slice(headCloseIdx);
}

async function main() {
  const distExists = await fs
    .stat(DIST)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!distExists) {
    console.error('dist/ not found — run `npm run build` first.');
    process.exit(1);
  }

  console.log('Starting local preview server for dist/ ...');
  const server = await preview({
    root: ROOT,
    preview: { port: 4174, strictPort: true, host: '127.0.0.1' },
  });
  const base = `http://127.0.0.1:4174`;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    for (const route of ROUTES) {
      const url = base + route;
      console.log(`Snapshotting ${route} ...`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Give React a moment past networkidle for any deferred state
      // updates (e.g. a fetch that resolves after the network goes idle
      // due to retries/debounce) to settle.
      await page.waitForTimeout(300);

      const html = dedupeHeadTags(await page.content());

      const outDir =
        route === '/' ? DIST : path.join(DIST, route.replace(/^\//, ''));
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, 'index.html'), html, 'utf-8');
    }
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`\nPrerendered ${ROUTES.length} routes into dist/.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
