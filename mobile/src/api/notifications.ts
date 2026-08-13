// src/api/notifications.ts
// Parent-facing notifications — reuses the same backend/routes/parent.py
// endpoints web's ParentNotificationsPage.tsx already calls. Written to by
// routes/classrooms.py's _notify_linked_parents() (a child added to a
// classroom) today; more notification types may write here later without
// any change needed on this side, since `type` is just an opaque string
// tag for now.

import { apiFetch } from './client';

export interface ParentNotification {
  id: string;
  parent_id: string;
  type: string; // achievement, concern, message, reminder, info, ...
  title: string;
  body: string;
  related_child_id: string;
  action_url?: string | null;
  read_at: string | null;
  created_at: string;
}

export async function fetchNotifications(unreadOnly = false): Promise<ParentNotification[]> {
  return apiFetch<ParentNotification[]>(`/api/v1/parent/notifications?unread_only=${unreadOnly}`);
}

export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/v1/parent/notifications/${id}/read`, { method: 'PUT' });
}
