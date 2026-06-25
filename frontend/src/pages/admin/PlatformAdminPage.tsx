/**
 * PlatformAdminPage — Peripateticware SaaS super-admin console
 *
 * Access: is_platform_admin = true (set on admin@example.com at startup)
 * Route:  /platform  (wrapped in PlatformAdminRoute in App.tsx)
 *
 * Tabs:
 *   Organizations — all orgs with spend, tier, BYOK, management actions
 *   Spend         — platform-wide spend summary and 6-month trend
 *   Audit Log     — paginated log of all platform admin actions
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, logout } from '../../services/auth'
import { useTranslation } from 'react-i18next';

// ── API helpers ───────────────────────────────────────────────────────────────

const API = '/api/v1/platform'

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Org {
  id: string
  name: string
  slug: string
  type: string
  license_tier: string
  license_status: string
  contact_email: string
  created_at: string | null
  teachers: number
  students: number
  homeschool: number
  spend_this_month: number
  monthly_cap: number
  spend_pct: number
  has_byok_key: boolean
}

interface SpendData {
  this_month: { total_usd: number; platform_usd: number; byok_usd: number; byok_pct: number }
  by_tier: { tier: string; cost_usd: number; org_count: number }[]
  six_month_trend: { month: string; total_usd: number; active_orgs: number }[]
  top_tasks: { task_type: string; cost_usd: number; calls: number }[]
}

interface AuditEntry {
  id: string
  action: string
  actor_email: string
  target_org_id: string | null
  target_org_name: string | null
  metadata: Record<string, unknown>
  created_at: string
}

interface AuditLog {
  total: number
  items: AuditEntry[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIERS = [
  'free', 'trial', 'starter',
  'homeschool_family', 'homeschool_coop',
  'school', 'school_byok',
  'district', 'district_byok',
  'enterprise',
]

const TIER_COLORS: Record<string, string> = {
  free: '#6b7280',
  trial: '#8b5cf6',
  starter: '#3b82f6',
  homeschool_family: '#10b981',
  homeschool_coop: '#059669',
  school: '#f59e0b',
  school_byok: '#d97706',
  district: '#ef4444',
  district_byok: '#dc2626',
  enterprise: '#1d4ed8',
}

// ── Shared mini-components ─────────────────────────────────────────────────────

const Badge: React.FC<{ label: string; color?: string }> = ({ label, color = '#6b7280' }) => (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    background: color + '22',
    color,
    border: `1px solid ${color}44`,
  }}>
    {label}
  </span>
)

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; accent?: string }> = ({
  label, value, sub, accent = 'var(--primary, #4f46e5)',
}) => (
  <div style={{
    background: 'var(--surface, #fff)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 10,
    padding: '18px 22px',
    flex: 1,
    minWidth: 140,
  }}>
    <div style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: accent }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>{sub}</div>}
  </div>
)

const SpendBar: React.FC<{ pct: number }> = ({ pct }) => {
  const clamped = Math.min(pct, 100)
  const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{ width: `${clamped}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, minWidth: 34 }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── Organizations tab ─────────────────────────────────────────────────────────

const OrgsTab: React.FC = () => {
  const { t } = useTranslation('landing');
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [editOrg, setEditOrg] = useState<Org | null>(null)
  const [editTier, setEditTier] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editReason, setEditReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch('/orgs')
      setOrgs(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load orgs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = orgs.filter(o => {
    const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.contact_email?.toLowerCase().includes(search.toLowerCase())
    const matchTier = !tierFilter || o.license_tier === tierFilter
    return matchSearch && matchTier
  })

  const handleSave = async () => {
    if (!editOrg || !editReason.trim()) return
    setSaving(true)
    setSaveMsg('')
    try {
      await apiFetch(`/orgs/${editOrg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          license_tier: editTier || undefined,
          license_status: editStatus || undefined,
          reason: editReason,
        }),
      })
      setSaveMsg('Saved')
      await load()
      setTimeout(() => { setEditOrg(null); setSaveMsg('') }, 800)
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const totalUsers = orgs.reduce((s, o) => s + o.teachers + o.students + o.homeschool, 0)
  const totalSpend = orgs.reduce((s, o) => s + o.spend_this_month, 0)

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Organizations" value={orgs.length} />
        <StatCard label="Total users" value={totalUsers.toLocaleString()} />
        <StatCard label="Spend this month" value={`$${totalSpend.toFixed(2)}`} accent="#10b981" />
        <StatCard label="BYOK orgs" value={orgs.filter(o => o.has_byok_key).length} sub="using own API key" accent="#8b5cf6" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email…"
          style={{
            flex: 1, padding: '7px 12px', borderRadius: 6,
            border: '1px solid var(--border, #e5e7eb)',
            background: 'var(--surface, #fff)',
            color: 'var(--text, #111)',
            fontSize: 13,
          }}
        />
        <select
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
          style={{
            padding: '7px 10px', borderRadius: 6,
            border: '1px solid var(--border, #e5e7eb)',
            background: 'var(--surface, #fff)',
            color: 'var(--text, #111)',
            fontSize: 13,
          }}
        >
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={load}
          style={{
            padding: '7px 14px', borderRadius: 6, border: 'none',
            background: 'var(--primary, #4f46e5)', color: '#fff',
            cursor: 'pointer', fontSize: 13,
          }}
        >↻ Refresh</button>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading…</div>}
      {error && <div style={{ color: '#ef4444', padding: 10 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border, #e5e7eb)', textAlign: 'left' }}>
                {['Organization', 'Tier', 'Status', 'Users', 'Spend / Cap', 'BYOK', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>No organizations found</td></tr>
              )}
              {filtered.map(org => (
                <tr key={org.id} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{org.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{org.contact_email}</div>
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <Badge label={org.license_tier} color={TIER_COLORS[org.license_tier] ?? '#6b7280'} />
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <Badge
                      label={org.license_status}
                      color={org.license_status === 'active' ? '#10b981' : org.license_status === 'suspended' ? '#ef4444' : '#f59e0b'}
                    />
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ fontSize: 12 }}>
                      <span title="Teachers">👩‍🏫 {org.teachers}</span>
                      {'  '}
                      <span title="Students">🎒 {org.students}</span>
                      {org.homeschool > 0 && <><br /><span title="Homeschool">🏠 {org.homeschool}</span></>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 10px', minWidth: 130 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      ${org.spend_this_month.toFixed(3)} / ${org.monthly_cap.toFixed(0)}
                    </div>
                    <SpendBar pct={org.spend_pct} />
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    {org.has_byok_key ? <Badge label="BYOK" color="#8b5cf6" /> : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 10px', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <button
                      onClick={() => { setEditOrg(org); setEditTier(org.license_tier); setEditStatus(org.license_status); setEditReason('') }}
                      style={{
                        padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 12,
                      }}
                    >Manage</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editOrg && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 12, padding: 28,
            width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Manage: {editOrg.name}</h3>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('pages_admin_platformadminpage.tier', 'Tier')}</label>
            <select
              value={editTier}
              onChange={e => setEditTier(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginBottom: 12 }}
            >
              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('pages_admin_platformadminpage.status', 'Status')}</label>
            <select
              value={editStatus}
              onChange={e => setEditStatus(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginBottom: 12 }}
            >
              {['active', 'trial', 'suspended', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('pages_admin_platformadminpage.reason_required_for_audit_log', 'Reason (required for audit log)')}</label>
            <input
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="e.g. Upgraded to school plan per invoice #123"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', marginBottom: 16, boxSizing: 'border-box' }}
            />

            {saveMsg && (
              <div style={{ fontSize: 13, color: saveMsg === 'Saved' ? '#10b981' : '#ef4444', marginBottom: 10 }}>
                {saveMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditOrg(null)}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !editReason.trim()}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: editReason.trim() ? 'var(--primary, #4f46e5)' : '#9ca3af',
                  color: '#fff', cursor: editReason.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                }}
              >{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Spend tab ─────────────────────────────────────────────────────────────────

const SpendTab: React.FC = () => {
  const { t } = useTranslation('landing');
  const [data, setData] = useState<SpendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/spend')
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading…</div>
  if (error) return <div style={{ color: '#ef4444', padding: 10 }}>{error}</div>
  if (!data) return null

  const m = data.this_month

  return (
    <div>
      {/* This month summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total this month" value={`$${m.total_usd.toFixed(4)}`} accent="#4f46e5" />
        <StatCard label="Platform cost" value={`$${m.platform_usd.toFixed(4)}`} sub="billed to Anthropic account" />
        <StatCard label="BYOK cost" value={`$${m.byok_usd.toFixed(4)}`} sub="billed to orgs' own accounts" accent="#8b5cf6" />
        <StatCard label="BYOK share" value={`${m.byok_pct.toFixed(1)}%`} sub="of total spend" accent="#10b981" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* By tier */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>{t('pages_admin_platformadminpage.spend_by_tier_this_month', 'Spend by tier (this month)')}</h3>
          {data.by_tier.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('pages_admin_platformadminpage.no_spend_recorded_yet', 'No spend recorded yet.')}</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Tier</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Orgs</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_tier.map(r => (
                    <tr key={r.tier} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                      <td style={{ padding: '7px 8px' }}><Badge label={r.tier} color={TIER_COLORS[r.tier] ?? '#6b7280'} /></td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{r.org_count}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace' }}>${r.cost_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>

        {/* Top tasks */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>{t('pages_admin_platformadminpage.top_tasks_this_month', 'Top tasks (this month)')}</h3>
          {data.top_tasks.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('pages_admin_platformadminpage.no_task_data_yet', 'No task data yet.')}</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Task</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Calls</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_tasks.map(r => (
                    <tr key={r.task_type} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                      <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 12 }}>{r.task_type}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{r.calls.toLocaleString()}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace' }}>${r.cost_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>

      {/* 6-month trend */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>{t('pages_admin_platformadminpage.6month_trend', '6-month trend')}</h3>
        {data.six_month_trend.length === 0
          ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('pages_admin_platformadminpage.no_historical_data_yet', 'No historical data yet.')}</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Month</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Active orgs</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Total spend</th>
                </tr>
              </thead>
              <tbody>
                {data.six_month_trend.map(r => (
                  <tr key={r.month} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 500 }}>{r.month}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{r.active_orgs}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace' }}>${r.total_usd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{t('pages_admin_platformadminpage.all_figures_are_product_signals_byok_spe', 'All figures are product signals. BYOK spend is logged for analytics but billed to the org\'s own Anthropic account.')}</p>
      </div>
    </div>
  )
}

// ── Audit log tab ─────────────────────────────────────────────────────────────

const AuditTab: React.FC = () => {
  const [log, setLog] = useState<AuditLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const LIMIT = 25

  const load = useCallback(async (off: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(`/audit-log?limit=${LIMIT}&offset=${off}`)
      setLog(data)
      setOffset(off)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(0) }, [load])

  const ACTION_COLORS: Record<string, string> = {
    org_suspended: '#ef4444',
    org_tier_changed: '#f59e0b',
    org_cap_updated: '#3b82f6',
  }

  return (
    <div>
      {loading && <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading…</div>}
      {error && <div style={{ color: '#ef4444', padding: 10 }}>{error}</div>}

      {!loading && log && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            {log.total} total entries
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border, #e5e7eb)', textAlign: 'left' }}>
                {['Time', 'Actor', 'Action', 'Organization', 'Details'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.items.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>No audit entries yet</td></tr>
              )}
              {log.items.map(entry => (
                <tr key={entry.id} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                  <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: 12 }}>{entry.actor_email}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <Badge label={entry.action} color={ACTION_COLORS[entry.action] ?? '#6b7280'} />
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: 12 }}>
                    {entry.target_org_name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.metadata?.reason as string ?? JSON.stringify(entry.metadata?.changes ?? {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - LIMIT))}
              style={{
                padding: '6px 12px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)',
                cursor: offset === 0 ? 'not-allowed' : 'pointer', opacity: offset === 0 ? 0.5 : 1,
              }}
            >← Prev</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {offset + 1}–{Math.min(offset + LIMIT, log.total)} of {log.total}
            </span>
            <button
              disabled={offset + LIMIT >= log.total}
              onClick={() => load(offset + LIMIT)}
              style={{
                padding: '6px 12px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)',
                cursor: offset + LIMIT >= log.total ? 'not-allowed' : 'pointer',
                opacity: offset + LIMIT >= log.total ? 0.5 : 1,
              }}
            >Next →</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'orgs' | 'spend' | 'audit'

const PlatformAdminPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('orgs')
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'orgs',  label: '🏢 Organizations' },
    { id: 'spend', label: '💰 Spend' },
    { id: 'audit', label: '📋 Audit Log' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #f9fafb)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        color: '#fff',
        padding: '0 24px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 }}>
                Peripateticware
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>⚙ Platform Admin</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>admin@example.com</span>
              <button
                onClick={() => navigate('/admin')}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                  background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12,
                }}
              >Org Admin</button>
              <button
                onClick={handleLogout}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                  background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12,
                }}
              >Sign out</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  borderBottom: tab === t.id ? '3px solid #a5b4fc' : '3px solid transparent',
                  background: 'transparent',
                  color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: tab === t.id ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {tab === 'orgs'  && <OrgsTab />}
        {tab === 'spend' && <SpendTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}

export default PlatformAdminPage
