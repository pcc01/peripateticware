// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// Run: npm test (vitest run)
//
// Tests the rubric + standards scoring panel added to
// TeacherSubmissionsPage.tsx (2026-09-14) -- previously zero automated
// coverage existed for this page at all (no unit test, no e2e case).
// getSubmissions/getSubmissionDetail/scoreRubric are mocked (via
// useTeacher()); useApiData itself is the REAL implementation
// (vi.importActual), so this exercises the real fetch-on-mount /
// fetch-on-selection wiring, not just a canned prop.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeacherSubmissionsPage from '@/pages/TeacherSubmissionsPage'

vi.mock('react-i18next', async (importOriginal) => {
  // src/services/api.ts transitively imports src/config/i18n.ts (which
  // calls i18next.use(initReactI18next)) -- a mock that doesn't re-export
  // the rest of the real module breaks that import chain. Keep everything
  // real except useTranslation, which we stub for deterministic assertions
  // (a test asserting on i18n keys/fallback text shouldn't depend on the
  // real translation catalog being loaded).
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
  }
})

const mockGetSubmissions = vi.fn()
const mockGetSubmissionDetail = vi.fn()
const mockScoreRubric = vi.fn()
const mockApproveSubmission = vi.fn()
const mockRejectSubmission = vi.fn()
const mockReviewFieldPhase = vi.fn()

vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api')
  return {
    ...actual,
    useTeacher: () => ({
      getSubmissions: mockGetSubmissions,
      approveSubmission: mockApproveSubmission,
      rejectSubmission: mockRejectSubmission,
      reviewFieldPhase: mockReviewFieldPhase,
      getSubmissionDetail: mockGetSubmissionDetail,
      scoreRubric: mockScoreRubric,
    }),
  }
})

const SESSION_ID = 'session-abc-123'

const BASE_SUBMISSION_ROW = {
  session_id: SESSION_ID,
  student_id: 'student-1',
  student_name: 'Alex Johnson',
  activity_id: 'activity-1',
  activity_title: 'Creek Habitat Study',
  status: 'pending_review',
  started_at: '2026-09-01T10:00:00Z',
}

const RUBRIC_DEFINITION = {
  id: 'rubric-1',
  title: 'Field Observation Rubric',
  description: null,
  total_points: 8,
  criteria: [
    {
      id: 'c1',
      name: 'Data Collection',
      description: 'Collects accurate field data',
      levels: [
        { score: 1, label: 'Beginning', description: '' },
        { score: 4, label: 'Exceeds', description: '' },
        { score: 2, label: 'Approaching', description: '' },
        { score: 3, label: 'Meets', description: '' },
      ],
    },
  ],
}

const STANDARDS_TARGET = {
  criterion_id: 'eco-1',
  standards_set_id: 'set-1',
  standards_set_name: 'WA Science Standards',
  criterion_name: 'Ecosystem interactions',
  design_coverage_level: 'partial',
}

function baseDetail(overrides: Record<string, any> = {}) {
  return {
    session_id: SESSION_ID,
    student_id: 'student-1',
    student_name: 'Alex Johnson',
    activity_id: 'activity-1',
    activity_title: 'Creek Habitat Study',
    completion_mode: 'field_only',
    require_field_approval: false,
    rubric_id: null,
    rubric: null,
    rubric_scores: {},
    standards_targets: [],
    standards_evaluation: {},
    submission_id: 'sub-1',
    submission_status: 'submitted',
    completion_phase: 'complete',
    field_phase_status: 'not_applicable',
    field_phase_feedback: null,
    field_phase_reviewed_at: null,
    reflection_status: 'not_applicable',
    reflection_content: null,
    linked_field_note_id: null,
    teacher_feedback: null,
    grade: null,
    evidence: [],
    started_at: '2026-09-01T10:00:00Z',
    completed_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSubmissions.mockResolvedValue([BASE_SUBMISSION_ROW])
  mockGetSubmissionDetail.mockResolvedValue(baseDetail())
  mockScoreRubric.mockResolvedValue({ submission_id: 'sub-1' })
})

async function selectTheSubmission() {
  render(<TeacherSubmissionsPage />)
  await waitFor(() => screen.getByText('Alex Johnson'))
  await userEvent.click(screen.getByText('Alex Johnson'))
}

describe('TeacherSubmissionsPage — list', () => {
  it('shows an empty state when there are no submissions', async () => {
    mockGetSubmissions.mockResolvedValue([])
    render(<TeacherSubmissionsPage />)
    await waitFor(() => screen.getByText('No submissions to review'))
  })

  it('renders a submission row and opens the detail panel on click', async () => {
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Submission Details'))
    // Appears both in the list row and the detail panel once selected.
    expect(screen.getAllByText('Creek Habitat Study').length).toBeGreaterThanOrEqual(2)
  })

  it('visually highlights the selected row (regression: the highlight check compared against submission.id, which real rows never have -- only session_id -- so the selected row never actually highlighted)', async () => {
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Submission Details'))
    // "Alex Johnson" now appears in both the list row and the detail
    // panel's Student Info section -- the list row renders first.
    const row = screen.getAllByText('Alex Johnson')[0].closest('.cursor-pointer') as HTMLElement
    expect(row.className).toContain('border-green-700')
    expect(row.className).toContain('bg-green-50')
  })
})

describe('TeacherSubmissionsPage — rubric + standards scoring panel', () => {
  it('does not render the scoring panel when the activity has neither a rubric nor mapped standards', async () => {
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Submission Details'))
    expect(screen.queryByText('Score This Submission')).not.toBeInTheDocument()
  })

  it('renders rubric criteria as selectable level buttons when a rubric is attached', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION }))
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    expect(screen.getByText('Field Observation Rubric')).toBeInTheDocument()
    expect(screen.getByText('Data Collection')).toBeInTheDocument()
    // Levels render sorted highest-score-first (the component sorts by score desc).
    const levelButtons = screen.getAllByRole('button', { name: /Exceeds \(4\)|Meets \(3\)|Approaching \(2\)|Beginning \(1\)/ })
    expect(levelButtons).toHaveLength(4)
  })

  it('renders mapped standards as selectable coverage-level buttons independently of a rubric', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ standards_targets: [STANDARDS_TARGET] }))
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    expect(screen.getByText('Ecosystem interactions')).toBeInTheDocument()
    expect(screen.getByText('WA Science Standards')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not Met' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Partial' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Full' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exceeds' })).toBeInTheDocument()
  })

  it('shows a graded badge with the percentage when submission_status is graded', async () => {
    mockGetSubmissionDetail.mockResolvedValue(
      baseDetail({ rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION, submission_status: 'graded', grade: 87 })
    )
    await selectTheSubmission()
    await waitFor(() => screen.getByText(/Graded/))
    expect(screen.getByText(/87%/)).toBeInTheDocument()
  })

  it('Save Scores is disabled until a score or evaluation is chosen', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION }))
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    const saveButton = screen.getByRole('button', { name: /Save Scores/ })
    expect(saveButton).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Meets (3)' }))
    expect(saveButton).not.toBeDisabled()
  })

  it('clicking a rubric level and saving calls scoreRubric with the right criterion/score', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION }))
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    await userEvent.click(screen.getByRole('button', { name: 'Exceeds (4)' }))
    await userEvent.click(screen.getByRole('button', { name: /Save Scores/ }))

    await waitFor(() => expect(mockScoreRubric).toHaveBeenCalledTimes(1))
    const [sessionIdArg, payload] = mockScoreRubric.mock.calls[0]
    expect(sessionIdArg).toBe(SESSION_ID)
    expect(payload.scores).toEqual([{ criterion_id: 'c1', score: 4 }])
    expect(payload.standards_evaluation).toEqual([])
  })

  it('clicking a standards coverage level and saving calls scoreRubric with the right criterion/level -- independent of any rubric', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ standards_targets: [STANDARDS_TARGET] }))
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    await userEvent.click(screen.getByRole('button', { name: 'Not Met' }))
    await userEvent.click(screen.getByRole('button', { name: /Save Scores/ }))

    await waitFor(() => expect(mockScoreRubric).toHaveBeenCalledTimes(1))
    const [, payload] = mockScoreRubric.mock.calls[0]
    expect(payload.scores).toEqual([])
    expect(payload.standards_evaluation).toEqual([{ criterion_id: 'eco-1', coverage_level: 'not_met' }])
  })

  it('includes feedback text in the save payload when the teacher writes any', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION }))
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    await userEvent.click(screen.getByRole('button', { name: 'Meets (3)' }))
    await userEvent.type(screen.getByPlaceholderText('Feedback for the student...'), 'Nice work on this one!')
    await userEvent.click(screen.getByRole('button', { name: /Save Scores/ }))

    await waitFor(() => expect(mockScoreRubric).toHaveBeenCalledTimes(1))
    expect(mockScoreRubric.mock.calls[0][1].feedback).toBe('Nice work on this one!')
  })

  it('shows a confirmation after a successful save', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION }))
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    await userEvent.click(screen.getByRole('button', { name: 'Meets (3)' }))
    await userEvent.click(screen.getByRole('button', { name: /Save Scores/ }))

    await waitFor(() => screen.getByText('✓ Saved'))
  })

  it('shows the server error message when saving fails, and does not show a false success', async () => {
    mockGetSubmissionDetail.mockResolvedValue(baseDetail({ rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION }))
    mockScoreRubric.mockRejectedValue({ response: { data: { detail: 'Score 9 is not a valid level for criterion c1' } } })
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    await userEvent.click(screen.getByRole('button', { name: 'Meets (3)' }))
    await userEvent.click(screen.getByRole('button', { name: /Save Scores/ }))

    await waitFor(() => screen.getByText('Score 9 is not a valid level for criterion c1'))
    expect(screen.queryByText('✓ Saved')).not.toBeInTheDocument()
  })

  it('pre-selects already-saved scores and evaluations when reopening a scored submission', async () => {
    mockGetSubmissionDetail.mockResolvedValue(
      baseDetail({
        rubric_id: 'rubric-1', rubric: RUBRIC_DEFINITION, rubric_scores: { c1: 3 },
        standards_targets: [STANDARDS_TARGET], standards_evaluation: { 'eco-1': 'full' },
      })
    )
    await selectTheSubmission()
    await waitFor(() => screen.getByText('Score This Submission'))

    // The previously-saved level buttons render in their "selected" visual
    // state -- verified via the highlight class this component applies,
    // since the label text alone is shared by every level button.
    const meetsButton = screen.getByRole('button', { name: 'Meets (3)' })
    expect(meetsButton.className).toContain('bg-green-700')
    const fullButton = screen.getByRole('button', { name: 'Full' })
    expect(fullButton.className).toContain('ring-2')
  })
})
