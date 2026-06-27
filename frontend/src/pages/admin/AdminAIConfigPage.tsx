// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * AdminAIConfigPage  —  /platform/ai-settings
 *
 * Platform super-admin controls:
 *   1. Provider credentials  — Anthropic key, OpenAI key, Ollama URL
 *   2. Task routing          — which provider handles each of the 5 AI task areas
 *
 * Endpoints:
 *   GET  /api/v1/ai-config/providers
 *   PUT  /api/v1/ai-config/providers/{provider}   (anthropic | openai | ollama)
 *   DELETE /api/v1/ai-config/providers/{provider}
 *   GET  /api/v1/ai-config/tasks
 *   PUT  /api/v1/ai-config/tasks/{task_type}
 *
 * All endpoints require is_platform_admin.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Server, CheckCircle, XCircle, Trash2, Eye, EyeOff, AlertCircle, RefreshCw, ArrowLeft, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useTranslation } from 'react-i18next';

const API = '/api/v1/ai-config';

// ── Constants ─────────────────────────────────────────────────────────────────

const TASK_LABELS: Record<string, { label: string; desc: string }> = {
  activity_suggestions:  { label: 'Activity Suggestions',      desc: 'Peri AI recommendations when a teacher creates or edits an activity' },
  standards_mapping:     { label: 'Standards Mapping',          desc: 'Mapping activities to curriculum standards (NGSS, Common Core, etc.)' },
  rubric_mapping:        { label: 'Rubric Mapping',             desc: 'Assigning rubric criteria to activity outcomes' },
  taxonomy_mapping:      { label: 'Taxonomy Classification',    desc: "Bloom's / DOK / SOLO / Marzano level assignment" },
  submission_assessment: { label: 'Submission Assessment',      desc: 'Evaluating student evidence and field notes against rubric criteria' },
};

const PROVIDER_META: Record<string, { label: string; badge: string; color: string }> = {
  ollama:            { label: 'Ollama (local)',          badge: 'Free',          color: '#15803d' },
  anthropic_instant: { label: 'Claude Instant',          badge: 'Paid / fast',   color: '#6d28d9' },
  anthropic_batch:   { label: 'Claude Batch (1 AM)',     badge: 'Paid / 50% off',color: '#0369a1' },
  openai:            { label: 'OpenAI',                  badge: 'Paid',          color: '#b45309' },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderStatus {
  provider:    string;
  key_set:     boolean;
  key_preview: string | null;
  model?:      string;
  healthy?:    boolean;
  url?:        string;
  source?:     string;
}

interface TaskConfig {
  task_type:         string;
  provider:          string;
  enabled:           boolean;
  allowed_providers: string[];
  updated_at:        string | null;
}

interface Msg { type: 'success' | 'error'; text: string }

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAIConfigPage() {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { token, logout } = useAuthStore();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [tasks, setTasks]         = useState<TaskConfig[]>([]);
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState<Msg | null>(null);
  const [saving, setSaving]       = useState(false);
  const [taskSaving, setTaskSaving] = useState<Record<string, boolean>>({});
  const [taskSaved, setTaskSaved]   = useState<Record<string, boolean>>({});

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Key / URL form state
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [openaiKey, setOpenaiKey]       = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [ollamaUrl, setOllamaUrl]       = useState('');

  const flash = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);

    // Fetch providers and tasks independently — one failure must not block the other
    const [provRes, taskRes] = await Promise.allSettled([
      fetch(`${API}/providers`, { headers: authHeaders }),
      fetch(`${API}/tasks`,     { headers: authHeaders }),
    ]);

    // ── Providers ─────────────────────────────────────────────────────────────
    if (provRes.status === 'fulfilled') {
      const r = provRes.value;
      if (r.status === 401 || r.status === 403) {
        flash('error', 'Access denied. Platform admin credentials required.');
        setLoading(false);
        return;
      }
      if (r.ok) {
        try {
          const data: ProviderStatus[] = await r.json();
          setProviders(data.filter(p => p.provider !== '_byok_summary'));
          const ollama = data.find(p => p.provider === 'ollama');
          if (ollama?.url && ollama.source === 'database') setOllamaUrl(ollama.url);
        } catch { /* malformed JSON — ignore */ }
      } else {
        flash('error', `Failed to load provider status (HTTP ${r.status})`);
      }
    } else {
      flash('error', `Network error loading providers: ${provRes.reason}`);
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────
    if (taskRes.status === 'fulfilled') {
      const r = taskRes.value;
      if (r.ok) {
        try {
          const data: TaskConfig[] = await r.json();
          setTasks(data);
        } catch { /* malformed JSON — ignore */ }
      } else {
        flash('error', `Failed to load task routing (HTTP ${r.status}). Run apply_ai_routing_tables.py if tables are missing.`);
      }
    } else {
      flash('error', `Network error loading tasks: ${taskRes.reason}`);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Provider save / delete ────────────────────────────────────────────────

  const saveProvider = async (provider: 'anthropic' | 'openai' | 'ollama', value: string) => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/providers/${provider}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ api_key: value.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      if (provider === 'anthropic') setAnthropicKey('');
      else if (provider === 'openai') setOpenaiKey('');
      flash('success', `${provider === 'ollama' ? 'Ollama URL' : provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} saved.`);
      await load();
    } catch (e: any) {
      flash('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (provider: 'anthropic' | 'openai' | 'ollama') => {
    const label = provider === 'ollama' ? 'Ollama URL' : provider === 'anthropic' ? 'Anthropic key' : 'OpenAI key';
    if (!confirm(`Remove the ${label}?`)) return;
    setSaving(true);
    try {
      await fetch(`${API}/providers/${provider}`, { method: 'DELETE', headers: authHeaders });
      if (provider === 'ollama') setOllamaUrl('');
      flash('success', `${label} removed.`);
      await load();
    } catch {
      flash('error', 'Failed to remove.');
    } finally {
      setSaving(false);
    }
  };

  // ── Task routing ──────────────────────────────────────────────────────────

  const updateTask = async (taskType: string, provider: string) => {
    setTaskSaving(s => ({ ...s, [taskType]: true }));
    try {
      const res = await fetch(`${API}/tasks/${taskType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ provider, enabled: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      setTasks(prev => prev.map(t => t.task_type === taskType ? { ...t, provider } : t));
      setTaskSaved(s => ({ ...s, [taskType]: true }));
      setTimeout(() => setTaskSaved(s => ({ ...s, [taskType]: false })), 2000);
    } catch (e: any) {
      flash('error', `Failed to update ${taskType}: ${e.message}`);
    } finally {
      setTaskSaving(s => ({ ...s, [taskType]: false }));
    }
  };

  // Provider helper lookups
  const anthropic  = providers.find(p => p.provider === 'anthropic');
  const openai     = providers.find(p => p.provider === 'openai');
  const ollama     = providers.find(p => p.provider === 'ollama');
  const ollamaOk   = ollama?.healthy ?? false;
  const claudeOk   = anthropic?.key_set ?? false;
  const openaiOk   = openai?.key_set ?? false;

  return (
    <div className="max-w-3xl mx-auto mt-8 space-y-6">

      {/* Page heading — always rendered so tests and screen readers see it immediately */}
      <h1 className="text-2xl font-bold text-gray-900">{t('pages_admin_adminaiconfigpage.ai_configuration', 'AI Configuration')}</h1>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
        </div>
      )}

      {!loading && <>

      {/* Flash */}
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

      {/* Provider status bar */}
      <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow border border-gray-100">
        <StatusPill ok={claudeOk} label="Anthropic" />
        <StatusPill ok={openaiOk} label="OpenAI" />
        <StatusPill ok={ollamaOk} label={`Ollama${ollama?.url ? ` (${ollama.url})` : ''}`} />
      </div>

      <ProviderCard
        icon={<Key className="w-5 h-5 text-purple-600" />}
        title="Anthropic (Claude) API Key"
        accentClass="focus:ring-purple-500"
        saveClass="bg-purple-700 hover:bg-purple-800"
        current={anthropic?.key_set ? anthropic.key_preview : null}
        placeholder="sk-ant-..."
        value={anthropicKey}
        show={showAnthropicKey}
        onToggleShow={() => setShowAnthropicKey(v => !v)}
        onChange={setAnthropicKey}
        onSave={() => saveProvider('anthropic', anthropicKey)}
        onDelete={() => deleteProvider('anthropic')}
        saving={saving}
        docsUrl="https://console.anthropic.com/account/keys"
        docsLabel="console.anthropic.com"
      />

      <ProviderCard
        icon={<Key className="w-5 h-5 text-amber-600" />}
        title="OpenAI API Key"
        accentClass="focus:ring-amber-500"
        saveClass="bg-amber-600 hover:bg-amber-700"
        current={openai?.key_set ? openai.key_preview : null}
        placeholder="sk-..."
        value={openaiKey}
        show={showOpenaiKey}
        onToggleShow={() => setShowOpenaiKey(v => !v)}
        onChange={setOpenaiKey}
        onSave={() => saveProvider('openai', openaiKey)}
        onDelete={() => deleteProvider('openai')}
        saving={saving}
        docsUrl="https://platform.openai.com/api-keys"
        docsLabel="platform.openai.com"
      />

      <section className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-green-700" />
          <h2 className="font-semibold text-gray-900">{t('pages_admin_adminaiconfigpage.ollama_instance_url', 'Ollama Instance URL')}</h2>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Free</span>
          <span className={`ml-auto flex items-center gap-1 text-xs font-medium ${ollamaOk ? 'text-green-700' : 'text-gray-400'}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${ollamaOk ? 'bg-green-500' : 'bg-gray-300'}`} />
            {ollamaOk ? 'Reachable' : 'Not reachable'}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Current URL</span>
          {ollama?.source === 'database' && ollama.url ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded text-green-700">{ollama.url}</span>
              <button onClick={() => deleteProvider('ollama')} disabled={saving}
                className="text-red-400 hover:text-red-600 disabled:opacity-40">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">
              {ollama?.url ? `${ollama.url} (from env)` : 'Not configured'}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input type="text" value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} aria-label="Ollama server URL"
            placeholder="http://localhost:11434"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
          <button onClick={() => saveProvider('ollama', ollamaUrl)} disabled={saving || !ollamaUrl.trim()}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition">
            Save
          </button>
        </div>
        <p className="text-xs text-gray-400">{t('pages_admin_adminaiconfigpage.must_be_reachable_from_the_peripateticwa', 'Must be reachable from the Peripateticware backend server.')}</p>
      </section>

      <section className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('pages_admin_adminaiconfigpage.task_routing', 'Task Routing')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('pages_admin_adminaiconfigpage.choose_which_provider_handles_each_ai_ta', 'Choose which provider handles each AI task. Greyed-out means the provider is not configured.')}</p>
        </div>
        <div className="divide-y divide-gray-50">
          {tasks.length === 0 && (
            <div className="px-6 py-6 text-sm text-gray-400 italic">
              No task configurations found. Backend needs to restart with the seeded ai_task_config table.
            </div>
          )}
          {tasks.map(task => {
            const meta  = TASK_LABELS[task.task_type];
            const isSav = taskSaving[task.task_type];
            const isDone= taskSaved[task.task_type];
            return (
              <div key={task.task_type} className="px-6 py-4 flex items-start gap-6 flex-wrap">
                <div className="flex-1 min-w-0" style={{ minWidth: 200 }}>
                  <p className="text-sm font-medium text-gray-800">{meta?.label ?? task.task_type}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{meta?.desc}</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {task.allowed_providers.map(p => {
                    const pm     = PROVIDER_META[p] ?? { label: p, badge: '', color: '#6b7280' };
                    const active = task.provider === p;
                    const avail  = p === 'ollama' ? ollamaOk
                                 : p.startsWith('anthropic') ? claudeOk
                                 : p === 'openai' ? openaiOk : true;
                    return (
                      <button key={p}
                        onClick={() => !active && !isSav && avail && updateTask(task.task_type, p)}
                        disabled={isSav || !avail}
                        className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition
                          ${active ? 'text-white' : isSav || !avail ? 'text-gray-300 border-gray-200 cursor-not-allowed' : 'text-gray-600 border-gray-200 hover:border-gray-400 cursor-pointer'}`}
                        style={active ? { borderColor: pm.color, background: pm.color } : undefined}>
                        {pm.label}
                        {pm.badge && <span className="ml-1 opacity-70 font-normal">{pm.badge}</span>}
                      </button>
                    );
                  })}
                  <span className="text-xs text-gray-400 w-10">{isSav ? '...' : isDone ? 'done' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400">{t('pages_admin_adminaiconfigpage.changes_apply_immediately_orglevel_byok_', 'Changes apply immediately. Org-level BYOK routing overrides these defaults per org.')}</p>
        </div>
      </section>

      </>}

    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      {ok ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-gray-400" />}
      {label}
    </div>
  );
}

interface ProviderCardProps {
  icon: React.ReactNode; title: string; accentClass: string; saveClass: string;
  current: string | null | undefined; placeholder: string; value: string;
  show: boolean; onToggleShow: () => void; onChange: (v: string) => void;
  onSave: () => void; onDelete: () => void; saving: boolean; docsUrl: string; docsLabel: string;
}

function ProviderCard({ icon, title, accentClass, saveClass, current, placeholder, value, show,
  onToggleShow, onChange, onSave, onDelete, saving, docsUrl, docsLabel }: ProviderCardProps) {
  return (
    <section className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-4">
      <div className="flex items-center gap-2">{icon}<h2 className="font-semibold text-gray-900">{title}</h2></div>
      <div className="flex items-center justify-between py-2 border-b border-gray-100">
        <span className="text-sm text-gray-500">Current key</span>
        {current ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">{current}</span>
            <button onClick={onDelete} disabled={saving} className="text-red-400 hover:text-red-600 disabled:opacity-40">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : <span className="text-sm text-gray-400 italic">Not set</span>}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} aria-label="API key value"
            placeholder={current ? '...... (enter new key to replace)' : placeholder}
            className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 pr-10 ${accentClass}`}
            autoComplete="off" />
          <button type="button" onClick={onToggleShow} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button onClick={onSave} disabled={saving || !value.trim()}
          className={`${saveClass} text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition`}>
          Save
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Get a key at <a href={docsUrl} target="_blank" rel="noreferrer" className="hover:underline text-blue-500">{docsLabel}</a>.
        Stored encrypted, never returned in full.
      </p>
    </section>
  );
}
