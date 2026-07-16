// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * OrgAIConfigPage  —  /admin/ai-config
 *
 * BYOK org admins configure their AI providers and see (read-only) task routing.
 *
 * Providers:
 *   - Anthropic (Claude) API key
 *   - OpenAI (GPT-4o / GPT-4o-mini) API key
 *   - Ollama — point to a self-hosted instance URL
 *
 * Task routing (5 areas) is set at signup and locked for self-service.
 * Changes require contacting the platform admin.
 */

import React, { useState, useEffect } from 'react';
import { Key, Server, CheckCircle, Trash2, AlertCircle, Lock, ExternalLink, Eye, EyeOff, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import UpgradeCTA from '../../../components/UpgradeCTA';

const API = '/api/v1/org';

// ── Task metadata ─────────────────────────────────────────────────────────────

const TASKS = [
  { key: 'activity_suggestions',  label: 'Activity Suggestions', desc: 'Peri AI suggestions when creating activities' },
  { key: 'standards_mapping',     label: 'Standards Mapping',    desc: 'Map activities to curriculum standards' },
  { key: 'rubric_mapping',        label: 'Rubric Mapping',       desc: 'Assign rubric criteria to activity outcomes' },
  { key: 'taxonomy_mapping',      label: 'Taxonomy Classification', desc: "Bloom's / DOK / SOLO / Marzano level assignment" },
  { key: 'submission_assessment', label: 'Submission Assessment', desc: 'AI evaluation of student evidence against rubric criteria' },
];

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  ollama:             { label: 'Ollama (self-hosted)',   color: '#15803d' },
  anthropic_instant:  { label: 'Claude — instant',       color: '#7c3aed' },
  anthropic_batch:    { label: 'Claude — batch (1 AM)',  color: '#0369a1' },
  openai:             { label: 'OpenAI',                 color: '#b45309' },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfig {
  anthropic:      { has_key: boolean; key_preview: string | null };
  openai:         { has_key: boolean; key_preview: string | null };
  ollama:         { configured: boolean; url: string };
  task_routing:   Record<string, string>;
  routing_locked: boolean;
  license_tier:   string;
}

interface Msg { type: 'success' | 'error'; text: string }

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrgAIConfigPage() {
  const { t } = useTranslation('landing');
  const [config, setConfig]   = useState<OrgConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [msg, setMsg]         = useState<Msg | null>(null);
  const [saving, setSaving]   = useState(false);

  // Anthropic key form
  const [anthropicKey, setAnthropicKey]   = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);

  // OpenAI key form
  const [openaiKey, setOpenaiKey]   = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Ollama URL form
  const [ollamaUrl, setOllamaUrl] = useState('');

  const flash = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/ai-config`, { credentials: 'include' });
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: OrgConfig = await res.json();
      setConfig(data);
      if (data.ollama.url) setOllamaUrl(data.ollama.url);
    } catch {
      flash('error', 'Could not load AI configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Save helpers ──────────────────────────────────────────────────────────

  const saveKey = async (provider: 'anthropic' | 'openai', key: string) => {
    if (!key.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/ai-config/key`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: key.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      if (provider === 'anthropic') setAnthropicKey('');
      else setOpenaiKey('');
      flash('success', `${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} key saved.`);
      await load();
    } catch (e: any) {
      flash('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (provider: 'anthropic' | 'openai') => {
    if (!confirm(`Remove your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} key?`)) return;
    setSaving(true);
    try {
      await fetch(`${API}/ai-config/key/${provider}`, { method: 'DELETE', credentials: 'include' });
      flash('success', 'Key removed.');
      await load();
    } catch {
      flash('error', 'Failed to remove key.');
    } finally {
      setSaving(false);
    }
  };

  const saveOllama = async () => {
    if (!ollamaUrl.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/ai-config/ollama`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ollama_url: ollamaUrl.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      flash('success', 'Ollama URL saved.');
      await load();
    } catch (e: any) {
      flash('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteOllama = async () => {
    if (!confirm('Remove Ollama URL? Tasks using Ollama will fall back to platform defaults.')) return;
    setSaving(true);
    try {
      await fetch(`${API}/ai-config/ollama`, { method: 'DELETE', credentials: 'include' });
      setOllamaUrl('');
      flash('success', 'Ollama URL removed.');
      await load();
    } catch {
      flash('error', 'Failed to remove Ollama URL.');
    } finally {
      setSaving(false);
    }
  };

  // ── Upgrade gate ──────────────────────────────────────────────────────────

  if (forbidden) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <p className="text-sm text-gray-500 mb-4">
          {t('pages_org_admin_orgaiconfigpage.byok_paid_note', 'Bring Your Own Key is a paid feature. Upgrade to configure custom AI providers for your school or district.')}
        </p>
        <UpgradeCTA
          featureName="Bring Your Own Key (AI Config)"
          requiredTier="school_byok"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  const routing = config?.task_routing ?? {};

  return (
    <div className="max-w-2xl mx-auto mt-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('pages_org_admin_orgaiconfigpage.ai_configuration', 'AI Configuration')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('pages_org_admin_orgaiconfigpage.configure_your_organisationaposs_ai_prov', 'Configure your organisation&apos;s AI providers and view your task routing assignments.')}</p>
      </div>

      {msg && (
        <div className={`flex gap-2 items-center p-3 rounded-xl text-sm ${
          msg.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {msg.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      <section className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-purple-600" />
          <h2 className="font-semibold text-gray-900">{t('pages_org_admin_orgaiconfigpage.anthropic_claude_api_key', 'Anthropic (Claude) API Key')}</h2>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">{t('pages_org_admin_orgaiconfigpage.current_key', 'Current key')}</span>
          {config?.anthropic.has_key ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">{config.anthropic.key_preview}</span>
              <button onClick={() => deleteKey('anthropic')} disabled={saving}
                className="text-red-400 hover:text-red-600 disabled:opacity-40" title={t('pages_org_admin_orgaiconfigpage.title_remove', 'Remove')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : <span className="text-sm text-gray-400 italic">{t('pages_org_admin_orgaiconfigpage.not_set', 'Not set')}</span>}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input type={showAnthropicKey ? 'text' : 'password'}
              value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
              placeholder={config?.anthropic.has_key ? '...... (enter new key to replace)' : 'sk-ant-...'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10"
              autoComplete="off" />
            <button type="button" onClick={() => setShowAnthropicKey(v => !v)}
              className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
              {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => saveKey('anthropic', anthropicKey)} disabled={saving || !anthropicKey.trim()}
            className="bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition">
            Save
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Get a key at <a href="https://console.anthropic.com/account/keys" target="_blank" rel="noreferrer"
            className="text-purple-600 hover:underline">{t('pages_org_admin_orgaiconfigpage.consoleanthropiccom', 'console.anthropic.com')}</a>. Stored encrypted.
        </p>
      </section>

      <section className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-amber-600" />
          <h2 className="font-semibold text-gray-900">{t('pages_org_admin_orgaiconfigpage.openai_api_key', 'OpenAI API Key')}</h2>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">{t('pages_org_admin_orgaiconfigpage.current_key', 'Current key')}</span>
          {config?.openai.has_key ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">{config.openai.key_preview}</span>
              <button onClick={() => deleteKey('openai')} disabled={saving}
                className="text-red-400 hover:text-red-600 disabled:opacity-40" title={t('pages_org_admin_orgaiconfigpage.title_remove', 'Remove')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : <span className="text-sm text-gray-400 italic">{t('pages_org_admin_orgaiconfigpage.not_set', 'Not set')}</span>}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input type={showOpenaiKey ? 'text' : 'password'}
              value={openaiKey} onChange={e => setOpenaiKey(e.target.value)}
              placeholder={config?.openai.has_key ? '...... (enter new key to replace)' : 'sk-...'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 pr-10"
              autoComplete="off" />
            <button type="button" onClick={() => setShowOpenaiKey(v => !v)}
              className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
              {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => saveKey('openai', openaiKey)} disabled={saving || !openaiKey.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition">
            Save
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
            className="text-amber-600 hover:underline">{t('pages_org_admin_orgaiconfigpage.platformopenaicom', 'platform.openai.com')}</a>.
        </p>
      </section>

      <section className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-green-700" />
          <h2 className="font-semibold text-gray-900">{t('pages_org_admin_orgaiconfigpage.ollama_instance', 'Ollama Instance')}</h2>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t('pages_org_admin_orgaiconfigpage.free', 'Free')}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">{t('pages_org_admin_orgaiconfigpage.current_url', 'Current URL')}</span>
          {config?.ollama.configured ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded text-green-700">{config.ollama.url}</span>
              <button onClick={deleteOllama} disabled={saving}
                className="text-red-400 hover:text-red-600 disabled:opacity-40" title={t('pages_org_admin_orgaiconfigpage.title_remove', 'Remove')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : <span className="text-sm text-gray-400 italic">{t('pages_org_admin_orgaiconfigpage.using_platform_default', 'Using platform default')}</span>}
        </div>
        <div className="flex gap-2">
          <input type="text" value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)}
            placeholder="http://192.168.1.50:11434"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
          <button onClick={saveOllama} disabled={saving || !ollamaUrl.trim()}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition">{t('pages_org_admin_orgaiconfigpage.save', 'Save')}</button>
        </div>
        <p className="text-xs text-gray-400">{t('pages_org_admin_orgaiconfigpage.must_be_reachable_from_the_peripateticwa', 'Must be reachable from the Peripateticware backend server.')}</p>
      </section>

      <section className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">{t('pages_org_admin_orgaiconfigpage.task_routing', 'Task Routing')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t('pages_org_admin_orgaiconfigpage.which_provider_handles_each_ai_task_for_', 'Which provider handles each AI task for your organisation.')}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0 mt-0.5">
            <Lock className="w-3.5 h-3.5" />Set at signup
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {TASKS.map(task => {
            const assigned = routing[task.key];
            const pl = assigned ? PROVIDER_LABELS[assigned] : null;
            return (
              <div key={task.key} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{task.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{task.desc}</p>
                </div>
                {pl ? (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full text-white flex-shrink-0"
                    style={{ background: pl.color }}>{pl.label}</span>
                ) : (
                  <span className="text-xs text-gray-400 flex-shrink-0 italic">{t('pages_org_admin_orgaiconfigpage.platform_default', 'Platform default')}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-100 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            Task routing is configured at signup. To change which provider handles a task area,{' '}
            <a href="mailto:hello@peripateticware.com?subject=AI routing change request"
              className="font-semibold hover:underline">{t('pages_org_admin_orgaiconfigpage.contact_platform_support', 'contact platform support')}</a>.
          </p>
        </div>
      </section>

    </div>
  );
}
