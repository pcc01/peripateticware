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
import { BlogPostView } from '../components/BlogPostView';
import { fetchPublishedPost, BlogPost } from '../services/blogService';
import { fmtDate } from '../utils/date';
import { plainTextExcerpt } from '../utils/blogMarkdown';

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

      <BlogPostView
        title={post.title}
        content={post.content}
        coverImageUrl={post.cover_image_url}
        tags={post.tags}
        metaLine={`${fmtDate(post.published_at || post.created_at)}${post.author_name ? ` · ${post.author_name}` : ''}`}
      />
    </div>
  );
}
