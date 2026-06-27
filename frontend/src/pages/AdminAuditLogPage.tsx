import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminAuditLogPage
 *
 * Filterable, paginated view of rule_audit_log with:
 *  - Date range, status, and actor role filters
 *  - Row detail expansion (full rules_applied + enforcement_actions JSON)
 *  - CSV export button
 *  - Summary stats (today's accesses, compliance rate, blocked count)
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '@/config/api'
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 25

type StatusBadge = 'COMPLIANT' | 'WARNING' | 'BLOCKED'

const STATUS_COLORS: Record<StatusBadge, { bg: string; color: string }> = {
  COMPLIANT: { bg: '#d4edda', color: '#155724' },
  WARNING:   { bg: '#fff3cd', color: '#856404' },
  BLOCKED:   { bg: '#fdecea', color: '#721c24' },
}

interface AuditRow {
  id: string
  timestamp: string | null
  action: string
  data_type: string | null
  actor_role: string | null
  compliance_status: string
  student_id_hash: string | null
  actor_id: string | null
  rules_applied: unknown[] | null
  enforcement_actions: Record<string, unknown> | null
  jurisdiction_ids: string[] | null
  notes: string | null
}

export default function AdminAuditLogPage() {
  const { t } = useTranslation('landing');
  const navigate = useNavigate()

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole,   setFilterRole]   = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  // Data
  const [rows,    setRows]    = useState<AuditRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Stats
  const todayCount    = rows.filter(r => r.timestamp && r.timestamp.startsWith(new Date().toISOString().split('T')[0])).length
  const blockedCount  = rows.filter(r => r.compliance_status === 'BLOCKED').length
  const compliantPct  = rows.length ? Math.round((rows.filter(r => r.compliance_status === 'COMPLIANT').length / rows.length) * 100) : 100

  useEffect(() => {
    loadRows()
  }, [page, filterStatus, filterRole, filterFrom, filterTo])

  async function loadRows() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = {
        limit:  PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }
      if (filterStatus) params.compliance_status = filterStatus
      if (filterRole)   params.actor_role = filterRole
      if (filterFrom)   params.from_dt = new Date(filterFrom).toISOString()
      if (filterTo)     params.to_dt   = new Date(filterTo).toISOString()

      const res = await apiClient.get(`/api/v1/privacy/audit-log`, {
        params,
      })
      setRows(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  function resetFilters() {
    setFilterStatus('')
    setFilterRole('')
    setFilterFrom('')
    setFilterTo('')
    setPage(1)
  }

  async function exportCSV() {
    try {
      const params: Record<string, string> = {}
      if (filterStatus) params.compliance_status = filterStatus
      if (filterFrom)   params.from_dt = new Date(filterFrom).toISOString()
      if (filterTo)     params.to_dt   = new Date(filterTo).toISOString()

      const res = await apiClient.get(`/api/v1/privacy/audit-log/export`, {
        params,
        responseType: 'blob',
      })
      const url  = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href  = url
      link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export failed', err)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
        <h1 style={{ margin: 0, color: '#2d4a3e', fontSize: '1.6rem' }}>{t('adminauditlogpage.audit_log', '📋 Audit Log')}</h1>
        <button
          onClick={exportCSV}
          style={{ marginLeft: 'auto', background: '#4a7c59', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Records today',    value: todayCount,       color: '#2d4a3e' },
          { label: 'Compliance rate',  value: `${compliantPct}%`, color: '#2d7d46' },
          { label: 'Blocked events',   value: blockedCount,     color: blockedCount > 0 ? '#c0392b' : '#2d4a3e' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '1rem 1.5rem', boxShadow: '0 2px 6px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)', padding: '1.2rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: '#444' }}>
          Status
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}>
            <option value="">All</option>
            <option value="COMPLIANT">Compliant</option>
            <option value="WARNING">Warning</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: '#444' }}>
          Actor Role
          <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}>
            <option value="">All</option>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
            <option value="admin">Admin</option>
            <option value="system">System</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: '#444' }}>
          From
          <input type="date" aria-label="Filter from date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1) }} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.4rem 0.6rem', fontSize: '0.9rem' }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: '#444' }}>
          To
          <input type="date" aria-label="Filter to date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1) }} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.4rem 0.6rem', fontSize: '0.9rem' }} />
        </label>

        <button
          onClick={resetFilters}
          style={{ background: 'none', border: '1px solid #ccc', borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)', overflow: 'hidden' }}>
        {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading…</div>}
        {error   && <div style={{ padding: '1rem 1.5rem', color: '#c0392b' }}>{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No audit records match your filters.</div>
        )}

        {!loading && rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
                {['Timestamp', 'Action', 'Data Type', 'Role', 'Status', 'Notes', ''].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#444' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const statusStyle = STATUS_COLORS[row.compliance_status as StatusBadge] ?? { bg: '#eee', color: '#333' }
                const isOpen = expanded === row.id
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: isOpen ? '#f9fdf9' : '#fff' }}
                      onClick={() => setExpanded(isOpen ? null : row.id)}
                    >
                      <td style={{ padding: '0.7rem 1rem', color: '#555', whiteSpace: 'nowrap' }}>
                        {row.timestamp ? fmtDateTime(row.timestamp) : '—'}
                      </td>
                      <td style={{ padding: '0.7rem 1rem', fontWeight: 500 }}>{row.action}</td>
                      <td style={{ padding: '0.7rem 1rem', color: '#666' }}>{row.data_type || '—'}</td>
                      <td style={{ padding: '0.7rem 1rem', color: '#666' }}>{row.actor_role || '—'}</td>
                      <td style={{ padding: '0.7rem 1rem' }}>
                        <span style={{ background: statusStyle.bg, color: statusStyle.color, borderRadius: 5, padding: '0.15rem 0.5rem', fontSize: '0.78rem', fontWeight: 600 }}>
                          {row.compliance_status}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', color: '#888', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes || '—'}</td>
                      <td style={{ padding: '0.7rem 0.5rem', color: '#aaa' }}>{isOpen ? '▲' : '▼'}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: '#f4f9f4', borderBottom: '1px solid #e0e0e0' }}>
                        <td colSpan={7} style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                              <strong style={{ fontSize: '0.85rem' }}>Event ID:</strong>
                              <code style={{ display: 'block', fontSize: '0.8rem', color: '#555', marginTop: '0.2rem' }}>{row.id}</code>
                              {row.student_id_hash && (
                                <>
                                  <strong style={{ fontSize: '0.85rem' }}>Student Hash:</strong>
                                  <code style={{ display: 'block', fontSize: '0.8rem', color: '#555', marginTop: '0.2rem' }}>{row.student_id_hash.slice(0, 16)}…</code>
                                </>
                              )}
                              {row.jurisdiction_ids && row.jurisdiction_ids.length > 0 && (
                                <div style={{ marginTop: '0.5rem' }}>
                                  <strong style={{ fontSize: '0.85rem' }}>Jurisdictions:</strong>
                                  <span style={{ fontSize: '0.85rem', color: '#444', marginLeft: '0.4rem' }}>{row.jurisdiction_ids.join(', ')}</span>
                                </div>
                              )}
                            </div>
                            <div>
                              {row.rules_applied && (row.rules_applied as any[]).length > 0 && (
                                <>
                                  <strong style={{ fontSize: '0.85rem' }}>Rules Applied:</strong>
                                  <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.6rem', borderRadius: 6, fontSize: '0.78rem', marginTop: '0.2rem', overflow: 'auto' }}>
                                    {JSON.stringify(row.rules_applied, null, 2)}
                                  </pre>
                                </>
                              )}
                              {row.enforcement_actions && Object.keys(row.enforcement_actions).length > 0 && (
                                <>
                                  <strong style={{ fontSize: '0.85rem' }}>Enforcement Actions:</strong>
                                  <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.6rem', borderRadius: 6, fontSize: '0.78rem', marginTop: '0.2rem', overflow: 'auto' }}>
                                    {JSON.stringify(row.enforcement_actions, null, 2)}
                                  </pre>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && total > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.8rem', padding: '1rem', borderTop: '1px solid #f0f0f0' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>‹ Prev</button>
            <span style={{ fontSize: '0.88rem', color: '#555' }}>Page {page} of {totalPages} ({total} records)</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  )
}
