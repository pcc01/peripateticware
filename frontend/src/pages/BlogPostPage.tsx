// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * BlogPostPage  —  /blog/:slug
 *
 * Public single-post view. GET /api/v1/blog/posts/:slug 404s for drafts,
 * so this page can't leak unpublished content by URL guessing.
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Seo } from '../components/Seo';
import { fetchPublishedPost, BlogPost } from '../services/blogService';
import { fmtDate } from '../utils/date';
import { renderBlogContent, plainTextExcerpt } from '../utils/blogMarkdown';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    fetchPublishedPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 6rem', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
        <Seo title="Post Not Found" description="This blog post could not be found." path="/blog" />
        <Link to="/blog" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '2.5rem' }}>
          <ArrowLeft size={16} /> Back to Blog
        </Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>Post not found</h1>
        <p style={{ color: 'var(--text-muted)' }}>This post may have been unpublished or moved.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
      <Seo
        title={post.title}
        description={post.excerpt || plainTextExcerpt(post.content, 160)}
        path={`/blog/${post.slug}`}
        image={post.cover_image_url || undefined}
      />
      <Link to="/blog" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '2.5rem' }}>
        <ArrowLeft size={16} /> Back to Blog
      </Link>

      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {fmtDate(post.published_at || post.created_at)}
            {post.author_name ? ` · ${post.author_name}` : ''}
          </span>
          {post.tags.map((tag) => (
            <span key={tag} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 9px', borderRadius: 20, background: 'var(--primary-muted)', color: 'var(--primary)' }}>
              {tag}
            </span>
          ))}
        </div>
        <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.25 }}>{post.title}</h1>
      </header>

      {post.cover_image_url && (
        <img
          src={post.cover_image_url}
          alt=""
          style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 14, marginBottom: '2rem' }}
        />
      )}

      <div>{renderBlogContent(post.content)}</div>
    </div>
  );
}
