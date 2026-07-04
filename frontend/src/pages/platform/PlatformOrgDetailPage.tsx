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
import { ArrowLeft, AlertTriangle, CheckCircle, RefreshCw, UserCheck } from 'lucide-react';
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
}

export default function PlatformOrgDetailPage() {
  const { t } = useTranslation('landing');
  const { orgId }           = useParams<{ orgId: string }>();
  const navigate            = useNavigate();
  const [org, setOrg]       = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
          <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Suspended</span>
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
