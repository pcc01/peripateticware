// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';

interface Child { id: string; full_name: string; }

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

export const HomeschoolExportPage: React.FC = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/homeschool/children', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Child[]) => {
        setChildren(data);
        if (data.length > 0) setSelectedChild(data[0].id);
      });
  }, []);

  const handleExport = async () => {
    if (!selectedChild) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch('/api/v1/homeschool/export/portfolio', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ child_id: selectedChild, format }),
      });
      const d = await r.json();
      setResult(d.message || 'Export queued.');
    } catch { setResult('Export failed. Please try again.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 560 }}>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>Export Portfolio</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
        Generate a downloadable portfolio report for a child — cover page, activity log, evidence, and standards coverage summary.
      </p>

      {children.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: 'var(--surface-alt)', borderRadius: 12 }}>
          Add children first before exporting a portfolio.
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Select Child</label>
            <select value={selectedChild} onChange={e => setSelectedChild(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.95rem' }}>
              {children.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 10 }}>Format</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['pdf', 'csv'] as const).map(f => (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 18px', borderRadius: 8, border: `2px solid ${format === f ? 'var(--primary)' : 'var(--border)'}`, background: format === f ? 'var(--accent-muted)' : 'var(--surface)' }}>
                  <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} style={{ accentColor: 'var(--primary)' }} />
                  {f === 'pdf' ? '📄 PDF Portfolio' : '📊 CSV Activity Log'}
                </label>
              ))}
            </div>
          </div>

          {result && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#166534', fontSize: '0.88rem' }}>
              {result}
            </div>
          )}

          <button onClick={handleExport} disabled={loading || !selectedChild}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, fontSize: '0.95rem', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Generating…' : `Export ${format.toUpperCase()}`}
          </button>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
            Full PDF portfolio generation (cover page, evidence thumbnails, standards coverage) is coming in the export service build (SH-6).
          </p>
        </div>
      )}
    </div>
  );
};

export default HomeschoolExportPage;
