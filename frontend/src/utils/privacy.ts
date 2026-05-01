# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

/**
 * Privacy & Compliance Module
 * Integrates:
 * - Marzano Privacy Engine: AI Artifact Retention + Teacher-Only Competency Assessment
 * - Playlab Privacy Engine: FERPA, COPPA, GDPR, EU AI Act compliance
 * - PII Classification and data residency
 */

import { User } from '@types/auth'
import { CompetencyAssessment, EvidenceOfLearning } from '@types/session'

// ============================================================================
// COMPLIANCE PROFILES (from Playlab)
// ============================================================================

export interface ComplianceProfile {
  countryCode: string
  regionCode?: string
  studentPrivacyLaws: string[]
  minorProtectionLaws: string[]
  regionalPrivacyLaws: string[]
  aiGovernanceLaws: string[]
  dataResidencyRegion: string
  gdprApplies: boolean
  euAiActApplies: boolean
  dataRetentionYears: number
}

const COMPLIANCE_PROFILES: Record<string, ComplianceProfile> = {
  US: {
    countryCode: 'US',
    studentPrivacyLaws: ['FERPA', 'PPRA'],
    minorProtectionLaws: ['COPPA', 'CIPA'],
    regionalPrivacyLaws: ['CCPA'], // CA only
    aiGovernanceLaws: ['NIST_AI_RMF'],
    dataResidencyRegion: 'us-east-1',
    gdprApplies: false,
    euAiActApplies: false,
    dataRetentionYears: 7,
  },
  EU: {
    countryCode: 'EU',
    studentPrivacyLaws: ['GDPR'],
    minorProtectionLaws: ['GDPR_Art8'],
    regionalPrivacyLaws: ['GDPR'],
    aiGovernanceLaws: ['EU_AI_Act', 'UNESCO_AI_Ethics'],
    dataResidencyRegion: 'eu-west-1',
    gdprApplies: true,
    euAiActApplies: true,
    dataRetentionYears: 3,
  },
  GB: {
    countryCode: 'GB',
    studentPrivacyLaws: ['UK_GDPR'],
    minorProtectionLaws: ['AADC', 'UK_GDPR'],
    regionalPrivacyLaws: ['UK_GDPR'],
    aiGovernanceLaws: ['AISI', 'UNESCO_AI_Ethics'],
    dataResidencyRegion: 'eu-west-2',
    gdprApplies: true,
    euAiActApplies: false,
    dataRetentionYears: 3,
  },
  AU: {
    countryCode: 'AU',
    studentPrivacyLaws: ['APPs'],
    minorProtectionLaws: ['NCC', 'APPs'],
    regionalPrivacyLaws: ['APPs'],
    aiGovernanceLaws: ['UNESCO_AI_Ethics'],
    dataResidencyRegion: 'ap-southeast-2',
    gdprApplies: false,
    euAiActApplies: false,
    dataRetentionYears: 7,
  },
  CA: {
    countryCode: 'CA',
    studentPrivacyLaws: ['PIPEDA', 'FIPPA'],
    minorProtectionLaws: ['PIPEDA'],
    regionalPrivacyLaws: ['PIPEDA'],
    aiGovernanceLaws: ['UNESCO_AI_Ethics'],
    dataResidencyRegion: 'ca-central-1',
    gdprApplies: false,
    euAiActApplies: false,
    dataRetentionYears: 7,
  },
}

export function getComplianceProfile(countryCode: string, regionCode?: string): ComplianceProfile {
  const cc = (countryCode || 'US').toUpperCase()
  const profile = COMPLIANCE_PROFILES[cc] || COMPLIANCE_PROFILES.US
  return { ...profile, regionCode }
}

// ============================================================================
// PII CLASSIFICATION (from Playlab)
// ============================================================================

// Fields that should ALWAYS be stripped from logs
const PII_SENSITIVE_FIELDS = ['dob', 'race', 'hispanicEthnicity', 'iepStatus', 'ellStatus', 'frlStatus', 'ssn']

// Fields safe to expose in Playlab/frontend
const USER_ALLOWLIST = new Set([
  'user_id',
  'username',
  'email',
  'full_name',
  'role',
  'coppaApplies', // COPPA: Is user under 13?
  'ferpaProtected',
])

export interface ClassifiedUser {
  forDisplay: Partial<User> // What to show in UI
  forStorage: User // Complete record for secure storage
  strippedFields: string[] // What was removed
}

export function classifyUser(user: User, coppaApplies: boolean): ClassifiedUser {
  const stripped: string[] = []
  const forDisplay: Record<string, unknown> = {}
  const userAsRecord = user as unknown as Record<string, unknown>

  // Add safe fields to display version
  for (const key of USER_ALLOWLIST) {
    if (key in userAsRecord) {
      forDisplay[key] = userAsRecord[key]
    }
  }

  // COPPA: Remove email for under-13 users
  if (coppaApplies) {
    delete forDisplay.email
    stripped.push('email (COPPA: under-13)')
  }

  const forStorage = { ...user }

  return {
    forDisplay: forDisplay as Partial<User>,
    forStorage,
    strippedFields: stripped,
  }
}

/**
 * Sanitize user data for logs (always use this for audit trails)
 * Never log full names, emails, or sensitive identifiers
 */
export function sanitizeUserForLog(user: User): Record<string, unknown> {
  return {
    user_id: user.user_id,
    username: user.username,
    role: user.role,
    // Name initials only
    name: `${(user.full_name[0] ?? '?').toUpperCase()}.${
      user.full_name.split(' ')[1]?.[0] ?? '?'
    }.`,
  }
}

// ============================================================================
// MARZANO PRIVACY ENGINE: Teacher-Only Competency Assessment
// ============================================================================

/**
 * Strip teacher-only fields from evidence before sending to students
 * Students should NEVER see competency assessments or original AI drafts
 */
export function stripTeacherDataForStudent(evidence: EvidenceOfLearning): Omit<EvidenceOfLearning, 'competency_assessment' | 'original_ai_draft'> {
  const { competency_assessment, original_ai_draft, ...studentSafe } = evidence
  return studentSafe
}

/**
 * Verify that a user has permission to view teacher-only data
 * Only teachers and admins can see competency assessments
 */
export function canViewCompetencyAssessment(userRole: string): boolean {
  return userRole === 'teacher' || userRole === 'admin'
}

/**
 * Verify that a user has permission to view original AI drafts
 * Only teachers and admins can see immutable original responses
 */
export function canViewOriginalArtifact(userRole: string): boolean {
  return userRole === 'teacher' || userRole === 'admin'
}

/**
 * Create a filtered evidence object suitable for the current user
 */
export function filterEvidenceByRole(evidence: EvidenceOfLearning, userRole: string): EvidenceOfLearning {
  if (!canViewCompetencyAssessment(userRole)) {
    return stripTeacherDataForStudent(evidence) as EvidenceOfLearning
  }
  return evidence
}

// ============================================================================
// AUDIT LOGGING (Compliance)
// ============================================================================

export interface AuditLog {
  timestamp: string
  userId: string
  userRole: string
  action: string
  resource: string
  resourceId: string
  outcome: 'success' | 'failure'
  details: Record<string, unknown>
}

/**
 * Log compliance-sensitive actions
 * Always sanitize user data before logging
 */
export function createAuditLog(
  userId: string,
  userRole: string,
  action: string,
  resource: string,
  resourceId: string,
  outcome: 'success' | 'failure' = 'success',
  details: Record<string, unknown> = {}
): AuditLog {
  return {
    timestamp: new Date().toISOString(),
    userId,
    userRole,
    action,
    resource,
    resourceId,
    outcome,
    details,
  }
}

// ============================================================================
// CONSENT & PRIVACY NOTICES
// ============================================================================

export interface PrivacyConsent {
  userId: string
  version: string // e.g., "1.0"
  timestamp: string
  dataProcessing: boolean // Consent to process learning data
  thirdPartySharing: boolean // Consent to share with teachers/admin
  ferpaAcknowledgment: boolean // Understood FERPA protections (US)
  gdprDataProcessing?: boolean // GDPR specific (EU)
  covidDataRetention?: boolean // COPPA specific (under-13)
}

export function createPrivacyConsent(
  userId: string,
  countryCode: string,
  covidDataRetention: boolean = false
): PrivacyConsent {
  const version = '1.0'
  const dataProcessing = true
  const thirdPartySharing = true
  const ferpaAcknowledgment = countryCode === 'US'

  return {
    userId,
    version,
    timestamp: new Date().toISOString(),
    dataProcessing,
    thirdPartySharing,
    ferpaAcknowledgment,
    gdprDataProcessing: countryCode === 'EU' || countryCode === 'GB',
    covidDataRetention: countryCode === 'US' && covidDataRetention,
  }
}

// ============================================================================
// DATA RESIDENCY & RETENTION
// ============================================================================

/**
 * Get the appropriate data residency region based on compliance profile
 */
export function getDataResidencyRegion(profile: ComplianceProfile): string {
  return profile.dataResidencyRegion
}

/**
 * Determine how long data should be retained
 */
export function getRetentionYears(profile: ComplianceProfile): number {
  return profile.dataRetentionYears
}

/**
 * Calculate deletion date based on retention policy
 */
export function getDataDeletionDate(createdAt: string, retentionYears: number): Date {
  const date = new Date(createdAt)
  date.setFullYear(date.getFullYear() + retentionYears)
  return date
}

// ============================================================================
// EXPORT FOR TESTING & ANALYTICS
// ============================================================================

export const Privacy = {
  getComplianceProfile,
  classifyUser,
  sanitizeUserForLog,
  stripTeacherDataForStudent,
  canViewCompetencyAssessment,
  canViewOriginalArtifact,
  filterEvidenceByRole,
  createAuditLog,
  createPrivacyConsent,
  getDataResidencyRegion,
  getRetentionYears,
  getDataDeletionDate,
}

export default Privacy
