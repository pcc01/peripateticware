// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * HomeschoolExportPage  —  /homeschool/export
 *
 * Generate a PDF portfolio or CSV activity log for any date range.
 * Quick presets: This Month, Last Month, This Quarter, Last Quarter,
 *               This Year, Last Year, Custom.
 *
 * The download streams directly from the backend — no intermediate storage.
 */

import React, { useEffect, useState } from 'react';
import { FileText, Table2, Download, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Child { id: string; full_name: string; grade?: number; }

function authHeader(): Record<string, string> {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildPresets(): Record<string, { label: string; from: string; to: string }> {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const qStart     = new Date(y, Math.floor(m / 3) * 3, 1);
  const lastQStart = new Date(y, Math.floor(m / 3) * 3 - 3, 1);
  const lastQEnd   = new Date(qStart.getTime() - 86400000);
  return {
    this_month:   { label: 'This Month',   from: ymd(new Date(y, m, 1)),        to: ymd(today) },
    last_month:   { label: 'Last Month',   from: ymd(new Date(y, m - 1, 1)),    to: ymd(new Date(y, m, 0)) },
    this_quarter: { label: 'This Quarter', from: ymd(qStart),                   to: ymd(today) },
    last_quarter: { label: 'Last Quarter', from: ymd(lastQStart),               to: ymd(lastQEnd) },
    this_year:    { label: 'This Year',    from: `${y}-01-01`,                  to: ymd(today) },
    last_year:    { label: 'Last Year',    from: `${y - 1}-01-01`,              to: `${y - 1}-12-31` },
    custom:       { label: 'Custom',       from: '',                             to: '' },
  };
}

const PRESETS = buildPresets();

export const HomeschoolExportPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const [children,      setChildren]      = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [format,        setFormat]        = useState<'pdf' | 'csv'>('pdf');
  const [preset,        setPreset]        = useState('this_month');
  const [customFrom,    setCustomFrom]    = useState('');
  const [customTo,      setCustomTo]      = useState(ymd(new Date()));
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    fetch('/api/v1/homeschool/children', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Child[]) => {
        setChildren(data);
        if (data.length) setSelectedChild(data[0].id);
      })
      .catch(() => {});
  }, []);

  const dateFrom = preset === 'custom' ? customFrom : PRESETS[preset]?.from;
  const dateTo   = preset === 'custom' ? customTo   : PRESETS[preset]?.to;
  const isValid  = !!(selectedChild && dateFrom && dateTo && dateFrom <= dateTo);

  const handleDownload = async () => {
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      const url  = `/api/v1/homeschool/report?child_id=${selectedChild}&date_from=${dateFrom}&date_to=${dateTo}&format=${format}`;
      const resp = await fetch(url, { headers: authHeader() });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.detail ?? `Server error ${resp.status}`);
      }
      const blob   = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      const child  = children.find(c => c.id === selectedChild);
      const name   = (child?.full_name ?? 'child').replace(/\s+/g, '_');
      a.href       = objUrl;
      a.download   = `Peripateticware_${name}_${dateFrom}_to_${dateTo}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      setError(e.message ?? 'Download failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!children.length) {
    return (
      <div style={{ fontFamily: 'var(--font-body)', maxWidth: 560 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>{t('pages_homeschool_homeschoolexportpage.export_portfolio', 'Export Portfolio')}</h1>
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)',
                      background: 'var(--surface-alt)', borderRadius: 12 }}>
          Add children first before exporting a portfolio.
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)',
    fontSize: '0.95rem', boxSizing: 'border-box',
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 560 }}>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>
        {t('pages_homeschool_homeschoolexportpage.export_portfolio', 'Export Portfolio')}
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        {t('pages_homeschool_homeschoolexportpage.generate_a_pdf_portfolio_or_csv_activity', 'Generate a PDF portfolio or CSV activity log for any date range.')}
      </p>

      {/* Child */}
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('pages_homeschool_homeschoolexportpage.child', 'Child')}</label>
      <select value={selectedChild} onChange={e => setSelectedChild(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }}>
        {children.map(c => (
          <option key={c.id} value={c.id}>{c.full_name}{c.grade != null ? ` (Grade ${c.grade})` : ''}</option>
        ))}
      </select>

      {/* Format */}
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('pages_homeschool_homeschoolexportpage.format', 'Format')}</label>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {([['pdf', 'PDF Portfolio', FileText], ['csv', 'CSV Activity Log', Table2]] as const).map(([val, label, Icon]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFormat(val)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              border: `2px solid ${format === val ? 'var(--primary)' : 'var(--border)'}`,
              background: format === val ? 'var(--primary)' : 'var(--surface)',
              color: format === val ? '#fff' : 'var(--text)',
            }}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {/* Date range presets */}
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
        <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Date Range
      </label>
      <select value={preset} onChange={e => setPreset(e.target.value)} style={{ ...inputStyle, marginBottom: preset === 'custom' ? 12 : 20 }}>
        {Object.entries(PRESETS).map(([key, p]) => (
          <option key={key} value={key}>{p.label}</option>
        ))}
      </select>

      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>{t('pages_homeschool_homeschoolexportpage.from', 'From')}</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>{t('pages_homeschool_homeschoolexportpage.to', 'To')}</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={inputStyle} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c',
                      borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleDownload}
        disabled={!isValid || loading}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '1rem',
          background: 'var(--primary)', color: '#fff',
          cursor: !isValid || loading ? 'not-allowed' : 'pointer',
          opacity: !isValid || loading ? 0.6 : 1,
        }}
      >
        <Download size={18} /> {loading ? 'Generating…' : `Download ${format.toUpperCase()}`}
      </button>
    </div>
  );
}

export default HomeschoolExportPage;
