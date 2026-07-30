// src/api/leaderboard.ts
// Leaderboards for student-created ("reverse scavenger hunt") activities —
// see backend/routes/student_activities.py's leaderboard endpoints for the
// ranking rules (completed sessions by time taken, in-progress ones by
// evidence captured so far).

import { apiFetch } from './client';

export interface ProposedActivity {
  id: string;
  title: string;
  subject: string;
  proposed_by: string | null;
  participant_count: number;
  created_at: string | null;
}

export interface LeaderboardEntry {
  student_id: string;
  student_name: string;
  status: string;
  captures_count: number;
  time_taken_seconds: number | null;
  started_at: string | null;
  is_you: boolean;
  rank: number;
}

export interface Leaderboard {
  activity_id: string;
  entries: LeaderboardEntry[];
}

export async function fetchProposedActivities(): Promise<ProposedActivity[]> {
  return apiFetch<ProposedActivity[]>('/api/v1/student/proposed-activities');
}

export async function fetchLeaderboard(activityId: string): Promise<Leaderboard> {
  return apiFetch<Leaderboard>(`/api/v1/student/activities/${activityId}/leaderboard`);
}
