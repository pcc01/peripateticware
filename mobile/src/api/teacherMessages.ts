// src/api/teacherMessages.ts
// TEACHER/HOMESCHOOL side of parent↔teacher messaging — reuses
// backend/routes/teacher_communication.py, which was built to share the
// same `parent_messages` table src/api/parentMessages.ts already reads,
// so a message sent from either side shows up on both with no extra sync.

import { apiFetch } from './client';

export type MessageAudience = 'student' | 'parent' | 'all_students' | 'all_parents';

export interface Recipient {
  id: string;
  name: string;
  email: string;
  student_id?: string;   // present on parent-type recipients
  student_name?: string; // present on parent-type recipients
}

export interface ClassroomRecipients {
  students: Recipient[];
  parents: Recipient[];
}

export interface TeacherConversation {
  conversation_id: string;
  other_user_id: string;
  other_user_name: string;
  subject: string;
  last_message: string;
  last_message_at: string | null;
  unread: boolean;
}

export interface ThreadMessage {
  id: string;
  from_user_id: string;
  from_name: string;
  is_mine: boolean;
  subject: string;
  body: string;
  created_at: string | null;
  read_at: string | null;
}

export interface SendMessageInput {
  classroom_id: string;
  audience: MessageAudience;
  student_id?: string;
  subject: string;
  body: string;
  notify?: boolean;
}

export async function fetchClassroomRecipients(classroomId: string): Promise<ClassroomRecipients> {
  return apiFetch<ClassroomRecipients>(`/api/v1/teacher/classrooms/${classroomId}/recipients`);
}

export async function fetchTeacherConversations(): Promise<TeacherConversation[]> {
  return apiFetch<TeacherConversation[]>('/api/v1/teacher/messages');
}

export async function fetchTeacherThread(conversationId: string): Promise<ThreadMessage[]> {
  return apiFetch<ThreadMessage[]>(`/api/v1/teacher/messages/${conversationId}`);
}

export async function sendTeacherMessage(input: SendMessageInput): Promise<{ success: boolean; sent_count: number }> {
  return apiFetch('/api/v1/teacher/messages', {
    method: 'POST',
    body: JSON.stringify({ notify: true, ...input }),
  });
}

export async function replyInTeacherThread(conversationId: string, body: string): Promise<void> {
  await apiFetch(`/api/v1/teacher/messages/${conversationId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
