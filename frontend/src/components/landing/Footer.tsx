// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation('landing');
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-inner">
        {/* Column 1: Brand */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.brand_title')}</h3>
          <p className="footer-desc">{t('footer.brand_desc')}</p>
          <div className="footer-badges">
            <span className="badge">SOC 2</span>
            <span className="badge">COPPA</span>
            <span className="badge">FERPA</span>
            <span className="badge">GDPR</span>
          </div>
        </div>

        {/* Column 2: Product */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.product_title')}</h3>
          <ul className="footer-links">
            <li><a href="#features">{t('footer.product_features')}</a></li>
            <li><a href="#tools">{t('footer.product_tools')}</a></li>
            <li><a href="#pricing">{t('footer.product_pricing')}</a></li>
            <li><a href="#demo">{t('footer.product_demo')}</a></li>
          </ul>
        </div>

        {/* Column 3: Company */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.company_title')}</h3>
          <ul className="footer-links">
            <li><a href="#about">{t('footer.company_about')}</a></li>
            <li><a href="#team">{t('footer.company_team')}</a></li>
            <li><a href="#blog">{t('footer.company_blog')}</a></li>
            <li><a href="#careers">{t('footer.company_careers')}</a></li>
          </ul>
        </div>

        {/* Column 4: Resources */}
        <div className="footer-column">
          <h3 className="footer-title">{t('footer.resources_title')}</h3>
          <ul className="footer-links">
            <li><a href="#docs">{t('footer.resources_docs')}</a></li>
            <li><a href="#guides">{t('footer.resources_guides')}</a></li>
            <li><a href="#api">{t('footer.resources_api')}</a></li>
            <li><a href="#support">{t('footer.resources_support')}</a></li>
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
