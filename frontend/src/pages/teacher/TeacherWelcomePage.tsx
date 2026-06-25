// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * TeacherWelcomePage  —  /teacher/welcome
 *
 * Two-step onboarding wizard shown to new teachers on first login.
 * Step 1: Privacy setup (PrivacySetupWizard — location, student ages, data prefs)
 * Step 2: Invite students to first classroom (or skip)
 *
 * Dismissed via POST /api/v1/onboarding/dismiss — never shown again.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ChevronLeft, X } from 'lucide-react';
import apiClient from '@/config/api';
import { useTranslation } from 'react-i18next';
import PrivacySetupWizard, { PrivacyResult } from '../../components/PrivacySetupWizard';

const API = import.meta.env.VITE_API_URL || '/api/v1';

const STEPS = ['Privacy Setup', 'Invite Students'];

export default function TeacherWelcomePage() {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [privacyResult, setPrivacyResult] = useState<PrivacyResult | null>(null);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const dismiss = async () => {
    await apiClient.post(`${API}/onboarding/dismiss`).catch(() => null);
    navigate('/teacher');
  };

  const handlePrivacyComplete = (result: PrivacyResult) => {
    setPrivacyResult(result);
    setStep(1);
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      // Create a default classroom if we don't have one yet
      let cid = classroomId;
      if (!cid) {
        const res = await apiClient.post(`${API}/classrooms`, {
          name: 'My First Class',
          grade_level: 'mixed',
        });
        cid = res.data.id;
        setClassroomId(cid);
      }
      await apiClient.post(`${API}/classrooms/${cid}/invites`, {
        email: inviteEmail.trim(),
      });
      setInviteMsg(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (e: any) {
      setInviteMsg(`Error: ${e.response?.data?.detail || e.message}`);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 580,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '0.75rem', overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--primary)', padding: '1.5rem 2rem', position: 'relative' }}>
          <button
            onClick={dismiss}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0.25rem' }}
            title="Skip setup"
          >
            <X size={18} />
          </button>
          <h1 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
            {t('pages_teacher_teacherwelcomepage.welcome_to_peripateticware', 'Welcome to Peripateticware 🌿')}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
            {t('pages_teacher_teacherwelcomepage.lets_get_your_classroom_set_up', "Let's get your classroom set up.")}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', padding: '1rem 2rem', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
          {STEPS.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: i < step ? 'var(--primary)' : i === step ? 'var(--primary)' : 'var(--border)',
                color: i <= step ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
              }}>
                {i < step ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span style={{
                fontSize: '0.75rem',
                color: i === step ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: i === step ? 600 : 400,
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: '0.25rem' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: step === 0 ? '0' : '1.75rem 2rem' }}>

          {/* ── Step 0: Privacy Setup (delegated to PrivacySetupWizard) ── */}
          {step === 0 && (
            <div style={{ padding: '1.75rem 2rem' }}>
              <PrivacySetupWizard
                userRole="teacher"
                onComplete={handlePrivacyComplete}
              />
            </div>
          )}

          {/* ── Step 1: Invite students ── */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                {t('pages_teacher_teacherwelcomepage.invite_your_first_students', 'Invite your first students')}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                {t('pages_teacher_teacherwelcomepage.send_invite_links_to_students_or_parent', 'Send invite links to students or parents. They\'ll create an account and join your classroom automatically.')}
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                  placeholder="student@example.com"
                  style={{
                    flex: 1, padding: '0.55rem 0.75rem',
                    border: '1px solid var(--border)', borderRadius: '0.35rem',
                    background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem',
                  }}
                />
                <button
                  onClick={sendInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  style={{
                    padding: '0.55rem 1.1rem', borderRadius: '0.35rem',
                    background: 'var(--primary)', color: '#fff',
                    border: 'none', fontWeight: 600, fontSize: '0.875rem',
                    cursor: inviting ? 'wait' : 'pointer',
                    opacity: (inviting || !inviteEmail.trim()) ? 0.6 : 1,
                  }}
                >
                  {inviting ? 'Sending…' : 'Invite'}
                </button>
              </div>

              {inviteMsg && (
                <p style={{
                  fontSize: '0.825rem',
                  color: inviteMsg.startsWith('Error') ? '#b91c1c' : '#15803d',
                  marginBottom: '0.75rem',
                }}>
                  {inviteMsg}
                </p>
              )}

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('pages_teacher_teacherwelcomepage.you_can_also_bulk_import_via_csv_from_t', 'You can also bulk-import via CSV from the Classrooms page.')}
              </p>
            </div>
          )}
        </div>

        {/* Navigation footer (step 1 only — step 0 has its own nav inside PrivacySetupWizard) */}
        {step === 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '1rem 2rem', borderTop: '1px solid var(--border)',
            background: 'var(--surface-alt, var(--surface))',
          }}>
            <button
              onClick={() => setStep(0)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}
            >
              <ChevronLeft size={16} />
              Back
            </button>

            <button
              onClick={dismiss}
              style={{
                padding: '0.55rem 1.4rem', borderRadius: '0.4rem',
                background: 'var(--primary)', color: '#fff',
                border: 'none', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              Go to dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
