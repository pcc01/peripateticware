import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import styles from './SettingsPages.module.css';

export const StudentSettingsPage = () => {
  const { t } = useTranslation('landing');
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
              value={settings.colorScheme}
              onChange={(e) => handleChange('colorScheme', e.target.value)}
              className={styles.select}>
              
              <option value="field-guide">{t("landing:field_guide_green", "Field Guide (Green)")}</option>
              <option value="terrain">{t("landing:terrain_orange", "Terrain (Orange)")}</option>
              <option value="atmosphere">{t("landing:atmosphere_dark", "Atmosphere (Dark)")}</option>
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
            <select
              value={settings.language}
              onChange={(e) => handleChange('language', e.target.value)}
              className={styles.select}>
              
              <option value="en">{t("landing:english", "English")}</option>
              <option value="es">{t("landing:espaol", "Espa\xF1ol")}</option>
              <option value="fr">{t("landing:franais", "Fran\xE7ais")}</option>
              <option value="ja">日本語</option>
              <option value="ar">العربية</option>
            </select>
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
        </section>

        <section className={styles.section} style={{ borderColor: '#dc2626' }}>
          <h2 style={{ color: '#dc2626' }}>{t("landing:danger_zone", "Danger Zone")}</h2>
          <button onClick={handleLogout} className={styles.dangerBtn}>{t("landing:studentsettingspage.logout", "\uD83D\uDEAA Logout")}

          </button>
        </section>

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