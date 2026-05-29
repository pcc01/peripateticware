// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const CookiePolicyPage: React.FC = () => {
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
            ← Back to Home
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {t('cookiepolicypage.cookie_policy', 'Cookie Policy')}
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 prose prose-gray">
        <p className="text-sm text-gray-500 mb-8">{t('cookiepolicypage.last_updated_may_2026', 'Last updated: May 2026')}</p>

        <h2>{t('cookiepolicypage.what_are_cookies', 'What Are Cookies?')}</h2>
        <p>{t('cookiepolicypage.cookies_are_small_text_files_placed_on_y', 'Cookies are small text files placed on your device by a website. Peripateticware uses a minimal set of cookies strictly necessary to operate the platform.')}</p>

        <h2>{t('cookiepolicypage.cookies_we_use', 'Cookies We Use')}</h2>

        <h3>{t('cookiepolicypage.strictly_necessary', 'Strictly Necessary')}</h3>
        <p>{t('cookiepolicypage.these_cookies_are_essential_for_the_serv', 'These cookies are essential for the Service to function. They cannot be disabled.')}</p>
        <ul>
          <li>
            <strong>auth_token</strong> — Stores your session JWT. Expires after 24 hours.
          </li>
          <li>
            <strong>auth_user</strong> — Stores your basic user profile (name, role). Cleared on logout.
          </li>
          <li>
            <strong>i18nextLng</strong> — Remembers your chosen language preference.
          </li>
        </ul>

        <h3>{t('cookiepolicypage.analytics_amp_performance', 'Analytics &amp; Performance')}</h3>
        <p>{t('cookiepolicypage.peripateticware_does_not_currently_use_t', 'Peripateticware does not currently use third-party analytics cookies. When server-side metrics are enabled they are processed without setting any cookies.')}</p>

        <h3>{t('cookiepolicypage.advertising', 'Advertising')}</h3>
        <p>{t('cookiepolicypage.peripateticware_is_adfree_we_do_not_plac', 'Peripateticware is ad-free. We do not place any advertising cookies.')}</p>

        <h2>{t('cookiepolicypage.managing_cookies', 'Managing Cookies')}</h2>
        <p>{t('cookiepolicypage.you_can_clear_cookies_at_any_time_throug', 'You can clear cookies at any time through your browser settings. Clearing auth cookies will log you out of the Service.')}</p>

        <h2>{t('cookiepolicypage.changes_to_this_policy', 'Changes to This Policy')}</h2>
        <p>{t('cookiepolicypage.we_may_update_this_policy_as_the_service', 'We may update this policy as the Service evolves. Significant changes will be communicated via in-app notification.')}</p>

        <h2>{t('cookiepolicypage.contact', 'Contact')}</h2>
        <p>
          Questions?{' '}
          <a href="mailto:hello@peripateticware.com" className="text-blue-600 underline">
            hello@peripateticware.com
          </a>
        </p>
      </main>
    </div>
  );
};

export default CookiePolicyPage;
