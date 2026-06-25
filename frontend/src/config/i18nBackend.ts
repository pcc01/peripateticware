// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Peripateticware — Custom i18next Single-File Backend
 *
 * Loads all namespaces from one file per locale:
 *   /locales/en.json  →  { "landing": {...}, "STUDENT": {...}, ... }
 *
 * This lets us keep one clean file per language while all existing
 * useTranslation('landing') / useTranslation('STUDENT') calls work unchanged.
 */

const cache: Record<string, Record<string, unknown>> = {};

const SingleFileBackend = {
  type: 'backend' as const,

  init() {},

  read(
    language: string,
    namespace: string,
    callback: (err: Error | null, data: Record<string, unknown> | null) => void
  ) {
    const url = `/locales/${language}.json`;

    // Return from cache if already loaded for this language
    if (cache[language]) {
      callback(null, (cache[language][namespace] as Record<string, unknown>) ?? {});
      return;
    }

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
        return res.json() as Promise<Record<string, Record<string, unknown>>>;
      })
      .then(data => {
        cache[language] = data;
        callback(null, data[namespace] ?? {});
      })
      .catch(err => {
        // Fall back gracefully — missing translations show fallback text
        console.warn(`[i18n] Could not load ${url}:`, err.message);
        callback(null, {});
      });
  },

  /** Invalidate cache entry when a language is reloaded at runtime. */
  invalidate(language: string) {
    delete cache[language];
  },
};

export default SingleFileBackend;
