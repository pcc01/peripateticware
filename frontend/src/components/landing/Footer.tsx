// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation('landing');
  const currentYear = new Date().getFullYear();

  // 14g.1 — Dynamic privacy badges from active jurisdictions
  const [privacyBadges, setPrivacyBadges] = useState<string[]>(['COPPA', 'FERPA', 'GDPR', 'SOC 2'])
  useEffect(() => {
    fetch('/api/v1/privacy/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.active_frameworks?.length) {
          setPrivacyBadges(data.active_frameworks.map((f: string) => f.split('_')[0].toUpperCase()))
        }
      })
      .catch(() => {/* keep defaults */})
  }, [])

  return (
    <footer className="footer">
      <div className="footer-inner">
        {/* Column 1: Brand */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.brand_title')}</h3>
          <p className="footer-desc">{t('footer.brand_desc')}</p>
          <div className="footer-badges">
            {privacyBadges.map(badge => (
              <span key={badge} className="badge">{badge}</span>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
            {t('footer.privacy_protected', 'Your data is protected under these frameworks')}
          </p>
        </div>

        {/* Column 2: Product */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.product_title')}</h3>
          <ul className="footer-links">
            <li><Link to="/#features">{t('footer.product_features')}</Link></li>
            <li><Link to="/#tools">{t('footer.product_tools')}</Link></li>
            <li><Link to="/#pricing">{t('footer.product_pricing')}</Link></li>
            <li><Link to="/privacy-engine">{t('footer.product_privacy_engine', 'Privacy Engine')}</Link></li>
          </ul>
        </div>

        {/* Column 3: Company */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.company_title')}</h3>
          <ul className="footer-links">
            <li><Link to="/#about">{t('footer.company_about')}</Link></li>
            <li><a href="mailto:hello@peripateticware.com">{t('footer.company_contact', 'Contact')}</a></li>
            <li><a href="mailto:hello@peripateticware.com?subject=Careers">{t('footer.company_careers')}</a></li>
          </ul>
        </div>

        {/* Column 4: Resources */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.resources_title')}</h3>
          <ul className="footer-links">
            <li><Link to="/privacy-engine">{t('footer.resources_privacy', 'Privacy Engine')}</Link></li>
            <li><a href="mailto:hello@peripateticware.com?subject=Support">{t('footer.resources_support')}</a></li>
          </ul>
        </div>

        {/* Column 5: Legal — linked to real routes */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.legal_title')}</h3>
          <ul className="footer-links">
            <li><Link to="/privacy">{t('footer.legal_privacy')}</Link></li>
            <li><Link to="/terms">{t('footer.legal_terms')}</Link></li>
            <li><Link to="/cookies">{t('footer.legal_cookies')}</Link></li>
            <li><a href="mailto:hello@peripateticware.com">{t('footer.legal_contact')}</a></li>
          </ul>
        </div>
      </div>

      {/* Copyright */}
      <div className="footer-bottom">
        <p className="footer-copyright">
          © {currentYear} {t('footer.company_name')}. {t('footer.all_rights')}
        </p>
      </div>
    </footer>
  );
}

export default Footer;
