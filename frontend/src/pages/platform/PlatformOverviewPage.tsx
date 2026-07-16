// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart2, Building2, Shield, Activity, TrendingUp, Key, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { platformFetch } from '@/utils/platformFetch';
import { useAuthStore } from '@/stores/auth';

interface Usage {
  period: string;
  total_tokens: number;
  total_cost_usd: number;
  active_orgs: number;
  top_orgs: { org_id: string; name: string; tokens: number; cost_usd: number }[];
}

export default function PlatformOverviewPage() {
  const { t } = useTranslation('landing');
  const { token } = useAuthStore();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<boolean | null>(null); // null = unknown
  const [maintBusy, setMaintBusy] = useState(false);

  useEffect(() => {
    platformFetch('/api/v1/platform/usage?period=month')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setUsage)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    platformFetch('/api/v1/platform/maintenance')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setMaintenance(!!d.enabled))
      .catch(() => setMaintenance(null));
  }, [token]);

  const toggleMaintenance = async () => {
    const target = !maintenance;
    const warning = target
      ? 'Take the site DOWN for maintenance? All users get a 503 + maintenance page. You keep access to /platform.'
      : 'Bring the site back UP?';
    if (!confirm(warning)) return;
    setMaintBusy(true);
    try {
      const res = await platformFetch('/api/v1/platform/maintenance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: target }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setMaintenance(!!d.enabled);
    } catch (e: any) {
      setError(`Maintenance toggle failed: ${e.message}`);
    } finally {
      setMaintBusy(false);
    }
  };

  const fmt = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Page header with logout */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pages_platform_platformoverviewpage.platform_admin', 'Platform Admin')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('pages_platform_platformoverviewpage.superadmin_view_this_monthaposs_activity', 'Super-admin view — this month&apos;s activity')}</p>
        </div>

      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Maintenance mode */}
      <div className={`flex items-center justify-between p-4 rounded-2xl border ${
        maintenance ? 'bg-red-50 border-red-300' : 'bg-white border-gray-100 shadow'
      }`}>
        <div className="flex items-center gap-3">
          <Wrench className={`w-5 h-5 ${maintenance ? 'text-red-600' : 'text-gray-400'}`} />
          <div>
            <p className="text-sm font-semibold text-gray-800">{t('pages_platform_platformoverviewpage.maintenance_mode', 'Maintenance mode')}</p>
            <p className="text-xs text-gray-500">
              {maintenance === null
                ? 'Status unavailable'
                : maintenance
                  ? 'SITE IS DOWN — all users see the maintenance page. /platform stays reachable for you.'
                  : 'Site is up. Enabling returns 503 to everyone except /platform. Auto-expires after 7 days.'}
            </p>
          </div>
        </div>
        <button
          onClick={toggleMaintenance}
          disabled={maintBusy || maintenance === null}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
            maintenance
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {maintBusy ? '…' : maintenance ? 'Bring site back UP' : 'Take site DOWN'}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<Activity className="w-5 h-5 text-blue-600" />} label="Tokens this month"
          value={loading ? '...' : fmt(usage?.total_tokens ?? 0)} color="blue" />
        <StatCard icon={<TrendingUp className="w-5 h-5 text-green-600" />} label="Cost this month"
          value={loading ? '...' : `$${(usage?.total_cost_usd ?? 0).toFixed(2)}`} color="green" />
        <StatCard icon={<Building2 className="w-5 h-5 text-purple-600" />} label="Active orgs"
          value={loading ? '...' : String(usage?.active_orgs ?? 0)} color="purple" />
      </div>

      {/* Top orgs */}
      {usage && (usage.top_orgs ?? []).length > 0 && (
        <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">{t('pages_platform_platformoverviewpage.top_orgs_by_token_usage', 'Top orgs by token usage')}</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-5 py-2 text-left">{t('pages_platform_platformoverviewpage.org', 'Org')}</th>
                <th className="px-5 py-2 text-right">{t('pages_platform_platformoverviewpage.tokens', 'Tokens')}</th>
                <th className="px-5 py-2 text-right">{t('pages_platform_platformoverviewpage.cost', 'Cost')}</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(usage.top_orgs ?? []).map(o => (
                <tr key={o.org_id} className="hover:bg-gray-50">
                  <td className="px-5 py-2 text-gray-800">{o.name || o.org_id}</td>
                  <td className="px-5 py-2 text-right font-mono text-gray-600">{fmt(o.tokens)}</td>
                  <td className="px-5 py-2 text-right font-mono text-gray-600">${o.cost_usd.toFixed(2)}</td>
                  <td className="px-5 py-2 text-right">
                    <Link to={`/platform/orgs/${o.org_id}`} className="text-xs text-blue-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nav links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NavCard to="/platform/orgs"      icon={<Building2 className="w-5 h-5" />} label="All Organisations" />
        <NavCard to="/platform/usage"     icon={<BarChart2 className="w-5 h-5" />} label="Usage Analytics" />
        <NavCard to="/platform/ai-settings" icon={<Key className="w-5 h-5" />}     label="AI Settings" />
        <NavCard to="/platform/audit-log" icon={<Shield className="w-5 h-5" />}    label="Audit Log" />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const bg: Record<string, string> = { blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50' };
  return (
    <div className={`${bg[color]} rounded-2xl p-5 border border-${color}-100`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-gray-500">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function NavCard({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4 bg-white rounded-xl shadow border border-gray-100 hover:border-green-300 hover:bg-green-50 transition text-sm font-medium text-gray-700">
      <span className="text-gray-500">{icon}</span>{label}
    </Link>
  );
}
