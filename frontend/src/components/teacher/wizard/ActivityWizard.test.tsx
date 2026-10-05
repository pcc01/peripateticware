// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Return the English default text, interpolating {{vars}}, so tests read like the UI.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, def?: unknown, opts?: Record<string, unknown>) => {
      const text = typeof def === 'string' ? def : _key;
      const vars = (typeof def === 'object' && def ? def : opts) as Record<string, unknown> | undefined;
      return vars ? text.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? '')) : text;
    },
  }),
}));

vi.mock('../WikiLocationInfo', () => ({
  WikiLocationInfo: ({ locationName }: { locationName?: string }) => <div data-testid="wiki">wiki for {locationName}</div>,
}));

const ragRetrieve = vi.fn();
vi.mock('@/services/inferenceService', () => ({ inferenceService: { ragRetrieve: (...a: unknown[]) => ragRetrieve(...a) } }));

import { WizardShell, WizardApi, StepKey, buildOrder } from './WizardShell';
import { StartPicker } from './StartPicker';
import { PaneHeader } from './Chapter';
import { AboutPlaceDialog } from './AboutPlaceDialog';
import { OutcomesStep } from './OutcomesStep';
import { SuggestedStandards } from './SuggestedStandards';

const LABELS: Record<StepKey, string> = {
  basics: 'Basics', experience: 'Experience', assessment: 'Assessment', outcomes: 'Outcomes', review: 'Review',
};
const titles: Record<StepKey, string> = {
  basics: 'The basics', experience: 'How will students experience it?', assessment: 'How will you assess it?',
  outcomes: 'What should students be able to do?', review: 'Review and create',
};
const panes = Object.fromEntries(
  (Object.keys(LABELS) as StepKey[]).map(k => [k, <PaneHeader key={k} stepKey={k} title={titles[k]} />]),
) as Record<StepKey, React.ReactNode>;

const renderShell = (props: Partial<React.ComponentProps<typeof WizardShell>> = {}) =>
  render(
    <WizardShell
      labels={LABELS}
      panes={panes}
      renderStart={(pick) => <StartPicker onPick={pick} />}
      submitLabel="Create Activity"
      {...props}
    />,
  );

describe('buildOrder', () => {
  it('puts the chosen start first, keeps the rest in canonical order, ends at review', () => {
    expect(buildOrder('outcomes')).toEqual(['outcomes', 'basics', 'experience', 'assessment', 'review']);
    expect(buildOrder('assessment')).toEqual(['assessment', 'basics', 'experience', 'outcomes', 'review']);
    expect(buildOrder(null)).toEqual(['basics', 'experience', 'assessment', 'outcomes', 'review']);
  });
});

describe('WizardShell', () => {
  it('asks where to start, hides the rail until a choice is made, then starts from that step', () => {
    renderShell();
    expect(screen.getByText('What do you want to start from?')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Progress' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Learning outcomes/ }));

    const rail = screen.getByRole('navigation', { name: 'Progress' });
    const buttons = Array.from(rail.querySelectorAll('button')).map(b => b.textContent);
    expect(buttons[0]).toContain('Outcomes');
    expect(buttons[buttons.length - 1]).toContain('Review');
    expect(rail.querySelector('[aria-current="step"]')?.textContent).toContain('Outcomes');
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('keeps only the showing pane interactive (others are inert)', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    expect(screen.getByLabelText('Basics', { selector: 'section' })).not.toHaveAttribute('inert');
    expect(screen.getByLabelText('Experience', { selector: 'section' })).toHaveAttribute('inert');
  });

  it('Next advances, Back returns, and Back on the first step returns to the chooser', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Basics', { selector: 'section' })).toHaveClass(/before/);
    expect(screen.getByLabelText('Experience', { selector: 'section' })).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Basics', { selector: 'section' })).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Change start point' }));
    expect(screen.queryByRole('navigation', { name: 'Progress' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Choose where to start', { selector: 'section' })).not.toHaveAttribute('inert');
  });

  it('blocks Next when canLeave returns false', () => {
    const canLeave = vi.fn().mockReturnValue(false);
    renderShell({ canLeave });
    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(canLeave).toHaveBeenCalledWith('basics');
    expect(screen.getByLabelText('Basics', { selector: 'section' })).not.toHaveAttribute('inert');
  });

  it('shows the submit button on the last step and lets goTo jump back to any step', () => {
    const ref = React.createRef<WizardApi>();
    renderShell({ apiRef: ref });
    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const submit = screen.getByRole('button', { name: 'Create Activity' });
    expect(submit).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    act(() => ref.current!.goTo('assessment'));
    expect(screen.getByLabelText('Assessment', { selector: 'section' })).not.toHaveAttribute('inert');
    expect(screen.getByLabelText('Review', { selector: 'section' })).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('skips the chooser when editing', () => {
    renderShell({ skipStart: true });
    expect(screen.queryByText('What do you want to start from?')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('does not let the rail jump to steps not yet reached', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /A location/ }));
    const rail = screen.getByRole('navigation', { name: 'Progress' });
    const review = Array.from(rail.querySelectorAll('button')).find(b => b.textContent?.includes('Review'))!;
    expect(review).toBeDisabled();
  });
});

describe('AboutPlaceDialog', () => {
  const base = { locationName: 'Central Park', latitude: 40.78, longitude: -73.96, subject: 'Science', onInfoLoaded: vi.fn() };

  it('renders nothing until coordinates are set, then keeps the place lookup mounted but hidden', () => {
    const { rerender } = render(<AboutPlaceDialog {...base} latitude={0} longitude={0} open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('wiki')).not.toBeInTheDocument();
    rerender(<AboutPlaceDialog {...base} open={false} onClose={vi.fn()} />);
    expect(screen.getByTestId('wiki')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // hidden → not in the accessibility tree
  });

  it('opens as a labelled modal, moves focus in, closes on Escape and returns focus', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<AboutPlaceDialog {...base} open={false} onClose={onClose} />);
    rerender(<AboutPlaceDialog {...base} open onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'Central Park' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    rerender(<AboutPlaceDialog {...base} open={false} onClose={onClose} />);
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('traps Tab inside the dialog', () => {
    render(<AboutPlaceDialog {...base} open onClose={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close dialog' });
    const lastBtn = screen.getByRole('button', { name: 'Close' });
    lastBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
  });
});

describe('OutcomesStep', () => {
  const library = [
    { id: 'o1', text: 'Classify three plant species', subject: 'Science', grade_min: 3, grade_max: 5, taxonomy_level: 'apply', evidence_type: 'photo' },
    { id: 'o2', text: 'Use a map and compass', subject: 'Social Studies', grade_min: 3, grade_max: 6, taxonomy_level: 'apply', evidence_type: 'field_notes' },
  ];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('auth_token', 'tok');
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => ({ id: 'new1', subject: null, grade_min: null, grade_max: null, taxonomy_level: null, evidence_type: null, ...body }) };
      }
      return { ok: true, status: 200, json: async () => library };
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  const mount = (objectives: string[] = [], onChange = vi.fn()) =>
    render(
      <WizardShell labels={LABELS} skipStart submitLabel="Create" renderStart={() => null}
        panes={{ ...panes, basics: <OutcomesStep objectives={objectives} onChange={onChange} subject="Science" grade={5} standardsMatched={2} /> }} />,
    );

  it('filters the library to the grade and subject, and adds a copy to the activity', async () => {
    const onChange = vi.fn();
    mount([], onChange);
    expect(await screen.findByText('Classify three plant species')).toBeInTheDocument();
    expect(screen.queryByText('Use a map and compass')).not.toBeInTheDocument(); // wrong subject

    fireEvent.click(screen.getByRole('button', { name: 'Add outcome: Classify three plant species' }));
    expect(onChange).toHaveBeenLastCalledWith(['Classify three plant species']);
    expect(screen.getByRole('button', { name: 'Added: Classify three plant species' })).toBeDisabled();
  });

  it('shows everything when the filter is turned off', async () => {
    mount();
    await screen.findByText('Classify three plant species');
    fireEvent.click(screen.getByRole('checkbox', { name: /Only show grade 5 Science/ }));
    expect(screen.getByText('Use a map and compass')).toBeInTheDocument();
  });

  it('saves a written outcome to the library', async () => {
    const onChange = vi.fn();
    mount([], onChange);
    await screen.findByText('Classify three plant species');
    fireEvent.change(screen.getByLabelText('Outcome 1'), { target: { value: 'Measure pond temperature' } });
    expect(onChange).toHaveBeenLastCalledWith(['Measure pond temperature']);

    fireEvent.click(screen.getByRole('button', { name: 'Save to my library' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /In my library/ })).toBeDisabled());
    const post = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toMatchObject({ text: 'Measure pond temperature', subject: 'Science', grade_min: 5, grade_max: 5 });
  });

  it('still works when the library endpoint is unavailable', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    mount();
    expect(await screen.findByText(/library could not be loaded/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Outcome 1'), { target: { value: 'Draw a site map' } });
    expect(screen.getByRole('button', { name: 'Save to my library' })).toBeDisabled();
  });

  it('rebuilds its rows when the parent list changes (existing activity finishes loading)', () => {
    const { rerender } = render(
      <WizardShell labels={LABELS} skipStart submitLabel="Create" renderStart={() => null}
        panes={{ ...panes, basics: <OutcomesStep objectives={[]} onChange={vi.fn()} subject="Science" grade={5} standardsMatched={0} /> }} />,
    );
    rerender(
      <WizardShell labels={LABELS} skipStart submitLabel="Create" renderStart={() => null}
        panes={{ ...panes, basics: <OutcomesStep objectives={['Loaded outcome']} onChange={vi.fn()} subject="Science" grade={5} standardsMatched={0} /> }} />,
    );
    expect(screen.getByLabelText('Outcome 1')).toHaveValue('Loaded outcome');
  });
});

describe('SuggestedStandards', () => {
  const doc = (id: string, code: string, content: string) => ({
    id, node_id: id, node_type: 'standards_item', content, metadata: { human_coding_scheme: code }, relevance_score: 0.9, relation: 'match',
  });

  beforeEach(() => {
    ragRetrieve.mockReset();
    ragRetrieve.mockResolvedValue({
      documents: [
        doc('s1', '5-LS2-1', 'Develop a model to describe the movement of matter among plants, animals, and the environment.'),
        doc('s2', '5-ESS3-1', 'Obtain and combine information about ways communities protect Earth resources.'),
        doc('s3', '5-PS3-1', 'Use models to describe that energy in animals food was once energy from the sun.'),
        { id: 'x', node_id: 'x', node_type: 'framework', content: 'ignored', metadata: {}, relevance_score: 0.1, relation: 'match' },
      ],
    });
  });

  const setup = (over: Partial<React.ComponentProps<typeof SuggestedStandards>> = {}) => {
    const onPickedChange = vi.fn();
    const onMatchCount = vi.fn();
    render(
      <SuggestedStandards
        active subject="Science" grade={5} stateCode="NY" stateLocked={false} onStateChange={vi.fn()}
        outcomes={['Classify plants in their environment']} title="Pond study" picked={{}}
        onPickedChange={onPickedChange} onMatchCount={onMatchCount} {...over}
      />,
    );
    return { onPickedChange, onMatchCount };
  };

  it('searches with grade, state, subject and the outcomes, and lists only standards items', async () => {
    setup();
    expect(await screen.findByText('5-LS2-1')).toBeInTheDocument();
    expect(ragRetrieve).toHaveBeenCalledTimes(1);
    const [query, opts] = ragRetrieve.mock.calls[0];
    expect(query).toContain('Science');
    expect(query).toContain('grade 5');
    expect(query).toContain('NY');
    expect(query).toContain('Classify plants in their environment');
    expect(opts).toMatchObject({ sourceType: 'standards' });
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  it('pre-selects outcome matches and the top two, and says why', async () => {
    const { onPickedChange, onMatchCount } = setup();
    await screen.findByText('5-LS2-1');
    await waitFor(() => expect(onPickedChange).toHaveBeenCalled());
    const picked = onPickedChange.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(picked)).toEqual(expect.arrayContaining(['s1', 's2'])); // s1 matches outcome 1 (plants/environment); s2 is top-two
    expect(picked.s3).toBeUndefined();
    expect(onMatchCount).toHaveBeenCalledWith(1);
    expect(screen.getByText(/Matches outcome 1/)).toBeInTheDocument();
    expect(screen.getAllByText(/Grade 5 Science, NY/).length).toBeGreaterThan(0);
  });

  it('does not search while inactive', async () => {
    setup({ active: false });
    await new Promise(r => setTimeout(r, 800));
    expect(ragRetrieve).not.toHaveBeenCalled();
  });

  it('reports a toggle to the parent and does not clobber it on the next result', async () => {
    const onPickedChange = vi.fn();
    const { rerender } = render(
      <SuggestedStandards active subject="Science" grade={5} stateCode="" stateLocked={false} onStateChange={vi.fn()}
        outcomes={[]} title="Pond" picked={{ s1: { code: '5-LS2-1', text: 't' } }} onPickedChange={onPickedChange} onMatchCount={vi.fn()} />,
    );
    await screen.findByText('5-LS2-1');
    onPickedChange.mockClear();
    fireEvent.click(screen.getAllByRole('checkbox')[0]); // uncheck s1
    expect(onPickedChange).toHaveBeenLastCalledWith({});

    // an outcome edit triggers a new search; the teacher's unchecking must stand
    rerender(
      <SuggestedStandards active subject="Science" grade={5} stateCode="" stateLocked={false} onStateChange={vi.fn()}
        outcomes={['Measure temperature']} title="Pond" picked={{}} onPickedChange={onPickedChange} onMatchCount={vi.fn()} />,
    );
    await waitFor(() => expect(ragRetrieve).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 50));
    expect(onPickedChange).toHaveBeenCalledTimes(1);
  });

  it('shows an error and no list when the search fails', async () => {
    ragRetrieve.mockRejectedValue(new Error('boom'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load standard suggestions/);
  });

  it('shows the state read-only for administrator-managed accounts', async () => {
    setup({ stateLocked: true });
    await screen.findByText('5-LS2-1');
    expect(document.getElementById('wizard-state')).toBeNull();
    expect(screen.getByText('NY')).toBeInTheDocument();
  });
});
