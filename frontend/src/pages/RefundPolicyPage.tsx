// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const RefundPolicyPage: React.FC = () => {
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
            {t('refundpolicypage.back_to_home', '← Back to Home')}
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {t('refundpolicypage.title', 'Refund &amp; Cancellation Policy')}
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 prose prose-gray">
        <p className="text-sm text-gray-500 mb-8">
          {t('refundpolicypage.last_updated', 'Last updated: September 2026')}
        </p>

        <h2>{t('refundpolicypage.1_title', '1. Free Trial')}</h2>
        <p>{t('refundpolicypage.1_body', 'Every new account includes a 30-day free trial with full access to all features. No payment method is required to start or use the trial. You will never be charged unless you actively choose to subscribe.')}</p>

        <h2>{t('refundpolicypage.2_title', '2. Subscriptions & Billing')}</h2>
        <p>{t('refundpolicypage.2_body', 'When you subscribe, payment is taken at that time for the plan you select (monthly or annual). Subscriptions renew automatically at the end of each billing period until cancelled. Our payments and billing are handled by Paddle.com, our Merchant of Record.')}</p>

        <h2>{t('refundpolicypage.3_title', '3. 14-Day Money-Back Guarantee')}</h2>
        <p>{t('refundpolicypage.3_body', 'If you are not satisfied with a paid subscription, you may request a full refund within 14 days of your first payment by emailing hello@peripateticware.com. Refunds are issued to the original payment method, typically within 5–10 business days.')}</p>

        <h2>{t('refundpolicypage.4_title', '4. Renewal Charges')}</h2>
        <p>{t('refundpolicypage.4_body', 'Renewal payments (after your first billing period) are generally non-refundable. To avoid a renewal charge, cancel before your renewal date — you will keep access until the end of the period you have already paid for.')}</p>

        <h2>{t('refundpolicypage.5_title', '5. How to Cancel')}</h2>
        <p>{t('refundpolicypage.5_body', 'Cancel any time from Settings → Plan in your account, or by using the link in any Paddle receipt email, or by contacting hello@peripateticware.com. Cancellation stops future renewals; it does not trigger a partial refund for the current period.')}</p>

        <h2>{t('refundpolicypage.6_title', '6. Exceptional Circumstances')}</h2>
        <p>{t('refundpolicypage.6_body', 'We review refund requests outside these windows on a case-by-case basis — for example duplicate charges, prolonged service outages, or billing errors. Contact us and we will make it right.')}</p>

        <h2>{t('refundpolicypage.7_title', '7. Contact')}</h2>
        <p>
          {t('refundpolicypage.7_body', 'Questions about billing, cancellations, or refunds?')}{' '}
          <a href="mailto:hello@peripateticware.com" className="text-blue-600 underline">
            hello@peripateticware.com
          </a>
        </p>
      </main>
    </div>
  );
};

export default RefundPolicyPage;
