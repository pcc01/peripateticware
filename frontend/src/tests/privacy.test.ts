import { describe, it, expect } from 'vitest'
import { Privacy } from '@utils/privacy'
import {
  stripTeacherDataForStudent,
  canViewCompetencyAssessment,
  canViewOriginalArtifact,
  filterEvidenceByRole,
  classifyUser,
  sanitizeUserForLog,
} from '@utils/privacy'
import { EvidenceOfLearning, CompetencyAssessment } from '@types/session'
import { User } from '@types/auth'

/**
 * Privacy Tests - Verify teacher-only data is properly stripped for students
 */

describe('Privacy Engine - Teacher-Only Data Protection', () => {
  const mockCompetencyAssessment: CompetencyAssessment = {
    standards_evidence: ['Standard 1', 'Standard 2'],
    grade_alignment: 'On grade level',
    competency_areas: ['Critical thinking', 'Problem solving'],
    growth_recommendations: ['Practice more', 'Explore deeper'],
    rigor_analysis: 'High cognitive demand',
    teacher_notes: 'Strong performance',
  }

  const mockEvidence: EvidenceOfLearning = {
    session_id: 'session-123',
    title: 'Learning Session',
    evidence: {
      bloom_level_achieved: 4,
      key_concepts: ['Photosynthesis', 'Energy transfer'],
      misconceptions_addressed: 2,
      engagement_score: 8.5,
    },
    status: 'completed',
    completed_at: '2024-04-25T10:00:00Z',
    original_ai_draft: 'This is the original AI response...',
    competency_assessment: mockCompetencyAssessment,
  }

  describe('stripTeacherDataForStudent', () => {
    it('should remove competency_assessment from evidence', () => {
      const stripped = stripTeacherDataForStudent(mockEvidence)
      expect(stripped).not.toHaveProperty('competency_assessment')
    })

    it('should remove original_ai_draft from evidence', () => {
      const stripped = stripTeacherDataForStudent(mockEvidence)
      expect(stripped).not.toHaveProperty('original_ai_draft')
    })

    it('should keep student-safe evidence fields', () => {
      const stripped = stripTeacherDataForStudent(mockEvidence)
      expect(stripped.session_id).toBe('session-123')
      expect(stripped.title).toBe('Learning Session')
      expect(stripped.evidence.bloom_level_achieved).toBe(4)
    })
  })

  describe('canViewCompetencyAssessment', () => {
    it('should return true for teachers', () => {
      expect(canViewCompetencyAssessment('teacher')).toBe(true)
    })

    it('should return true for admins', () => {
      expect(canViewCompetencyAssessment('admin')).toBe(true)
    })

    it('should return false for students', () => {
      expect(canViewCompetencyAssessment('student')).toBe(false)
    })

    it('should return false for parents', () => {
      expect(canViewCompetencyAssessment('parent')).toBe(false)
    })
  })

  describe('canViewOriginalArtifact', () => {
    it('should return true for teachers', () => {
      expect(canViewOriginalArtifact('teacher')).toBe(true)
    })

    it('should return true for admins', () => {
      expect(canViewOriginalArtifact('admin')).toBe(true)
    })

    it('should return false for students', () => {
      expect(canViewOriginalArtifact('student')).toBe(false)
    })
  })

  describe('filterEvidenceByRole', () => {
    it('should return full evidence for teachers', () => {
      const filtered = filterEvidenceByRole(mockEvidence, 'teacher')
      expect(filtered.competency_assessment).toBeDefined()
      expect(filtered.original_ai_draft).toBeDefined()
    })

    it('should strip teacher data for students', () => {
      const filtered = filterEvidenceByRole(mockEvidence, 'student')
      expect(filtered.competency_assessment).toBeUndefined()
      expect(filtered.original_ai_draft).toBeUndefined()
    })

    it('should keep student-safe fields for students', () => {
      const filtered = filterEvidenceByRole(mockEvidence, 'student')
      expect(filtered.session_id).toBe('session-123')
      expect(filtered.evidence.bloom_level_achieved).toBe(4)
    })
  })

  describe('classifyUser', () => {
    const mockUser: User = {
      user_id: 'user-123',
      email: 'student@school.edu',
      username: 'student123',
      full_name: 'Jane Smith',
      role: 'student',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    it('should create classified user with forDisplay and forStorage', () => {
      const classified = classifyUser(mockUser, false)
      expect(classified.forDisplay).toBeDefined()
      expect(classified.forStorage).toBeDefined()
      expect(classified.strippedFields).toBeDefined()
    })

    it('should keep safe fields in forDisplay', () => {
      const classified = classifyUser(mockUser, false)
      expect(classified.forDisplay.user_id).toBe('user-123')
      expect(classified.forDisplay.full_name).toBe('Jane Smith')
    })

    it('should remove email for COPPA users (under-13)', () => {
      const classified = classifyUser(mockUser, true)
      expect(classified.forDisplay.email).toBeUndefined()
      expect(classified.strippedFields).toContain('email (COPPA: under-13)')
    })

    it('should keep email for non-COPPA users', () => {
      const classified = classifyUser(mockUser, false)
      expect(classified.forDisplay.email).toBe('student@school.edu')
    })
  })

  describe('sanitizeUserForLog', () => {
    const mockUser: User = {
      user_id: 'user-123',
      email: 'student@school.edu',
      username: 'student123',
      full_name: 'Jane Smith',
      role: 'student',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    it('should never include full email in logs', () => {
      const sanitized = sanitizeUserForLog(mockUser)
      expect(sanitized.email).toBeUndefined()
    })

    it('should never include full name in logs', () => {
      const sanitized = sanitizeUserForLog(mockUser)
      expect(sanitized).not.toHaveProperty('full_name')
    })

    it('should include only initials', () => {
      const sanitized = sanitizeUserForLog(mockUser)
      expect(sanitized.name).toMatch(/^[A-Z]\.[A-Z]\./)
    })

    it('should include safe identifiers', () => {
      const sanitized = sanitizeUserForLog(mockUser)
      expect(sanitized.user_id).toBe('user-123')
      expect(sanitized.username).toBe('student123')
      expect(sanitized.role).toBe('student')
    })
  })
})
