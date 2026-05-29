import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import styles from './SettingsPages.module.css';

export const AdminSettingsPage = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [settings, setSettings] = useState({
    colorScheme: 'field-guide',
    language: 'en',
    notificationsEnabled: true,
    soundEnabled: true,
    theme: 'light',
    systemAlertsEnabled: true,
    auditLogsEnabled: true,
    maintenanceMode: false,
    debugMode: false
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
      systemAlertsEnabled: true,
      auditLogsEnabled: true,
      maintenanceMode: false,
      debugMode: false
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
        <h1>{t("landing:admin_settings", "Admin Settings")}</h1>
        <button onClick={() => navigate('/admin/users')} className={styles.backBtn}>{t("landing:back_to_dashboard", "\u2190 Back to Dashboard")}

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
          <h2>{t("landing:system_management", "System Management")}</h2>
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.systemAlertsEnabled}
                onChange={(e) => handleChange('systemAlertsEnabled', e.target.checked)} />{t("landing:system_alerts_enabled", "System Alerts Enabled")}


            </label>
            <p className={styles.helpText}>{t("landing:get_notified_of_system_errors_and_warnin", "Get notified of system errors and warnings")}</p>
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.auditLogsEnabled}
                onChange={(e) => handleChange('auditLogsEnabled', e.target.checked)} />{t("landing:audit_logs_enabled", "Audit Logs Enabled")}


            </label>
            <p className={styles.helpText}>{t("landing:track_all_administrative_actions", "Track all administrative actions")}</p>
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
                style={{ accentColor: '#dc2626' }} />
              
              <span style={{ color: '#dc2626', fontWeight: 600 }}>{t("landing:maintenance_mode", "Maintenance Mode")}</span>
            </label>
            <p className={styles.helpText}>{t("landing:disable_access_for_nonadmin_users", "Disable access for non-admin users")}</p>
          </div>

          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.debugMode}
                onChange={(e) => handleChange('debugMode', e.target.checked)} />{t("landing:debug_mode", "Debug Mode")}


            </label>
            <p className={styles.helpText}>{t("landing:enable_detailed_logging_and_error_report", "Enable detailed logging and error reporting")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{t("landing:general_preferences", "General Preferences")}</h2>
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
            <p>{t("landing:email_adminexamplecom", "Email: admin@example.com")}</p>
            <button className={styles.secondaryBtn}>{t("landing:change_email", "Change Email")}</button>
          </div>

          <div className={styles.settingGroup}>
            <p>{t("landing:password_last_changed_30_days_ago", "Password last changed: 30 days ago")}</p>
            <button className={styles.secondaryBtn}>{t("landing:change_password", "Change Password")}</button>
          </div>
        </section>

        <section className={styles.section}>
          <h2>{t("landing:system_information", "System Information")}</h2>
          <div className={styles.settingGroup}>
            <p><strong>{t("landing:version", "Version:")}</strong> 1.0.0</p>
            <p><strong>{t("landing:adminsettingspage.last_updated", "Last Updated:")}</strong> 2026-05-24</p>
            <p><strong>{t("landing:database", "Database:")}</strong>{t("landing:postgresql_16_pgvector", "PostgreSQL 16 + pgvector")}</p>
          </div>
        </section>

        <section className={styles.section} style={{ borderColor: '#dc2626' }}>
          <h2 style={{ color: '#dc2626' }}>{t("landing:danger_zone", "Danger Zone")}</h2>
          <button onClick={handleLogout} className={styles.dangerBtn}>{t("landing:adminsettingspage.logout", "\uD83D\uDEAA Logout")}

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