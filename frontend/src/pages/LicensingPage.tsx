// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT_NAME } from '../constants/brand';

export const LicensingPage: React.FC = () => {
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
          <h1 className="text-xl font-bold text-gray-900">Licensing</h1>
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
        <p>
          These are related but distinct: using peripateticware.com doesn't require you to know or care
          about the source license below, and the source license is what governs anyone running their own
          copy of the code — including the fact that it's what permits Paul, as the license holder, to
          operate this SaaS in the first place.
        </p>

        <h2>The source license: BSL 1.1 → Apache 2.0</h2>
        <p>
          The {PRODUCT_NAME} codebase is dual-licensed under the <strong>Business Source License 1.1 (BSL 1.1)</strong> today,
          converting automatically to the fully open-source <strong>Apache License 2.0</strong> on
          <strong> May 1, 2030</strong>. This is a common model for commercial open-source software: it lets
          anyone read, modify, and self-host the code now, while protecting the creator's ability to run a
          commercial service with it until the code is fully free.
        </p>

        <h3>Free today, under BSL 1.1, for:</h3>
        <ul>
          <li>Individual educators using it in their own classroom</li>
          <li>Non-commercial, research, or personal projects</li>
          <li>A single classroom of 5–30 students, self-hosted</li>
        </ul>

        <h3>Requires a commercial license today for:</h3>
        <ul>
          <li>School districts or charter management organizations (5+ classrooms)</li>
          <li>Anyone offering it as a hosted service (SaaS) to third parties</li>
          <li>Reselling, rebranding, or forking it into a competing product</li>
        </ul>

        <h3>What BSL 1.1 does <em>not</em> allow, regardless of tier:</h3>
        <ul>
          <li>Reselling or rebranding the software</li>
          <li>Forking it to create a competing product</li>
          <li>Sublicensing without permission</li>
          <li>Claiming it as your own work</li>
        </ul>

        <h3>After May 1, 2030</h3>
        <p>
          The license converts automatically to Apache 2.0. At that point anyone can use, self-host, modify,
          or offer it as a service &mdash; no commercial license required, fully community-owned.
        </p>

        <h2>Open-source components</h2>
        <p>
          {PRODUCT_NAME} is built on many open-source libraries — React, TypeScript, Tailwind CSS, FastAPI,
          SQLAlchemy, Ollama, Leaflet, PostgreSQL, Redis, and others — which remain under their own original
          licenses. The BSL 1.1 terms above apply only to the code Paul Christopher Cerda wrote for
          {PRODUCT_NAME} itself.
        </p>

        <h2>Commercial licensing</h2>
        <p>
          If your organization needs a commercial license — a school district, charter management
          organization, EdTech company, or anyone wanting to self-host and resell — contact Paul Christopher
          Cerda for pricing based on your organization's size and needs.
        </p>
        <p>
          <strong>Email:</strong> <a href="mailto:admin@thewordinbits.com">admin@thewordinbits.com</a>
        </p>

        <p className="text-sm text-gray-500 mt-8">
          This page summarizes the license for readability. The governing legal text is in{' '}
          <code>LICENSE_DUAL.md</code> in the project repository; where the two differ, the repository file
          controls. See also the full <a href="mailto:admin@thewordinbits.com?subject=Licensing%20Question">FAQ</a> for
          more detail on what's free vs. paid.
        </p>
      </main>
    </div>
  );
};

export default LicensingPage;
