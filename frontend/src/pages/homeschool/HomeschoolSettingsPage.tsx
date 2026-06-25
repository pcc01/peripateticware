// Copyright (c) 2026 Paul Christopher Cerda
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useSkin, SKIN_LABELS, type Skin } from '@/hooks/useSkin';
import { useTranslation } from 'react-i18next';

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 24, marginBottom: 20,
};
const h2s: React.CSSProperties = { margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 };

export const HomeschoolSettingsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { skin, setSkin, skins } = useSkin();
  const handleLogout = () => { logout(); navigate('/'); };

  // Privacy preferences
  const [privacy, setPrivacy] = useState({
    coppa_enabled: true,
    data_sharing_enabled: false,
    ai_enabled: true,
  });
  const [privacyConfigured, setPrivacyConfigured] = useState<boolean | null>(null);
  const [privacyBannerDismissed, setPrivacyBannerDismissed] = useState<boolean>(
    () => localStorage.getItem('privacy_banner_dismissed') === 'true'
  );
  const [orgGoverned, setOrgGoverned] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacySaveStatus, setPrivacySaveStatus] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    fetch('/api/v1/privacy/me', {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setPrivacy({
          coppa_enabled: data.coppa_enabled,
          data_sharing_enabled: data.data_sharing_enabled,
          ai_enabled: data.ai_enabled,
        });
        setPrivacyConfigured(!data.role_defaults_applied);
        setOrgGoverned(data.org_governed ?? false);
      })
      .catch(() => {});
  }, []);

  const handlePrivacySave = async () => {
    setPrivacySaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/v1/privacy/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ferpa_enabled: false, ...privacy }),
      });
      if (res.ok) {
        setPrivacyConfigured(true);
        setPrivacyBannerDismissed(true);
        localStorage.setItem('privacy_banner_dismissed', 'true');
        setPrivacySaveStatus('Privacy settings saved.');
        setTimeout(() => setPrivacySaveStatus(''), 3000);
      }
    } catch {
      setPrivacySaveStatus('Error saving privacy settings.');
    } finally {
      setPrivacySaving(false);
    }
  };

  const toggle = (label: string, desc: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, cursor: orgGoverned ? 'default' : 'pointer', opacity: orgGoverned ? 0.6 : 1 }}>
      <input type="checkbox" checked={checked} disabled={orgGoverned}
        onChange={e => onChange(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
      <span>
        <strong style={{ fontSize: '0.9rem' }}>{label}</strong>
        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</span>
      </span>
    </label>
  );

  const btnStyle: React.CSSProperties = {
    padding: '9px 22px', borderRadius: 8, border: 'none',
    background: 'var(--accent)', color: '#fff',
    cursor: privacySaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.88rem',
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 560 }}>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 32 }}>{t('pages_homeschool_homeschoolsettingspage.settings', 'Settings')}</h1>

      {/* Account */}
      <div style={card}>
        <h2 style={h2s}>{t('pages_homeschool_homeschoolsettingspage.account', 'Account')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Name</span>
            <span style={{ fontWeight: 600 }}>{user?.full_name || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Email</span>
            <span style={{ fontWeight: 600 }}>{user?.email || '—'}</span>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div style={card}>
        <h2 style={h2s}>{t('pages_homeschool_homeschoolsettingspage.appearance', 'Appearance')}</h2>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, alignItems: 'center' }}>{t('pages_homeschool_homeschoolsettingspage.theme', 'Theme')}</label>
        <select value={skin} onChange={e => setSkin(e.target.value as Skin)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text, #333)', fontSize: '0.9rem', width: '100%' }}>
          {skins.map(s => <option key={s} value={s}>{SKIN_LABELS[s]}</option>)}
        </select>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>{t('pages_homeschool_homeschoolsettingspage.field_guide_green_warm_beige_terrain_ora', 'Field Guide (green + warm beige) · Terrain (orange + light) · Atmosphere (purple + dark)')}</p>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, marginTop: 16 }}>{t('pages_homeschool_homeschoolsettingspage.language', 'Language')}</label>
        <LocaleSwitcher />
      </div>

      {/* Privacy & Data */}
      <div style={card}>
        <h2 style={h2s}>{t('pages_homeschool_homeschoolsettingspage.privacy_amp_data', 'Privacy &amp; Data')}</h2>

        {orgGoverned ? (
          <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#1e40af' }}>
            🏫 Your privacy settings are managed by your co-op or organisation. Contact your administrator to make changes.
          </div>
        ) : privacyConfigured === false && !privacyBannerDismissed ? (
          <div style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#92400e' }}>
            ⚠ You're using default privacy settings. Review and save below to confirm your configuration.
          </div>
        ) : null}

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>{t('pages_homeschool_homeschoolsettingspage.as_a_homeschool_teacher_you_operate_outs', 'As a homeschool teacher you operate outside institutional FERPA requirements, but COPPA still applies to any child under 13.')}</p>

        {toggle(
          "COPPA — Children's Online Privacy Protection Act",
          'Required when any child is under 13. Restricts collection of location and audio data without parental consent.',
          privacy.coppa_enabled, v => setPrivacy(p => ({ ...p, coppa_enabled: v }))
        )}
        {toggle(
          'AI Features — Peri inquiry suggestions',
          'AI runs locally via Ollama. No student data leaves your server.',
          privacy.ai_enabled, v => setPrivacy(p => ({ ...p, ai_enabled: v }))
        )}
        {toggle(
          'Anonymous usage data',
          'Share anonymised platform statistics to help improve Peripateticware. No student records included.',
          privacy.data_sharing_enabled, v => setPrivacy(p => ({ ...p, data_sharing_enabled: v }))
        )}

        {privacySaveStatus && (
          <div style={{ fontSize: '0.85rem', color: privacySaveStatus.startsWith('Error') ? '#dc2626' : '#16a34a', marginBottom: 10 }}>
            {privacySaveStatus}
          </div>
        )}

        {!orgGoverned && (
          <button onClick={handlePrivacySave} disabled={privacySaving} style={btnStyle}>
            {privacySaving ? 'Saving…' : privacyConfigured ? 'Update Privacy Settings' : 'Confirm Privacy Settings'}
          </button>
        )}
      </div>

      {/* Password */}
      <div style={card}>
        <h2 style={h2s}>{t('pages_homeschool_homeschoolsettingspage.password', 'Password')}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 12 }}>{t('pages_homeschool_homeschoolsettingspage.change_your_account_password', 'Change your account password.')}</p>
        <button onClick={() => navigate('/forgot-password')}
          style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 500, fontSize: '0.88rem' }}>
          Reset Password
        </button>
      </div>

      {/* Sign Out removed — available in the sidebar (DashboardShell). */}
    </div>
  );
};

export default HomeschoolSettingsPage;
