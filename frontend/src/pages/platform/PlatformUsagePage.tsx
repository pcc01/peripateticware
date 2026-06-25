// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import React, { useEffect, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';

type Period = 'day' | 'week' | 'month';

interface Usage {
  period: string; since: string;
  total_tokens: number; total_cost_usd: number; active_orgs: number;
  top_orgs: { org_id: string; name: string; tokens: number; cost_usd: number }[];
}

export default function PlatformUsagePage() {
  const { t } = useTranslation('landing');
  const { token } = useAuthStore();
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/platform/usage?period=${period}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [period, token]);

  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
    : String(n);

  const maxTokens = data?.top_orgs?.length ? Math.max(...data.top_orgs.map(o => o.tokens), 1) : 1;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('pages_platform_platformusagepage.usage_analytics', 'Usage Analytics')}</h1>
            <p className="text-sm text-gray-500">{t('pages_platform_platformusagepage.platformwide_ai_token_spend', 'Platform-wide AI token spend')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['day', 'week', 'month'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${period === p ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total tokens', value: loading ? '...' : fmt(data?.total_tokens ?? 0) },
          { label: 'Total cost',   value: loading ? '...' : `$${(data?.total_cost_usd ?? 0).toFixed(2)}` },
          { label: 'Active orgs',  value: loading ? '...' : String(data?.active_orgs ?? 0) },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow p-4">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Top orgs bar chart */}
      {data && (data.top_orgs ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gray-400" />Top organisations
          </h2>
          {data.top_orgs.map(o => (
            <div key={o.org_id} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span className="font-medium truncate max-w-xs">{o.name || o.org_id}</span>
                <span className="font-mono ml-4 flex-shrink-0">{fmt(o.tokens)} &middot; ${o.cost_usd.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-2 bg-green-500 rounded-full"
                  style={{ width: `${Math.max(2, (o.tokens / maxTokens) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
