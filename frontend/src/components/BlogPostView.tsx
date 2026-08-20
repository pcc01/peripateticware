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
  tags: string[];
  /** Pre-formatted date/author line, e.g. "5/30/2026 · Paul Cerda" or "Draft — not yet published". */
  metaLine?: string;
}

export function BlogPostView({ title, content, coverImageUrl, tags, metaLine }: BlogPostViewProps) {
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
        <img
          src={coverImageUrl}
          alt=""
          style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 14, marginBottom: '2rem' }}
        />
      )}

      <div>{content.trim() ? renderBlogContent(content) : <span style={{ color: 'var(--text-muted)' }}>Nothing to preview yet.</span>}</div>
    </div>
  );
}
