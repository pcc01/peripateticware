// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { axiosInstance } from './api';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  cover_image_caption: string | null;
  cover_image_attribution: string | null;
  cover_image_width: number | null;
  cover_image_height: number | null;
  status: 'draft' | 'published';
  author_name: string | null;
  tags: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// List views don't get the full content body, and don't need cover
// caption/attribution (a thumbnail has no room for it) -- but dimensions
// stay, so a list card can size its cover thumbnail to the real aspect
// ratio without cropping too, same as the full post view.
export type BlogPostSummary = Omit<BlogPost, 'content' | 'cover_image_caption' | 'cover_image_attribution'>;

export interface BlogPostListResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface BlogPostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  cover_image_url?: string;
  cover_image_caption?: string;
  cover_image_attribution?: string;
  cover_image_width?: number | null;
  cover_image_height?: number | null;
  status: 'draft' | 'published';
  tags: string[];
}

// ── Public ──────────────────────────────────────────────────────────────────

export async function fetchPublishedPosts(page = 1, pageSize = 12, tag?: string) {
  const { data } = await axiosInstance.get<BlogPostListResponse<BlogPostSummary>>('/blog/posts', {
    params: { page, page_size: pageSize, ...(tag ? { tag } : {}) },
  });
  return data;
}

export async function fetchPublishedPost(slug: string) {
  const { data } = await axiosInstance.get<BlogPost>(`/blog/posts/${encodeURIComponent(slug)}`);
  return data;
}

// ── Admin ───────────────────────────────────────────────────────────────────

export async function adminListPosts(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  const { data } = await axiosInstance.get<BlogPostListResponse<BlogPostSummary>>('/admin/blog/posts', { params });
  return data;
}

export async function adminGetPost(id: string) {
  const { data } = await axiosInstance.get<BlogPost>(`/admin/blog/posts/${id}`);
  return data;
}

export async function adminCreatePost(input: BlogPostInput) {
  const { data } = await axiosInstance.post<BlogPost>('/admin/blog/posts', input);
  return data;
}

export async function adminUpdatePost(id: string, input: Partial<BlogPostInput>) {
  const { data } = await axiosInstance.put<BlogPost>(`/admin/blog/posts/${id}`, input);
  return data;
}

export async function adminDeletePost(id: string) {
  await axiosInstance.delete(`/admin/blog/posts/${id}`);
}

export interface UploadedBlogImage {
  url: string;
  /** Natural pixel dimensions after the server's resize step. 0 if the
   *  server couldn't decode the file's dimensions (still uploaded fine --
   *  just no aspect-ratio info to size a box with). */
  width: number;
  height: number;
}

/** Uploads an image (JPEG/PNG/WEBP/GIF, max 5MB; larger files are
 *  downscaled server-side) and returns its URL plus natural dimensions --
 *  used both for BlogPostInput.cover_image_url/width/height and for images
 *  inserted into the post body. */
export async function adminUploadBlogImage(file: File): Promise<UploadedBlogImage> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await axiosInstance.post<UploadedBlogImage>('/admin/blog/upload-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
