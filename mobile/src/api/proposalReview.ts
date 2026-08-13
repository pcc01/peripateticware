// src/api/proposalReview.ts
// TEACHER/HOMESCHOOL side of student "reverse scavenger hunt" proposals —
// reuses backend/routes/proposals.py's /api/v1/teacher/proposals endpoints.
// Distinct from src/api/proposals.ts, which is the STUDENT side (create/
// edit/submit/withdraw). Approving turns a proposal straight into a
// published Activity (activity_type='discovery') server-side — nothing
// else for this screen to do afterward.

import { apiFetch } from './client';

export interface PendingProposal {
  id: string;
  title: string;
  challenge_description: string;
  location_hint: string;
  subject: string;
  note_to_teacher: string;
  status: string;
  student_id: string;
  student_name: string;
  created_at: string | null;
}

export async function fetchPendingProposals(): Promise<PendingProposal[]> {
  return apiFetch<PendingProposal[]>('/api/v1/teacher/proposals');
}

export async function approveProposal(proposalId: string): Promise<{ status: string; activity_id: string }> {
  return apiFetch(`/api/v1/teacher/proposals/${proposalId}/approve`, { method: 'POST' });
}

export async function rejectProposal(proposalId: string, feedback: string): Promise<{ status: string }> {
  return apiFetch(`/api/v1/teacher/proposals/${proposalId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
}
