// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Minimal, dependency-free renderer for the lightweight markdown subset
 * blog posts are written in (see backend/models/blog.py's docstring).
 *
 * Deliberately NOT a full CommonMark implementation and never touches
 * dangerouslySetInnerHTML -- every line is parsed into plain React
 * elements, so there's no HTML-injection surface even though post content
 * is admin-authored free text.
 *
 * Supported:
 *   ## Heading / ### Subheading
 *   > Blockquote
 *   - Bullet list item   (consecutive "- " lines group into one <ul>)
 *   Blank-line-separated paragraphs
 *   Inline: **bold**, *italic*, [text](url)
 */

import React from 'react';

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Single pass over **bold**, *italic*, and [text](url) -- order matters
  // (bold before italic) since *…* would otherwise also match inside **…**.
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\))/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${i++}`}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-${i++}`} href={match[5]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
          {match[4]}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderBlogContent(content: string): React.ReactNode {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    blocks.push(
      <p key={`p-${key++}`} style={{ lineHeight: 1.8, marginBottom: '1.25rem', color: 'var(--text)' }}>
        {renderInline(text, `p-${key}`)}
      </p>
    );
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} style={{ marginBottom: '1.25rem', paddingLeft: '1.5rem', lineHeight: 1.8, color: 'var(--text)' }}>
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li-${key}-${idx}`)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h3-${key++}`} style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)', margin: '1.75rem 0 0.75rem' }}>
          {renderInline(line.slice(4), `h3-${key}`)}
        </h3>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h2-${key++}`} style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', margin: '2rem 0 0.85rem' }}>
          {renderInline(line.slice(3), `h2-${key}`)}
        </h2>
      );
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote key={`bq-${key++}`} style={{ borderLeft: '4px solid var(--primary)', paddingLeft: '1.25rem', margin: '1.5rem 0', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.8 }}>
          {renderInline(line.slice(2), `bq-${key}`)}
        </blockquote>
      );
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return <>{blocks}</>;
}

/** Plain-text excerpt (markdown syntax stripped) for list-page previews and
 *  meta descriptions when a post has no explicit excerpt set. */
export function plainTextExcerpt(content: string, maxLength = 180): string {
  const stripped = (content || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  if (stripped.length <= maxLength) return stripped;
  return stripped.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
}
