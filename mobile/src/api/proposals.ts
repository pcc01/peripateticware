// src/api/proposals.ts
// Student Activity Proposals ("reverse scavenger hunt") — a student
// proposes a place-based challenge for other students; a teacher approves
// it into a real Activity. Mirrors backend/routes/proposals.py's student
// endpoints (mobile is student-only, so the teacher review endpoints have
// no mobile client).

import { apiFetch } from './client';

export type ProposalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface Proposal {
  id: string;
  title: string;
  challenge_description: string;
  location_hint: string;
  subject: string;
  note_to_teacher: string;
  status: ProposalStatus;
  teacher_feedback: string;
  student_id: string;
  student_name: string;
  approved_activity_id: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ProposalInput {
  title: string;
  challenge_description: string;
  location_hint?: string;
  subject?: string;
  note_to_teacher?: string;
}

export async function fetchMyProposals(): Promise<Proposal[]> {
  return apiFetch<Proposal[]>('/api/v1/proposals');
}

export async function fetchProposal(id: string): Promise<Proposal> {
  return apiFetch<Proposal>(`/api/v1/proposals/${id}`);
}

export async function createProposal(input: ProposalInput): Promise<{ id: string; status: ProposalStatus }> {
  return apiFetch('/api/v1/proposals', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateProposal(id: string, input: Partial<ProposalInput>): Promise<void> {
  await apiFetch(`/api/v1/proposals/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function submitProposal(id: string): Promise<void> {
  await apiFetch(`/api/v1/proposals/${id}/submit`, { method: 'POST' });
}

export async function deleteProposal(id: string): Promise<void> {
  await apiFetch(`/api/v1/proposals/${id}`, { method: 'DELETE' });
}
