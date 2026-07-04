// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { platformFetch } from '@/utils/platformFetch';

interface AuditEntry {
  id: string;
  actor_user_id: string;
  action: string;
  target_org_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

interface AuditResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

export default function PlatformAuditLogPage() {
  const { t } = useTranslation('landing');
  const [data, setData] = useState<AuditResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    platformFetch(`/api/v1/platform/audit-log?page=${page}&page_size=25`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/platform" className="text-sm text-gray-400 hover:text-gray-600">← Platform</Link>
        <Shield className="w-5 h-5 text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900">{t('pages_platform_platformauditlogpage.audit_log', 'Audit Log')}</h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Actor</th>
              <th className="px-4 py-3 text-left">Target Org</th>
              <th className="px-4 py-3 text-left">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No audit entries yet.</td></tr>
            )}
            {data?.items.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap font-mono text-xs">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 font-medium text-gray-800">{entry.action}</td>
                <td className="px-4 py-2 text-gray-500 font-mono text-xs">{entry.actor_user_id?.slice(0, 8)}…</td>
                <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                  {entry.target_org_id ? (
                    <Link to={`/platform/orgs/${entry.target_org_id}`} className="text-blue-600 hover:underline">
                      {entry.target_org_id.slice(0, 8)}…
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs font-mono truncate max-w-xs">
                  {JSON.stringify(entry.detail)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages} — {data?.total} entries</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
