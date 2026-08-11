// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PlatformOrgDetailPage  —  /platform/orgs/:orgId
 *
 * Full org detail for platform admins: usage, privacy frameworks,
 * suspend/reinstate, and impersonation.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle, RefreshCw, UserCheck, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { platformFetch } from '@/utils/platformFetch';

interface OrgDetail {
  id: string; slug: string; name: string; type: string;
  license_tier: string; license_status: string; contact_email: string | null;
  country_code: string | null; created_at: string;
  max_teachers: number; max_students: number;
  user_count: number; is_suspended: boolean;
  monthly_tokens_used: number; monthly_cost_usd: number;
  privacy_jurisdiction_ids: string[];
  license_valid_until: string | null;
}

// Mirrors TIER_ORDER in backend/services/license_validator.py
const ALL_TIERS = [
  'free', 'trial', 'starter', 'homeschool_family', 'homeschool_coop',
  'school', 'school_byok', 'district', 'district_byok', 'enterprise', 'beta',
];

function expiryLabel(validUntil: string | null): { text: string; tone: 'expired' | 'soon' | 'ok' | 'none' } {
  if (!validUntil) return { text: 'No expiration', tone: 'none' };
  const days = Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86_400_000);
  const date = new Date(validUntil).toLocaleDateString();
  if (days < 0) return { text: `Expired ${date}`, tone: 'expired' };
  if (days <= 14) return { text: `${date} (${days}d left)`, tone: 'soon' };
  return { text: `${date} (${days}d left)`, tone: 'ok' };
}

export default function PlatformOrgDetailPage() {
  const { t } = useTranslation('landing');
  const { orgId }           = useParams<{ orgId: string }>();
  const navigate            = useNavigate();
  const [org, setOrg]       = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tierChoice, setTierChoice] = useState('');
  const [customDays, setCustomDays] = useState('');

  const fetchOrg = async () => {
    setLoading(true);
    try {
      const res = await platformFetch(`/api/v1/platform/orgs/${orgId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOrg(await res.json());
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrg(); }, [orgId]);

  const doAction = async (path: string, successMsg: string) => {
    setActing(true); setMessage(null);
    try {
      const res = await platformFetch(`/api/v1/platform/${path}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage({ type: 'success', text: successMsg });
      await fetchOrg();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setActing(false);
    }
  };

  const doLicenseUpdate = async (
    body: { tier?: string; extend_days?: number; clear_valid_until?: boolean },
    successMsg: string,
  ) => {
    setActing(true); setMessage(null);
    try {
      const res = await platformFetch(`/api/v1/platform/orgs/${orgId}/license`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail?.message || err?.detail || `HTTP ${res.status}`);
      }
      setMessage({ type: 'success', text: successMsg });
      await fetchOrg();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setActing(false);
    }
  };

  const doImpersonate = async () => {
    if (!confirm("Issue a 1-hour impersonation token for this org's owner? This is logged.")) return;
    setActing(true); setMessage(null);
    try {
      const res = await platformFetch(`/api/v1/platform/impersonate/${orgId}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Store impersonation token and redirect
      localStorage.setItem('impersonation_token', data.access_token);
      setMessage({ type: 'success', text: 'Impersonation token issued. Reload app to use it.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setActing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!org) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <p className="text-red-600">{message?.text || 'Organisation not found.'}</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/platform/orgs')} className="text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
          <p className="text-sm text-gray-500">{org.slug} · {org.type}</p>
        </div>
        {org.is_suspended && (
          <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{t('pages_platform_platformorgdetailpage.suspended', 'Suspended')}</span>
        )}
      </div>

      {message && (
        <div className={`flex gap-2 items-center p-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Details grid */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 p-5 grid grid-cols-2 gap-4 text-sm">
        <Detail label="Licence tier"   value={org.license_tier} />
        <Detail label="Status"         value={org.license_status} />
        <Detail label="Contact"        value={org.contact_email || '—'} />
        <Detail label="Country"        value={org.country_code || '—'} />
        <Detail label="Users"          value={String(org.user_count)} />
        <Detail label="Max students"   value={String(org.max_students)} />
        <Detail label="Created"        value={new Date(org.created_at).toLocaleDateString()} />
        <Detail label="Privacy laws"   value={org.privacy_jurisdiction_ids.join(', ') || 'None set'} />
      </div>

      {/* License / trial expiration */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">License</h2>
          {(() => {
            const { text, tone } = expiryLabel(org.license_valid_until);
            const toneClass = tone === 'expired' ? 'text-red-600' : tone === 'soon' ? 'text-amber-600' : 'text-gray-500';
            return <span className={`text-xs font-medium ml-1 ${toneClass}`}>{text}</span>;
          })()}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => doLicenseUpdate({ extend_days: 30 }, 'Extended 30 days.')}
            disabled={acting}
            className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
            +30 days
          </button>
          <button onClick={() => doLicenseUpdate({ extend_days: 60 }, 'Extended 60 days.')}
            disabled={acting}
            className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
            +60 days
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number" placeholder="days" value={customDays}
              onChange={e => setCustomDays(e.target.value)}
              className="w-16 text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={() => { const n = parseInt(customDays, 10); if (!isNaN(n)) doLicenseUpdate({ extend_days: n }, `Adjusted by ${n} days.`); }}
              disabled={acting || !customDays}
              className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
              Apply
            </button>
          </div>
          {org.license_valid_until && (
            <button onClick={() => { if (confirm('Remove this org\'s expiration? Its current tier will never auto-downgrade.')) doLicenseUpdate({ clear_valid_until: true }, 'Expiration cleared.'); }}
              disabled={acting}
              className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
              Clear expiration
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <select value={tierChoice} onChange={e => setTierChoice(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">Change tier to…</option>
            {ALL_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => { if (tierChoice) doLicenseUpdate({ tier: tierChoice }, `Tier changed to ${tierChoice}.`); }}
            disabled={acting || !tierChoice}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition">
            Apply
          </button>
          <p className="text-xs text-gray-400">e.g. move to a paid tier once they've signed a contract, or grant/end 'beta' by hand.</p>
        </div>
      </div>

      {/* Usage */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('pages_platform_platformorgdetailpage.this_months_usage', 'This month\'s usage')}</h2>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-gray-400 text-xs">{t('pages_platform_platformorgdetailpage.tokens', 'Tokens')}</p>
            <p className="text-xl font-bold text-gray-900">{org.monthly_tokens_used.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('pages_platform_platformorgdetailpage.cost', 'Cost')}</p>
            <p className="text-xl font-bold text-gray-900">${org.monthly_cost_usd.toFixed(4)}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('pages_platform_platformorgdetailpage.admin_actions', 'Admin actions')}</h2>
        <div className="flex flex-wrap gap-3">
          {org.is_suspended ? (
            <button onClick={() => doAction(`orgs/${orgId}/reinstate`, 'Organisation reinstated.')}
              disabled={acting}
              className="flex items-center gap-2 text-sm bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50 transition">
              <RefreshCw className="w-4 h-4" />Reinstate
            </button>
          ) : (
            <button onClick={() => {
              if (confirm('Suspend this organisation? All their users will lose access.'))
                doAction(`orgs/${orgId}/suspend`, 'Organisation suspended.');
            }}
              disabled={acting}
              className="flex items-center gap-2 text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition">
              <AlertTriangle className="w-4 h-4" />Suspend
            </button>
          )}
          <button onClick={doImpersonate} disabled={acting}
            className="flex items-center gap-2 text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">
            <UserCheck className="w-4 h-4" />Impersonate owner
          </button>
        </div>
        <p className="text-xs text-gray-400">{t('pages_platform_platformorgdetailpage.all_actions_are_recorded_in_the_audit_lo', 'All actions are recorded in the audit log.')}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-gray-800 font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}
