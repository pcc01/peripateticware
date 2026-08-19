// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminBlogPage  —  /admin/blog
 *
 * Manage console for the marketing blog: list every post (draft +
 * published), jump into the editor, publish/unpublish in one click, delete.
 * The editor itself (create + edit) lives in AdminBlogEditorPage.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { adminListPosts, adminUpdatePost, adminDeletePost, BlogPostSummary } from '@/services/blogService';

const AdminBlogPage: React.FC = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminListPosts()
      .then((res) => setPosts(res.items))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load posts.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (post: BlogPostSummary) => {
    setBusyId(post.id);
    try {
      await adminUpdatePost(post.id, { status: post.status === 'published' ? 'draft' : 'published' });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not update post.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (post: BlogPostSummary) => {
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    setBusyId(post.id);
    try {
      await adminDeletePost(post.id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not delete post.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = search
    ? posts.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.toLowerCase().includes(search.toLowerCase()))
    : posts;

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 4 }}>Blog</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.88rem' }}>
            Write and publish posts. Published posts appear at /blog and are linked from the site header.
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/blog/new')}
          style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}
        >
          + New Post
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by title or slug…"
        style={{ width: '100%', marginBottom: 20, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)' }}
      />

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {search ? 'No posts match your search.' : 'No posts yet. Create the first one.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((post) => (
          <div
            key={post.id}
            style={{
              padding: '14px 18px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              display: 'flex', alignItems: 'flex-start', gap: 14,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/blog/${post.id}`)}
                >
                  {post.title}
                </span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '1px 9px', borderRadius: 20,
                  background: post.status === 'published' ? '#dcfce7' : '#f1f5f9',
                  color: post.status === 'published' ? '#15803d' : '#64748b',
                }}>
                  {post.status === 'published' ? '● Published' : '○ Draft'}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                /blog/{post.slug} · Updated {fmtDate(post.updated_at)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => navigate(`/admin/blog/${post.id}`)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}
              >
                Edit
              </button>
              <button
                onClick={() => togglePublish(post)}
                disabled={busyId === post.id}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', opacity: busyId === post.id ? 0.5 : 1 }}
              >
                {post.status === 'published' ? 'Unpublish' : 'Publish'}
              </button>
              <button
                onClick={() => handleDelete(post)}
                disabled={busyId === post.id}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecdd3', background: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#be123c', opacity: busyId === post.id ? 0.5 : 1 }}
              >
                {busyId === post.id ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminBlogPage;
