// src/api/inference.ts — Peri AI chat + activity generation

import { apiFetch } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  response: string;
  next_question?: string;
  confidence?: number;
}

export async function chatWithPeri(params: {
  message: string;
  history: ChatMessage[];
  // Looked up server-side to enforce the activity's ai_interaction_mode --
  // a hidden "Ask Peri" button is a UI convenience, not real enforcement.
  // Omit for chat outside any specific activity (e.g. general help).
  activityId?: string;
  activityTitle?: string;
  activitySubject?: string;
  currentPrompt?: string;
}): Promise<ChatResponse> {
  const systemContext = [
    params.activityTitle && `Activity: ${params.activityTitle}`,
    params.activitySubject && `Subject: ${params.activitySubject}`,
    params.currentPrompt && `Current prompt: ${params.currentPrompt}`,
  ].filter(Boolean).join('\n');

  return apiFetch<ChatResponse>('/api/v1/inference/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: params.message,
      history: params.history,
      activity_id: params.activityId,
      system_context: systemContext || undefined,
    }),
  });
}
