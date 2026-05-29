// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getPrivacyStatus, type PrivacyStatusResult } from '../utils/privacy';

export const PrivacyPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatusResult | null>(null);

  useEffect(() => {
    getPrivacyStatus().then(status => setPrivacyStatus(status));
  }, []);

  return (
    <div className="privacy-page">
      {/* Header with back button */}
      <header className="privacy-header">
        <div className="privacy-header-inner">
          <button className="back-button" onClick={() => navigate('/')}>{t("landing:privacypage.back_to_home", "\u2190 Back to Home")}

          </button>
          <h1 className="privacy-title">{t("landing:peripateticware_privacy_engine", "Peripateticware Privacy Engine")}</h1>
          <p className="privacy-subtitle">{t('privacy.tagline')}</p>
        </div>
      </header>

      {/* Live status banner — shown only when API data is available */}
      {privacyStatus && privacyStatus.status !== 'unknown' && (
        <div style={{
          background: '#f0f7f4',
          borderBottom: '1px solid #c8e6d4',
          padding: '0.6rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.88rem',
          flexWrap: 'wrap',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d7d46', display: 'inline-block' }} />
            <strong style={{ color: '#2d4a3e' }}>
              {privacyStatus.active_rules_count} {t('privacy.jurisdictions_enforced', 'jurisdictions enforced')}
            </strong>
          </span>
          {privacyStatus.frameworks_enforced.length > 0 && (
            <span style={{ color: '#555' }}>
              {privacyStatus.frameworks_enforced.map(f => f.toUpperCase()).join(' · ')}
            </span>
          )}
          {privacyStatus.last_updated && (
            <span style={{ color: '#888', marginLeft: 'auto' }}>
              {t('privacy.last_updated', 'Last updated')}: {new Date(privacyStatus.last_updated).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Summary Hero Section */}
      <section className="privacy-summary">
        <div className="section-inner">
          <div className="summary-grid">
            <div className="summary-content">
              <h2 className="h-section">{t('privacy.summary_title')}</h2>
              <p className="lead">{t('privacy.summary_subtitle')}</p>
              <p className="body">{t('privacy.summary_desc')}</p>
              <button className="btn btn-primary">{t('privacy.summary_cta')}</button>
            </div>
            <div className="summary-visual">
              <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" className="privacy-icon">
                <rect width="400" height="300" fill="none" />
                <circle cx="200" cy="150" r="80" fill="#4a7c59" opacity="0.1" />
                <path
                  d="M 200 80 L 240 130 L 200 180 L 160 130 Z"
                  fill="#4a7c59"
                  stroke="#2d5037"
                  strokeWidth="2" />
                
                <circle cx="200" cy="130" r="15" fill="#2d5037" />
                <path d="M 200 145 L 200 190" stroke="#2d5037" strokeWidth="2" />
                <path d="M 180 160 L 220 160" stroke="#2d5037" strokeWidth="2" />
                <path d="M 180 175 L 220 175" stroke="#2d5037" strokeWidth="2" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="privacy-how-it-works">
        <div className="section-inner">
          <h2 className="h-section">{t('privacy.engine_core_title')}</h2>
          <p className="lead">{t('privacy.engine_core_desc')}</p>

          <div className="flow-diagram">
            <div className="flow-item">
              <div className="flow-icon">📸</div>
              <div className="flow-label">{t("landing:student_submits_evidence", "Student submits evidence")}</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-item">
              <div className="flow-icon">📍</div>
              <div className="flow-label">{t("landing:system_identifies_jurisdiction", "System identifies jurisdiction")}</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-item">
              <div className="flow-icon">⚙️</div>
              <div className="flow-label">{t("landing:loads_active_compliance_rules", "Loads active compliance rules")}</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-item">
              <div className="flow-icon">🔐</div>
              <div className="flow-label">{t("landing:encrypts_stores", "Encrypts & stores")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="privacy-features">
        <div className="section-inner">
          <h2 className="h-section">{t('privacy.supported_frameworks_title')}</h2>

          <div className="features-grid">
            {/* Jurisdiction Aware */}
            <div className="feature-card">
              <div className="feature-icon">🌍</div>
              <h3 className="h-card">{t('privacy.jurisdiction_aware_title')}</h3>
              <p className="body">{t('privacy.jurisdiction_aware_desc')}</p>
            </div>

            {/* Auto Updates */}
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3 className="h-card">{t('privacy.auto_updates_title')}</h3>
              <p className="body">{t('privacy.auto_updates_desc')}</p>
            </div>

            {/* Versioned Rules */}
            <div className="feature-card">
              <div className="feature-icon">📋</div>
              <h3 className="h-card">{t('privacy.versioned_rules_title')}</h3>
              <p className="body">{t('privacy.versioned_rules_desc')}</p>
            </div>

            {/* Extensible */}
            <div className="feature-card">
              <div className="feature-icon">🔧</div>
              <h3 className="h-card">{t('privacy.extensible_title')}</h3>
              <p className="body">{t('privacy.extensible_desc')}</p>
            </div>

            {/* Encrypted */}
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3 className="h-card">{t('privacy.encrypted_by_default_title')}</h3>
              <p className="body">{t('privacy.encrypted_by_default_desc')}</p>
            </div>

            {/* On-Device First */}
            <div className="feature-card">
              <div className="feature-icon">📱</div>
              <h3 className="h-card">{t('privacy.on_device_first_title')}</h3>
              <p className="body">{t('privacy.on_device_first_desc')}</p>
            </div>

            {/* Consent Framework */}
            <div className="feature-card">
              <div className="feature-icon">✓</div>
              <h3 className="h-card">{t('privacy.consent_framework_title')}</h3>
              <p className="body">{t('privacy.consent_framework_desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance Cards */}
      <section className="privacy-compliance">
        <div className="section-inner">
          <h2 className="h-section">{t('privacy.supported_frameworks_title', 'Supported Frameworks')}</h2>

          <div className="compliance-grid">
            {[
              { cls: 'ferpa', titleKey: 'privacy.ferpa_card_title', descKey: 'privacy.ferpa_card_desc', jid: 'US_FEDERAL' },
              { cls: 'coppa', titleKey: 'privacy.coppa_card_title', descKey: 'privacy.coppa_card_desc', jid: 'US_FEDERAL_COPPA' },
              { cls: 'gdpr',  titleKey: 'privacy.gdpr_card_title',  descKey: 'privacy.gdpr_card_desc',  jid: 'EU' },
              { cls: 'ccpa',  titleKey: 'privacy.ccpa_card_title',  descKey: 'privacy.ccpa_card_desc',  jid: 'US_CA' },
              { cls: 'custom', titleKey: 'privacy.custom_policy_card_title', descKey: 'privacy.custom_policy_card_desc', jid: null },
            ].map(card => {
              const isLive = card.jid
                ? privacyStatus?.jurisdictions?.includes(card.jid) ?? false
                : false;
              return (
                <div key={card.cls} className={`compliance-card ${card.cls}`} style={{ position: 'relative' }}>
                  {isLive && (
                    <span style={{
                      position: 'absolute', top: '0.75rem', right: '0.75rem',
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      background: '#e8f4ea', color: '#2d7d46',
                      borderRadius: 4, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2d7d46', display: 'inline-block' }} />
                      LIVE
                    </span>
                  )}
                  <h3 className="h-card">{t(card.titleKey)}</h3>
                  <p className="body">{t(card.descKey)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="privacy-cta">
        <div className="section-inner cta-content">
          <h2 className="h-section">{t('privacy.cta_section_title')}</h2>
          <p className="lead">{t('privacy.cta_section_subtitle')}</p>
          <p className="body">{t('privacy.cta_section_desc')}</p>
          <div className="cta-buttons">
            <button className="btn btn-primary">{t('privacy.cta_explore_docs', 'Explore Privacy Docs')}</button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>{t("landing:privacypage.back_to_home", "Back to Home")}</button>
          </div>
        </div>
      </section>
    </div>);

};

export default PrivacyPage;