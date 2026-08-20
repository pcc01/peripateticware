// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminBlogEditorPage  —  /admin/blog/new and /admin/blog/:id
 *
 * Single form for both creating and editing a post (branches on whether
 * :id is present). Deliberately a plain textarea for content rather than a
 * WYSIWYG editor -- it accepts the lightweight markdown subset
 * utils/blogMarkdown.tsx renders (headings, bold/italic/strikethrough,
 * inline code, fenced code blocks, links, images, lists, quotes, rules),
 * with a toolbar that inserts the syntax so nobody has to memorize it, a
 * quick raw side-by-side preview while typing, and a "Full Preview" that
 * shows the post exactly as BlogPostPage will render it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { adminGetPost, adminCreatePost, adminUpdatePost, adminUploadBlogImage, BlogPostInput } from '@/services/blogService';
import { renderBlogContent } from '@/utils/blogMarkdown';
import { BlogPostView } from '@/components/BlogPostView';

const EMPTY: BlogPostInput = {
  title: '',
  excerpt: '',
  content: '',
  cover_image_url: '',
  status: 'draft',
  tags: [],
};

interface SelectionTransform {
  text: string;
  selStart: number;
  selEnd: number;
}

const AdminBlogEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<BlogPostInput>(EMPTY);
  const [tagsText, setTagsText] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingContentImage, setUploadingContentImage] = useState(false);
  const [replacingImageAt, setReplacingImageAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentImageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const savedSelection = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const replaceTarget = useRef<{ index: number; length: number; alt: string } | null>(null);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const url = await adminUploadBlogImage(file);
      update('cover_image_url', url);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not upload that image.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Content toolbar ────────────────────────────────────────────────────
  // Every helper below reads/writes form.content around the textarea's
  // current selection and restores the cursor afterwards, so the toolbar
  // behaves like a normal text-editing shortcut rather than jumping focus.

  const applyToSelection = (transform: (selected: string, before: string, after: string) => SelectionTransform) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = form.content;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const { text, selStart, selEnd } = transform(selected, before, after);
    update('content', text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const wrapSelection = (marker: string, placeholder: string) => {
    applyToSelection((selected, before, after) => {
      const body = selected || placeholder;
      const text = `${before}${marker}${body}${marker}${after}`;
      const selStart = before.length + marker.length;
      return { text, selStart, selEnd: selStart + body.length };
    });
  };

  const toggleLinePrefix = (prefix: string) => {
    const el = contentRef.current;
    if (!el) return;
    const value = form.content;
    const cursor = el.selectionStart;
    const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
    let lineEnd = value.indexOf('\n', cursor);
    if (lineEnd === -1) lineEnd = value.length;
    const line = value.slice(lineStart, lineEnd);
    const stripped = line.replace(/^(#{1,3}\s+|>\s+|-\s+|\*\s+|\d+\.\s+)/, '');
    const newLine = line.startsWith(prefix) ? stripped : prefix + stripped;
    const text = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
    update('content', text);
    const delta = newLine.length - line.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor + delta, cursor + delta);
    });
  };

  const insertLink = () => {
    applyToSelection((selected, before, after) => {
      const label = selected || 'link text';
      const text = `${before}[${label}](https://)${after}`;
      const selStart = before.length + label.length + 3; // past "[label]("
      return { text, selStart, selEnd: selStart + 'https://'.length };
    });
  };

  const insertCodeBlock = () => {
    applyToSelection((selected, before, after) => {
      const body = selected || 'code here';
      const lead = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const trail = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
      const text = `${before}${lead}\`\`\`\n${body}\n\`\`\`${trail}${after}`;
      const selStart = before.length + lead.length + 4; // past "```\n"
      return { text, selStart, selEnd: selStart + body.length };
    });
  };

  const insertHr = () => {
    applyToSelection((_selected, before, after) => {
      const text = `${before}\n\n---\n\n${after}`;
      const pos = before.length + 5;
      return { text, selStart: pos, selEnd: pos };
    });
  };

  const openContentImagePicker = () => {
    const el = contentRef.current;
    savedSelection.current = { start: el?.selectionStart ?? form.content.length, end: el?.selectionEnd ?? form.content.length };
    contentImageInputRef.current?.click();
  };

  const handleContentImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingContentImage(true);
    setError(null);
    try {
      const url = await adminUploadBlogImage(file);
      const { start, end } = savedSelection.current;
      const value = form.content;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const lead = before.length > 0 && !before.endsWith('\n') ? '\n\n' : '';
      const trail = after.length > 0 && !after.startsWith('\n') ? '\n\n' : '';
      const snippet = `${lead}![](${url})${trail}`;
      update('content', before + snippet + after);
      const pos = before.length + snippet.length;
      requestAnimationFrame(() => {
        contentRef.current?.focus();
        contentRef.current?.setSelectionRange(pos, pos);
      });
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not upload that image.');
    } finally {
      setUploadingContentImage(false);
      if (contentImageInputRef.current) contentImageInputRef.current.value = '';
    }
  };

  // ── Body image management (delete / replace) ───────────────────────────
  // Scanned fresh from form.content on every render, so offsets are always
  // in sync with the live text -- no cache to go stale.
  const imageMatches = React.useMemo(() => {
    const re = /!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g;
    const results: { index: number; length: number; alt: string; url: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(form.content)) !== null) {
      results.push({ index: m.index, length: m[0].length, alt: m[1], url: m[2] });
    }
    return results;
  }, [form.content]);

  const removeContentImage = (index: number, length: number) => {
    const before = form.content.slice(0, index);
    const after = form.content.slice(index + length);
    update('content', before + after);
  };

  const openReplacePicker = (match: { index: number; length: number; alt: string }) => {
    replaceTarget.current = match;
    setReplacingImageAt(match.index);
    replaceImageInputRef.current?.click();
  };

  const handleReplaceImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = replaceTarget.current;
    if (!file || !target) return;
    setError(null);
    try {
      const url = await adminUploadBlogImage(file);
      const before = form.content.slice(0, target.index);
      const after = form.content.slice(target.index + target.length);
      update('content', `${before}![${target.alt}](${url})${after}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not upload that image.');
    } finally {
      setReplacingImageAt(null);
      replaceTarget.current = null;
      if (replaceImageInputRef.current) replaceImageInputRef.current.value = '';
    }
  };

  const removeCoverImage = () => update('cover_image_url', '');

  const toolbarButtons: { label: string; title: string; action: () => void; disabled?: boolean }[] = [
    { label: 'H1', title: 'Heading', action: () => toggleLinePrefix('# ') },
    { label: 'H2', title: 'Subheading', action: () => toggleLinePrefix('## ') },
    { label: 'H3', title: 'Sub-subheading', action: () => toggleLinePrefix('### ') },
    { label: 'B', title: 'Bold', action: () => wrapSelection('**', 'bold text') },
    { label: 'I', title: 'Italic', action: () => wrapSelection('*', 'italic text') },
    { label: 'S', title: 'Strikethrough', action: () => wrapSelection('~~', 'strikethrough text') },
    { label: '"', title: 'Quote', action: () => toggleLinePrefix('> ') },
    { label: '•', title: 'Bullet list', action: () => toggleLinePrefix('- ') },
    { label: '1.', title: 'Numbered list', action: () => toggleLinePrefix('1. ') },
    { label: '🔗', title: 'Link', action: insertLink },
    { label: '🖼', title: 'Insert image', action: openContentImagePicker, disabled: uploadingContentImage },
    { label: '</>', title: 'Inline code', action: () => wrapSelection('`', 'code') },
    { label: '{ }', title: 'Code block', action: insertCodeBlock },
    { label: '—', title: 'Horizontal rule', action: insertHr },
  ];

  useEffect(() => {
    if (!id) return;
    adminGetPost(id)
      .then((post) => {
        setForm({
          title: post.title,
          excerpt: post.excerpt || '',
          content: post.content,
          cover_image_url: post.cover_image_url || '',
          status: post.status,
          tags: post.tags,
        });
        setTagsText(post.tags.join(', '));
        setSlug(post.slug);
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load this post.'))
      .finally(() => setLoading(false));
  }, [id]);

  const update = (field: keyof BlogPostInput, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const save = async (publish?: boolean) => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: BlogPostInput = {
      ...form,
      status: publish === undefined ? form.status : publish ? 'published' : 'draft',
      tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (isEditing && id) {
        await adminUpdatePost(id, payload);
      } else {
        const created = await adminCreatePost(payload);
        navigate(`/admin/blog/${created.id}`, { replace: true });
        setSaving(false);
        return;
      }
      navigate('/admin/blog');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not save this post.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
    fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6 };
  const toolbarButtonStyle: React.CSSProperties = {
    padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
    cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.2, minWidth: 30,
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 900 }}>
      <Link to="/admin/blog" style={{ display: 'inline-block', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: 20 }}>
        ← Back to Blog
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 4 }}>{isEditing ? 'Edit Post' : 'New Post'}</h1>
          {slug && <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.82rem' }}>/blog/{slug}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowFullPreview(true)}
          style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}
        >
          Full Preview
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Post title" />
        </div>

        <div>
          <label style={labelStyle}>Excerpt <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — shown on the blog list and in link previews; auto-generated from content if left blank)</span></label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.excerpt} onChange={(e) => update('excerpt', e.target.value)} placeholder="One or two sentence summary…" />
        </div>

        <div>
          <label style={labelStyle}>Cover Image <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — upload a file, or paste a URL if it's already hosted somewhere)</span></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={form.cover_image_url}
              onChange={(e) => update('cover_image_url', e.target.value)}
              placeholder="https://… or upload a file"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'nowrap', opacity: uploadingImage ? 0.6 : 1 }}
            >
              {uploadingImage ? 'Uploading…' : form.cover_image_url ? 'Replace…' : 'Upload…'}
            </button>
          </div>
          {form.cover_image_url && (
            <div style={{ position: 'relative', display: 'inline-block', marginTop: 10 }}>
              <img
                src={form.cover_image_url}
                alt=""
                style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <button
                type="button"
                onClick={removeCoverImage}
                title="Remove cover image"
                style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: 'white', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ×
              </button>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Tags <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(comma-separated)</span></label>
          <input style={inputStyle} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="product, homeschool, standards" />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Content</label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {toolbarButtons.map((btn) => (
              <button
                key={btn.title}
                type="button"
                title={btn.title}
                disabled={btn.disabled}
                onClick={btn.action}
                style={{ ...toolbarButtonStyle, opacity: btn.disabled ? 0.6 : 1 }}
              >
                {btn.label}
              </button>
            ))}
            <input
              ref={contentImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleContentImageChange}
              style={{ display: 'none' }}
            />
            <input
              ref={replaceImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleReplaceImageChange}
              style={{ display: 'none' }}
            />
          </div>

          {imageMatches.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
              {imageMatches.map((img) => (
                <div key={img.index} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px' }}>
                  <img src={img.url} alt={img.alt} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4 }} onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.alt || 'image'}
                  </span>
                  <button
                    type="button"
                    title="Replace this image"
                    disabled={replacingImageAt === img.index}
                    onClick={() => openReplacePicker(img)}
                    style={{ padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text)', opacity: replacingImageAt === img.index ? 0.6 : 1 }}
                  >
                    {replacingImageAt === img.index ? '…' : 'Replace'}
                  </button>
                  <button
                    type="button"
                    title="Remove this image"
                    onClick={() => removeContentImage(img.index, img.length)}
                    style={{ padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.7rem', color: '#b91c1c' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: 8 }}>
            Supports headings (<code># ## ###</code>), <code>**bold**</code>, <code>*italic*</code>, <code>~~strikethrough~~</code>, <code>`code`</code>,
            fenced code blocks, <code>[link](url)</code>, <code>![image](url)</code>, <code>- </code>/<code>1. </code> lists, <code>&gt; quote</code>, and <code>---</code> rules.
          </p>
          <div style={{ display: showPreview ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <textarea
              ref={contentRef}
              style={{ ...inputStyle, minHeight: 360, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem', lineHeight: 1.6 }}
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              placeholder="Write in Markdown…"
            />
            {showPreview && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', overflowY: 'auto', maxHeight: 400 }}>
                {form.content.trim() ? renderBlogContent(form.content) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nothing to preview yet.</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <button
          onClick={() => save(false)}
          disabled={saving}
          style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', opacity: saving ? 0.6 : 1 }}
        >
          Save Draft
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving}
          style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : form.status === 'published' ? 'Save & Update' : 'Publish'}
        </button>
      </div>

      {showFullPreview && (
        <div
          onClick={() => setShowFullPreview(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', overflowY: 'auto', padding: '3rem 1rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg, var(--surface))', borderRadius: 16, maxWidth: 800, width: '100%', height: 'fit-content', padding: '2.5rem 2rem 4rem', position: 'relative' }}
          >
            <button
              type="button"
              onClick={() => setShowFullPreview(false)}
              style={{ position: 'sticky', top: 0, float: 'right', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text)' }}
            >
              Close
            </button>
            <div style={{ maxWidth: 760, margin: '2.5rem auto 0' }}>
              <BlogPostView
                title={form.title}
                content={form.content}
                coverImageUrl={form.cover_image_url}
                tags={tagsText.split(',').map((t) => t.trim()).filter(Boolean)}
                metaLine={form.status === 'published' ? 'Preview — published' : 'Preview — draft, not yet published'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBlogEditorPage;
