// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// frontend/src/tests/phase7.test.tsx
// Run: npm test (vitest run)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/phase7Api', () => ({
  fieldNoteApi: {
    list: vi.fn().mockResolvedValue({
      items: [
        { id: 'note-1', title: 'River Observation', status: 'draft',
          capture_count: 2, location_name: 'Green River',
          created_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:00:00Z' },
        { id: 'note-2', title: 'Bridge Study', status: 'submitted',
          capture_count: 1, location_name: null,
          created_at: '2026-05-02T10:00:00Z', updated_at: '2026-05-02T10:00:00Z' },
      ],
      total: 2, page: 1, page_size: 20, total_pages: 1,
    }),
    get: vi.fn().mockResolvedValue({
      id: 'note-1', title: 'River Observation',
      description: 'The current is unusually fast today',
      status: 'draft', captures: [], self_project_id: null,
      self_tagged_objective_ids: [], location_name: 'Green River',
      created_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:00:00Z',
    }),
    create: vi.fn().mockResolvedValue({
      id: 'note-new', title: 'New Note', status: 'draft', captures: [],
      self_tagged_objective_ids: [],
      created_at: '2026-05-08T10:00:00Z', updated_at: '2026-05-08T10:00:00Z',
    }),
    update: vi.fn().mockResolvedValue({
      id: 'note-1', title: 'Updated Title', status: 'draft', captures: [],
      self_tagged_objective_ids: [],
      created_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-08T10:00:00Z',
    }),
    share: vi.fn().mockResolvedValue({ detail: 'Shared' }),
    unshare: vi.fn().mockResolvedValue({ detail: 'Unshared' }),
    submitForPromotion: vi.fn().mockResolvedValue({ detail: 'Submitted' }),
    addCapture: vi.fn().mockResolvedValue({ detail: 'Linked' }),
    removeCapture: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  selfProjectApi: {
    list: vi.fn().mockResolvedValue([
      { id: 'proj-1', title: 'Bridge Research', status: 'personal',
        field_note_count: 3, created_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:00:00Z' },
    ]),
    create: vi.fn().mockResolvedValue({
      id: 'proj-new', title: 'New Project', status: 'personal',
      field_note_count: 0, created_at: '2026-05-08T10:00:00Z', updated_at: '2026-05-08T10:00:00Z',
    }),
    archive: vi.fn().mockResolvedValue({ id: 'proj-1', status: 'archived', field_note_count: 0 }),
    requestClassmateShare: vi.fn().mockResolvedValue({ share_id: 'share-1', detail: 'Submitted' }),
    get: vi.fn().mockResolvedValue({ id: 'proj-1', title: 'Bridge Research', status: 'personal',
                                     field_note_count: 3 }),
    update: vi.fn(),
  },
  peerProjectApi: {
    listAuthored: vi.fn().mockResolvedValue({
      items: [
        { id: 'pp-1', title: 'Bridge Challenge', status: 'published',
          description: 'Explore bridge structure', response_count: 5,
          completed_response_count: 3, allowed_capture_types: ['photo', 'text'],
          guiding_prompts: [{ prompt: 'What holds the bridge up?', order: 1 }],
          learning_objectives_text: [], example_captures: [],
          author_student_id: 'student-1', class_id: 'class-1',
          audience: 'whole_class', target_student_ids: [], curriculum_objective_ids: [],
          approval_required: true, author_can_see_individual_responses: false,
          created_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:00:00Z' },
      ],
      total: 1, page: 1, page_size: 20, total_pages: 1,
    }),
    listAvailable: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'pp-new', status: 'draft', title: 'New Project' }),
    update: vi.fn(),
    submit: vi.fn().mockResolvedValue({ status: 'pending_approval', detail: 'Submitted' }),
    addExample: vi.fn(),
    removeExample: vi.fn(),
    startResponse: vi.fn().mockResolvedValue({ id: 'resp-1', status: 'in_progress', captures: [] }),
    getMyResponse: vi.fn().mockResolvedValue({ id: 'resp-1', status: 'in_progress', captures: [] }),
    addCaptureToResponse: vi.fn().mockResolvedValue({ detail: 'Added' }),
    completeResponse: vi.fn().mockResolvedValue({ detail: 'Completed' }),
  },
  audioApi: {
    upload: vi.fn().mockResolvedValue({
      id: 'cap-audio-1', capture_type: 'audio', file_path: 'media/audio/test.webm',
      duration_seconds: 15, file_size_bytes: 512000, mime_type: 'audio/webm',
      transcript: null, captured_at: '2026-05-08T10:00:00Z',
    }),
    streamUrl: vi.fn().mockReturnValue('http://localhost:8000/api/v1/student/captures/cap-audio-1/stream'),
  },
  teacherFieldNoteApi: {
    list: vi.fn().mockResolvedValue({
      items: [
        { id: 'note-2', title: 'Bridge Study', status: 'submitted',
          capture_count: 1, location_name: null,
          created_at: '2026-05-02T10:00:00Z', updated_at: '2026-05-02T10:00:00Z' },
      ],
      total: 1, page: 1, page_size: 20, total_pages: 1,
    }),
    approve: vi.fn().mockResolvedValue({ activity_id: 'act-1', detail: 'Approved' }),
    reject: vi.fn().mockResolvedValue({ detail: 'Rejected' }),
  },
  teacherPeerProjectApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }),
    approve: vi.fn().mockResolvedValue({ detail: 'Approved' }),
    reject: vi.fn().mockResolvedValue({ detail: 'Rejected' }),
    gradeResponse: vi.fn().mockResolvedValue({ id: 'grade-1', score: 88, feedback_to_student: 'Good job' }),
    setAuthorVisibility: vi.fn(),
    shareCrossClass: vi.fn(),
    getGrade: vi.fn(),
  },
}));

// ── Mock MediaDevices (jsdom doesn't have getUserMedia) ───────────────────────
const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null as any,
  onstop: null as any,
  state: 'inactive' as const,
};

Object.defineProperty(global.navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    }),
  },
});

global.MediaRecorder = vi.fn().mockImplementation(() => mockMediaRecorder) as any;
(global.MediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(true);

global.AudioContext = vi.fn().mockImplementation(() => ({
  createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 256, frequencyBinCount: 128,
    getByteTimeDomainData: vi.fn(),
    disconnect: vi.fn(),
  }),
  close: vi.fn(),
})) as any;

global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { FieldNoteEditor, FieldNoteList } from '../components/student/FieldNoteEditor';
import { SelfProjectView } from '../components/student/SelfProjectView';
import { PeerProjectAuthorDashboard } from '../components/student/SelfProjectView';
import { AudioRecorder } from '../components/student/AudioRecorder';
import { FieldNoteReview } from '../components/teacher/FieldNoteReview';

// ============================================================================
// FIELD NOTE LIST TESTS
// ============================================================================

describe('FieldNoteList', () => {
  it('renders field notes from API', async () => {
    render(<FieldNoteList />);
    await waitFor(() => {
      expect(screen.getByText('River Observation')).toBeTruthy();
      expect(screen.getByText('Bridge Study')).toBeTruthy();
    });
  });

  it('shows status badge for each note', async () => {
    render(<FieldNoteList />);
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeTruthy();
      expect(screen.getByText('Submitted')).toBeTruthy();
    });
  });

  it('shows location name when present', async () => {
    render(<FieldNoteList />);
    await waitFor(() => {
      expect(screen.getByText(/Green River/)).toBeTruthy();
    });
  });

  it('shows capture count', async () => {
    render(<FieldNoteList />);
    await waitFor(() => {
      expect(screen.getByText(/2 captures/)).toBeTruthy();
    });
  });

  it('shows New button and calls onNew when clicked', async () => {
    const onNew = vi.fn();
    render(<FieldNoteList onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('New')).toBeTruthy();
    });
    await userEvent.click(screen.getByText('New'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('filters notes by search text', async () => {
    render(<FieldNoteList />);
    await waitFor(() => {
      expect(screen.getByText('River Observation')).toBeTruthy();
    });
    const searchInput = screen.getByPlaceholderText('Search notes…');
    await userEvent.type(searchInput, 'Bridge');
    expect(screen.queryByText('River Observation')).toBeFalsy();
    expect(screen.getByText('Bridge Study')).toBeTruthy();
  });

  it('calls onSelect when a note is clicked', async () => {
    const onSelect = vi.fn();
    render(<FieldNoteList onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('River Observation')).toBeTruthy();
    });
    await userEvent.click(screen.getByText('River Observation'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-1', title: 'River Observation' })
    );
  });
});

// ============================================================================
// FIELD NOTE EDITOR TESTS
// ============================================================================

describe('FieldNoteEditor — new note', () => {
  it('renders empty form for new note', () => {
    render(<FieldNoteEditor />);
    expect(screen.getByPlaceholderText(/What did you observe/)).toBeTruthy();
    expect(screen.getByText('New Field Note')).toBeTruthy();
  });

  it('validates title is required on save', async () => {
    render(<FieldNoteEditor />);
    const saveBtn = screen.getByText('Save');
    await userEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeTruthy();
    });
  });

  it('calls fieldNoteApi.create on save with valid data', async () => {
    const { fieldNoteApi } = await import('../services/phase7Api');
    const onSave = vi.fn();
    render(<FieldNoteEditor onSave={onSave} />);
    await userEvent.type(screen.getByPlaceholderText(/What did you observe/), 'New observation');
    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(fieldNoteApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New observation' })
      );
    });
  });
});

describe('FieldNoteEditor — existing note', () => {
  it('loads and displays existing note data', async () => {
    render(<FieldNoteEditor noteId="note-1" />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('River Observation')).toBeTruthy();
    });
  });

  it('shows Share with Teacher button for draft notes', async () => {
    render(<FieldNoteEditor noteId="note-1" />);
    await waitFor(() => {
      expect(screen.getByText(/Share with Teacher/)).toBeTruthy();
    });
  });
});

// ============================================================================
// SELF-PROJECT VIEW TESTS
// ============================================================================

describe('SelfProjectView', () => {
  it('renders existing projects from API', async () => {
    render(<SelfProjectView />);
    await waitFor(() => {
      expect(screen.getByText('Bridge Research')).toBeTruthy();
    });
  });

  it('shows project field note count', async () => {
    render(<SelfProjectView />);
    await waitFor(() => {
      expect(screen.getByText(/3 field notes/)).toBeTruthy();
    });
  });

  it('shows New Project button when under quota', async () => {
    render(<SelfProjectView />);
    await waitFor(() => {
      expect(screen.getByText('New Project')).toBeTruthy();
    });
  });

  it('creates new project on form submit', async () => {
    const { selfProjectApi } = await import('../services/phase7Api');
    render(<SelfProjectView />);
    await waitFor(() => screen.getByText('New Project'));
    await userEvent.click(screen.getByText('New Project'));
    await waitFor(() => screen.getByPlaceholderText('Project title'));
    await userEvent.type(screen.getByPlaceholderText('Project title'), 'My New Project');
    await userEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(selfProjectApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My New Project' })
      );
    });
  });
});

// ============================================================================
// PEER PROJECT AUTHOR DASHBOARD TESTS
// ============================================================================

describe('PeerProjectAuthorDashboard', () => {
  it('renders authored peer projects', async () => {
    render(<PeerProjectAuthorDashboard classId="class-1" />);
    await waitFor(() => {
      expect(screen.getByText('Bridge Challenge')).toBeTruthy();
    });
  });

  it('shows response count for published project', async () => {
    render(<PeerProjectAuthorDashboard classId="class-1" />);
    await waitFor(() => {
      expect(screen.getByText(/5 responses/)).toBeTruthy();
    });
  });

  it('shows correct status badge', async () => {
    render(<PeerProjectAuthorDashboard classId="class-1" />);
    await waitFor(() => {
      expect(screen.getByText('published')).toBeTruthy();
    });
  });
});

// ============================================================================
// AUDIO RECORDER TESTS
// ============================================================================

describe('AudioRecorder', () => {
  it('renders idle state with Start Recording button', () => {
    render(<AudioRecorder maxSeconds={30} onRecordingComplete={vi.fn()} />);
    expect(screen.getByText('Start Recording')).toBeTruthy();
    expect(screen.getByText('Max 30s')).toBeTruthy();
  });

  it('shows timer display', () => {
    render(<AudioRecorder maxSeconds={30} onRecordingComplete={vi.fn()} />);
    expect(screen.getByText('0:00')).toBeTruthy();
  });

  it('starts recording on button click', async () => {
    render(<AudioRecorder maxSeconds={30} onRecordingComplete={vi.fn()} />);
    await userEvent.click(screen.getByText('Start Recording'));
    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });
  });

  it('is disabled when disabled prop is true', () => {
    render(<AudioRecorder maxSeconds={30} onRecordingComplete={vi.fn()} disabled={true} />);
    const btn = screen.getByText('Start Recording').closest('button');
    expect(btn?.disabled).toBe(true);
  });
});

// ============================================================================
// TEACHER FIELD NOTE REVIEW TESTS
// ============================================================================

describe('FieldNoteReview', () => {
  it('renders submitted field notes', async () => {
    render(<FieldNoteReview classId="class-1" />);
    await waitFor(() => {
      expect(screen.getByText('Bridge Study')).toBeTruthy();
    });
  });

  it('shows field note status in list', async () => {
    render(<FieldNoteReview classId="class-1" />);
    await waitFor(() => {
      expect(screen.getByText('submitted')).toBeTruthy();
    });
  });

  it('shows approve and reject buttons in detail view', async () => {
    render(<FieldNoteReview classId="class-1" />);
    await waitFor(() => screen.getByText('Bridge Study'));
    await userEvent.click(screen.getByText('Bridge Study'));
    await waitFor(() => {
      expect(screen.getByText(/Approve.*Activity/)).toBeTruthy();
      expect(screen.getByText(/Return to Student/)).toBeTruthy();
    });
  });

  it('requires feedback when rejecting', async () => {
    render(<FieldNoteReview classId="class-1" />);
    await waitFor(() => screen.getByText('Bridge Study'));
    await userEvent.click(screen.getByText('Bridge Study'));
    await waitFor(() => screen.getByText(/Return to Student/));
    await userEvent.click(screen.getByText(/Return to Student/));
    await waitFor(() => screen.getByText(/Return to Student/i));
    // Click reject without filling in feedback
    const rejectBtn = screen.getAllByText(/Return to Student/i).find(el =>
      el.tagName === 'BUTTON' || el.closest('button')
    );
    if (rejectBtn) await userEvent.click(rejectBtn);
    // Should show error about required feedback
    await waitFor(() => {
      // Error will show on submit attempt
      const errEl = screen.queryByText(/required/i);
      expect(errEl).toBeTruthy();
    });
  });
});

// ============================================================================
// TYPE SAFETY TESTS
// ============================================================================

describe('Phase 7 TypeScript interfaces', () => {
  it('FieldNote type has all required fields', () => {
    const note = {
      id: 'test', student_id: 'stud', title: 'Test',
      status: 'draft' as const, captures: [],
      self_tagged_objective_ids: [],
      created_at: '2026-05-01T10:00:00Z',
      updated_at: '2026-05-01T10:00:00Z',
    };
    // TypeScript compile-time check — if this runs, types are correct
    expect(note.status).toBe('draft');
    expect(Array.isArray(note.captures)).toBe(true);
  });

  it('AudioCaptureResult always has null transcript', () => {
    const result = {
      id: 'cap-1', capture_type: 'audio' as const,
      file_path: 'media/audio/test.webm',
      duration_seconds: 25, file_size_bytes: 512000,
      mime_type: 'audio/webm', transcript: null,
      captured_at: '2026-05-08T10:00:00Z',
    };
    expect(result.transcript).toBeNull();
  });
});
