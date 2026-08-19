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
  status: 'draft' | 'published';
  author_name: string | null;
  tags: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BlogPostSummary = Omit<BlogPost, 'content'>;

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
