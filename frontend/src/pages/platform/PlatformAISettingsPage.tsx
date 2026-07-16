// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PlatformAISettingsPage  —  /platform/ai-settings
 *
 * Manage the platform-level Anthropic API key (used for all SaaS orgs)
 * and view which orgs have BYOK enabled.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Key, Eye, EyeOff, Save, Trash2, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { platformFetch } from '@/utils/platformFetch';

interface PlatformKey {
  provider: string;
  key_preview: string | null;
  has_key: boolean;
}

interface OrgRow {
  id: string;
  name: string;
  license_tier: string;
  byok_enabled: boolean;
}

const BYOK_TIERS = ['school_byok', 'district_byok', 'enterprise'];

export default function PlatformAISettingsPage() {
  const { t } = useTranslation('landing');
  const [keys, setKeys] = useState<PlatformKey[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Key form state
  const [provider, setProvider] = useState('anthropic');
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    platformFetch('/api/v1/platform/ai-keys')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => setKeys(Array.isArray(data) ? data : [data]))
      .catch(e => setError(String(e)))
      .finally(() => setLoadingKeys(false));

    // Load orgs to show BYOK status
    platformFetch('/api/v1/platform/orgs?page_size=200')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => {
        const items: OrgRow[] = (data.items ?? data).map((o: any) => ({
          id: o.id,
          name: o.name,
          license_tier: o.license_tier ?? 'starter',
          byok_enabled: BYOK_TIERS.includes(o.license_tier),
        }));
        setOrgs(items);
      })
      .catch(() => {/* orgs are optional here */})
      .finally(() => setLoadingOrgs(false));
  }, []);

  const handleSave = async () => {
    if (!newKey.trim()) return;
    setSaving(true); setSaveMsg(null);
    try {
      const res = await platformFetch('/api/v1/platform/ai-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: newKey.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveMsg('Key saved.');
      setNewKey('');
      // Refresh keys list
      const updated = await platformFetch('/api/v1/platform/ai-keys').then(r => r.json());
      setKeys(Array.isArray(updated) ? updated : [updated]);
    } catch (e: any) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const byokOrgs = orgs.filter(o => o.byok_enabled);
  const saasOrgs = orgs.filter(o => !o.byok_enabled);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/platform" className="text-sm text-gray-400 hover:text-gray-600">← Platform</Link>
        <Key className="w-5 h-5 text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900">{t('pages_platform_platformaisettingspage.ai_settings', 'AI Settings')}</h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Platform API Keys */}
      <section className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{t('pages_platform_platformaisettingspage.platform_api_keys', 'Platform API Keys')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('pages_platform_platformaisettingspage.these_keys_are_used_for_all_saas_orgs_th', 'These keys are used for all SaaS orgs that don\'t bring their own key.')}</p>
        </div>

        {/* Existing keys */}
        {!loadingKeys && keys.length > 0 && (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.provider} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-700 capitalize">{k.provider}</span>
                  {k.has_key ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Active — {k.key_preview}
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t('pages_platform_platformaisettingspage.not_set', 'Not set')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / replace key */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <option value="anthropic">{t('pages_platform_platformaisettingspage.anthropic', 'Anthropic')}</option>
              <option value="openai">{t('pages_platform_platformaisettingspage.openai', 'OpenAI')}</option>
              <option value="gemini">{t('pages_platform_platformaisettingspage.gemini', 'Gemini')}</option>
            </select>

            <div className="flex-1 relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={t('pages_platform_platformaisettingspage.placeholder_skant', 'sk-ant-…')}
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !newKey.trim()}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {saveMsg && (
            <p className={`text-sm ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMsg}
            </p>
          )}
        </div>
      </section>

      {/* SaaS orgs — using platform key */}
      <section className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{t('pages_platform_platformaisettingspage.saas_orgs_using_platform_key', 'SaaS Orgs (using platform key)')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {loadingOrgs ? '…' : `${saasOrgs.length} org${saasOrgs.length !== 1 ? 's' : ''}`} billed through the platform AI key
          </p>
        </div>
        <OrgTable orgs={saasOrgs} loading={loadingOrgs} emptyMsg="No SaaS orgs yet." />
      </section>

      {/* BYOK orgs */}
      <section className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{t('pages_platform_platformaisettingspage.byok_orgs_own_api_key', 'BYOK Orgs (own API key)')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {loadingOrgs ? '…' : `${byokOrgs.length} org${byokOrgs.length !== 1 ? 's' : ''}`} on BYOK tiers — their token usage is not billed to the platform key
          </p>
        </div>
        <OrgTable orgs={byokOrgs} loading={loadingOrgs} emptyMsg="No BYOK orgs yet." />
      </section>
    </div>
  );
}

function OrgTable({ orgs, loading, emptyMsg }: { orgs: OrgRow[]; loading: boolean; emptyMsg: string }) {
  const { t } = useTranslation('landing');
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
        <tr>
          <th className="px-5 py-2 text-left">{t('pages_platform_platformaisettingspage.org', 'Org')}</th>
          <th className="px-5 py-2 text-left">{t('pages_platform_platformaisettingspage.tier', 'Tier')}</th>
          <th className="px-5 py-2"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {loading && <tr><td colSpan={3} className="px-5 py-6 text-center text-gray-400">{t('pages_platform_platformaisettingspage.loading', 'Loading…')}</td></tr>}
        {!loading && orgs.length === 0 && <tr><td colSpan={3} className="px-5 py-6 text-center text-gray-400">{emptyMsg}</td></tr>}
        {orgs.map(o => (
          <tr key={o.id} className="hover:bg-gray-50">
            <td className="px-5 py-2 font-medium text-gray-800">{o.name || o.id}</td>
            <td className="px-5 py-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{o.license_tier}</span>
            </td>
            <td className="px-5 py-2 text-right">
              <Link to={`/platform/orgs/${o.id}`} className="text-xs text-blue-600 hover:underline">View</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
