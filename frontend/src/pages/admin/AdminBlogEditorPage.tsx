// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminBlogEditorPage  —  /admin/blog/new and /admin/blog/:id
 *
 * Single form for both creating and editing a post (branches on whether
 * :id is present). Deliberately a plain textarea for content rather than a
 * WYSIWYG editor -- it accepts the small markdown subset
 * utils/blogMarkdown.tsx renders (##, **, *, [text](url), -, >) with a
 * live preview alongside so "easy to update" doesn't require learning a
 * new tool.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { adminGetPost, adminCreatePost, adminUpdatePost, adminUploadBlogImage, BlogPostInput } from '@/services/blogService';
import { renderBlogContent } from '@/utils/blogMarkdown';

const EMPTY: BlogPostInput = {
  title: '',
  excerpt: '',
  content: '',
  cover_image_url: '',
  status: 'draft',
  tags: [],
};

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
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              {uploadingImage ? 'Uploading…' : 'Upload…'}
            </button>
          </div>
          {form.cover_image_url && (
            <img
              src={form.cover_image_url}
              alt=""
              style={{ marginTop: 10, maxWidth: '100%', maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
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
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: 8 }}>
            Supports <code>## Heading</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[link](https://…)</code>, <code>- list item</code>, <code>&gt; quote</code>, and blank-line-separated paragraphs.
          </p>
          <div style={{ display: showPreview ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <textarea
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
    </div>
  );
};

export default AdminBlogEditorPage;
