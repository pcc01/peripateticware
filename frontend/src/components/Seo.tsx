// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Per-page SEO tags.
 *
 * React 19 hoists <title>, <meta>, and <link> tags rendered anywhere in the
 * component tree into the document <head> automatically — no react-helmet
 * or similar dependency needed. Drop <Seo ... /> at the top of any public
 * (unauthenticated) page component to give it its own title, meta
 * description, canonical URL, and social preview tags instead of falling
 * back to the generic site-wide ones in index.html.
 *
 * Only use this on PUBLIC marketing/legal pages meant to be indexed and
 * shared (landing page, origin story, pricing, privacy/terms, etc). Logged-in
 * app pages (student/teacher/admin dashboards) don't need it — they aren't
 * meant to be indexed or link-shared.
 *
 * Usage:
 *   <Seo
 *     title="Origin Story"
 *     description="How a 2007 whitepaper became Peripateticware."
 *     path="/about/origin"
 *   />
 */

import { PRODUCT_NAME } from '../constants/brand';

const SITE_URL = 'https://peripateticware.com';

interface SeoProps {
  /** Page-specific title. "— Peripateticware" is appended automatically unless already present. */
  title: string;
  /** ~140-160 character summary. Shows in Google results and link previews (Slack, Facebook, etc). */
  description: string;
  /** Route path starting with "/", e.g. "/about/origin". Used to build the canonical URL and og:url. */
  path: string;
  /**
   * Absolute URL to a 1200x630 social preview image. Omit until a real one
   * exists — pointing og:image at a missing or wrong-shaped file makes link
   * previews look broken, which is worse than having no preview image at all.
   */
  image?: string;
}

export function Seo({ title, description, path, image }: SeoProps) {
  const fullTitle = title.includes(PRODUCT_NAME) ? title : `${title} — ${PRODUCT_NAME}`;
  const url = `${SITE_URL}${path}`;

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={PRODUCT_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      {image && <meta property="og:image" content={image} />}

      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </>
  );
}

export default Seo;
