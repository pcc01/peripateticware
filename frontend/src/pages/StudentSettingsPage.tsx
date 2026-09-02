import { useTranslation } from 'react-i18next';
import { useSkin, SKIN_LABELS, type Skin } from '@/hooks/useSkin';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { MfaSettings } from '@/components/account/MfaSettings';
import styles from './SettingsPages.module.css';

export const StudentSettingsPage = () => {
  const { t } = useTranslation('landing');
  const { skin, setSkin, skins } = useSkin();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [settings, setSettings] = useState({
    colorScheme: 'field-guide',
    language: 'en',
    notificationsEnabled: true,
    soundEnabled: true,
    theme: 'light'
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const handleChange = (key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
    setSaveStatus('');
  };

  const handleSave = async () => {
    try {
      // TODO: Connect to API to save settings
      setSaveStatus('Settings saved successfully!');
      setHasChanges(false);
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      setSaveStatus('Error saving settings');
    }
  };

  const handleReset = () => {
    setSettings({
      colorScheme: 'field-guide',
      language: 'en',
      notificationsEnabled: true,
      soundEnabled: true,
      theme: 'light'
    });
    setHasChanges(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>{t("landing:student_settings", "Student Settings")}</h1>
        <button onClick={() => navigate('/student/activities')} className={styles.backBtn}>{t("landing:back_to_dashboard", "\u2190 Back to Dashboard")}

        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2>{t("landing:appearance", "Appearance")}</h2>
          <div className={styles.settingGroup}>
            <label>{t("landing:color_scheme", "Color Scheme")}</label>
            <select
              value={skin}
              onChange={(e) => setSkin(e.target.value as Skin)}
              className={styles.select}>
              {skins.map((s) => (
                <option key={s} value={s}>{SKIN_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className={styles.settingGroup}>
            <label>{t("landing:theme", "Theme")}</label>
            <div className={styles.radioGroup}>
              <label>
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  checked={settings.theme === 'light'}
                  onChange={(e) => handleChange('theme', e.target.value)} />{t("landing:light", "Light")}


              </label>
              <label>
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  checked={settings.theme === 'dark'}
                  onChange={(e) => handleChange('theme', e.target.value)} />{t("landing:dark", "Dark")}


              </label>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{t("landing:preferences", "Preferences")}</h2>
          <div className={styles.settingGroup}>
            <label>{t("landing:language", "Language")}</label>
            <LocaleSwitcher className={styles.select} onChanged={() => handleChange('language', 'changed')} />
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(e) => handleChange('notificationsEnabled', e.target.checked)} />{t("landing:enable_notifications", "Enable Notifications")}


            </label>
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => handleChange('soundEnabled', e.target.checked)} />{t("landing:enable_sound_effects", "Enable Sound Effects")}


            </label>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{t("landing:account", "Account")}</h2>
          <div className={styles.settingGroup}>
            <p>{t("landing:email_studentexamplecom", "Email: student@example.com")}</p>
            <button className={styles.secondaryBtn}>{t("landing:change_email", "Change Email")}</button>
          </div>

          <div className={styles.settingGroup}>
            <p>{t("landing:password_last_changed_30_days_ago", "Password last changed: 30 days ago")}</p>
            <button className={styles.secondaryBtn}>{t("landing:change_password", "Change Password")}</button>
          </div>
          <div className={styles.settingGroup}>
            <p>{t('landing:two_factor_authentication', 'Two-Factor Authentication')}</p>
            <MfaSettings />
          </div>
        </section>

        {/* 14d.3 — My Data section */}
        <section className={styles.section}>
          <h2>{t("landing:my_data", "My Data")}</h2>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            {t("landing:my_data_desc", "Download or delete your personal data. This cannot be undone.")}
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('auth_token')
                  const res = await fetch('/api/v1/privacy/my-data', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                  })
                  const data = await res.json()
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url
                  a.download = 'my-peripateticware-data.json'; a.click()
                  URL.revokeObjectURL(url)
                } catch { alert('Export failed') }
              }}
              className={styles.saveBtn}
            >
              {t("landing:download_my_data", "⬇ Download My Data")}
            </button>
            <button
              onClick={async () => {
                if (!confirm(t("landing:confirm_delete_data", "Delete all your personal data? This cannot be undone."))) return
                try {
                  const token = localStorage.getItem('auth_token')
                  await fetch('/api/v1/privacy/my-data', {
                    method: 'DELETE',
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                  })
                  alert(t("landing:data_deleted", "Your data has been anonymised."))
                } catch { alert('Deletion failed') }
              }}
              className={styles.dangerBtn}
            >
              {t("landing:delete_my_data", "🗑 Delete My Data")}
            </button>
          </div>
        </section>

        {/* Logout removed \u2014 available in the sidebar (DashboardShell). */}

        {saveStatus &&
        <div className={styles.statusMessage}>
            {saveStatus}
          </div>
        }

        <div className={styles.actions}>
          <button
            onClick={handleReset}
            className={styles.secondaryBtn}
            disabled={!hasChanges}>{t("landing:reset_to_defaults", "Reset to Defaults")}


          </button>
          <button
            onClick={handleSave}
            className={styles.primaryBtn}
            disabled={!hasChanges}>{t("landing:save_settings", "Save Settings")}


          </button>
        </div>
      </main>
    </div>);

};