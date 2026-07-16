// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';

interface Child { id: string; email: string; full_name: string; is_active: boolean; grade_level: number; age_band: string; created_at: string; }

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

const AGE_BAND_LABELS: Record<string, string> = { k6: 'K–6', m712: '7–12', h1318: '13–18' };

export const HomeschoolChildrenPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', grade_level: 1, age_band: 'k6' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/v1/homeschool/children', { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setChildren)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/homeschool/children', { method: 'POST', headers: authHeader(), body: JSON.stringify(form) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (r.status === 402 && d?.code === 'UPGRADE_REQUIRED') {
          window.dispatchEvent(new CustomEvent('upgrade-required', { detail: d }));
          return;
        }
        throw new Error(d.detail || 'Failed to create child');
      }
      setShowAdd(false);
      setForm({ full_name: '', email: '', password: '', grade_level: 1, age_band: 'k6' });
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0, flex: 1 }}>My Children ({children.length})</h1>
        <button onClick={() => setShowAdd(s => !s)} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {showAdd ? 'Cancel' : '+ Add Child'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 28 }}>
          <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-head)' }}>{t('pages_homeschool_homeschoolchildrenpage.add_child_account', 'Add Child Account')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 5, fontSize: '0.85rem' }}>{t('pages_homeschool_homeschoolchildrenpage.full_name', 'Full name *')}</label>
              <input required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                id="child-full-name"
                aria-label={t('pages_homeschool_homeschoolchildrenpage.aria_label_childs_full_name', 'Child\'s full name')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 5, fontSize: '0.85rem' }}>{t('pages_homeschool_homeschoolchildrenpage.email', 'Email *')}</label>
              <input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                id="child-email"
                aria-label={t('pages_homeschool_homeschoolchildrenpage.aria_label_childs_email_address', 'Child\'s email address')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 5, fontSize: '0.85rem' }}>{t('pages_homeschool_homeschoolchildrenpage.password', 'Password *')}</label>
              <input required type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                id="child-password"
                aria-label={t('pages_homeschool_homeschoolchildrenpage.aria_label_childs_password', 'Child\'s password')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 5, fontSize: '0.85rem' }}>{t('pages_homeschool_homeschoolchildrenpage.grade_level', 'Grade level')}</label>
              <input type="number" min={0} max={12} value={form.grade_level} onChange={e => setForm(p => ({ ...p, grade_level: parseInt(e.target.value) }))}
                id="child-grade"
                aria-label={t('pages_homeschool_homeschoolchildrenpage.aria_label_childs_grade_level_012', 'Child\'s grade level (0-12)')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 5, fontSize: '0.85rem' }}>{t('pages_homeschool_homeschoolchildrenpage.age_band', 'Age band')}</label>
              <select value={form.age_band} onChange={e => setForm(p => ({ ...p, age_band: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}>
                <option value="k6">{t('pages_homeschool_homeschoolchildrenpage.k6_ages_512', 'K–6 (Ages 5–12)')}</option>
                <option value="m712">{t('pages_homeschool_homeschoolchildrenpage.712_ages_1217', '7–12 (Ages 12–17)')}</option>
                <option value="h1318">{t('pages_homeschool_homeschoolchildrenpage.1318_ages_1318', '13–18 (Ages 13–18)')}</option>
              </select>
            </div>
          </div>
          {error && <p role="alert" style={{ color: '#be123c', marginBottom: 10, fontSize: '0.85rem' }}>{error}</p>}
          <button type="submit" disabled={saving} style={{ padding: '10px 28px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            {saving ? 'Creating…' : 'Create Child Account'}
          </button>
        </form>
      )}

      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_homeschool_homeschoolchildrenpage.loading', 'Loading…')}</p>}

      {!loading && children.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👧</div>
          <p>{t('pages_homeschool_homeschoolchildrenpage.no_children_added_yet_add_your_first_chi', 'No children added yet. Add your first child to get started.')}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children.map(c => (
          <div key={c.id}
            role="button"
            tabIndex={0}
            aria-label={`View progress for ${c.full_name}`}
            onClick={() => navigate(`/homeschool/progress?child=${c.id}`)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/homeschool/progress?child=${c.id}`); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)', flexShrink: 0 }}>
              {(c.full_name || c.email)[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{c.full_name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                {c.email} · Grade {c.grade_level} · {AGE_BAND_LABELS[c.age_band] || c.age_band} · Added {fmtDate(c.created_at)}
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('pages_homeschool_homeschoolchildrenpage.view_progress', 'View progress →')}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HomeschoolChildrenPage;
