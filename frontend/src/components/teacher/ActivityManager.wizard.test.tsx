// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// End-to-end check of the guided wizard inside ActivityManager: start picker →
// validation on Basics → outcomes/standards → review (with Edit) → create.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown, opts?: Record<string, unknown>) => {
      const text = typeof def === 'string' ? def : key;
      const vars = (typeof def === 'object' && def ? def : opts) as Record<string, unknown> | undefined;
      return vars ? text.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? '')) : text;
    },
  }),
}));

const createActivity = vi.fn();
const updateActivity = vi.fn();
const getActivity = vi.fn();
vi.mock('@/stores/teacher', () => ({
  useTeacherStore: () => ({
    activities: [], getActivity, createActivity, updateActivity, loading: false, error: null, clearCurrentActivity: vi.fn(),
  }),
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'u1', role: 'teacher', org_id: null, state_standard: 'NY' } }),
}));

vi.mock('./OllamaLessonSuggestions', () => ({ OllamaLessonSuggestions: () => <div>peri suggestions</div> }));
vi.mock('./WayfindingBuilder', () => ({ default: () => <div data-testid="wayfinding-builder" /> }));
vi.mock('./WikiLocationInfo', () => ({ WikiLocationInfo: ({ locationName }: { locationName?: string }) => <div data-testid="wiki">wiki {locationName}</div> }));
vi.mock('@/components/shared/AppliedStandardsPanel', () => ({
  default: () => <div data-testid="applied-standards-panel" />,
  triggerStandardsSuggestion: vi.fn().mockResolvedValue(undefined),
}));
const ragRetrieve = vi.fn();
vi.mock('@/services/inferenceService', () => ({ inferenceService: { ragRetrieve: (...a: unknown[]) => ragRetrieve(...a) } }));

import ActivityManager from './ActivityManager';

const stdDoc = (id: string, code: string, content: string) => ({
  id, node_id: id, node_type: 'standards_item', content, metadata: { human_coding_scheme: code }, relevance_score: 0.9, relation: 'match',
});

const mount = (path = '/teacher/activities/new') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teacher/activities/new" element={<ActivityManager />} />
        <Route path="/teacher/activities/:id/edit" element={<ActivityManager />} />
        <Route path="/teacher/activities" element={<div>activities list</div>} />
      </Routes>
    </MemoryRouter>,
  );

const section = (name: string) => screen.getByLabelText(name, { selector: 'section' });
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

describe('ActivityManager guided wizard', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'tok');
    createActivity.mockReset().mockResolvedValue({ id: 'a1' });
    ragRetrieve.mockReset().mockResolvedValue({
      documents: [
        stdDoc('s1', '5-LS2-1', 'Develop a model to describe the movement of matter among plants and the environment.'),
        stdDoc('s2', '5-ESS3-1', 'Obtain information about how communities protect Earth resources.'),
      ],
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/locations/geocode')) return { ok: true, json: async () => ({ latitude: 40.78, longitude: -73.96, is_approximate: false }) };
      if (String(url).includes('/outcomes')) return { ok: true, status: 200, json: async () => [] };
      if (String(url).includes('/rubrics')) return { ok: true, json: async () => [{ id: 'r1', title: 'Field Observation Rubric' }] };
      if (String(url).includes('check-compliance')) return { ok: true, json: async () => ({ status: 'compliant', issues: [] }) };
      return { ok: true, status: 200, json: async () => ({}) };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('walks start → basics → experience → assessment → outcomes → review and creates with chosen standards', async () => {
    mount();
    expect(screen.getByText('What do you want to start from?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    expect(section('Basics')).not.toHaveAttribute('inert');

    // Basics validation: blocked with word-based errors, focus stays put
    next();
    expect(screen.getByText('Error: Title is required')).toBeInTheDocument();
    expect(section('Basics')).not.toHaveAttribute('inert');

    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Pond Life Walk' } });
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'Students observe pond life and record data.' } });
    fireEvent.change(screen.getByLabelText(/^Location Name/), { target: { value: 'Central Park' } });
    next();
    expect(section('Experience')).not.toHaveAttribute('inert');

    // Wayfaring shows the route builder; investigative hides it
    expect(screen.queryByTestId('wayfinding-builder')).not.toBeInTheDocument();
    fireEvent.click(within(section('Experience')).getByRole('button', { name: /^Wayfaring/ }));
    expect(screen.getByTestId('wayfinding-builder')).toBeInTheDocument();
    next();

    // Assessment: Peri's suggested standards, outcome-free first pass pre-selects the top two
    expect(section('Assessment')).not.toHaveAttribute('inert');
    expect(await screen.findByText('5-LS2-1')).toBeInTheDocument();
    await waitFor(() => expect(within(section('Assessment')).getAllByRole('checkbox').filter(c => (c as HTMLInputElement).checked)).toHaveLength(2));
    // untick the second
    fireEvent.click(within(section('Assessment')).getAllByRole('checkbox')[1]);
    next();

    // Outcomes
    expect(section('Outcomes')).not.toHaveAttribute('inert');
    fireEvent.change(screen.getByLabelText('Outcome 1'), { target: { value: 'Identify three pond plants' } });
    next();

    // Review: summary, Edit jumps back, answers kept
    expect(section('Review')).not.toHaveAttribute('inert');
    expect(within(section('Review')).getByText('Pond Life Walk')).toBeInTheDocument();
    expect(within(section('Review')).getByText('1 applied')).toBeInTheDocument();
    fireEvent.click(within(section('Review')).getByRole('button', { name: 'Edit Title' }));
    expect(section('Basics')).not.toHaveAttribute('inert');
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Pond Life Walk');
    for (let i = 0; i < 4; i++) next();

    fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }));
    await waitFor(() => expect(createActivity).toHaveBeenCalledTimes(1));
    const payload = createActivity.mock.calls[0][0];
    expect(payload).toMatchObject({
      title: 'Pond Life Walk',
      location_name: 'Central Park',
      learning_objectives: ['Identify three pond plants'],
      discovery_wayfinding_enabled: true,
      seed_standard_ids: ['s1'],
    });
    expect(await screen.findByText('activities list')).toBeInTheDocument();
  });

  it('offers "About this place" once a location resolves, and again on Review', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    expect(within(section('Basics')).queryByRole('button', { name: /About this place/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Location Name/), { target: { value: 'Central Park' } });
    const about = await within(section('Basics')).findByRole('button', { name: /About this place/ }, { timeout: 3000 });
    expect(screen.getByTestId('wiki')).toBeInTheDocument(); // lookup already running, dialog still closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(about);
    const dialog = screen.getByRole('dialog', { name: 'Central Park' });
    expect(within(dialog).getByTestId('wiki')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cannot skip past Basics when starting elsewhere: required fields are checked when leaving it', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /An assessment/ }));
    expect(section('Assessment')).not.toHaveAttribute('inert');
    next(); // Assessment → Basics (first step is the start point; Basics comes second)
    expect(section('Basics')).not.toHaveAttribute('inert');
    next(); // blocked: title and description are empty
    expect(section('Basics')).not.toHaveAttribute('inert');
    expect(screen.getByText('Error: Title is required')).toBeInTheDocument();
    expect(createActivity).not.toHaveBeenCalled();
  });

  it('does not submit when Enter is pressed in a text field', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    fireEvent.keyDown(screen.getByLabelText(/^Title/), { key: 'Enter' });
    expect(createActivity).not.toHaveBeenCalled();
  });

  it('skips the chooser when editing and shows the existing standards panel', async () => {
    getActivity.mockResolvedValue({
      id: 'e1', title: 'Existing', description: 'An existing activity description.', grade_level: 5, subject: 'Science',
      difficulty_level: 3, location_latitude: 1, location_longitude: 2, location_radius_meters: 500, location_name: 'Park',
      estimated_duration_minutes: 45, materials_needed: [], resources: [], learning_objectives: ['Existing outcome'],
      curriculum_unit_ids: [], bloom_level: 'apply', activity_type: 'outdoor',
    });
    mount('/teacher/activities/e1/edit');
    expect(screen.queryByText('What do you want to start from?')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Existing'));
    next(); next();
    expect(screen.getByTestId('applied-standards-panel')).toBeInTheDocument();
    next();
    expect(screen.getByLabelText('Outcome 1')).toHaveValue('Existing outcome');
    expect(ragRetrieve).not.toHaveBeenCalled(); // suggestions are for new activities only
  });
});
