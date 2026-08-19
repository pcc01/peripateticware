// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * usePageBlocks
 *
 * Fetches every published, admin-editable copy block for one page_key in
 * a single request and returns a `block(key, fallback)` lookup function.
 * A block only needs a database row once someone actually edits it via
 * /admin/pages -- until then `block()` returns the fallback you already
 * had hardcoded, so wiring a page up to this hook changes nothing visible
 * until an admin makes an edit.
 *
 * Usage:
 *   const { block } = usePageBlocks('landing');
 *   <h2>{block('landing.hero.homeschool.headline', 'The World Is Your Classroom.')}</h2>
 */

import { useEffect, useState } from 'react';
import { fetchPublishedBlocks } from '../services/pageContentService';

export interface UsePageBlocksResult {
  /** Returns the admin-edited value for `key`, or `fallback` if none exists yet (or while loading). */
  block: (key: string, fallback: string) => string;
  isLoading: boolean;
}

export function usePageBlocks(pageKey: string, locale = 'en'): UsePageBlocksResult {
  const [blocks, setBlocks] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchPublishedBlocks(pageKey, locale)
      .then((data) => { if (!cancelled) setBlocks(data); })
      // Silent fallback -- a failed fetch just means every block() call
      // returns its hardcoded default, same as before this system existed.
      .catch(() => { if (!cancelled) setBlocks({}); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [pageKey, locale]);

  const block = (key: string, fallback: string): string => blocks[key] ?? fallback;

  return { block, isLoading };
}
