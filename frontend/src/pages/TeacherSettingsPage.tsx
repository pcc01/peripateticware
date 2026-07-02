// Copyright (c) 2026 Paul Christopher Cerda
import { useTranslation } from 'react-i18next';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useSkin, SKIN_LABELS, type Skin } from '@/hooks/useSkin';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import styles from './SettingsPages.module.css';

export const TeacherSettingsPage = () => {
  const { t } = useTranslation('landing');
  const { skin, setSkin, skins } = useSkin();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [settings, setSettings] = useState({
    notificationsEnabled: true,
    soundEnabled: true,
    theme: 'light',
    defaultRubric: 'bloom',
    autoSaveEnabled: true,
    studentNotificationsEnabled: true,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // ── Privacy preferences ────────────────────────────────────────────────────
  const [privacy, setPrivacy] = useState({
    ferpa_enabled: true,
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
          ferpa_enabled: data.ferpa_enabled,
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
        body: JSON.stringify(privacy),
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

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveStatus('');
  };

  const handleSave = async () => {
    try {
      setSaveStatus('Settings saved successfully!');
      setHasChanges(false);
      setTimeout(() => setSaveStatus(''), 3000);
    } catch {
      setSaveStatus('Error saving settings');
    }
  };

  const handleReset = () => {
    setSettings({ notificationsEnabled: true, soundEnabled: true, theme: 'light', defaultRubric: 'bloom', autoSaveEnabled: true, studentNotificationsEnabled: true });
    setHasChanges(false);
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const privacyToggle = (label: string, desc: string, checked: boolean, disabled: boolean, onChange: (v: boolean) => void) => (
    <div className={styles.settingGroup} key={label}>
      <label className={styles.checkboxLabel} style={{ alignItems: 'flex-start', gap: 10 }}>
        <input type="checkbox" checked={checked} disabled={disabled}
          onChange={e => onChange(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <strong>{label}</strong>
          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</span>
        </span>
      </label>
    </div>
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>{t('landing:teacher_settings', 'Teacher Settings')}</h1>
        <button onClick={() => navigate('/teacher/activities')} className={styles.backBtn}>
          {t('landing:back_to_dashboard', '← Back to Dashboard')}
        </button>
      </header>

      <main className={styles.main}>

        {/* Appearance */}
        <section className={styles.section}>
          <h2>{t('landing:appearance', 'Appearance')}</h2>
          <div className={styles.settingGroup}>
            <label>{t('landing:color_scheme', 'Color Scheme')}</label>
            <select value={skin} onChange={e => { setSkin(e.target.value as Skin); handleChange('theme', e.target.value); }} className={styles.select}>
              {skins.map(s => <option key={s} value={s}>{SKIN_LABELS[s]}</option>)}
            </select>
          </div>
        </section>

        {/* Teaching Preferences */}
        <section className={styles.section}>
          <h2>{t('landing:teaching_preferences', 'Teaching Preferences')}</h2>
          <div className={styles.settingGroup}>
            <label>{t('landing:default_assessment_rubric', 'Default Assessment Rubric')}</label>
            <select value={settings.defaultRubric} onChange={e => handleChange('defaultRubric', e.target.value)} className={styles.select}>
              <option value="bloom">{t('landing:blooms_taxonomy', "Bloom's Taxonomy")}</option>
              <option value="marzano">{t('landing:marzano', 'Marzano')}</option>
              <option value="dok">{t('landing:depth_of_knowledge', 'Depth of Knowledge')}</option>
              <option value="solo">{t('landing:solo', 'SOLO')}</option>
            </select>
          </div>
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={settings.autoSaveEnabled}
                onChange={e => handleChange('autoSaveEnabled', e.target.checked)} />
              {t('landing:autosave_activity_drafts', 'Auto-save Activity Drafts')}
            </label>
          </div>
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={settings.studentNotificationsEnabled}
                onChange={e => handleChange('studentNotificationsEnabled', e.target.checked)} />
              {t('landing:notify_students_of_feedback', 'Notify Students of Feedback')}
            </label>
          </div>
        </section>

        {/* General Preferences */}
        <section className={styles.section}>
          <h2>{t('landing:general_preferences', 'General Preferences')}</h2>
          <div className={styles.settingGroup}>
            <label>{t('landing:language', 'Language')}</label>
            <LocaleSwitcher className={styles.select} onChanged={() => handleChange('language', 'changed')} />
          </div>
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={settings.notificationsEnabled}
                onChange={e => handleChange('notificationsEnabled', e.target.checked)} />
              {t('landing:enable_notifications', 'Enable Notifications')}
            </label>
          </div>
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={settings.soundEnabled}
                onChange={e => handleChange('soundEnabled', e.target.checked)} />
              {t('landing:enable_sound_effects', 'Enable Sound Effects')}
            </label>
          </div>
        </section>

        {/* Privacy & Data */}
        <section className={styles.section}>
          <h2>{t('landing:privacy_data', 'Privacy & Data')}</h2>

          {orgGoverned ? (
            <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#1e40af' }}>
              🏫 Your privacy settings are managed by your school or organisation. Contact your administrator to make changes.
            </div>
          ) : privacyConfigured === false && !privacyBannerDismissed ? (
            <div style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#92400e' }}>
              ⚠ You're using default privacy settings. Review and save your preferences below to confirm your configuration.
            </div>
          ) : null}

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>{t('pages_teachersettingspage.these_settings_apply_to_your_account_and', 'These settings apply to your account and the activities you create. FERPA and COPPA compliance checks run automatically when you publish an activity.')}</p>

          {privacyToggle(
            'FERPA — Family Educational Rights and Privacy Act',
            'Required for US school teachers. Governs student education records.',
            privacy.ferpa_enabled, orgGoverned,
            v => setPrivacy(p => ({ ...p, ferpa_enabled: v }))
          )}
          {privacyToggle(
            'COPPA — Children\'s Online Privacy Protection Act',
            'Required when any student is under 13. Location and audio data subject to stricter rules.',
            privacy.coppa_enabled, orgGoverned,
            v => setPrivacy(p => ({ ...p, coppa_enabled: v }))
          )}
          {privacyToggle(
            'AI Features — Peri inquiry suggestions & lesson ideas',
            'AI runs locally via Ollama. No student data leaves your server.',
            privacy.ai_enabled, orgGoverned,
            v => setPrivacy(p => ({ ...p, ai_enabled: v }))
          )}
          {privacyToggle(
            'Anonymous usage data',
            'Share anonymised platform statistics to help improve Peripateticware. No student records included.',
            privacy.data_sharing_enabled, orgGoverned,
            v => setPrivacy(p => ({ ...p, data_sharing_enabled: v }))
          )}

          {privacySaveStatus && (
            <div style={{ fontSize: '0.85rem', color: privacySaveStatus.startsWith('Error') ? '#dc2626' : '#16a34a', marginBottom: 8 }}>
              {privacySaveStatus}
            </div>
          )}

          {!orgGoverned && (
            <button onClick={handlePrivacySave} disabled={privacySaving} className={styles.primaryBtn} style={{ marginTop: 8 }}>
              {privacySaving ? 'Saving…' : privacyConfigured ? 'Update Privacy Settings' : 'Confirm Privacy Settings'}
            </button>
          )}
        </section>

        {/* Account */}
        <section className={styles.section}>
          <h2>{t('landing:account', 'Account')}</h2>
          <div className={styles.settingGroup}>
            <p>{t('landing:email_teacherexamplecom', 'Email: teacher@example.com')}</p>
            <button className={styles.secondaryBtn}>{t('landing:change_email', 'Change Email')}</button>
          </div>
          <div className={styles.settingGroup}>
            <p>{t('landing:password_last_changed_30_days_ago', 'Password last changed: 30 days ago')}</p>
            <button className={styles.secondaryBtn}>{t('landing:change_password', 'Change Password')}</button>
          </div>
        </section>

        {/* Logout removed — available in the sidebar (DashboardShell). */}

        {saveStatus && <div className={styles.statusMessage}>{saveStatus}</div>}

        <div className={styles.actions}>
          <button onClick={handleReset} className={styles.secondaryBtn} disabled={!hasChanges}>
            {t('landing:reset_to_defaults', 'Reset to Defaults')}
          </button>
          <button onClick={handleSave} className={styles.primaryBtn} disabled={!hasChanges}>
            {t('landing:save_settings', 'Save Settings')}
          </button>
        </div>

      </main>
    </div>
  );
};
