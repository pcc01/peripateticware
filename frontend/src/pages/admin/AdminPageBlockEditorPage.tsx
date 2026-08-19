// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminPageBlockEditorPage  —  /admin/pages/new and /admin/pages/:id
 *
 * Edit a single page copy block, with its full version history alongside.
 * "New Block" requires knowing the block_key a developer wired into the
 * page's JSX (usePageBlocks().block('landing.hero.homeschool.headline', …))
 * -- this isn't a page builder, it's an override mechanism for copy that
 * already exists in code.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  adminGetBlock, adminCreateBlock, adminUpdateBlock,
  PageBlockWithHistory, PageBlockUpsertInput,
} from '@/services/pageContentService';
import { fmtDateTime } from '@/utils/date';
import { renderBlogContent } from '@/utils/blogMarkdown';

const EMPTY: PageBlockUpsertInput = {
  page_key: '',
  block_key: '',
  locale: 'en',
  format: 'text',
  content: '',
  status: 'published',
};

const AdminPageBlockEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<PageBlockUpsertInput>(EMPTY);
  const [block, setBlock] = useState<PageBlockWithHistory | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    adminGetBlock(id)
      .then((b) => {
        setBlock(b);
        setForm({
          page_key: b.page_key,
          block_key: b.block_key,
          locale: b.locale,
          format: b.format,
          content: b.content,
          status: b.status,
        });
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load this block.'))
      .finally(() => setLoading(false));
  }, [id]);

  const update = (field: keyof PageBlockUpsertInput, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const save = async () => {
    if (!form.block_key.trim() || !form.page_key.trim() || !form.content.trim()) {
      setError('Page key, block key, and content are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEditing && id) {
        await adminUpdateBlock(id, { content: form.content, format: form.format, status: form.status });
      } else {
        const created = await adminCreateBlock(form);
        navigate(`/admin/pages/${created.id}`, { replace: true });
        setSaving(false);
        return;
      }
      navigate('/admin/pages');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not save this block.');
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
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 1000 }}>
      <Link to="/admin/pages" style={{ display: 'inline-block', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: 20 }}>
        ← Back to Pages
      </Link>

      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 20 }}>{isEditing ? 'Edit Block' : 'New Block'}</h1>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '2fr 1fr' : '1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isEditing && (
            <>
              <div>
                <label style={labelStyle}>Page Key <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(groups blocks in the list, e.g. "landing")</span></label>
                <input style={inputStyle} value={form.page_key} onChange={(e) => update('page_key', e.target.value)} placeholder="landing" />
              </div>
              <div>
                <label style={labelStyle}>Block Key <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(must match the key hardcoded in the page's JSX)</span></label>
                <input style={inputStyle} value={form.block_key} onChange={(e) => update('block_key', e.target.value)} placeholder="landing.hero.homeschool.headline" />
              </div>
            </>
          )}
          {isEditing && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
              {form.page_key} / {form.block_key} · {form.locale}
            </div>
          )}

          <div>
            <label style={labelStyle}>Format</label>
            <select style={inputStyle} value={form.format} onChange={(e) => update('format', e.target.value)}>
              <option value="text">Plain text</option>
              <option value="markdown">Markdown</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Content</label>
            <textarea
              style={{ ...inputStyle, minHeight: form.format === 'markdown' ? 240 : 100, resize: 'vertical' }}
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
            />
            {form.format === 'markdown' && form.content.trim() && (
              <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                {renderBlogContent(form.content)}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="published">Published (live on the site)</option>
              <option value="draft">Draft (hidden — page shows its built-in default)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {isEditing && block && (
          <div>
            <label style={labelStyle}>History</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
              {block.versions.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No saved versions yet.</p>
              )}
              {block.versions.map((v) => (
                <div key={v.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {fmtDateTime(v.created_at)}{v.edited_by_name ? ` · ${v.edited_by_name}` : ''}
                    {v.source === 'ai_assisted' ? ' · AI-assisted' : ''}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                    {v.content}
                  </div>
                  <button
                    onClick={() => update('content', v.content)}
                    style={{ marginTop: 6, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-muted)' }}
                  >
                    Load into editor
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPageBlockEditorPage;
