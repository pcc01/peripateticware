import { fmtDate } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { getPrivacyStatus, type PrivacyStatusResult } from '../utils/privacy';
import { PRODUCT_NAME } from '../constants/brand';

export const PrivacyPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatusResult | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    setStatusLoading(true);
    getPrivacyStatus()
      .then(status => setPrivacyStatus(status))
      .catch(() => {
        // silently fall back — the policy text below stands on its own
      })
      .finally(() => setStatusLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            {t('privacypage.back_to_home', '← Back to Home')}
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {t('privacypage.title', 'Privacy Policy')}
          </h1>
        </div>
      </header>

      {/* Live status banner — real jurisdiction/compliance data, not a claim */}
      {!statusLoading && privacyStatus && privacyStatus.status !== 'unknown' && (
        <div className="bg-green-50 border-b border-green-100 py-2 px-6 text-sm flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-600" />
            <strong className="text-green-900">
              {privacyStatus.active_rules_count} {t('privacypage.jurisdictions_enforced', 'jurisdictions enforced')}
            </strong>
          </span>
          {privacyStatus.frameworks_enforced.length > 0 && (
            <span className="text-gray-600">
              {privacyStatus.frameworks_enforced.map(f => f.toUpperCase()).join(' · ')}
            </span>
          )}
          {privacyStatus.last_updated && (
            <span className="text-gray-400 ml-auto">
              {t('privacypage.rules_last_updated', 'Rules last updated')}: {fmtDate(privacyStatus.last_updated)}
            </span>
          )}
        </div>
      )}

      <main className="max-w-4xl mx-auto px-6 py-10 prose prose-gray">
        <p className="text-sm text-gray-500 mb-8">{t('privacypage.last_updated', 'Last updated: September 2026')}</p>

        <p>
          {t('privacypage.intro', 'This Privacy Policy explains what information {{product}} collects, how we use and share it, and the choices and rights you have — including the additional protections that apply to students under the age of 18. It applies to the {{product}} website, mobile apps, and related services (together, the &ldquo;Service&rdquo;).', { product: PRODUCT_NAME })}
        </p>
        <p>
          {t('privacypage.intro_frameworks', '{{product}} is built for K-12 outdoor and field-based learning, so we designed this policy — and the systems behind it — around COPPA, FERPA, GDPR, CCPA/CPRA, PIPEDA, LGPD, and PDPA from the start, not as an afterthought.', { product: PRODUCT_NAME })}
        </p>

        <h2>{t('privacypage.1_title', '1. Information We Collect')}</h2>

        <h3>{t('privacypage.1a_title', 'Account information')}</h3>
        <p>{t('privacypage.1a_body', 'When a teacher, parent, or homeschool educator signs up, we collect a name, email address, username, and password (stored as a salted hash, never in plain text). Student accounts are created only through a teacher’s classroom invite, never by public sign-up, and collect the same basic account fields plus, where provided, a date of birth used solely for the age-appropriate handling described in Section 3.')}</p>

        <h3>{t('privacypage.1b_title', 'Location information')}</h3>
        <p>{t('privacypage.1b_body', 'Field activities can use device GPS to detect arrival at a mapped stop (wayfinding) or confirm a student is within an activity’s boundary (geofencing). Location is requested only while an activity is active, only with the device’s own permission prompt, and — for students under 13 — only after a parent has separately consented to GPS use.')}</p>

        <h3>{t('privacypage.1c_title', 'Field evidence & reflections')}</h3>
        <p>{t('privacypage.1c_body', 'Photos, video, audio recordings, and written notebook/journal entries that a student captures as part of an activity are stored so the student, their teacher, and (where linked) their parent can review them and so the student’s portfolio persists across sessions.')}</p>

        <h3>{t('privacypage.1d_title', 'Conversations with Peri')}</h3>
        <p>{t('privacypage.1d_body', 'The optional &ldquo;Ask Peri&rdquo; assistant sends a student’s typed question, and enough recent conversation for context, to a language-model provider (which may be a model we run ourselves or a third-party API such as Anthropic’s Claude) in order to generate a reply. Teachers can disable free-form AI chat for a specific activity.')}</p>

        <h3>{t('privacypage.1e_title', 'Billing information')}</h3>
        <p>{t('privacypage.1e_body', 'Paid subscriptions (available to teacher, parent, and homeschool accounts, never required for students) are processed by Paddle.com, our Merchant of Record. Paddle collects and processes your payment details directly — we never see or store full card numbers.')}</p>

        <h3>{t('privacypage.1f_title', 'Usage & technical information')}</h3>
        <p>{t('privacypage.1f_body', 'Like most online services, our servers log standard technical information (IP address, browser/device type, timestamps, pages or screens viewed) to operate, secure, and troubleshoot the Service.')}</p>

        <h2>{t('privacypage.2_title', '2. How We Use Information')}</h2>
        <p>{t('privacypage.2_body', 'We use the information above to: provide and operate the Service (running activities, saving progress, generating Peri’s replies); let teachers and, where linked, parents monitor and support a student’s work; process payments for paid accounts; secure the Service and prevent abuse; comply with legal obligations; and communicate with you about your account. We do not use student data for advertising, and we do not build advertising profiles of students.')}</p>

        <h2>{t('privacypage.3_title', '3. Children’s Privacy (COPPA)')}</h2>
        <p>{t('privacypage.3_body_1', 'Students can only join {{product}} through a teacher’s classroom invite — there is no public sign-up path for a student account. When a student’s provided or estimated age places them under 13, their account is held inactive until a parent or guardian approves it through a secure, single-use link we email to the address the student (or their teacher) provides.', { product: PRODUCT_NAME })}</p>
        <p>{t('privacypage.3_body_2', 'For students under 13, we collect only what is needed for the activities their teacher has assigned: an account identifier, field evidence and reflections the student creates, and (only with the separate consent described above) GPS location while an activity is active. We do not knowingly collect more than this, do not show advertising to students, and do not sell or share student information for cross-context behavioral advertising.')}</p>
        <p>{t('privacypage.3_body_3', 'A parent or guardian who has approved a child’s account may at any time: review the personal information we have collected from their child; request that it be corrected or deleted; and refuse to allow any further collection or use of their child’s information (which will deactivate the account). Contact privacy@peripateticware.com to exercise any of these rights — see Section 8 for how we handle the request.')}</p>

        <h2>{t('privacypage.4_title', '4. Schools, Teachers & FERPA')}</h2>
        <p>{t('privacypage.4_body', 'Where a school or teacher directs students to use {{product}} as part of coursework, we act as a &ldquo;school official&rdquo; with a legitimate educational interest under FERPA (and the equivalent COPPA school-official consent exception): the school or teacher’s authorization stands in for individual parental consent for that limited purpose, we use student data only to provide the requested educational service, and we do not use it for any other commercial purpose. A teacher can see and manage only their own classroom’s roster and student work — never another school’s.', { product: PRODUCT_NAME })}</p>

        <h2>{t('privacypage.5_title', '5. How We Share Information')}</h2>
        <p>{t('privacypage.5_body_intro', 'We do not sell personal information, and we never have. We share information only in these limited circumstances:')}</p>
        <ul>
          <li>{t('privacypage.5_item_1', 'With the student’s own teacher and, where a parent-child link has been approved, their parent — this is the core of how the Service works.')}</li>
          <li>{t('privacypage.5_item_2', 'With service providers who process data on our behalf under contract, and only for the purpose we hired them for: Paddle.com (payment processing), an email delivery provider (transactional email such as verification links and classroom invites), and AI language-model providers (to generate Peri’s replies, as described in Section 1).')}</li>
          <li>{t('privacypage.5_item_3', 'If required by law, subpoena, or a good-faith belief that disclosure is necessary to protect the safety of a student or the public.')}</li>
          <li>{t('privacypage.5_item_4', 'In connection with a merger, acquisition, or sale of assets — in which case we would require the successor to honor the commitments in this policy.')}</li>
        </ul>

        <h2>{t('privacypage.6_title', '6. Data Retention')}</h2>
        <p>{t('privacypage.6_body', 'We keep account and activity data for as long as the account is active, plus a limited period afterward to allow reactivation, meet legal/record-keeping obligations, and resolve disputes. When a teacher, parent, or platform administrator deletes a student’s account, or a parent exercises the deletion right described in Section 3, we delete or de-identify the associated personal data within a reasonable period, except where we are legally required to retain it.')}</p>

        <h2>{t('privacypage.7_title', '7. Your Rights & Regional Disclosures')}</h2>
        <p>{t('privacypage.7_body_intro', 'Wherever you or your child are located, you can ask us to: tell you what personal information we hold; correct it; delete it; or provide a copy of it. Email privacy@peripateticware.com, or use the')} {' '}<Link to="/do-not-sell" className="text-blue-600 underline">{t('privacypage.do_not_sell_link', 'Do Not Sell or Share My Personal Information')}</Link>{' '}{t('privacypage.7_body_intro_end', 'form for a California opt-out request specifically. We will verify the request and respond within the time required by applicable law.')}</p>
        <p>{t('privacypage.7_gdpr', 'EEA/UK (GDPR): our legal bases for processing are performance of a contract (running the Service you or your school signed up for), legitimate interests (security, service improvement), consent (GPS location, Peri chat where applicable), and legal obligation. You additionally have the right to restrict or object to processing, to data portability, and to lodge a complaint with your local supervisory authority.')}</p>
        <p>{t('privacypage.7_ccpa', 'California (CCPA/CPRA): in the preceding 12 months we have not sold or shared personal information for cross-context behavioral advertising. California residents have the right to know, delete, correct, and opt out of sale/sharing (which, again, we do not do), and to not be discriminated against for exercising these rights.')}</p>
        <p>{t('privacypage.7_other', 'Canada (PIPEDA), Brazil (LGPD), and Singapore/APAC (PDPA) residents have equivalent access, correction, and deletion rights under those frameworks, which we honor through the same request channel above.')}</p>

        <h2>{t('privacypage.8_title', '8. Security')}</h2>
        <p>{t('privacypage.8_body', 'We use industry-standard safeguards to protect your information, including encryption of sensitive fields such as email addresses at rest, encrypted connections in transit, and access controls that limit who can see student data to that student’s own teacher and linked parent(s). No method of storage or transmission is 100% secure, and we work continuously to find and fix gaps rather than claim perfection.')}</p>

        <h2>{t('privacypage.9_title', '9. International Data Transfers')}</h2>
        <p>{t('privacypage.9_body', 'Our servers and service providers are located in the United States. If you are accessing the Service from outside the United States, your information will be transferred to, stored, and processed in the United States, which may have different data protection laws than your own country.')}</p>

        <h2>{t('privacypage.10_title', '10. Changes to This Policy')}</h2>
        <p>{t('privacypage.10_body', 'We’ll update the &ldquo;Last updated&rdquo; date above when we make changes to this policy, and will notify account holders by email of any change that materially reduces your rights.')}</p>

        <h2>{t('privacypage.11_title', '11. Contact Us')}</h2>
        <p>
          {t('privacypage.11_body', 'Questions about this policy, or a request under Sections 3 or 7?')}{' '}
          <a href="mailto:privacy@peripateticware.com" className="text-blue-600 underline">privacy@peripateticware.com</a>
        </p>
        <p className="text-sm text-gray-500">
          {t('privacypage.see_also', 'See also our')}{' '}
          <Link to="/privacy-engine" className="text-blue-600 underline">{t('privacypage.see_also_engine', 'Privacy Engine')}</Link>{' '}
          {t('privacypage.see_also_mid', '(a closer look at how we technically enforce the rules in this policy) and our')}{' '}
          <Link to="/terms" className="text-blue-600 underline">{t('privacypage.see_also_terms', 'Terms of Service')}</Link>.
        </p>
      </main>
    </div>
  );
};

export default PrivacyPage;
