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
import apiClient from '@/config/api';
import { useTranslation } from 'react-i18next';
import { EU_COUNTRIES, US_STATES, SUBDIVISION_SUPPORT, toSubdivisionCode } from '../constants/geo';

// Human-readable display metadata for resolved jurisdiction_ids, mirroring
// PrivacyConfirmationPage.tsx's JURISDICTION_META — kept small/duplicated
// rather than shared, since this wizard only needs a fallback label, not the
// full descriptive copy that page shows post-signup.
const JURISDICTION_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  ferpa_us:        { label: 'FERPA', desc: 'Family Educational Rights and Privacy Act — US school records', color: '#0369a1' },
  coppa_us:        { label: 'COPPA', desc: "Children's Online Privacy Protection Act — applies to under-13", color: '#7c3aed' },
  ccpa_california: { label: 'CCPA',  desc: 'California Consumer Privacy Act — applies to California residents', color: '#b45309' },
  gdpr_eu:         { label: 'GDPR',  desc: 'EU General Data Protection Regulation — applies to EU/EEA students', color: '#047857' },
};
const FALLBACK_JURISDICTION_COLOR = '#4b5563';

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
  const [region,      setRegion]      = useState('');  // optional 3rd tier: district/city/local law
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
  const [resolvedJurisdictions, setResolvedJurisdictions] = useState<
    Array<{ jurisdiction_id: string; is_verified: boolean; short_name?: string; full_name?: string }>
  >([]);
  const [saved, setSaved] = useState(false);

  // "Something not right?" — per the product decision that solo teachers
  // aren't privacy experts and shouldn't self-override an auto-applied
  // jurisdiction; this is their escape hatch instead of a toggle.
  const [showReviewForm,    setShowReviewForm]    = useState(false);
  const [reviewReason,      setReviewReason]      = useState('');
  const [reviewSubmitting,  setReviewSubmitting]  = useState(false);
  const [reviewSubmitted,   setReviewSubmitted]   = useState(false);

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
  // Calls the real resolver (backend/routes/privacy.py's
  // POST /jurisdictions/resolve) instead of the old /privacy/setup endpoint,
  // which never existed — every previous submission silently 404'd and the
  // wizard never actually saved a jurisdiction for anyone.

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const subdivisionCode = isUS
        ? toSubdivisionCode('US', usState)
        : (SUBDIVISION_SUPPORT.has(country) && usState ? `${country}-${usState}` : undefined);

      const resp = await apiClient.post('/privacy/jurisdictions/resolve', {
        country_code:     isUS ? 'US' : country,
        subdivision_code: subdivisionCode,
        region:           region || undefined,
        has_under_13:     hasUnder13 !== 'no',
      });
      setResolvedJurisdictions(resp.data?.resolved ?? []);
      setSaved(true);
      setSaving(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Could not save privacy settings — you can try again or configure them later in Settings.'
      );
      setSaving(false);
    }
  };

  const submitReviewRequest = async () => {
    setReviewSubmitting(true);
    try {
      await apiClient.post('/privacy/jurisdictions/request-review', { reason: reviewReason });
      setReviewSubmitted(true);
      setShowReviewForm(false);
    } catch {
      // non-blocking — the request itself failing shouldn't trap the user in the wizard
      setReviewSubmitted(true);
      setShowReviewForm(false);
    } finally {
      setReviewSubmitting(false);
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
          {SUBDIVISION_SUPPORT.has(country) && (
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                {t('components_privacysetupwizard.state_province', 'State / Province')}
              </label>
              <input
                value={usState}
                onChange={e => setUsState(e.target.value)}
                placeholder={t('components_privacysetupwizard.province_placeholder', 'e.g. Ontario, São Paulo, Bavaria')}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem',
                  border: '1px solid var(--border)', borderRadius: '0.35rem',
                  background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Region — optional 3rd tier, for anything more specific than state/
          province (a district, city, or local ordinance the teacher already
          knows applies). Feeds the resolver's fuzzy region-text catalog
          match; it's not required for the baseline country/state resolution
          to work. */}
      <div style={{ marginTop: '0.9rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
          {t('components_privacysetupwizard.region_optional', 'Region (optional)')}
        </label>
        <input
          value={region}
          onChange={e => setRegion(e.target.value)}
          placeholder={t('components_privacysetupwizard.region_placeholder', 'A specific district or local law, if you know of one')}
          style={{
            width: '100%', padding: '0.6rem 0.75rem',
            border: '1px solid var(--border)', borderRadius: '0.35rem',
            background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem',
            boxSizing: 'border-box',
          }}
        />
      </div>
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

    const locationStr = isUS
      ? (usState ? `${usState}, US` : 'United States')
      : (country || 'outside the US');

    // Before "Apply my settings" is clicked: a preview of what's LIKELY to
    // apply, computed client-side from the quiz answers alone.
    const previewActive: Array<keyof typeof JURISDICTION_LABELS> = [];
    if (ferpa)   previewActive.push('ferpa_us');
    if (coppa)   previewActive.push('coppa_us');
    if (isCalif) previewActive.push('ccpa_california');
    if (isEU)    previewActive.push('gdpr_eu');

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

        {!saved ? (
          previewActive.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('components_privacysetupwizard.frameworks_likely_to_apply', 'Frameworks likely to apply (confirmed once you apply your settings):')}</p>
              {previewActive.map(key => (
                <Badge key={key} {...JURISDICTION_LABELS[key]} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>{t('components_privacysetupwizard.no_specific_frameworks_are_preselected_b', 'No specific frameworks are pre-selected based on your answers — the system will check for anything applicable to your location once you apply your settings.')}</p>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('components_privacysetupwizard.frameworks_now_active_on_your_account', 'Frameworks now active on your account:')}</p>
            {resolvedJurisdictions.length > 0 ? resolvedJurisdictions.map(r => {
              const meta = JURISDICTION_LABELS[r.jurisdiction_id];
              return (
                <div key={r.jurisdiction_id}>
                  <Badge
                    label={meta?.label ?? r.short_name ?? r.jurisdiction_id}
                    desc={meta?.desc ?? r.full_name ?? ''}
                    color={meta?.color ?? FALLBACK_JURISDICTION_COLOR}
                  />
                  {!r.is_verified && (
                    <p style={{ fontSize: '0.72rem', color: '#92400e', margin: '0.2rem 0 0 0.9rem' }}>
                      {t('components_privacysetupwizard.auto_discovered_pending_review', 'Auto-discovered — pending legal review, applied conservatively in the meantime.')}
                    </p>
                  )}
                </div>
              );
            }) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('components_privacysetupwizard.no_specific_frameworks_found', 'No specific framework was found for your location — general child-safety-conscious defaults apply.')}</p>
            )}

            {/* Read-only by design: solo teachers aren't expected to be privacy
                experts, so this doesn't offer a self-service override toggle —
                only a way to flag it for a human to look at. */}
            {!reviewSubmitted ? (
              !showReviewForm ? (
                <button
                  type="button"
                  onClick={() => setShowReviewForm(true)}
                  style={{
                    alignSelf: 'flex-start', marginTop: '0.4rem', background: 'none', border: 'none',
                    color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer', padding: 0,
                  }}
                >
                  {t('components_privacysetupwizard.something_not_right', "Something not right? Let us know")}
                </button>
              ) : (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '0.4rem' }}>
                  <textarea
                    value={reviewReason}
                    onChange={e => setReviewReason(e.target.value)}
                    placeholder={t('components_privacysetupwizard.review_reason_placeholder', "What looks wrong? We'll route this to the right person to review.")}
                    rows={3}
                    style={{
                      width: '100%', padding: '0.5rem 0.6rem', border: '1px solid var(--border)',
                      borderRadius: '0.35rem', background: 'var(--bg)', color: 'var(--text)',
                      fontSize: '0.85rem', boxSizing: 'border-box', resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={submitReviewRequest}
                      disabled={!reviewReason.trim() || reviewSubmitting}
                      style={{
                        padding: '0.4rem 0.9rem', borderRadius: '0.35rem', border: 'none',
                        background: 'var(--primary)', color: '#fff', fontSize: '0.8rem',
                        cursor: reviewReason.trim() ? 'pointer' : 'not-allowed',
                        opacity: reviewReason.trim() ? 1 : 0.6,
                      }}
                    >
                      {reviewSubmitting ? 'Sending…' : 'Send'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReviewForm(false)}
                      style={{ padding: '0.4rem 0.9rem', borderRadius: '0.35rem', border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.4rem' }}>
                {t('components_privacysetupwizard.review_submitted', 'Thanks — sent for review.')}
              </p>
            )}
          </div>
        )}

        <div style={{
          padding: '0.65rem 0.9rem', borderRadius: '0.4rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '1rem',
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

  const isLastStep = step === TOTAL_STEPS - 1;
  const nextLabel = !isLastStep
    ? 'Next'
    : saved
      ? 'Done'
      : (saving ? 'Applying…' : 'Apply my settings');
  const handleAdvance = !isLastStep
    ? () => setStep(s => s + 1)
    : (saved ? () => onComplete(result) : save);

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
          onClick={handleAdvance}
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
