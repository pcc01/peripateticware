// src/api/parent.ts
// Read-only summary for the mobile parent dashboard — reuses the same
// backend/routes/parent.py endpoints the web parent dashboard calls.
// GET /parent/dashboard exists but its `children` field is a permanent
// empty-array stub server-side (see that route's own comment), so the
// linked-children list comes from GET /parent/children instead, with each
// child's progress fetched individually from GET /parent/children/{id}/progress.

import { apiFetch } from './client';

export type LinkStatus = 'pending' | 'approved' | 'denied';

export interface LinkedChild {
  id: string;
  child_id: string;
  child_name: string;
  child_avatar?: string | null;
  relationship: string;
  linked_at: string;
  // Absent from responses predating this field only in already-cached
  // clients mid-rollout; the backend always sends it now. Treat a missing
  // value as 'approved' (matches the DB column's own migration default
  // for pre-existing rows — see backend/startup.py).
  status?: LinkStatus;
}

export interface CompetencyProgress {
  name: string;
  level: number;
  max_level: number;
}

export interface ChildProgress {
  child_id: string;
  child_name: string;
  grade: number;
  competencies: CompetencyProgress[];
  activities_completed: number;
  hours_learned: number;
  engagement_score: number;
  last_active: string;
}

export async function fetchLinkedChildren(): Promise<LinkedChild[]> {
  return apiFetch<LinkedChild[]>('/api/v1/parent/children');
}

export async function fetchChildProgress(childId: string): Promise<ChildProgress> {
  return apiFetch<ChildProgress>(`/api/v1/parent/children/${childId}/progress`);
}

export interface LinkChildResult {
  success: boolean;
  status: LinkStatus;
  message: string;
  child: { id: string; name: string; email: string; relationship: string; status: LinkStatus; linked_at: string };
}

// Requests a link to an existing student account by email — does NOT grant
// access by itself. Creates a status='pending' row the child must approve
// from their own app (src/api/parentLinkRequests.ts) before any progress
// data becomes visible; see backend/routes/parent.py's link_child()
// docstring for the full flow. Mirrors web's useParentStore.linkChild(),
// which also only ever sends the email — relationship always defaults to
// "guardian" server-side.
export async function linkChild(childEmail: string): Promise<LinkChildResult> {
  return apiFetch<LinkChildResult>('/api/v1/parent/link-child', {
    method: 'POST',
    body: JSON.stringify({ child_email: childEmail }),
  });
}

// Unilateral on the parent's side — no child approval needed to remove a
// link, same as the child needs no parent approval to deny one. Works at
// any status (pending/approved/denied); a parent can always re-request
// afterward, which the child would need to approve from scratch.
export async function unlinkChild(childId: string): Promise<{ success: boolean; child_id: string }> {
  return apiFetch(`/api/v1/parent/children/${childId}`, { method: 'DELETE' });
}
