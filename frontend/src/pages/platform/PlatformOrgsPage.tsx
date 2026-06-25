// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PlatformOrgsPage  —  /platform/orgs
 *
 * Searchable, paginated table of all organisations.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Org {
  id: string; slug: string; name: string; type: string;
  license_tier: string; license_status: string; contact_email: string | null;
  country_code: string | null; created_at: string;
  user_count: number; is_suspended: boolean;
}

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  trial: 'bg-yellow-100 text-yellow-800',
  starter: 'bg-blue-100 text-blue-800',
  school: 'bg-green-100 text-green-800',
  school_byok: 'bg-green-200 text-green-900',
  district: 'bg-purple-100 text-purple-800',
  district_byok: 'bg-purple-200 text-purple-900',
  enterprise: 'bg-indigo-100 text-indigo-800',
};

export default function PlatformOrgsPage() {
  const { t } = useTranslation('landing');
  const [orgs, setOrgs]       = useState<Org[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);

  const PER_PAGE = 25;

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
      if (search) params.set('search', search);
      const res = await fetch(`/api/v1/platform/orgs?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOrgs(data.orgs);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchOrgs(); };
  const pages = Math.ceil(total / PER_PAGE);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pages_platform_platformorgspage.organisations', 'Organisations')}</h1>
          <p className="text-sm text-gray-500">{total.toLocaleString()} total</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, slug, or email…"
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button type="submit" className="bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-800 transition">
          Search
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin mr-2" />Loading…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Tier</th>
                <th className="px-4 py-3 text-left">Country</th>
                <th className="px-4 py-3 text-right">Users</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orgs.map(o => (
                <tr key={o.id} className={`hover:bg-gray-50 ${o.is_suspended ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{o.name}</div>
                    <div className="text-xs text-gray-400">{o.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[o.license_tier] ?? 'bg-gray-100 text-gray-600'}`}>
                      {o.license_tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.country_code || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.user_count}</td>
                  <td className="px-4 py-3">
                    {o.is_suspended
                      ? <span className="text-xs text-red-600 font-medium">Suspended</span>
                      : <span className="text-xs text-green-700 font-medium">{o.license_status}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/platform/orgs/${o.id}`} className="text-xs text-blue-600 hover:underline">Details</Link>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No organisations found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
