// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const TermsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            {t('termspage.back_to_home', '← Back to Home')}
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {t('termspage.terms_of_service', 'Terms of Service')}
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 prose prose-gray">
        <p className="text-sm text-gray-500 mb-8">{t('termspage.last_updated_may_2026', 'Last updated: May 2026')}</p>

        <h2>{t('termspage.1_acceptance_of_terms', '1. Acceptance of Terms')}</h2>
        <p>{t('termspage.by_accessing_or_using_peripateticware_ld', 'By accessing or using Peripateticware (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.')}</p>

        <h2>{t('termspage.2_description_of_service', '2. Description of Service')}</h2>
        <p>{t('termspage.peripateticware_is_an_outdoor_and_peripa', 'Peripateticware is an outdoor and peripatetic learning platform designed for teachers, students, and families. It enables geo-tagged activities, student evidence capture, and curriculum-aligned portfolio management.')}</p>

        <h2>{t('termspage.3_eligibility', '3. Eligibility')}</h2>
        <p>{t('termspage.the_service_is_intended_for_use_by_schoo', 'The Service is intended for use by school-age students under the supervision of licensed educators and their guardians. Student accounts must be created by an authorised teacher or institution.')}</p>

        <h2>{t('termspage.4_privacy_amp_child_safety', '4. Privacy &amp; Child Safety')}</h2>
        <p>
          {t('termspage.privacy_compliance_intro', 'Peripateticware complies with COPPA, GDPR, FERPA, CCPA, PIPEDA, LGPD, and PDPA. Student data is never sold or used for advertising. See our')}{' '}
          <a href="/privacy" className="text-blue-600 underline">{t('termspage.privacy_policy_link', 'Privacy Policy')}</a>{' '}
          {t('termspage.privacy_compliance_outro', 'for full details.')}
        </p>

        <h2>{t('termspage.5_intellectual_property', '5. Intellectual Property')}</h2>
        <p>{t('termspage.the_peripateticware_platform_is_licensed', 'The Peripateticware platform is licensed under the Business Source License 1.1, converting to Apache 2.0 on May 1, 2030. Copyright &copy; 2026 Paul Christopher Cerda. Student-created content remains the property of the student and their institution.')}</p>

        <h2>{t('termspage.6_prohibited_uses', '6. Prohibited Uses')}</h2>
        <p>{t('termspage.you_may_not_use_the_service_to_upload_ha', 'You may not use the Service to upload harmful content, circumvent safety controls, share student data with unauthorised parties, or engage in any activity that violates applicable law.')}</p>

        <h2>{t('termspage.7_limitation_of_liability', '7. Limitation of Liability')}</h2>
        <p>{t('termspage.the_service_is_provided_ldquoas_isrdquo_', 'The Service is provided &ldquo;as is.&rdquo; Peripateticware shall not be liable for any indirect, incidental, or consequential damages arising from use of the Service.')}</p>

        <h2>{t('termspage.8_contact', '8. Contact')}</h2>
        <p>
          {t('termspage.questions_about_terms', 'Questions about these Terms?')}{' '}
          <a href="mailto:hello@peripateticware.com" className="text-blue-600 underline">{t('pages_termspage.helloperipateticwarecom', 'hello@peripateticware.com')}</a>
        </p>
      </main>
    </div>
  );
};

export default TermsPage;
