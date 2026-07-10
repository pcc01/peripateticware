// src/api/fieldNotes.ts
// Field-note CRUD — backs the Extended Field Journal on mobile.
// Blocks (text / capture / reflection / question) are stored as JSON
// in the `description` field. Format: { v: 2, summary: string, blocks: Block[] }
// Legacy plain-text descriptions are treated as a single text block.

import { apiFetch } from './client';

// ── Block types ─────────────────────────────────────────────────────────────
export type BlockType = 'text' | 'capture' | 'reflection' | 'question';

export interface TextBlock {
  type: 'text';
  id: string;
  content: string;
  created_at: string;
}
export interface CaptureBlock {
  type: 'capture';
  id: string;
  capture_id: string;
  caption?: string;
  capture_type: string;   // 'photo' | 'video' | 'audio' | 'text'
  file_path?: string;
  created_at: string;
}
export interface ReflectionBlock {
  type: 'reflection';
  id: string;
  prompt: string;
  content: string;
  created_at: string;
}
export interface QuestionBlock {
  type: 'question';
  id: string;
  content: string;
  created_at: string;
}

export type JournalBlock = TextBlock | CaptureBlock | ReflectionBlock | QuestionBlock;

export interface JournalDoc {
  v: 2;
  summary: string;
  blocks: JournalBlock[];
}

// ── Serialize / deserialise description ─────────────────────────────────────

export function descriptionToDoc(description: string | null | undefined): JournalDoc {
  if (!description) return { v: 2, summary: '', blocks: [] };
  try {
    const parsed = JSON.parse(description);
    if (parsed?.v === 2) return parsed as JournalDoc;
  } catch {}
  // Legacy plain text — wrap as first text block
  return {
    v: 2,
    summary: description.slice(0, 160),
    blocks: [{
      type: 'text',
      id: 'legacy',
      content: description,
      created_at: new Date().toISOString(),
    }],
  };
}

export function docToDescription(doc: JournalDoc): string {
  return JSON.stringify(doc);
}

// ── API types ────────────────────────────────────────────────────────────────
export interface FieldNote {
  id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'submitted' | 'promoted' | 'rejected';
  location_latitude?: number | null;
  location_longitude?: number | null;
  location_name?: string | null;
  self_project_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ── API calls ────────────────────────────────────────────────────────────────
export async function fetchFieldNotes(): Promise<FieldNote[]> {
  try {
    const data = await apiFetch<{ items: FieldNote[] }>('/api/v1/student/field-notes?limit=50');
    return data.items ?? [];
  } catch { return []; }
}

export async function fetchFieldNote(id: string): Promise<FieldNote> {
  return apiFetch<FieldNote>(`/api/v1/student/field-notes/${id}`);
}

export async function createFieldNote(params: {
  title: string;
  doc: JournalDoc;
  location_name?: string;
  location_latitude?: number;
  location_longitude?: number;
}): Promise<FieldNote> {
  return apiFetch<FieldNote>('/api/v1/student/field-notes', {
    method: 'POST',
    body: JSON.stringify({
      title: params.title,
      description: docToDescription(params.doc),
      location_name: params.location_name,
      location_latitude: params.location_latitude,
      location_longitude: params.location_longitude,
    }),
  });
}

export async function saveFieldNote(
  id: string,
  params: { title?: string; doc?: JournalDoc },
): Promise<FieldNote> {
  const body: Record<string, unknown> = {};
  if (params.title !== undefined) body.title = params.title;
  if (params.doc   !== undefined) body.description = docToDescription(params.doc);
  return apiFetch<FieldNote>(`/api/v1/student/field-notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function submitFieldNote(id: string): Promise<FieldNote> {
  return apiFetch<FieldNote>(`/api/v1/student/field-notes/${id}/submit-for-promotion`, { method: 'POST' });
}
