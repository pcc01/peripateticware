// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * BlogPostView -- the actual header/cover/body markup for a single blog
 * post, shared by the public BlogPostPage and the admin editor's "Full
 * Preview" so what an editor sees while drafting is pixel-identical to
 * what gets published, not just a rough approximation.
 */

import React from 'react';
import { renderBlogContent } from '../utils/blogMarkdown';

export interface BlogPostViewProps {
  title: string;
  content: string;
  coverImageUrl?: string | null;
  coverImageCaption?: string | null;
  coverImageAttribution?: string | null;
  /** Natural pixel dimensions of the cover image, when known (uploaded
   *  through the editor, post-2026-08-22). Used to size the cover box to
   *  the image's real aspect ratio so it's never cropped top/bottom;
   *  falls back to a fixed-crop box when unknown (older posts, or a
   *  cover set by pasting an external URL rather than uploading). */
  coverImageWidth?: number | null;
  coverImageHeight?: number | null;
  tags: string[];
  /** Pre-formatted date/author line, e.g. "5/30/2026 · Paul Cerda" or "Draft — not yet published". */
  metaLine?: string;
}

const COVER_MAX_HEIGHT = 420;

export function BlogPostView({
  title,
  content,
  coverImageUrl,
  coverImageCaption,
  coverImageAttribution,
  coverImageWidth,
  coverImageHeight,
  tags,
  metaLine,
}: BlogPostViewProps) {
  // aspect-ratio reserves the right amount of vertical space before the
  // image loads (no layout jump) and, for the common landscape-ish cover,
  // sizes the box to match the image exactly so there's nothing to crop.
  // BUT: when that ratio-derived height would exceed COVER_MAX_HEIGHT (a
  // portrait cover -- width stays 100% either way, CSS doesn't shrink it
  // back down to match a clamped height), the box ends up wider than the
  // image's own shape. object-fit: cover previously filled that mismatched
  // box by cropping the image's top/bottom -- exactly the bug this feature
  // was supposed to fix, just for portrait covers instead of landscape
  // ones. object-fit: contain guarantees nothing is ever cropped in either
  // case, at the cost of harmless letterboxing for the rare extreme-ratio
  // cover; the background fills that letterbox space so it reads as
  // intentional padding, not a rendering glitch.
  const coverImageStyle: React.CSSProperties = coverImageWidth && coverImageHeight
    ? {
        width: '100%',
        maxHeight: COVER_MAX_HEIGHT,
        aspectRatio: `${coverImageWidth} / ${coverImageHeight}`,
        objectFit: 'contain',
        background: 'var(--surface-alt, rgba(127,127,127,0.06))',
        borderRadius: 14,
        display: 'block',
      }
    : { width: '100%', maxHeight: COVER_MAX_HEIGHT, objectFit: 'cover', borderRadius: 14, display: 'block' };
  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
          {metaLine && <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{metaLine}</span>}
          {tags.map((tag) => (
            <span key={tag} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 9px', borderRadius: 20, background: 'var(--primary-muted)', color: 'var(--primary)' }}>
              {tag}
            </span>
          ))}
        </div>
        <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.25 }}>{title || 'Untitled post'}</h1>
      </header>

      {coverImageUrl && (
        <figure style={{ margin: '0 0 2rem' }}>
          <img src={coverImageUrl} alt={coverImageCaption || ''} style={coverImageStyle} />
          {(coverImageCaption || coverImageAttribution) && (
            <figcaption style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.6rem', lineHeight: 1.5 }}>
              {coverImageCaption && <span>{coverImageCaption}</span>}
              {coverImageAttribution && (
                <span style={{ display: coverImageCaption ? 'block' : 'inline', marginTop: coverImageCaption ? 2 : 0, fontStyle: 'italic' }}>
                  {coverImageAttribution}
                </span>
              )}
            </figcaption>
          )}
        </figure>
      )}

      <div>{content.trim() ? renderBlogContent(content) : <span style={{ color: 'var(--text-muted)' }}>Nothing to preview yet.</span>}</div>
    </div>
  );
}
