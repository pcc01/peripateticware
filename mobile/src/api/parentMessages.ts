// src/api/parentMessages.ts
// Parent side of parent↔teacher messaging — reuses the same backend/routes/
// parent.py endpoints web's ParentMessagesPage.tsx already calls. Flat list
// of incoming teacher messages with a per-message Reply, not a full
// threaded view — matches web's own actual behavior exactly (web has no
// thread endpoint on this side either; only the teacher-facing router
// does), so this isn't a scoped-down mobile version, it's the same feature.

import { apiFetch } from './client';

export interface ParentMessage {
  id: string;
  from_teacher_id: string;
  from_teacher_name: string;
  to_parent_id: string;
  subject: string;
  body: string;
  read_at: string | null;
  created_at: string;
  conversation_id: string;
}

export async function fetchParentMessages(): Promise<ParentMessage[]> {
  return apiFetch<ParentMessage[]>('/api/v1/parent/messages');
}

export async function replyToParentMessage(messageId: string, body: string): Promise<void> {
  await apiFetch(`/api/v1/parent/messages/${messageId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
