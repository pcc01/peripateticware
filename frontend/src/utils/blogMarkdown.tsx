// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Minimal, dependency-free renderer for the lightweight markdown subset
 * blog posts are written in (see backend/models/blog.py's docstring).
 *
 * Deliberately NOT a full CommonMark implementation (no tables, no LaTeX)
 * and never touches dangerouslySetInnerHTML -- every line is parsed into
 * plain React elements, so there's no HTML-injection surface even though
 * post content is admin-authored free text.
 *
 * Supported:
 *   # Title / ## Heading / ### Subheading
 *   > Blockquote
 *   - Bullet list item     (consecutive "- "/"* " lines group into one <ul>)
 *   1. Numbered list item  (consecutive "1. " lines group into one <ol>)
 *   ``` fenced code block ```
 *   ---  horizontal rule (three or more - or *, alone on a line)
 *   Blank-line-separated paragraphs
 *   Inline: **bold**, *italic*, ~~strikethrough~~, `code`,
 *           [text](url), ![alt](url)
 *
 * Captioned images: an image that's alone on its own line, immediately
 * followed by a line starting with "^", renders as a <figure> with a
 * <figcaption> instead of a bare inline <img>:
 *
 *   ![alt text](url)
 *   ^Caption text | Photo: Jane Doe
 *
 * The part before the first "|" is the caption, the part after is the
 * attribution -- either half can be left empty (e.g. "^ | Photo: Jane Doe"
 * for attribution with no caption). Omit the "|" entirely for a
 * caption-only line. An image with no following "^" line (or one that
 * appears mid-paragraph rather than alone on its own line) renders as a
 * plain <img>, same as before this existed -- so older posts are
 * unaffected. AdminBlogEditorPage's image toolbar generates this syntax;
 * it's not meant to be hand-typed, though it's plain text either way.
 */

import React from 'react';

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Single pass over the inline syntaxes -- order matters where prefixes
  // overlap (bold before italic, since *…* would otherwise also match
  // inside **…**; image before link is naturally safe since "![" can only
  // start the image alternative).
  const pattern =
    /(!\[(.*?)\]\((https?:\/\/[^\s)]+)\))|(\[(.+?)\]\((https?:\/\/[^\s)]+)\))|(\*\*(.+?)\*\*)|(~~(.+?)~~)|(\*(.+?)\*)|(`([^`]+?)`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      // ![alt](url)
      nodes.push(
        <img
          key={`${keyPrefix}-${i++}`}
          src={match[3]}
          alt={match[2] || ''}
          style={{ maxWidth: '100%', borderRadius: 8, display: 'block', margin: '0.5rem 0' }}
        />
      );
    } else if (match[4] !== undefined) {
      // [text](url)
      nodes.push(
        <a key={`${keyPrefix}-${i++}`} href={match[6]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
          {match[5]}
        </a>
      );
    } else if (match[7] !== undefined) {
      // **bold**
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{match[8]}</strong>);
    } else if (match[9] !== undefined) {
      // ~~strikethrough~~
      nodes.push(<del key={`${keyPrefix}-${i++}`}>{match[10]}</del>);
    } else if (match[11] !== undefined) {
      // *italic*
      nodes.push(<em key={`${keyPrefix}-${i++}`}>{match[12]}</em>);
    } else if (match[13] !== undefined) {
      // `code`
      nodes.push(
        <code
          key={`${keyPrefix}-${i++}`}
          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9em', background: 'var(--surface-alt, rgba(127,127,127,0.15))', padding: '2px 5px', borderRadius: 4 }}
        >
          {match[14]}
        </code>
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// A line containing nothing but a single ![alt](url) -- the trigger for
// checking the following line for a "^caption | attribution" tag. Doesn't
// match if there's any other text sharing the line (that image stays a
// plain inline <img>, rendered via renderInline() as part of its paragraph).
const _SOLO_IMAGE_RE = /^!\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/;

function parseCaptionLine(line: string): { caption: string; attribution: string } {
  const body = line.slice(1); // strip leading "^"
  const barIndex = body.indexOf('|');
  if (barIndex === -1) return { caption: body.trim(), attribution: '' };
  return { caption: body.slice(0, barIndex).trim(), attribution: body.slice(barIndex + 1).trim() };
}

export function renderBlogContent(content: string): React.ReactNode {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  let codeLines: string[] = [];
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
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`list-${key++}`} style={{ marginBottom: '1.25rem', paddingLeft: '1.5rem', lineHeight: 1.8, color: 'var(--text)' }}>
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li-${key}-${idx}`)}</li>
        ))}
      </Tag>
    );
    listItems = [];
    listType = null;
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    // Fenced code blocks preserve raw lines (including indentation/blank
    // lines) until the closing ``` -- checked before any trimming/paragraph
    // logic below since code content shouldn't be treated as prose.
    if (rawLine.trim().startsWith('```')) {
      if (!inCodeBlock) {
        flushParagraph();
        flushList();
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        blocks.push(
          <pre
            key={`code-${key++}`}
            style={{ background: 'var(--surface-alt, rgba(127,127,127,0.12))', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', overflowX: 'auto', marginBottom: '1.25rem' }}
          >
            <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text)' }}>
              {codeLines.join('\n')}
            </code>
          </pre>
        );
        codeLines = [];
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    const line = rawLine.trim();

    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const soloImage = _SOLO_IMAGE_RE.exec(line);
    if (soloImage) {
      const nextLine = lines[lineIdx + 1]?.trim() ?? '';
      if (nextLine.startsWith('^')) {
        flushParagraph();
        flushList();
        const [, alt, url] = soloImage;
        const { caption, attribution } = parseCaptionLine(nextLine);
        blocks.push(
          <figure key={`fig-${key++}`} style={{ margin: '1.75rem 0' }}>
            <img src={url} alt={alt} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
            {(caption || attribution) && (
              <figcaption style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.6rem', lineHeight: 1.5 }}>
                {caption && <span>{caption}</span>}
                {attribution && (
                  <span style={{ display: caption ? 'block' : 'inline', marginTop: caption ? 2 : 0, fontStyle: 'italic' }}>
                    {attribution}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
        );
        lineIdx += 1; // consume the "^caption" line too
        continue;
      }
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${key++}`} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }} />);
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
    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <h1 key={`h1-${key++}`} style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text)', margin: '2.25rem 0 1rem' }}>
          {renderInline(line.slice(2), `h1-${key}`)}
        </h1>
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
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType === 'ul') flushList();
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      if (listType === 'ol') flushList();
      listType = 'ul';
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
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^(-{3,}|\*{3,})$/gm, '')
    .replace(/^\^.*$/gm, '') // image caption/attribution tag line -- see renderBlogContent's _SOLO_IMAGE_RE
    .replace(/!\[(.*?)\]\(.+?\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  if (stripped.length <= maxLength) return stripped;
  return stripped.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
}
