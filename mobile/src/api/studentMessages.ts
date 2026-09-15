// src/api/studentMessages.ts
// STUDENT side of teacher↔student 1:1 messaging — reuses the same
// parent_messages-backed conversation model as src/api/teacherMessages.ts
// and src/api/parentMessages.ts, via backend/routes/student.py's
// /student/messages endpoints. Read + reply only — students can't
// originate a new thread here, same scope as the parent side (see
// src/api/parentMessages.ts's header comment).

import { apiFetch } from './client';

export interface StudentConversation {
  conversation_id: string;
  other_user_id: string;
  other_user_name: string;
  subject: string;
  last_message: string;
  last_message_at: string | null;
  unread: boolean;
}

export interface StudentThreadMessage {
  id: string;
  from_user_id: string;
  from_name: string;
  is_mine: boolean;
  subject: string;
  body: string;
  created_at: string | null;
  read_at: string | null;
}

export async function fetchStudentConversations(): Promise<StudentConversation[]> {
  return apiFetch<StudentConversation[]>('/api/v1/student/messages');
}

export async function fetchStudentThread(conversationId: string): Promise<StudentThreadMessage[]> {
  return apiFetch<StudentThreadMessage[]>(`/api/v1/student/messages/${conversationId}`);
}

export async function replyInStudentThread(
  conversationId: string,
  body: string
): Promise<{ success: boolean; message_id: string; created_at: string }> {
  return apiFetch(`/api/v1/student/messages/${conversationId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
