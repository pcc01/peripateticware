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
  // Place grounding (PERI_OFFLINE_SPEC_v2.md item 12) -- same source as
  // the on-device script (location_wiki_data), so live chat and the
  // offline engine are grounded in the same facts. The backend caps and
  // frames this as background-only context, never something to state
  // directly to the student.
  locationName?: string;
  locationDescription?: string;
  locationAiGenerated?: boolean;
}): Promise<ChatResponse> {
  const placeNote = params.locationName
    ? `Place: ${params.locationName}` +
      (params.locationDescription ? ` — ${params.locationDescription.slice(0, 400)}` : '') +
      (params.locationAiGenerated
        ? ' (this description came from the AI\'s general knowledge, not a verified source -- treat specifics with caution)'
        : '')
    : undefined;

  const systemContext = [
    params.activityTitle && `Activity: ${params.activityTitle}`,
    params.activitySubject && `Subject: ${params.activitySubject}`,
    placeNote,
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
