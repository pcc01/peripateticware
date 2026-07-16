// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT_NAME } from '../constants/brand';
import { useTranslation } from 'react-i18next';

export const LicensingPage: React.FC = () => {
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
          <h1 className="text-xl font-bold text-gray-900">{t('pages_licensingpage.licensing', 'Licensing')}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 prose prose-gray">
        <p className="text-sm text-gray-500 mb-8">
          How {PRODUCT_NAME}.com relates to the {PRODUCT_NAME} source code — two different things, two different licenses.
        </p>

        <h2>Two things named &ldquo;{PRODUCT_NAME}&rdquo;</h2>
        <p>
          <strong>peripateticware.com</strong> — the hosted product you can sign up for on this site — is a
          SaaS (software-as-a-service) offering operated by Paul Christopher Cerda. When you sign up here,
          you're a customer of that service, under its Terms of Service and Privacy Policy, on whichever
          subscription plan (Personal, School, District, Homeschool) fits your use.
        </p>
        <p>
          <strong>The {PRODUCT_NAME} source code</strong> — the underlying software this product is built
          from — is separately available under a dual license described below, for anyone who wants to
          self-host it, study it, or build on it.
        </p>
        <p>{t('pages_licensingpage.these_are_related_but_distinct_using_per', 'These are related but distinct: using peripateticware.com doesn\'t require you to know or care about the source license below, and the source license is what governs anyone running their own copy of the code — including the fact that it\'s what permits Paul, as the license holder, to operate this SaaS in the first place.')}</p>

        <h2>{t('pages_licensingpage.the_source_license_bsl_11_apache_20', 'The source license: BSL 1.1 → Apache 2.0')}</h2>
        <p>
          The {PRODUCT_NAME} codebase is dual-licensed under the <strong>Business Source License 1.1 (BSL 1.1)</strong> today,
          converting automatically to the fully open-source <strong>Apache License 2.0</strong> on
          <strong> May 1, 2030</strong>. This is a common model for commercial open-source software: it lets
          anyone read, modify, and self-host the code now, while protecting the creator's ability to run a
          commercial service with it until the code is fully free.
        </p>

        <h3>{t('pages_licensingpage.free_today_under_bsl_11_for', 'Free today, under BSL 1.1, for:')}</h3>
        <ul>
          <li>{t('pages_licensingpage.individual_educators_using_it_in_their_o', 'Individual educators using it in their own classroom')}</li>
          <li>{t('pages_licensingpage.noncommercial_research_or_personal_proje', 'Non-commercial, research, or personal projects')}</li>
          <li>{t('pages_licensingpage.a_single_classroom_of_530_students_selfh', 'A single classroom of 5–30 students, self-hosted')}</li>
        </ul>

        <h3>{t('pages_licensingpage.requires_a_commercial_license_today_for', 'Requires a commercial license today for:')}</h3>
        <ul>
          <li>{t('pages_licensingpage.school_districts_or_charter_management_o', 'School districts or charter management organizations (5+ classrooms)')}</li>
          <li>{t('pages_licensingpage.anyone_offering_it_as_a_hosted_service_s', 'Anyone offering it as a hosted service (SaaS) to third parties')}</li>
          <li>{t('pages_licensingpage.reselling_rebranding_or_forking_it_into_', 'Reselling, rebranding, or forking it into a competing product')}</li>
        </ul>

        <h3>What BSL 1.1 does <em>not</em> allow, regardless of tier:</h3>
        <ul>
          <li>{t('pages_licensingpage.reselling_or_rebranding_the_software', 'Reselling or rebranding the software')}</li>
          <li>{t('pages_licensingpage.forking_it_to_create_a_competing_product', 'Forking it to create a competing product')}</li>
          <li>{t('pages_licensingpage.sublicensing_without_permission', 'Sublicensing without permission')}</li>
          <li>{t('pages_licensingpage.claiming_it_as_your_own_work', 'Claiming it as your own work')}</li>
        </ul>

        <h3>{t('pages_licensingpage.after_may_1_2030', 'After May 1, 2030')}</h3>
        <p>{t('pages_licensingpage.the_license_converts_automatically_to_ap', 'The license converts automatically to Apache 2.0. At that point anyone can use, self-host, modify, or offer it as a service &mdash; no commercial license required, fully community-owned.')}</p>

        <h2>{t('pages_licensingpage.opensource_components', 'Open-source components')}</h2>
        <p>
          {PRODUCT_NAME} is built on many open-source libraries — React, TypeScript, Tailwind CSS, FastAPI,
          SQLAlchemy, Ollama, Leaflet, PostgreSQL, Redis, and others — which remain under their own original
          licenses. The BSL 1.1 terms above apply only to the code Paul Christopher Cerda wrote for
          {PRODUCT_NAME} itself.
        </p>

        <h2>{t('pages_licensingpage.commercial_licensing', 'Commercial licensing')}</h2>
        <p>{t('pages_licensingpage.if_your_organization_needs_a_commercial_', 'If your organization needs a commercial license — a school district, charter management organization, EdTech company, or anyone wanting to self-host and resell — contact Paul Christopher Cerda for pricing based on your organization\'s size and needs.')}</p>
        <p>
          <strong>Email:</strong> <a href="mailto:admin@thewordinbits.com">{t('pages_licensingpage.adminthewordinbitscom', 'admin@thewordinbits.com')}</a>
        </p>

        <p className="text-sm text-gray-500 mt-8">
          This page summarizes the license for readability. The governing legal text is in{' '}
          <code>LICENSE_DUAL.md</code> in the project repository; where the two differ, the repository file
          controls. See also the full <a href="mailto:admin@thewordinbits.com?subject=Licensing%20Question">{t('pages_licensingpage.faq', 'FAQ')}</a> for
          more detail on what's free vs. paid.
        </p>
      </main>
    </div>
  );
};

export default LicensingPage;
