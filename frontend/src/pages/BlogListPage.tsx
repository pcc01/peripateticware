// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * BlogListPage  —  /blog
 *
 * Public post index. Only ever shows status='published' posts (enforced
 * server-side by GET /api/v1/blog/posts). Follows the same standalone
 * public-page shape as OriginStoryPage (Seo tags + a "Back" link, no
 * app chrome) -- the site nav link to here lives in LandingPage's header.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Seo } from '../components/Seo';
import { fetchPublishedPosts, BlogPostSummary } from '../services/blogService';
import { fmtDate } from '../utils/date';

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublishedPosts(1, 24)
      .then((res) => setPosts(res.items))
      .catch(() => setError('Could not load posts right now. Please try again shortly.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
      <Seo
        title="Blog"
        description="News, field notes, and ideas from the Peripateticware team on outdoor learning, AI-guided inquiry, and standards-aligned assessment."
        path="/blog"
      />
      <Link
        to="/"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '2.5rem' }}>
        <ArrowLeft size={16} /> Back
      </Link>

      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginBottom: '0.5rem' }}>Blog</h1>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Updates and field notes from the team building Peripateticware.
        </p>
      </header>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>
          No posts yet — check back soon.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {posts.map((post) => (
          <article key={post.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.75rem' }}>
            {post.cover_image_url && (
              <Link to={`/blog/${post.slug}`}>
                <img
                  src={post.cover_image_url}
                  alt=""
                  loading="lazy"
                  style={
                    post.cover_image_width && post.cover_image_height
                      ? {
                          // object-fit: contain, not cover -- see BlogPostView.tsx's
                          // coverImageStyle comment: cover would still crop a portrait
                          // image here once maxHeight clamps below its ratio-derived height.
                          width: '100%',
                          maxHeight: 320,
                          aspectRatio: `${post.cover_image_width} / ${post.cover_image_height}`,
                          objectFit: 'contain',
                          background: 'var(--surface-alt, rgba(127,127,127,0.06))',
                          borderRadius: 12,
                          marginBottom: '1rem',
                          display: 'block',
                        }
                      : { width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 12, marginBottom: '1rem', display: 'block' }
                  }
                />
              </Link>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {fmtDate(post.published_at || post.created_at)}
                {post.author_name ? ` · ${post.author_name}` : ''}
              </span>
              {post.tags.map((tag) => (
                <span key={tag} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 9px', borderRadius: 20, background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                  {tag}
                </span>
              ))}
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              <Link to={`/blog/${post.slug}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                {post.title}
              </Link>
            </h2>
            {post.excerpt && (
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '0.75rem' }}>
                {post.excerpt}
              </p>
            )}
            <Link to={`/blog/${post.slug}`} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none' }}>
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
