// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * privacy.ts — Privacy utility functions
 *
 * Merges the original stub (Privacy class with redactPII / checkDataCompliance)
 * with new API-connected functions backed by the full privacy engine:
 *
 *   checkDataCompliance()     — POST /api/v1/privacy/check
 *   getActiveJurisdictions()  — GET  /api/v1/privacy/jurisdictions
 *   getPrivacyStatus()        — GET  /api/v1/privacy/status
 *   redactPII()               — client-side (no network)
 *   formatAuditEntry()        — formatting helper
 */

import axios from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000'

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplianceCheckResult {
  allowed:        boolean
  reasons:        string[]
  warnings:       string[]
  jurisdiction_id: string | null
}

export interface JurisdictionSummary {
  rule_id:       string
  regulation_id: string
  version:       string
  jurisdiction:  string
  framework:     string | null
  effective_date: string | null
}

export interface PrivacyStatusResult {
  status:            string
  active_rules_count: number
  jurisdictions:     string[]
  last_updated:      string | null
  frameworks_enforced: string[]
}

export interface AuditLogEntry {
  id:                string
  timestamp:         string | null
  action:            string
  data_type:         string | null
  actor_role:        string | null
  compliance_status: string
  student_id_hash:   string | null
  notes:             string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// API-connected functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ad-hoc compliance check. Calls POST /api/v1/privacy/check.
 * Falls back gracefully if the API is unreachable (returns allowed=true with a warning).
 */
export async function checkDataCompliance(
  action: 'submit_evidence' | 'view_student_data',
  context: { studentAge?: number; dataTypes: string[]; jurisdictionId?: string }
): Promise<ComplianceCheckResult> {
  try {
    const res = await axios.post(
      `${API_BASE}/api/v1/privacy/check`,
      {
        student_age:     context.studentAge ?? 15,
        data_categories: context.dataTypes,
        jurisdiction_id: context.jurisdictionId ?? null,
        purpose:         action === 'submit_evidence' ? 'lesson_delivery' : 'view_student_data',
      },
      { headers: getAuthHeader() }
    )

    return {
      allowed:         res.data.compliant ?? true,
      reasons:         res.data.issues    ?? [],
      warnings:        res.data.warnings  ?? [],
      jurisdiction_id: res.data.jurisdiction_id ?? null,
    }
  } catch (err) {
    console.warn('[privacy] checkDataCompliance API unavailable — defaulting to allowed', err)
    return { allowed: true, reasons: [], warnings: ['Privacy API unavailable'], jurisdiction_id: null }
  }
}

/**
 * Returns list of active jurisdictions from GET /api/v1/privacy/jurisdictions.
 * Requires admin token; returns empty array for unauthenticated callers.
 */
export async function getActiveJurisdictions(): Promise<JurisdictionSummary[]> {
  try {
    const res = await axios.get(`${API_BASE}/api/v1/privacy/jurisdictions`, {
      headers: getAuthHeader(),
    })
    return res.data ?? []
  } catch (err) {
    console.warn('[privacy] getActiveJurisdictions failed', err)
    return []
  }
}

/**
 * Returns live privacy engine status from GET /api/v1/privacy/status.
 * Public endpoint — no auth required.
 */
export async function getPrivacyStatus(): Promise<PrivacyStatusResult> {
  try {
    const res = await axios.get(`${API_BASE}/api/v1/privacy/status`)
    return res.data
  } catch (err) {
    console.warn('[privacy] getPrivacyStatus failed', err)
    return {
      status:            'unknown',
      active_rules_count: 0,
      jurisdictions:     [],
      last_updated:      null,
      frameworks_enforced: [],
    }
  }
}

/**
 * Format an audit log entry for display.
 */
export function formatAuditEntry(entry: AuditLogEntry): string {
  const ts    = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'unknown time'
  const actor = entry.actor_role ?? 'unknown'
  const data  = entry.data_type  ?? 'unknown'
  return `[${ts}] ${actor.toUpperCase()} performed ${entry.action} on ${data} — ${entry.compliance_status}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side PII redaction (no network)
// ─────────────────────────────────────────────────────────────────────────────

const PII_FIELDS = new Set([
  'email', 'phone', 'ssn', 'socialSecurityNumber', 'password',
  'full_name', 'first_name', 'last_name', 'address', 'dob',
  'date_of_birth', 'ip_address', 'ip',
])

/**
 * Redact PII fields from a plain object (shallow).
 * Nested objects are not traversed — wrap in a recursive call if needed.
 */
export function redactPII(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    out[key] = PII_FIELDS.has(key) ? '***REDACTED***' : value
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Privacy class — kept for backward compat with imports
// ─────────────────────────────────────────────────────────────────────────────

export class Privacy {
  /** Shallow PII redaction. */
  static redactPII(data: Record<string, unknown>): Record<string, unknown> {
    return redactPII(data)
  }

  /**
   * Synchronous stub kept for legacy callers.
   * For real async compliance checks use checkDataCompliance().
   */
  static checkDataCompliance(_data: unknown): boolean {
    return true
  }
}

export default Privacy
