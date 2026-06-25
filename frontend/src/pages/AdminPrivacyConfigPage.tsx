import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminPrivacyConfigPage
 *
 * Lets administrators:
 *  - View all active jurisdictions and rule versions
 *  - Expand a rule's full JSON definition
 *  - Upload / paste a new JSON config and POST to /api/v1/privacy/rules
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '@/config/api'
import { useTranslation } from 'react-i18next';

interface JurisdictionRow {
  rule_id: string
  regulation_id: string
  version: string
  jurisdiction: string
  effective_date: string | null
  framework: string | null
  created_at: string | null
}

interface RuleDetail extends JurisdictionRow {
  rule_definition: Record<string, unknown>
  change_log: string | null
  audit_hash: string | null
  version_history: Array<{ rule_id: string; version: string; created_at: string | null; change_log: string | null }>
}

const EMPTY_RULE = `{
  "framework": "ferpa",
  "jurisdiction_name": "New Jurisdiction",
  "country_code": "US",
  "max_retention_days": 365,
  "encryption_required": true,
  "encryption_algorithm": "AES-256",
  "student_data_sharing_allowed": false,
  "student_monitoring_allowed": false,
  "student_profiling_allowed": false,
  "student_targeting_allowed": false,
  "version": "1.0"
}`

export default function AdminPrivacyConfigPage() {
  const { t } = useTranslation('landing');
  const navigate = useNavigate()
  const [jurisdictions, setJurisdictions] = useState<JurisdictionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ruleDetail, setRuleDetail] = useState<RuleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  // Add form state
  // rule_id must be a valid UUID (the DB column is UUID PRIMARY KEY).
  // Auto-generate one so the user doesn't have to type a UUID manually.
  const genUUID = () => crypto.randomUUID()
  const [newRuleId, setNewRuleId]         = useState(() => genUUID())
  const [newRegId, setNewRegId]           = useState('')
  const [newVersion, setNewVersion]       = useState('1.0')
  const [newJurisdiction, setNewJurisdiction] = useState('')
  const [newEffDate, setNewEffDate]       = useState(new Date().toISOString().split('T')[0])
  const [newJson, setNewJson]             = useState(EMPTY_RULE)
  const [newChangeLog, setNewChangeLog]   = useState('')
  const [frameworkStatus, setFrameworkStatus] = useState<Record<string, boolean>>({})
  const [frameworkSaving, setFrameworkSaving] = useState<string | null>(null)

  const KNOWN_FRAMEWORKS = [
    { id: 'ferpa', label: 'FERPA', region: 'US Schools', color: '#1d4ed8', bg: '#dbeafe',
      desc: 'Family Educational Rights and Privacy Act — student record privacy.' },
    { id: 'coppa', label: 'COPPA', region: 'US (Under 13)', color: '#7c3aed', bg: '#ede9fe',
      desc: "Children's Online Privacy Protection Act — parental consent for under-13s." },
    { id: 'ccpa', label: 'CCPA', region: 'California', color: '#b45309', bg: '#fef3c7',
      desc: 'California Consumer Privacy Act — data rights for CA residents.' },
    { id: 'gdpr', label: 'GDPR', region: 'European Union', color: '#065f46', bg: '#d1fae5',
      desc: 'General Data Protection Regulation — comprehensive EU data protection.' },
  ]

  async function loadFrameworkStatus() {
    try {
      const res = await apiClient.get(`/api/v1/privacy/status`)
      const active: string[] = (res.data?.frameworks_enforced || []).map((f: string) => f.toLowerCase())
      const status: Record<string, boolean> = {}
      KNOWN_FRAMEWORKS.forEach(f => { status[f.id] = active.includes(f.id) })
      setFrameworkStatus(status)
    } catch { /* non-fatal */ }
  }

  async function toggleFramework(frameworkId: string, currentlyActive: boolean) {
    setFrameworkSaving(frameworkId)
    try {
      if (currentlyActive) {
        // Deactivate: set is_active=false on all rules for this framework
        await apiClient.patch(`/api/v1/privacy/rules/framework/${frameworkId}/deactivate`, {})
      } else {
        // Activate: POST seed rule if none exist, or re-activate
        await apiClient.patch(`/api/v1/privacy/rules/framework/${frameworkId}/activate`, {})
      }
      await loadFrameworkStatus()
      await loadJurisdictions()
    } catch (err: any) {
      console.error('Failed to toggle framework', err)
    } finally {
      setFrameworkSaving(null)
    }
  }

  useEffect(() => {
    loadJurisdictions()
    loadFrameworkStatus()
  }, [])

  async function loadJurisdictions() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get(`/api/v1/privacy/jurisdictions`)
      setJurisdictions(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load jurisdictions')
    } finally {
      setLoading(false)
    }
  }

  async function loadRuleDetail(ruleId: string) {
    setDetailLoading(true)
    setRuleDetail(null)
    try {
      const res = await apiClient.get(`/api/v1/privacy/rules/${ruleId}`)
      setRuleDetail(res.data)
    } catch (err: any) {
      console.error('Failed to load rule detail', err)
    } finally {
      setDetailLoading(false)
    }
  }

  function downloadJson() {
    // Export the current privacy configuration (frameworks + jurisdictions) as JSON.
    const payload = {
      exported_at: new Date().toISOString(),
      frameworks_enforced: Object.entries(frameworkStatus)
        .filter(([, on]) => on)
        .map(([id]) => id),
      framework_status: frameworkStatus,
      jurisdictions,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `privacy-config-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function toggleExpand(ruleId: string) {
    if (expanded === ruleId) {
      setExpanded(null)
      setRuleDetail(null)
    } else {
      setExpanded(ruleId)
      loadRuleDetail(ruleId)
    }
  }

  async function submitNewRule(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddSuccess(null)
    setAddLoading(true)

    try {
      const parsed = JSON.parse(newJson)
      await apiClient.post(
        `/api/v1/privacy/rules`,
        {
          rule_id:        newRuleId,
          regulation_id:  newRegId,
          version:        newVersion,
          jurisdiction:   newJurisdiction,
          effective_date: new Date(newEffDate).toISOString(),
          rule_definition: parsed,
          change_log:     newChangeLog || null,
        }
      )
      setAddSuccess(`Rule created successfully`)
      setShowAddForm(false)
      setNewRuleId(genUUID())   // fresh UUID ready for next rule
      loadJurisdictions()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setAddError(detail)
      } else if (Array.isArray(detail)) {
        setAddError(detail.map((d: any) => d.msg || JSON.stringify(d)).join('; '))
      } else {
        setAddError('Failed to save rule. Check JSON is valid.')
      }
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2', padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => navigate('/admin')}
          style={{ background: 'none', border: '1px solid #ccc', borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, color: '#2d4a3e', fontSize: '1.6rem' }}>{t('adminprivacyconfigpage.privacy_configuration', '🔒 Privacy Configuration')}</h1>
        <button
          onClick={downloadJson}
          style={{ marginLeft: 'auto', background: '#2d4a3e', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
        >
          ⬇ Download as JSON
        </button>
      </div>

      {addSuccess && (
        <div style={{ background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: 8, padding: '0.8rem 1.2rem', marginBottom: '1rem', color: '#155724' }}>
          ✅ {addSuccess}
        </div>
      )}

      {/* Quick Framework Setup */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 4px', color: '#2d4a3e', fontSize: '1.1rem' }}>{t('pages_adminprivacyconfigpage.compliance_frameworks', 'Compliance Frameworks')}</h2>
        <p style={{ margin: '0 0 1.2rem', color: '#666', fontSize: '0.85rem' }}>{t('pages_adminprivacyconfigpage.toggle_which_privacy_frameworks_are_acti', 'Toggle which privacy frameworks are actively enforced. Pre-seeded on first boot — enable the ones applicable to your jurisdiction.')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {KNOWN_FRAMEWORKS.map(fw => {
            const active = frameworkStatus[fw.id] ?? false
            const saving = frameworkSaving === fw.id
            return (
              <div key={fw.id} style={{
                border: `2px solid ${active ? fw.color : '#e5e7eb'}`,
                borderRadius: 10, padding: '14px 16px',
                background: active ? fw.bg : '#fafafa',
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontWeight: 800, fontSize: '0.9rem', color: active ? fw.color : '#6b7280',
                      background: active ? 'white' : '#e5e7eb',
                      padding: '2px 8px', borderRadius: 6,
                    }}>{fw.label}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fw.region}</span>
                  </div>
                  <button
                    onClick={() => toggleFramework(fw.id, active)}
                    disabled={saving}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700,
                      border: 'none', cursor: saving ? 'wait' : 'pointer',
                      background: active ? fw.color : '#e5e7eb',
                      color: active ? 'white' : '#374151',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? '…' : active ? '✓ On' : 'Off'}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.4 }}>{fw.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active Jurisdictions */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#2d4a3e', fontSize: '1.1rem' }}>{t('adminprivacyconfigpage.active_jurisdictions', 'Active Jurisdictions')}</h2>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setAddError(null); setAddSuccess(null) }}
            style={{ background: '#4a7c59', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            + Add Jurisdiction
          </button>
        </div>

        {loading && <p style={{ color: '#888' }}>{t('adminprivacyconfigpage.loading', 'Loading…')}</p>}
        {error && <p style={{ color: '#c0392b' }}>{error}</p>}

        {!loading && !error && jurisdictions.length === 0 && (
          <p style={{ color: '#888' }}>{t('adminprivacyconfigpage.no_active_jurisdictions_found_run_the_se', 'No active jurisdictions found. Run the seed migration to add defaults.')}</p>
        )}

        {!loading && jurisdictions.map(j => (
          <div key={j.rule_id} style={{ border: '1px solid #e8e4dc', borderRadius: 8, marginBottom: '0.8rem', overflow: 'hidden' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1rem', cursor: 'pointer', background: expanded === j.rule_id ? '#f0f7f4' : '#fff' }}
              onClick={() => toggleExpand(j.rule_id)}
            >
              <div>
                <strong style={{ color: '#2d4a3e' }}>{j.jurisdiction}</strong>
                <span style={{ marginLeft: '0.8rem', fontSize: '0.85rem', color: '#666' }}>{j.regulation_id}</span>
                <span style={{ marginLeft: '0.5rem', background: '#e8f4ea', color: '#2d7d46', borderRadius: 4, padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}>v{j.version}</span>
                {j.framework && <span style={{ marginLeft: '0.5rem', background: '#eef', color: '#446', borderRadius: 4, padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}>{j.framework.toUpperCase()}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {j.created_at && <span style={{ fontSize: '0.8rem', color: '#999' }}>Updated {fmtDate(j.created_at)}</span>}
                <span style={{ color: '#888' }}>{expanded === j.rule_id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expanded === j.rule_id && (
              <div style={{ padding: '1rem', background: '#f9f9f9', borderTop: '1px solid #e8e4dc' }}>
                {detailLoading && <p style={{ color: '#888' }}>{t('adminprivacyconfigpage.loading_rule_details', 'Loading rule details…')}</p>}
                {ruleDetail && ruleDetail.rule_id === j.rule_id && (
                  <>
                    <div style={{ marginBottom: '0.8rem' }}>
                      <strong>Rule ID:</strong> <code style={{ fontSize: '0.85rem', background: '#eee', padding: '0.1rem 0.3rem', borderRadius: 3 }}>{ruleDetail.rule_id}</code>
                    </div>
                    {ruleDetail.audit_hash && (
                      <div style={{ marginBottom: '0.8rem', fontSize: '0.8rem', color: '#666' }}>
                        <strong>Audit Hash:</strong> {ruleDetail.audit_hash.slice(0, 16)}…
                      </div>
                    )}
                    <div style={{ marginBottom: '0.8rem' }}>
                      <strong>Rule Definition (JSON):</strong>
                      <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '1rem', borderRadius: 8, overflowX: 'auto', fontSize: '0.82rem', marginTop: '0.5rem' }}>
                        {JSON.stringify(ruleDetail.rule_definition, null, 2)}
                      </pre>
                    </div>
                    {ruleDetail.version_history.length > 0 && (
                      <div>
                        <strong>Version History:</strong>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ background: '#eee' }}>
                              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Rule ID</th>
                              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Version</th>
                              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Created</th>
                              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Change Log</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ruleDetail.version_history.map(h => (
                              <tr key={h.rule_id} style={{ borderBottom: '1px solid #ddd' }}>
                                <td style={{ padding: '0.4rem 0.6rem' }}><code>{h.rule_id}</code></td>
                                <td style={{ padding: '0.4rem 0.6rem' }}>v{h.version}</td>
                                <td style={{ padding: '0.4rem 0.6rem' }}>{h.created_at ? fmtDate(h.created_at) : '—'}</td>
                                <td style={{ padding: '0.4rem 0.6rem' }}>{h.change_log || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Jurisdiction Form */}
      {showAddForm && (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)', padding: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1rem', color: '#2d4a3e', fontSize: '1.1rem' }}>{t('adminprivacyconfigpage.add_update_jurisdiction', 'Add / Update Jurisdiction')}</h2>
          {addError && <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 8, padding: '0.8rem 1.2rem', marginBottom: '1rem', color: '#721c24' }}>❌ {addError}</div>}

          <form onSubmit={submitNewRule}>
            {/* Rule ID — auto-generated UUID (required by DB schema) */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', color: '#444' }}>
                Rule ID (auto-generated UUID)
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    readOnly
                    value={newRuleId}
                    style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 0.7rem', fontSize: '0.85rem', fontFamily: 'monospace', background: '#f9f9f9', color: '#555' }}
                  />
                  <button
                    type="button"
                    onClick={() => setNewRuleId(genUUID())}
                    title="Generate a new UUID"
                    style={{ padding: '0.5rem 0.8rem', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: '1rem' }}
                  >↻</button>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  Unique identifier stored in the database — generated automatically.
                </span>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              {[
                ['Regulation ID', newRegId, setNewRegId, 'e.g. FERPA-1974-US-FEDERAL'],
                ['Version', newVersion, setNewVersion, 'e.g. 2.2'],
                ['Jurisdiction', newJurisdiction, setNewJurisdiction, 'e.g. US_FEDERAL'],
              ].map(([label, value, setter, placeholder]) => (
                <label key={String(label)} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', color: '#444' }}>
                  {String(label)} *
                  <input
                    required
                    value={String(value)}
                    onChange={e => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                    placeholder={String(placeholder)}
                    style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 0.7rem', fontSize: '0.9rem' }}
                  />
                </label>
              ))}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', color: '#444', marginBottom: '1rem' }}>
              Effective Date *
              <input
                type="date"
                required
                value={newEffDate}
                onChange={e => setNewEffDate(e.target.value)}
                style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 0.7rem', fontSize: '0.9rem', width: '200px' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', color: '#444', marginBottom: '1rem' }}>
              Rule Definition JSON *
              <textarea
                required
                rows={14}
                value={newJson}
                onChange={e => setNewJson(e.target.value)}
                style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 0.7rem', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', color: '#444', marginBottom: '1.5rem' }}>
              Change Log (optional)
              <input
                value={newChangeLog}
                onChange={e => setNewChangeLog(e.target.value)}
                placeholder="What changed in this version?"
                style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 0.7rem', fontSize: '0.9rem' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                disabled={addLoading}
                style={{ background: '#4a7c59', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.4rem', cursor: addLoading ? 'not-allowed' : 'pointer', opacity: addLoading ? 0.7 : 1 }}
              >
                {addLoading ? 'Saving…' : 'Save Rule'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                style={{ background: 'none', border: '1px solid #ccc', borderRadius: 8, padding: '0.6rem 1.4rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
