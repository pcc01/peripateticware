// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiClient from '@/config/api';

interface EnvCategory { category: string; keys: { key: string; value: string; description?: string }[] }

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>{title}</h2>
    {children}
  </div>
);

export const AdminSystemPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [envData, setEnvData] = useState<EnvCategory[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  // New key form
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [addStatus, setAddStatus] = useState('');

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setAddingKey(true);
    try {
      await apiClient.post('/api/v1/admin/env', { key: newKey.trim(), value: newVal, description: newDesc });
      setAddStatus('✓ Added — restart backend to apply');
      setNewKey(''); setNewVal(''); setNewDesc('');
      setTimeout(() => setAddStatus(''), 5000);
    } catch { setAddStatus('Error saving'); }
    finally { setAddingKey(false); }
  };

  useEffect(() => {
    Promise.allSettled([
      apiClient.get('/api/v1/admin/env').then(r => r.data).catch(() => []),
      apiClient.get('/api/v1/health').then(r => r.data).catch(() => null),
    ]).then(([envRes, healthRes]) => {
      if (envRes.status === 'fulfilled') setEnvData(Array.isArray(envRes.value) ? envRes.value : []);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    if (!(key in edits)) return;
    setSaving(key);
    try {
      await apiClient.post('/api/v1/admin/env', { key, value: edits[key] });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0 }}>{t('pages_admin_adminsystempage.system_settings', 'System Settings')}</h1>
      </div>

      {/* Health */}
      <Section title="System Health">
        {health ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', display: 'flex', gap: 32 }}>
            {Object.entries(health).map(([k, v]) => {
              // Health values can be nested objects (e.g. ollama: { model, status }).
              // Rendering an object directly yields "[object Object]" — extract a label.
              const display =
                v !== null && typeof v === 'object'
                  ? ((v as any).name ?? (v as any).model ?? (v as any).id ?? (v as any).status ?? (v as any).version ?? JSON.stringify(v))
                  : String(v);
              const isOk = v === 'healthy' || v === true || (v !== null && typeof v === 'object' && ((v as any).status === 'healthy' || (v as any).healthy === true));
              return (
                <div key={k}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                  <div style={{ fontWeight: 600, color: isOk ? '#16a34a' : 'var(--text)' }}>{display}</div>
                </div>
              );
            })}
          </div>
        ) : <p style={{ color: 'var(--text-muted)' }}>{t('pages_admin_adminsystempage.health_check_unavailable', 'Health check unavailable')}</p>}
      </Section>

      {/* Env vars */}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_admin_adminsystempage.loading_environment', 'Loading environment…')}</p>}
      {!loading && envData.length === 0 && (
        <Section title="Environment Variables">
          <p style={{ color: 'var(--text-muted)' }}>No environment configuration available. Ensure the backend <code>/api/v1/admin/env</code> endpoint is wired up.</p>
        </Section>
      )}
      {envData.map(cat => (
        <Section key={cat.category} title={cat.category}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cat.keys.map(item => {
              const val = item.key in edits ? edits[item.key] : item.value;
              const isSaved = saved === item.key;
              return (
                <div key={item.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'monospace' }}>{item.key}</div>
                      {item.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>{item.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <input value={val} onChange={e => setEdits(p => ({ ...p, [item.key]: e.target.value }))} aria-label={`Value for ${item.key}`}
                        style={{ width: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.82rem' }} />
                      <button onClick={() => handleSave(item.key)} disabled={!(item.key in edits) || saving === item.key}
                        style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: isSaved ? '#16a34a' : 'var(--primary)', color: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, opacity: !(item.key in edits) ? 0.4 : 1 }}>
                        {isSaved ? '✓ Saved' : saving === item.key ? '…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}

      {/* Add new config key */}
      <Section title="Add Configuration Key">
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 16 }}>{t('pages_admin_adminsystempage.add_a_new_environment_key_stored_in_the_', 'Add a new environment key. Stored in the database and overrides .env on next request. A backend restart applies most settings.')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY_NAME" aria-label="Configuration key name"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.85rem' }} />
              <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" aria-label="Configuration value"
                style={{ flex: 2, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.85rem' }} />
            </div>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" aria-label="Configuration description"
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={handleAddKey} disabled={!newKey.trim() || addingKey}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: !newKey.trim() ? 0.5 : 1 }}>
                {addingKey ? 'Adding…' : '+ Add Key'}
              </button>
              {addStatus && <span style={{ fontSize: '0.82rem', color: addStatus.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{addStatus}</span>}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default AdminSystemPage;
