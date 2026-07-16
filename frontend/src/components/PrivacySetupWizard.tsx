// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PrivacySetupWizard
 *
 * Reusable 4-step onboarding wizard that:
 *   1. IP-geolocates the user to pre-fill country / US state
 *   2. Asks where they are teaching (confirms/overrides geo)
 *   3. Asks about student age range  (drives COPPA)
 *   4. Asks data & AI preferences
 *   5. Shows a summary of the derived frameworks + saves via POST /api/v1/privacy/setup
 *
 * Used by TeacherWelcomePage and HomeschoolWelcomePage.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API = import.meta.env.VITE_API_URL || '/api/v1';

// ── Constants ─────────────────────────────────────────────────────────────────

const EU_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK',
];

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrivacyResult {
  ferpa_enabled:        boolean;
  coppa_enabled:        boolean;
  data_sharing_enabled: boolean;
  ai_enabled:           boolean;
  ccpa_applicable:      boolean;
  gdpr_applicable:      boolean;
}

interface Props {
  userRole:       'teacher' | 'homeschool';
  prefilledState?: string;   // pass from a prior wizard step (e.g. HomeschoolWelcome's state picker)
  onComplete:     (result: PrivacyResult) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fw = (label: string, desc: string, color: string) => ({ label, desc, color });

const FRAMEWORKS = {
  FERPA:  fw('FERPA',  'Family Educational Rights and Privacy Act — US school records',       '#0369a1'),
  COPPA:  fw('COPPA',  "Children's Online Privacy Protection Act — applies to under-13",      '#7c3aed'),
  CCPA:   fw('CCPA',   'California Consumer Privacy Act — applies to California residents',   '#b45309'),
  GDPR:   fw('GDPR',   'EU General Data Protection Regulation — applies to EU/EEA students', '#047857'),
};

const Badge: React.FC<{ label: string; desc: string; color: string }> = ({ label, desc, color }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
    padding: '0.65rem 0.9rem', borderRadius: '0.4rem',
    border: `1px solid ${color}22`, background: `${color}0a`,
  }}>
    <span style={{
      flexShrink: 0, fontWeight: 700, fontSize: '0.75rem',
      color, background: `${color}18`, borderRadius: '0.25rem',
      padding: '0.1rem 0.4rem',
    }}>{label}</span>
    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</span>
  </div>
);

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}> = ({ checked, onChange, label, hint }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0' }}>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink: 0, width: 42, height: 24, borderRadius: 12,
        border: 'none', cursor: 'pointer', position: 'relative',
        background: checked ? 'var(--primary)' : 'var(--border)',
        transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
    <div>
      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text)' }}>{label}</div>
      {hint && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{hint}</div>}
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const PrivacySetupWizard: React.FC<Props> = ({ userRole, prefilledState, onComplete }) => {
  const { t } = useTranslation('landing');
  // Geo state
  const [country,     setCountry]     = useState('US');
  const [usState,     setUsState]     = useState(prefilledState || '');
  const [isUS,        setIsUS]        = useState(true);
  const [geoLoading,  setGeoLoading]  = useState(true);
  const [geoDetected, setGeoDetected] = useState('');  // human-readable detected location

  // Quiz state
  const [hasUnder13,  setHasUnder13]  = useState<'yes' | 'no' | 'mix'>('mix');
  const [aiEnabled,   setAiEnabled]   = useState(true);
  const [dataSharing, setDataSharing] = useState(false);

  // UI state
  const [step,   setStep]   = useState(0);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // ── IP geolocation ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (prefilledState) {
      // State already captured from a prior wizard step — skip geo call
      setGeoDetected(prefilledState + ', US');
      setGeoLoading(false);
      return;
    }
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(d => {
        const cc = d.country_code || 'US';
        setCountry(cc);
        setIsUS(cc === 'US');
        if (cc === 'US' && d.region) {
          setUsState(d.region);
          setGeoDetected(d.region + ', US');
        } else if (d.country_name) {
          setGeoDetected(d.country_name);
        }
      })
      .catch(() => { /* silent — user can fill manually */ })
      .finally(() => setGeoLoading(false));
  }, [prefilledState]);

  // ── Derived flags ───────────────────────────────────────────────────────────

  const isCalif    = isUS && usState === 'California';
  const isEU       = EU_COUNTRIES.includes(country);
  const ferpa      = userRole === 'teacher' && isUS;
  const coppa      = hasUnder13 !== 'no';

  const result: PrivacyResult = {
    ferpa_enabled:        ferpa,
    coppa_enabled:        coppa,
    data_sharing_enabled: dataSharing,
    ai_enabled:           aiEnabled,
    ccpa_applicable:      isCalif,
    gdpr_applicable:      isEU,
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await axios.post(`${API}/privacy/setup`, {
        ...result,
        home_state:   isUS ? usState : '',
        home_country: country,
        has_under_13: hasUnder13,
        role:         userRole,
      });
      onComplete(result);
    } catch {
      setError('Could not save privacy settings — you can try again or configure them later in Settings.');
      setSaving(false);
    }
  };

  // ── Step content ────────────────────────────────────────────────────────────

  const TOTAL_STEPS = 4; // 0-indexed: location, students, data prefs, summary

  const StepDots = () => (
    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? 20 : 8, height: 8, borderRadius: 4,
          background: i <= step ? 'var(--primary)' : 'var(--border)',
          transition: 'all 0.2s',
        }} />
      ))}
    </div>
  );

  // ── Step 0: Location ────────────────────────────────────────────────────────

  const LocationStep = () => (
    <div>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>{t('components_privacysetupwizard.where_are_you_teaching', 'Where are you teaching?')}</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        This tells Peripateticware which data privacy laws apply to your students.
        {geoDetected && !geoLoading && (
          <> We detected <strong>{geoDetected}</strong> — confirm or change below.</>
        )}
        {geoLoading && <> Detecting your location…</>}
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => { setIsUS(true); setCountry('US'); }}
          style={{
            flex: 1, padding: '0.7rem', borderRadius: '0.4rem', cursor: 'pointer',
            border: `2px solid ${isUS ? 'var(--primary)' : 'var(--border)'}`,
            background: isUS ? 'var(--primary-light, #eff6ff)' : 'var(--surface)',
            color: isUS ? 'var(--primary)' : 'var(--text)',
            fontWeight: isUS ? 600 : 400, fontSize: '0.875rem',
          }}
        >
          🇺🇸 United States
        </button>
        <button
          type="button"
          onClick={() => { setIsUS(false); setCountry(''); setUsState(''); }}
          style={{
            flex: 1, padding: '0.7rem', borderRadius: '0.4rem', cursor: 'pointer',
            border: `2px solid ${!isUS ? 'var(--primary)' : 'var(--border)'}`,
            background: !isUS ? 'var(--primary-light, #eff6ff)' : 'var(--surface)',
            color: !isUS ? 'var(--primary)' : 'var(--text)',
            fontWeight: !isUS ? 600 : 400, fontSize: '0.875rem',
          }}
        >
          🌍 Outside the US
        </button>
      </div>

      {isUS ? (
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>{t('components_privacysetupwizard.state', 'State')}</label>
          <select
            value={usState}
            onChange={e => setUsState(e.target.value)}
            style={{
              width: '100%', padding: '0.6rem 0.75rem',
              border: '1px solid var(--border)', borderRadius: '0.35rem',
              background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem',
            }}
          >
            <option value="">{t('components_privacysetupwizard.select_your_state', '— Select your state —')}</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {usState === 'California' && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#b45309', lineHeight: 1.4 }}>{t('components_privacysetupwizard.california_schools_may_be_subject_to_ccp', '📋 California schools may be subject to CCPA in addition to FERPA &amp; COPPA.')}</p>
          )}
        </div>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>{t('components_privacysetupwizard.country', 'Country')}</label>
          <input
            value={country}
            onChange={e => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            placeholder={t('components_privacysetupwizard.placeholder_2letter_country_code_eg_de_fr_gb', '2-letter country code, e.g. DE, FR, GB')}
            maxLength={2}
            style={{
              width: '100%', padding: '0.6rem 0.75rem',
              border: '1px solid var(--border)', borderRadius: '0.35rem',
              background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
          {EU_COUNTRIES.includes(country) && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#047857', lineHeight: 1.4 }}>{t('components_privacysetupwizard.eu_country_gdpr_applies_your_platform_ad', '🇪🇺 EU country — GDPR applies. Your platform administrator will need to enable it.')}</p>
          )}
        </div>
      )}
    </div>
  );

  // ── Step 1: Students ────────────────────────────────────────────────────────

  const StudentsStep = () => (
    <div>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>{t('components_privacysetupwizard.tell_us_about_your_students', 'Tell us about your students')}</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>{t('components_privacysetupwizard.coppa_childrens_online_privacy_protectio', 'COPPA (Children\'s Online Privacy Protection Act) applies when any student is under 13.')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {([
          { value: 'no',  label: 'All 13+',         hint: 'High school or middle school — no COPPA obligation' },
          { value: 'mix', label: 'Mixed ages',       hint: 'Some students may be under 13 — COPPA applies to those' },
          { value: 'yes', label: 'All or mostly under 13', hint: 'Elementary / K-5 — COPPA applies to all student data' },
        ] as const).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setHasUnder13(opt.value)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '0.75rem 1rem', borderRadius: '0.4rem', cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${hasUnder13 === opt.value ? 'var(--primary)' : 'var(--border)'}`,
              background: hasUnder13 === opt.value ? 'var(--primary-light, #eff6ff)' : 'var(--surface)',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: hasUnder13 === opt.value ? 'var(--primary)' : 'var(--text)' }}>
              {opt.label}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {opt.hint}
            </span>
          </button>
        ))}
      </div>

      {ferpa && (
        <p style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.4 }}>{t('components_privacysetupwizard.ferpa_applies_to_all_your_students_regar', 'ℹ️ FERPA applies to all your students regardless of age since you teach at a US school.')}</p>
      )}
    </div>
  );

  // ── Step 2: Data prefs ──────────────────────────────────────────────────────

  const DataPrefsStep = () => (
    <div>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>{t('components_privacysetupwizard.ai_amp_data_preferences', 'AI &amp; data preferences')}</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>{t('components_privacysetupwizard.these_defaults_apply_to_your_account_stu', 'These defaults apply to your account. Students and parents can set their own preferences, and you can change yours at any time in Settings.')}</p>

      <div style={{ borderTop: '1px solid var(--border)' }}>
        <Toggle
          checked={aiEnabled}
          onChange={setAiEnabled}
          label="Allow AI to analyse student submissions"
          hint="Peri uses AI to suggest rubric feedback and learning insights. Student data stays on your server or your chosen provider."
        />
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <Toggle
          checked={dataSharing}
          onChange={setDataSharing}
          label="Share anonymised usage data to improve Peripateticware"
          hint="Activity patterns (never student PII) help improve AI suggestions and curriculum standards matching. Off by default."
        />
      </div>

      <div style={{
        marginTop: '1.25rem', padding: '0.75rem 1rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5,
      }}>{t('components_privacysetupwizard.student_data_is_never_sold_or_shared_wit', '🔒 Student data is never sold or shared with advertisers. You can export or delete all data at any time under Admin &gt; Privacy Configuration.')}</div>
    </div>
  );

  // ── Step 3: Summary ─────────────────────────────────────────────────────────

  const SummaryStep = () => {
  const { t } = useTranslation('landing');
    const active: Array<keyof typeof FRAMEWORKS> = [];
    if (ferpa)   active.push('FERPA');
    if (coppa)   active.push('COPPA');
    if (isCalif) active.push('CCPA');
    if (isEU)    active.push('GDPR');

    const locationStr = isUS
      ? (usState ? `${usState}, US` : 'United States')
      : (country || 'outside the US');

    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>🛡️</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('components_privacysetupwizard.your_privacy_setup', 'Your privacy setup')}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Based on your answers — {locationStr},{' '}
            {userRole === 'teacher' ? 'school teacher' : 'homeschool educator'},{' '}
            {hasUnder13 === 'no' ? 'students 13+' : hasUnder13 === 'mix' ? 'mixed ages' : 'students under 13'}.
          </p>
        </div>

        {active.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('components_privacysetupwizard.frameworks_now_active_on_your_account', 'Frameworks now active on your account:')}</p>
            {active.map(key => (
              <Badge key={key} {...FRAMEWORKS[key]} />
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>{t('components_privacysetupwizard.no_specific_frameworks_are_preselected_b', 'No specific frameworks are pre-selected based on your answers. You can enable them any time in Settings.')}</p>
        )}

        {(isCalif || isEU) && (
          <div style={{
            padding: '0.65rem 0.9rem', borderRadius: '0.4rem',
            background: '#fffbeb', border: '1px solid #fbbf24',
            fontSize: '0.78rem', color: '#92400e', lineHeight: 1.5, marginBottom: '1rem',
          }}>
            ⚠ {isCalif ? 'CCPA' : ''}
            {isCalif && isEU ? ' and ' : ''}
            {isEU ? 'GDPR' : ''} require a platform-level activation by your administrator.
            Your location has been noted — ask your admin to enable the relevant framework in
            Admin &gt; Privacy Configuration.
          </div>
        )}

        <div style={{
          padding: '0.65rem 0.9rem', borderRadius: '0.4rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5,
        }}>
          AI analysis: <strong>{aiEnabled ? 'enabled' : 'disabled'}</strong> ·{' '}
          Anonymised data sharing: <strong>{dataSharing ? 'enabled' : 'disabled'}</strong>
          <br />You can change any of these in Settings &gt; Privacy &amp; Data at any time.
        </div>

        {error && (
          <p style={{ marginTop: '0.75rem', color: '#b91c1c', fontSize: '0.8rem' }}>{error}</p>
        )}
      </div>
    );
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const canAdvance = () => {
    if (step === 0 && isUS && !usState) return false;   // must pick a state
    if (step === 0 && !isUS && !country) return false;  // must enter country
    return true;
  };

  const nextLabel = step === TOTAL_STEPS - 1 ? (saving ? 'Saving…' : 'Confirm & continue') : 'Next';

  // ── Outer card ──────────────────────────────────────────────────────────────

  return (
    <div>
      <StepDots />

      <div style={{ minHeight: 260 }}>
        {step === 0 && <LocationStep />}
        {step === 1 && <StudentsStep />}
        {step === 2 && <DataPrefsStep />}
        {step === 3 && <SummaryStep />}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)',
      }}>
        <button
          type="button"
          onClick={() => step > 0 ? setStep(s => s - 1) : undefined}
          style={{
            background: 'none', border: 'none', fontSize: '0.875rem',
            color: step === 0 ? 'transparent' : 'var(--text-muted)',
            cursor: step === 0 ? 'default' : 'pointer',
            pointerEvents: step === 0 ? 'none' : 'auto',
            display: 'flex', alignItems: 'center', gap: '0.25rem',
          }}
        >
          ← Back
        </button>

        <button
          type="button"
          onClick={step === TOTAL_STEPS - 1 ? save : () => setStep(s => s + 1)}
          disabled={!canAdvance() || saving}
          style={{
            padding: '0.6rem 1.5rem', borderRadius: '0.4rem',
            background: canAdvance() && !saving ? 'var(--primary)' : 'var(--border)',
            color: canAdvance() && !saving ? '#fff' : 'var(--text-muted)',
            border: 'none', fontWeight: 600, fontSize: '0.875rem',
            cursor: canAdvance() && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
};

export default PrivacySetupWizard;
