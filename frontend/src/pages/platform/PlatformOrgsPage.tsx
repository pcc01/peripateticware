// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PlatformOrgsPage  —  /platform/orgs
 *
 * Searchable, paginated table of all organisations.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Building2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { platformFetch } from '@/utils/platformFetch';

interface Org {
  id: string; slug: string; name: string; type: string;
  license_tier: string; license_status: string; contact_email: string | null;
  country_code: string | null; created_at: string;
  user_count: number; is_suspended: boolean;
  license_valid_until: string | null;
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
  beta: 'bg-amber-100 text-amber-800',
};

/** Days-remaining badge for orgs with a license_valid_until (mainly 'beta'). */
function ExpiryBadge({ validUntil }: { validUntil: string | null }) {
  if (!validUntil) return <span className="text-xs text-gray-400">—</span>;
  const days = Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <span className="text-xs text-red-600 font-medium">Expired</span>;
  if (days <= 7) return <span className="text-xs text-red-600 font-medium">{days}d left</span>;
  if (days <= 14) return <span className="text-xs text-amber-600 font-medium">{days}d left</span>;
  return <span className="text-xs text-gray-500">{days}d left</span>;
}

export default function PlatformOrgsPage() {
  const { t } = useTranslation('landing');
  const [searchParams, setSearchParams] = useSearchParams();
  const [orgs, setOrgs]       = useState<Org[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [tierFilter, setTierFilter] = useState(searchParams.get('tier') ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const PER_PAGE = 25;

  const fetchOrgs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
      if (search) params.set('search', search);
      if (tierFilter) params.set('tier', tierFilter);
      const res = await platformFetch(`/api/v1/platform/orgs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} — you may not have platform admin access yet.`);
      const data = await res.json();
      setOrgs(data.orgs);
      setTotal(data.total);
    } catch (e: any) {
      setOrgs([]); setTotal(0);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, tierFilter]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchOrgs(); };
  const handleTierChange = (tier: string) => {
    setTierFilter(tier); setPage(1);
    setSearchParams(tier ? { tier } : {});
  };
  const pages = Math.ceil(total / PER_PAGE);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pages_platform_platformorgspage.organisations', 'Organisations')}</h1>
          <p className="text-sm text-gray-500">{total.toLocaleString()} total{tierFilter ? ` · filtered to "${tierFilter}"` : ''}</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('pages_platform_platformorgspage.placeholder_search_by_name_slug_or_email', 'Search by name, slug, or email…')}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={tierFilter}
          onChange={e => handleTierChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All tiers</option>
          {Object.keys(TIER_COLORS).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="submit" className="bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-800 transition">{t('pages_platform_platformorgspage.search', 'Search')}</button>
      </form>

      {/* Quick filter: beta testers */}
      <div className="flex gap-2">
        <button
          onClick={() => handleTierChange(tierFilter === 'beta' ? '' : 'beta')}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
            tierFilter === 'beta'
              ? 'bg-amber-100 border-amber-300 text-amber-800'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {tierFilter === 'beta' ? '✓ ' : ''}Beta testers only
        </button>
      </div>

      {error && (
        <div className="flex gap-2 items-center p-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin mr-2" />{t('pages_platform_platformorgspage.loading', 'Loading…')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">{t('pages_platform_platformorgspage.name', 'Name')}</th>
                <th className="px-4 py-3 text-left">{t('pages_platform_platformorgspage.tier', 'Tier')}</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">{t('pages_platform_platformorgspage.country', 'Country')}</th>
                <th className="px-4 py-3 text-right">{t('pages_platform_platformorgspage.users', 'Users')}</th>
                <th className="px-4 py-3 text-left">{t('pages_platform_platformorgspage.status', 'Status')}</th>
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
                  <td className="px-4 py-3"><ExpiryBadge validUntil={o.license_valid_until} /></td>
                  <td className="px-4 py-3 text-gray-600">{o.country_code || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.user_count}</td>
                  <td className="px-4 py-3">
                    {o.is_suspended
                      ? <span className="text-xs text-red-600 font-medium">{t('pages_platform_platformorgspage.suspended', 'Suspended')}</span>
                      : <span className="text-xs text-green-700 font-medium">{o.license_status}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/platform/orgs/${o.id}`} className="text-xs text-blue-600 hover:underline">Details</Link>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('pages_platform_platformorgspage.no_organisations_found', 'No organisations found.')}</td></tr>
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
