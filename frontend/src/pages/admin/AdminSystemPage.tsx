// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

interface EnvCategory { category: string; keys: { key: string; value: string; description?: string }[] }

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>{title}</h2>
    {children}
  </div>
);

export const AdminSystemPage: React.FC = () => {
  const navigate = useNavigate();
  const [envData, setEnvData] = useState<EnvCategory[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/v1/admin/env', { headers: authHeader() }).then(r => r.ok ? r.json() : []),
      fetch('/api/v1/health').then(r => r.ok ? r.json() : null),
    ]).then(([envRes, healthRes]) => {
      if (envRes.status === 'fulfilled') setEnvData(Array.isArray(envRes.value) ? envRes.value : []);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    if (!(key in edits)) return;
    setSaving(key);
    try {
      await fetch('/api/v1/admin/env', { method: 'POST', headers: authHeader(), body: JSON.stringify({ key, value: edits[key] }) });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0 }}>System Settings</h1>
      </div>

      {/* Health */}
      <Section title="System Health">
        {health ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', display: 'flex', gap: 32 }}>
            {Object.entries(health).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 600, color: v === 'healthy' || v === true ? '#16a34a' : 'var(--text)' }}>{String(v)}</div>
              </div>
            ))}
          </div>
        ) : <p style={{ color: 'var(--text-muted)' }}>Health check unavailable</p>}
      </Section>

      {/* Env vars */}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading environment…</p>}
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
                      <input value={val} onChange={e => setEdits(p => ({ ...p, [item.key]: e.target.value }))}
                        style={{ width: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem', fontFamily: 'monospace' }} />
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
    </div>
  );
};

export default AdminSystemPage;
