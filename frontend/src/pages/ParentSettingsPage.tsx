import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useSkin, SKIN_LABELS, type Skin } from '@/hooks/useSkin';
import styles from './SettingsPages.module.css';

export const ParentSettingsPage = () => {
  const { t } = useTranslation('landing');
  const { skin, setSkin, skins } = useSkin();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [settings, setSettings] = useState({
    colorScheme: 'field-guide',
    language: 'en',
    notificationsEnabled: true,
    soundEnabled: true,
    theme: 'light',
    progressNotifications: true,
    weeklyDigest: true,
    activityUpdates: true
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
      theme: 'light',
      progressNotifications: true,
      weeklyDigest: true,
      activityUpdates: true
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
        <h1>{t("landing:parent_settings", "Parent Settings")}</h1>
        <button onClick={() => navigate('/parent/progress')} className={styles.backBtn}>{t("landing:back_to_dashboard", "\u2190 Back to Dashboard")}

        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2>{t("landing:appearance", "Appearance")}</h2>
          <div className={styles.settingGroup}>
            <label>{t("landing:color_scheme", "Theme")}</label>
            <select
              value={skin}
              onChange={(e) => setSkin(e.target.value as Skin)}
              className={styles.select}>
              {skins.map(s => <option key={s} value={s}>{SKIN_LABELS[s]}</option>)}
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
          <h2>{t("landing:parentsettingspage.notifications", "Notifications")}</h2>
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.progressNotifications}
                onChange={(e) => handleChange('progressNotifications', e.target.checked)} />{t("landing:student_progress_updates", "Student Progress Updates")}


            </label>
            <p className={styles.helpText}>{t("landing:get_notified_when_students_reach_milesto", "Get notified when students reach milestones")}</p>
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.activityUpdates}
                onChange={(e) => handleChange('activityUpdates', e.target.checked)} />{t("landing:activity_completions", "Activity Completions")}


            </label>
            <p className={styles.helpText}>{t("landing:get_notified_when_students_complete_acti", "Get notified when students complete activities")}</p>
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.weeklyDigest}
                onChange={(e) => handleChange('weeklyDigest', e.target.checked)} />{t("landing:weekly_digest", "Weekly Digest")}


            </label>
            <p className={styles.helpText}>{t("landing:receive_a_weekly_summary_of_student_prog", "Receive a weekly summary of student progress")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{t("landing:general_preferences", "General Preferences")}</h2>
          <div className={styles.settingGroup}>
            <label>{t("landing:language", "Language")}</label>
            <LocaleSwitcher className={styles.select} onChanged={() => handleChange('language', 'changed')} />
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(e) => handleChange('notificationsEnabled', e.target.checked)} />{t("landing:enable_all_notifications", "Enable All Notifications")}


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
            <p>{t("landing:email_parentexamplecom", "Email: parent@example.com")}</p>
            <button className={styles.secondaryBtn}>{t("landing:change_email", "Change Email")}</button>
          </div>

          <div className={styles.settingGroup}>
            <p>{t("landing:password_last_changed_30_days_ago", "Password last changed: 30 days ago")}</p>
            <button className={styles.secondaryBtn}>{t("landing:change_password", "Change Password")}</button>
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