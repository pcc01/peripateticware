// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

const API = '/api/v1/auth/mfa';

function authHeader() {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Step = 'loading' | 'off' | 'setup' | 'backup-codes' | 'on';

/**
 * Two-factor authentication (TOTP) settings, dropped into each role's
 * Account section (TeacherSettingsPage, AdminSettingsPage, etc.). Opt-in
 * for every role — not enforced — but the copy below specifically
 * recommends it for Teacher/Admin given their student-PII access.
 */
export function MfaSettings() {
  const [step, setStep] = useState<Step>('loading');
  const [secret, setSecret] = useState('');
  const [provisioningUri, setProvisioningUri] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedBackupCodes, setSavedBackupCodes] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableForm, setShowDisableForm] = useState(false);

  useEffect(() => {
    axios.get(`${API}/status`, { headers: authHeader() })
      .then(res => setStep(res.data.mfa_enabled ? 'on' : 'off'))
      .catch(() => setStep('off'));
  }, []);

  const startSetup = async () => {
    setError(''); setBusy(true);
    try {
      const res = await axios.post(`${API}/setup`, {}, { headers: authHeader() });
      setSecret(res.data.secret);
      setProvisioningUri(res.data.provisioning_uri);
      setCode('');
      setStep('setup');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not start MFA setup.');
    } finally { setBusy(false); }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await axios.post(`${API}/confirm`, { code: code.trim() }, { headers: authHeader() });
      setBackupCodes(res.data.backup_codes);
      setSavedBackupCodes(false);
      setStep('backup-codes');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid code. Check your authenticator app and try again.');
    } finally { setBusy(false); }
  };

  const finishBackupCodes = () => {
    setStep('on');
    setSecret(''); setProvisioningUri(''); setCode(''); setBackupCodes([]);
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await axios.post(`${API}/disable`, { password: disablePassword }, { headers: authHeader() });
      setDisablePassword('');
      setShowDisableForm(false);
      setStep('off');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Incorrect password.');
    } finally { setBusy(false); }
  };

  const regenerateBackupCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await axios.post(`${API}/regenerate-backup-codes`, { code: code.trim() }, { headers: authHeader() });
      setBackupCodes(res.data.backup_codes);
      setSavedBackupCodes(false);
      setCode('');
      setStep('backup-codes');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid code.');
    } finally { setBusy(false); }
  };

  const boxStyle: React.CSSProperties = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '1rem', marginTop: '0.5rem' };
  const errorStyle: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.6rem 0.8rem', borderRadius: 6, fontSize: '0.82rem', marginTop: '0.6rem' };
  const inputStyle: React.CSSProperties = { padding: '0.55rem 0.75rem', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', fontSize: '0.9rem', width: '100%', maxWidth: 220, boxSizing: 'border-box' };
  const btnStyle: React.CSSProperties = { padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: 'var(--primary, #166534)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
  const secondaryBtnStyle: React.CSSProperties = { ...btnStyle, background: 'transparent', border: '1px solid var(--border, #e5e5e5)', color: 'var(--text)' };

  if (step === 'loading') return null;

  return (
    <div style={boxStyle}>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Two-factor authentication adds a second step at login using an authenticator app (Google
        Authenticator, Authy, 1Password, etc.). Especially recommended for Teacher and Admin
        accounts, given their access to student data.
      </p>

      {step === 'off' && (
        <button onClick={startSetup} disabled={busy} style={btnStyle}>
          {busy ? 'Starting…' : 'Enable two-factor authentication'}
        </button>
      )}

      {step === 'setup' && (
        <div>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            1. Scan this QR code with your authenticator app (or enter the key manually).
          </p>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 8, display: 'inline-block' }}>
            <QRCodeSVG value={provisioningUri} size={180} />
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.5rem 0', wordBreak: 'break-all' }}>
            Manual entry key: <code>{secret}</code>
          </p>
          <form onSubmit={confirmSetup} style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>2. Enter the 6-digit code it shows:</p>
            <input
              type="text"
              autoFocus
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value)}
              style={inputStyle}
            />
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={busy || !code.trim()} style={btnStyle}>
                {busy ? 'Verifying…' : 'Confirm & Enable'}
              </button>
              <button type="button" onClick={() => { setStep('off'); setError(''); }} style={secondaryBtnStyle}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'backup-codes' && (
        <div>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Save these backup codes now — they won't be shown again.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Each code works once, if you ever lose access to your authenticator app.
          </p>
          <div style={{ background: 'var(--surface-alt, #f5f5f5)', borderRadius: 6, padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 1.8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem' }}>
            {backupCodes.map(c => <span key={c}>{c}</span>)}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.9rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={savedBackupCodes} onChange={e => setSavedBackupCodes(e.target.checked)} />
            I've saved these codes somewhere safe
          </label>
          <button onClick={finishBackupCodes} disabled={!savedBackupCodes} style={{ ...btnStyle, marginTop: '0.75rem' }}>
            Done
          </button>
        </div>
      )}

      {step === 'on' && (
        <div>
          <p style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600, margin: '0 0 0.75rem' }}>
            ✓ Two-factor authentication is enabled
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!showDisableForm && (
              <button onClick={() => { setShowDisableForm(true); setError(''); }} style={secondaryBtnStyle}>
                Disable
              </button>
            )}
          </div>

          {showDisableForm && (
            <form onSubmit={disable} style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>
                Confirm your password to disable:
              </label>
              <input
                type="password"
                autoFocus
                value={disablePassword}
                onChange={e => setDisablePassword(e.target.value)}
                style={inputStyle}
              />
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" disabled={busy || !disablePassword} style={btnStyle}>
                  {busy ? 'Disabling…' : 'Disable MFA'}
                </button>
                <button type="button" onClick={() => { setShowDisableForm(false); setDisablePassword(''); setError(''); }} style={secondaryBtnStyle}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!showDisableForm && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                Regenerate backup codes
              </summary>
              <form onSubmit={regenerateBackupCodes} style={{ marginTop: '0.6rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Enter a current 6-digit code to invalidate your old backup codes and generate new ones.
                </p>
                <input
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ marginTop: '0.6rem' }}>
                  <button type="submit" disabled={busy || !code.trim()} style={secondaryBtnStyle}>
                    {busy ? 'Regenerating…' : 'Regenerate'}
                  </button>
                </div>
              </form>
            </details>
          )}
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}
