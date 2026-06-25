import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useSkin, SKIN_LABELS, type Skin } from '@/hooks/useSkin';
import styles from './SettingsPages.module.css';

const ADMIN_TOKEN_KEY = 'admin_panel_token';

export const AdminSettingsPage = () => {
  const { t } = useTranslation('landing');
  const { skin, setSkin, skins } = useSkin();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  // Admin panel auth (separate from main JWT)
  const [adminToken, setAdminToken] = useState<string>(localStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [adminLoginUsername, setAdminLoginUsername] = useState('admin');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');

  // Env vars loaded from backend
  const [envCategories, setEnvCategories] = useState<any[]>([]);
  const [editingEnv, setEditingEnv] = useState<Record<string, string>>({});
  const [envSaveStatus, setEnvSaveStatus] = useState<Record<string, string>>({});
  const [envLoading, setEnvLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyStatus, setNewKeyStatus] = useState('');

  const handleAddConfigKey = async () => {
    if (!newKeyName.trim() || !adminToken) return;
    setNewKeyStatus('saving');
    try {
      const res = await fetch(`/api/v1/admin/env/${newKeyName.trim()}?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newKeyValue }),
      });
      if (res.ok) {
        setNewKeyStatus('saved');
        setNewKeyName('');
        setNewKeyValue('');
        loadEnvVars();
        setTimeout(() => setNewKeyStatus(''), 2000);
      } else {
        setNewKeyStatus('error');
      }
    } catch {
      setNewKeyStatus('error');
    }
  };

  // UI settings (local only)
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

  // Load env vars when token is available
  useEffect(() => {
    if (adminToken) loadEnvVars();
  }, [adminToken]);

  const handleAdminLogin = async () => {
    setAdminLoginError('');
    try {
      const res = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminLoginUsername, password: adminLoginPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAdminLoginError(err.detail || 'Login failed');
        return;
      }
      const data = await res.json();
      const token = data.token;
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      setAdminToken(token);
      setAdminLoginPassword('');
    } catch {
      setAdminLoginError('Could not connect to admin API');
    }
  };

  const loadEnvVars = async () => {
    setEnvLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/env?token=${adminToken}`);
      if (res.status === 401) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setAdminToken('');
        return;
      }
      const data = await res.json();
      setEnvCategories(Array.isArray(data) ? data : []);
    } catch {
      setEnvCategories([]);
    } finally {
      setEnvLoading(false);
    }
  };

  const handleEnvChange = (key: string, value: string) => {
    setEditingEnv((prev) => ({ ...prev, [key]: value }));
  };

  const handleEnvSave = async (key: string) => {
    const value = editingEnv[key];
    if (value === undefined) return;
    setEnvSaveStatus((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      const res = await fetch(`/api/v1/admin/env/${key}?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('Save failed');
      setEnvSaveStatus((prev) => ({ ...prev, [key]: 'saved' }));
      setTimeout(() => setEnvSaveStatus((prev) => ({ ...prev, [key]: '' })), 2000);
      setEditingEnv((prev) => { const n = { ...prev }; delete n[key]; return n; });
      loadEnvVars();
    } catch {
      setEnvSaveStatus((prev) => ({ ...prev, [key]: 'error' }));
    }
  };

  const handleChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveStatus('');
  };

  const handleSave = async () => {
    try {
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
            <label>{t("landing:color_scheme", "Theme")}</label>
            <select value={skin} onChange={(e) => setSkin(e.target.value as Skin)} className={styles.select}>
              {skins.map(s => <option key={s} value={s}>{SKIN_LABELS[s]}</option>)}
            </select>
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
            <LocaleSwitcher className={styles.select} />
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

        {/* ── Environment Variable Editor ─────────────────────────── */}
        <section className={styles.section}>
          <h2>{t('pages_adminsettingspage.environment_variables', '⚙️ Environment Variables')}</h2>
          {!adminToken ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
              <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{t('pages_adminsettingspage.log_in_with_the_admin_panel_credentials_', 'Log in with the admin panel credentials to view and edit environment variables.')}</p>
              <input
                type="text"
                placeholder="Username"
                value={adminLoginUsername}
                onChange={(e) => setAdminLoginUsername(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              />
              <input
                type="password"
                placeholder="Password"
                value={adminLoginPassword}
                onChange={(e) => setAdminLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              />
              {adminLoginError && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{adminLoginError}</p>}
              <button onClick={handleAdminLogin} className={styles.primaryBtn}>
                Unlock Env Panel
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <button onClick={loadEnvVars} className={styles.secondaryBtn} disabled={envLoading}>
                  {envLoading ? 'Loading…' : '↻ Refresh'}
                </button>
                <button
                  onClick={() => { localStorage.removeItem('admin_panel_token'); setAdminToken(''); setEnvCategories([]); }}
                  className={styles.secondaryBtn}
                >
                  Lock Panel
                </button>
              </div>
              {envCategories.map((cat: any) => (
                <details key={cat.category} style={{ marginBottom: 12 }}>
                  <summary style={{ fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
                    {cat.category} ({cat.variables?.length || 0})
                  </summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(cat.variables || []).map((v: any) => (
                      <div key={v.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ minWidth: 200, fontSize: '0.8rem', fontFamily: 'monospace', color: '#374151' }}>
                          {v.key}
                        </label>
                        <input
                          type={v.encrypted ? 'password' : 'text'}
                          defaultValue={v.value}
                          onChange={(e) => handleEnvChange(v.key, e.target.value)}
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.8rem', fontFamily: 'monospace' }}
                        />
                        <button
                          onClick={() => handleEnvSave(v.key)}
                          style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 4,
                            background: envSaveStatus[v.key] === 'saved' ? '#059669' : '#3b82f6',
                            color: 'white', border: 'none', cursor: 'pointer' }}
                          disabled={!editingEnv[v.key]}
                        >
                          {envSaveStatus[v.key] === 'saving' ? '…' : envSaveStatus[v.key] === 'saved' ? '✓' : 'Save'}
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              {envCategories.length === 0 && !envLoading && (
                <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{t('pages_adminsettingspage.no_environment_variables_loaded', 'No environment variables loaded.')}</p>
              )}

              {/* Add Configuration Key */}
              {adminToken && (
                <div style={{ marginTop: 20, padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#166534', margin: '0 0 12px' }}>{t('pages_adminsettingspage.add_configuration_key', '➕ Add Configuration Key')}</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="KEY_NAME"
                      value={newKeyName}
                      onChange={e => setNewKeyName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                      style={{ flex: '1 1 160px', padding: '7px 10px', borderRadius: 6, border: '1px solid #86efac', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                    <input
                      type="text"
                      placeholder="value"
                      value={newKeyValue}
                      onChange={e => setNewKeyValue(e.target.value)}
                      style={{ flex: '2 1 200px', padding: '7px 10px', borderRadius: 6, border: '1px solid #86efac', fontSize: '0.85rem' }}
                    />
                    <button
                      onClick={handleAddConfigKey}
                      disabled={!newKeyName.trim() || newKeyStatus === 'saving'}
                      style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#16a34a', color: 'white', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', opacity: !newKeyName.trim() ? 0.5 : 1 }}
                    >
                      {newKeyStatus === 'saving' ? '…' : newKeyStatus === 'saved' ? '✓ Saved' : newKeyStatus === 'error' ? 'Error' : 'Add Key'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#166534', marginTop: 8 }}>{t('pages_adminsettingspage.key_names_are_autouppercased_value_is_sa', 'Key names are auto-uppercased. Value is saved immediately and loaded on next server restart.')}</p>
                </div>
              )}
            </div>
          )}
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