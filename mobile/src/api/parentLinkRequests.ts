// src/api/parentLinkRequests.ts
// Student-side (child) half of parent-child linking — reuses
// backend/routes/student.py's /student/parent-requests endpoints.
// Distinct from src/api/parent.ts, which is the PARENT-role side (that
// file's linkChild() only ever creates a status='pending' row; nothing
// there can grant access). A parent's request shows up here for the
// child to approve or deny — see routes/parent.py's link_child()
// docstring for the full flow.

import { apiFetch } from './client';

export interface ParentLinkRequest {
  parent_id: string;
  parent_name: string;
  parent_email: string;
  relationship: string;
  requested_at: string;
}

export async function fetchParentRequests(): Promise<ParentLinkRequest[]> {
  return apiFetch<ParentLinkRequest[]>('/api/v1/student/parent-requests');
}

export async function approveParentRequest(parentId: string): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/api/v1/student/parent-requests/${parentId}/approve`, { method: 'POST' });
}

export async function denyParentRequest(parentId: string): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/api/v1/student/parent-requests/${parentId}/deny`, { method: 'POST' });
}
