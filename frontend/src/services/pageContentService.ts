// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { axiosInstance } from './api';

export interface PageBlock {
  id: string;
  page_key: string;
  block_key: string;
  locale: string;
  format: 'text' | 'markdown';
  content: string;
  status: 'draft' | 'published';
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageBlockVersion {
  id: string;
  content: string;
  status: string;
  source: 'human' | 'ai_assisted';
  edited_by_name: string | null;
  created_at: string;
}

export interface PageBlockWithHistory extends PageBlock {
  versions: PageBlockVersion[];
}

export interface PageBlockUpsertInput {
  page_key: string;
  block_key: string;
  locale?: string;
  format?: 'text' | 'markdown';
  content: string;
  status?: 'draft' | 'published';
}

export interface PageBlockUpdateInput {
  content?: string;
  format?: 'text' | 'markdown';
  status?: 'draft' | 'published';
}

// ── Public ──────────────────────────────────────────────────────────────────

export async function fetchPublishedBlocks(pageKey: string, locale = 'en') {
  const { data } = await axiosInstance.get<{ blocks: Record<string, string> }>(
    `/pages/${encodeURIComponent(pageKey)}/blocks`,
    { params: { locale } }
  );
  return data.blocks;
}

// ── Admin ───────────────────────────────────────────────────────────────────

export async function adminListBlocks(params: { page_key?: string; search?: string } = {}) {
  const { data } = await axiosInstance.get<PageBlock[]>('/admin/pages/blocks', { params });
  return data;
}

export async function adminListPageKeys() {
  const { data } = await axiosInstance.get<string[]>('/admin/pages/page-keys');
  return data;
}

export async function adminGetBlock(id: string) {
  const { data } = await axiosInstance.get<PageBlockWithHistory>(`/admin/pages/blocks/${id}`);
  return data;
}

export async function adminCreateBlock(input: PageBlockUpsertInput) {
  const { data } = await axiosInstance.post<PageBlock>('/admin/pages/blocks', input);
  return data;
}

export async function adminUpdateBlock(id: string, input: PageBlockUpdateInput) {
  const { data } = await axiosInstance.put<PageBlock>(`/admin/pages/blocks/${id}`, input);
  return data;
}

export async function adminDeleteBlock(id: string) {
  await axiosInstance.delete(`/admin/pages/blocks/${id}`);
}
