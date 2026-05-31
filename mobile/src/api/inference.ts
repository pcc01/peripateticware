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
      system_context: systemContext || undefined,
    }),
  });
}
