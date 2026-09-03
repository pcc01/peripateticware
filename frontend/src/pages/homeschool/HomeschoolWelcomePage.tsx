// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * HomeschoolWelcomePage — /homeschool/welcome
 *
 * Three-step onboarding wizard shown to new homeschool parents on first login.
 * Step 1: Add children (name + grade)
 * Step 2: Pick your state / standards set (optional but recommended)
 * Step 3: Create your first activity (or skip to dashboard)
 *
 * Dismissed via POST /api/v1/onboarding/dismiss — never shown again.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ChevronRight, ChevronLeft, X } from 'lucide-react';
import apiClient from '@/config/api';
import { useTranslation } from 'react-i18next';
import { PRODUCT_NAME } from '../../constants/brand';

// ── US States list ────────────────────────────────────────────────────────────
// [code, name] pairs — kept in sync with HomeschoolRequirementsPage.tsx's US_STATES
// list so the state code selected here matches what that page reads from
// localStorage (LS_STATE_KEY / 'hs_state_code').
const US_STATES: [string, string][] = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];

// Same localStorage key HomeschoolRequirementsPage.tsx reads on mount (its
// `stateCode` initial state is `localStorage.getItem(LS_STATE_KEY)`).
const LS_STATE_KEY = 'hs_state_code';

// ── Step indicators ───────────────────────────────────────────────────────────
const STEPS = ['Add Children', 'Your State', 'First Activity'];

interface Child {
  name:       string;
  grade:      string;
  age_band:   string;
}

interface CreatedChildCredential {
  name:     string;
  email:    string;   // the child's login (a synthetic address, not a real inbox)
  password: string;
}

// Readable, unique per-child password. Kid-typeable and satisfies the
// backend's complexity rule (upper + lower + digit + special). NOT a shared
// constant — every child gets their own, surfaced to the parent once.
const NATURE_WORDS = [
  'Oak', 'Fern', 'River', 'Maple', 'Cedar', 'Moss', 'Pine', 'Birch',
  'Willow', 'Heron', 'Otter', 'Finch', 'Aspen', 'Clover', 'Hazel', 'Reed',
];
function generateChildPassword(): string {
  const rand = (n: number) => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return crypto.getRandomValues(new Uint32Array(1))[0] % n;
    }
    return Math.floor(Math.random() * n);
  };
  const w1 = NATURE_WORDS[rand(NATURE_WORDS.length)];
  const w2 = NATURE_WORDS[rand(NATURE_WORDS.length)].toLowerCase();
  const digits = String(100 + rand(900)); // 3 digits
  return `${w1}${w2}${digits}!`;
}

// ── Main component ────────────────────────────────────────────────────────────
const HomeschoolWelcomePage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate  = useNavigate();
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Step 1 state
  const [children, setChildren] = useState<Child[]>([
    { name: '', grade: '1', age_band: 'k6' },
  ]);
  // After children are created: their generated logins, shown to the parent
  // once (they're never recoverable in plaintext later — parent resets from
  // the Children page if lost).
  const [createdCredentials, setCreatedCredentials] = useState<CreatedChildCredential[] | null>(null);
  const [credsCopied, setCredsCopied] = useState(false);

  // Step 2 state — 2-letter state code (e.g. 'CA'), matching
  // HomeschoolRequirementsPage.tsx's stateCode / LS_STATE_KEY convention.
  // Pre-fill from whatever the parent already picked: an existing
  // hs_state_code, or the state chosen on the signup form's Teaching Context
  // step (stored as hs_signup_subdivision — may be a code OR a full name).
  const [selectedState, setSelectedState] = useState<string>(() => {
    try {
      const existing = localStorage.getItem(LS_STATE_KEY);
      if (existing) return existing;
      const fromSignup = (localStorage.getItem('hs_signup_subdivision') || '').trim();
      if (fromSignup) {
        const up = fromSignup.toUpperCase();
        const match = US_STATES.find(
          ([code, name]) => code === up || name.toLowerCase() === fromSignup.toLowerCase(),
        );
        if (match) return match[0];
      }
    } catch { /* ignore */ }
    return '';
  });

  const handleStateSelect = (code: string) => {
    setSelectedState(code);
    // Only persist a non-empty selection — never overwrite an existing
    // hs_state_code with '' if the parent clears/skips this step.
    if (code) {
      try { localStorage.setItem(LS_STATE_KEY, code); } catch { /* ignore */ }
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addChild = () =>
    setChildren(prev => [...prev, { name: '', grade: '1', age_band: 'k6' }]);

  const updateChild = (i: number, field: keyof Child, value: string) =>
    setChildren(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const removeChild = (i: number) =>
    setChildren(prev => prev.filter((_, idx) => idx !== i));

  const saveChildren = async () => {
    const valid = children.filter(c => c.name.trim());
    if (!valid.length) { setError('Please add at least one child.'); return; }
    setError(null);
    setSaving(true);
    let anyFailed = false;
    const created: CreatedChildCredential[] = [];
    try {
      for (const child of valid) {
        // The wizard only asks for name/grade, but the backend needs a login.
        // Generate a synthetic address (kids rarely have their own email) and
        // a UNIQUE, random per-child password — surfaced to the parent below,
        // never a shared constant.
        const slug = child.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'child';
        // Not @homeschool.local — `.local` is an RFC 6762 special-use TLD that
        // pydantic's EmailStr rejects. A subdomain of the real product domain
        // passes validation and can't collide with a real user's own email.
        const email = `${slug}.${Math.random().toString(36).slice(2, 7)}@homeschool.peripateticware.com`;
        const password = generateChildPassword();
        try {
          await apiClient.post(`/homeschool/children`, {
            full_name:   child.name.trim(),
            email,
            password,
            grade_level: parseInt(child.grade) || 0,
            age_band:    child.age_band,
          });
          created.push({ name: child.name.trim(), email, password });
        } catch (err: any) {
          if (err?.statusCode === 402 || err?.response?.status === 402) {
            const body = err?.originalError?.response?.data ?? err?.response?.data ?? {};
            if (body?.code === 'UPGRADE_REQUIRED') {
              window.dispatchEvent(new CustomEvent('upgrade-required', { detail: body }));
            }
          }
          anyFailed = true;
        }
      }
      if (anyFailed) {
        setError('Some children could not be saved automatically — you can add them later from the Children page.');
      }
      if (created.length) {
        // Show the credentials panel before advancing — the parent must be
        // able to copy/print these; they can't be shown again in plaintext.
        setCreatedCredentials(created);
      } else {
        setStep(1);
      }
    } finally {
      setSaving(false);
    }
  };

  const credentialsText = (creds: CreatedChildCredential[]) =>
    creds.map(c => `${c.name}\n  Login:    ${c.email}\n  Password: ${c.password}`).join('\n\n');

  const copyCredentials = async () => {
    if (!createdCredentials) return;
    try {
      await navigator.clipboard.writeText(credentialsText(createdCredentials));
      setCredsCopied(true);
      setTimeout(() => setCredsCopied(false), 2500);
    } catch { /* clipboard blocked — the parent can still select the text */ }
  };

  const dismiss = async () => {
    // Persist a local flag FIRST so the dashboard never bounces back here even if
    // the onboarding API is unavailable (this was the "can't close / infinite loop").
    try { localStorage.setItem('hs_onboarding_dismissed', '1'); } catch { /* ignore */ }
    await apiClient.post(`/onboarding/dismiss`).catch(() => null);
    navigate('/homeschool');
  };

  const goToDashboard = async () => {
    await dismiss();
  };

  const goToNewActivity = async () => {
    await apiClient.post(`/onboarding/dismiss`).catch(() => null);
    navigate('/homeschool/activities/new');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '0.75rem', overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--primary)', padding: '1.5rem 2rem', position: 'relative' }}>
          <button
            onClick={goToDashboard}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0.25rem' }}
            title={t('pages_homeschool_homeschoolwelcomepage.title_skip_setup', 'Skip setup')}
          >
            <X size={18} />
          </button>
          <h1 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>{`Welcome to ${PRODUCT_NAME} 🌿`}</h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', margin: '0.4rem 0 0', fontSize: '0.9rem' }}>{t('pages_homeschool_homeschoolwelcomepage.lets_get_you_set_up_in_3_quick_steps', 'Let\'s get you set up in 3 quick steps.')}</p>
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
        <div style={{ padding: '1.75rem 2rem' }}>

          {/* ── Step 0a: child logins created — show once ── */}
          {step === 0 && createdCredentials && (
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                {t('pages_homeschool_homeschoolwelcomepage.childrens_logins', 'Your children\'s logins')}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {t('pages_homeschool_homeschoolwelcomepage.save_these_now', 'Save or print these now — for your child\'s privacy we can\'t show the password again. You can reset it any time from the Children page.')}
              </p>
              <div style={{
                border: '1px solid var(--border)', borderRadius: '0.5rem',
                background: 'var(--bg)', padding: '0.75rem 1rem', marginBottom: '0.75rem',
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}>
                {createdCredentials.map((c, i) => (
                  <div key={i} style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {t('pages_homeschool_homeschoolwelcomepage.login_label', 'Login')}: <code style={{ color: 'var(--text)' }}>{c.email}</code>
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {t('pages_homeschool_homeschoolwelcomepage.password_label', 'Password')}: <code style={{ color: 'var(--text)' }}>{c.password}</code>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={copyCredentials}
                style={{
                  background: 'none', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: '0.35rem',
                  padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                {credsCopied
                  ? t('pages_homeschool_homeschoolwelcomepage.copied', 'Copied ✓')
                  : t('pages_homeschool_homeschoolwelcomepage.copy_all', 'Copy all')}
              </button>
              {error && <p style={{ color: '#b45309', fontSize: '0.8rem', marginTop: '0.75rem' }}>{error}</p>}
            </div>
          )}

          {/* ── Step 0: Children ── */}
          {step === 0 && !createdCredentials && (
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>{t('pages_homeschool_homeschoolwelcomepage.who_are_you_teaching', 'Who are you teaching?')}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>{t('pages_homeschool_homeschoolwelcomepage.add_each_childs_name_and_grade_you_can_a', 'Add each child\'s name and grade. You can add more children later from the Children page.')}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                {children.map((child, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      value={child.name}
                      onChange={e => updateChild(i, 'name', e.target.value)}
                      placeholder={`Child ${i + 1} name`}
                      style={{
                        flex: '1 1 160px', padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border)', borderRadius: '0.35rem',
                        background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem',
                      }}
                    />
                    <select
                      value={child.grade}
                      onChange={e => updateChild(i, 'grade', e.target.value)}
                      style={{
                        padding: '0.5rem 0.75rem', border: '1px solid var(--border)',
                        borderRadius: '0.35rem', background: 'var(--bg)', color: 'var(--text)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {['K','1','2','3','4','5','6','7','8','9','10','11','12'].map(g => (
                        <option key={g} value={g === 'K' ? '0' : g}>Grade {g}</option>
                      ))}
                    </select>
                    {children.length > 1 && (
                      <button
                        onClick={() => removeChild(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addChild}
                style={{
                  background: 'none', border: '1px dashed var(--border)',
                  color: 'var(--text-muted)', borderRadius: '0.35rem',
                  padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.8rem',
                  width: '100%', marginBottom: '1.25rem',
                }}
              >{t('pages_homeschool_homeschoolwelcomepage.add_another_child', '+ Add another child')}</button>

              {error && <p style={{ color: '#b91c1c', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>}
            </div>
          )}

          {/* ── Step 1: State ── */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>{t('pages_homeschool_homeschoolwelcomepage.which_state_do_you_homeschool_in', 'Which state do you homeschool in?')}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>{t('pages_homeschool_homeschoolwelcomepage.this_helps_peripateticware_show_the_righ', 'This helps Peripateticware show the right state reporting requirements and standards sets. You can change this any time in Settings.')}</p>
              <select
                value={selectedState}
                onChange={e => handleStateSelect(e.target.value)}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem',
                  border: '1px solid var(--border)', borderRadius: '0.35rem',
                  background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem',
                  marginBottom: '1.25rem',
                }}
              >
                <option value="">{t('pages_homeschool_homeschoolwelcomepage.select_your_state_optional', '— Select your state (optional) —')}</option>
                {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('pages_homeschool_homeschoolwelcomepage.35_us_states_require_homeschool_parents_', '35 US states require homeschool parents to keep learning records. Peripateticware generates the reports automatically from your activity log.')}</p>
            </div>
          )}

          {/* ── Step 2: First activity ── */}
          {step === 2 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌿</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>{t('pages_homeschool_homeschoolwelcomepage.youre_all_set', 'You\'re all set!')}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>{t('pages_homeschool_homeschoolwelcomepage.ready_to_create_your_first_outdoor_activ', 'Ready to create your first outdoor activity? Peri will suggest Aristotelian inquiry questions tailored to your location and subject.')}</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={goToNewActivity}
                  style={{
                    padding: '0.7rem 1.5rem', borderRadius: '0.4rem',
                    background: 'var(--primary)', color: '#fff',
                    border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                  }}
                >{t('pages_homeschool_homeschoolwelcomepage.create_first_activity', 'Create first activity →')}</button>
                <button
                  onClick={goToDashboard}
                  style={{
                    padding: '0.7rem 1.25rem', borderRadius: '0.4rem',
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >{t('pages_homeschool_homeschoolwelcomepage.go_to_dashboard', 'Go to dashboard')}</button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation footer */}
        {step < 2 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '1rem 2rem', borderTop: '1px solid var(--border)',
            background: 'var(--surface-alt, var(--surface))',
          }}>
            <button
              onClick={() => step > 0 ? setStep(s => s - 1) : goToDashboard()}
              disabled={step === 0 && !!createdCredentials}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: (step === 0 && !!createdCredentials) ? 'default' : 'pointer',
                visibility: (step === 0 && !!createdCredentials) ? 'hidden' : 'visible',
                display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}
            >
              <ChevronLeft size={16} />
              {step === 0 ? 'Skip setup' : 'Back'}
            </button>

            <button
              onClick={() => {
                if (step === 0 && createdCredentials) { setCreatedCredentials(null); setStep(1); }
                else if (step === 0) saveChildren();
                else setStep(s => s + 1);
              }}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.55rem 1.3rem', borderRadius: '0.4rem',
                background: 'var(--primary)', color: '#fff',
                border: 'none', fontWeight: 600, fontSize: '0.875rem',
                cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : (step === 0 && createdCredentials) ? 'I\'ve saved these' : 'Continue'}
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeschoolWelcomePage;
