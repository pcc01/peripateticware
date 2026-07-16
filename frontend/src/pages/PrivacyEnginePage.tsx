// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * PrivacyEnginePage
 * Route: /privacy-engine
 * Public page explaining Peripateticware's configurable privacy engine —
 * how it works, what frameworks it supports, and how institutions configure it.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Settings, Globe, Lock, Eye, FileCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Framework {
  id: string;
  name: string;
  region: string;
  description: string;
  keyRules: string[];
}

const FRAMEWORKS: Framework[] = [
  {
    id: 'ferpa',
    name: 'FERPA',
    region: 'United States',
    description: 'Family Educational Rights and Privacy Act — governs access to student education records.',
    keyRules: [
      'Parents and eligible students may inspect and review education records',
      'Schools must have written permission before releasing records to third parties',
      'Directory information may only be disclosed under strict opt-out controls',
      'Student data may not be used for commercial profiling or targeting',
    ],
  },
  {
    id: 'coppa',
    name: 'COPPA',
    region: 'United States',
    description: "Children's Online Privacy Protection Act — protects children under 13 from data collection without parental consent.",
    keyRules: [
      'Verifiable parental consent required before collecting data from children under 13',
      "Parents may review and delete their child's data at any time",
      'No behavioral advertising to children under 13',
      'Data retention limited to the period necessary for the stated purpose',
    ],
  },
  {
    id: 'gdpr',
    name: 'GDPR',
    region: 'European Union',
    description: 'General Data Protection Regulation — comprehensive data protection law with strict rights for data subjects.',
    keyRules: [
      'Lawful basis required for all data processing (consent, legitimate interest, legal obligation)',
      'Right to erasure ("right to be forgotten") must be honoured on request',
      'Data portability: users may export their data in machine-readable format',
      'Breach notification to authorities within 72 hours',
    ],
  },
  {
    id: 'soc2',
    name: 'SOC 2',
    region: 'Global',
    description: 'Service Organization Control 2 — auditing standard for security, availability, and confidentiality of customer data.',
    keyRules: [
      'Continuous monitoring of access controls and security events',
      'Encryption in transit (TLS 1.2+) and at rest (AES-256)',
      'Annual third-party audit and penetration testing',
      'Detailed audit logs retained for minimum 12 months',
    ],
  },
];

const HOW_IT_WORKS = [
  {
    icon: Globe,
    title: 'Jurisdiction Detection',
    body: 'When a school or district is onboarded, the admin selects their governing jurisdiction(s). The engine automatically loads the matching rule set — FERPA for US schools, GDPR for EU institutions, or custom blends for international programs.',
  },
  {
    icon: FileCheck,
    title: 'Rule-Based Enforcement',
    body: 'Every data operation — collection, storage, sharing, deletion — is checked against the active rule set before it executes. Rules specify retention windows, encryption requirements, sharing permissions, and consent requirements.',
  },
  {
    icon: Settings,
    title: 'Admin Configuration',
    body: "Institution admins can tune parameters within their jurisdiction's bounds: adjust retention days, restrict or expand sharing with parents, enable/disable specific monitoring features. No rule can be configured below the legal minimum.",
  },
  {
    icon: Lock,
    title: 'Immutable Audit Trail',
    body: 'Every rule change and every data access is recorded with a cryptographic hash. The audit log is append-only and tamper-evident — giving your legal and compliance teams a full verifiable history.',
  },
  {
    icon: Eye,
    title: 'Transparency for Families',
    body: 'Parents and students have a dedicated dashboard showing exactly what data is collected, under which rules, and how long it is retained. Data subject requests (access, deletion, export) are handled automatically.',
  },
  {
    icon: Shield,
    title: 'Continuous Compliance',
    body: 'When regulations change, Peripateticware ships an updated rule version. Admins review a diff, approve the upgrade, and the engine enforces the new rules immediately — no re-coding required.',
  },
];

function FrameworkCard({ fw }: { fw: Framework }) {
  const { t } = useTranslation('landing');
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div>
          <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded mr-3">
            {fw.name}
          </span>
          <span className="text-gray-500 text-sm">{fw.region}</span>
          <p className="text-gray-700 mt-1 text-sm">{fw.description}</p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />}
      </button>
      {open && (
        <div className="px-6 pb-5 border-t border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">{t('pages_privacyenginepage.key_rules_enforced', 'Key Rules Enforced')}</p>
          <ul className="space-y-2">
            {fw.keyRules.map((rule, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-green-600 mt-0.5">✓</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PrivacyEnginePage() {
  const { t } = useTranslation('landing');
  const [activeFrameworks, setActiveFrameworks] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/v1/privacy/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.active_frameworks?.length) {
          setActiveFrameworks(data.active_frameworks.map((f: string) => f.split('_')[0].toUpperCase()));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-green-800 to-green-600 text-white">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-10 h-10 text-green-200" />
            <span className="text-green-200 text-sm font-semibold uppercase tracking-widest">{t('pages_privacyenginepage.privacy_engine', 'Privacy Engine')}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6" style={{ fontFamily: 'var(--font-head, "Lora", Georgia, serif)' }}>
            Compliance built in,<br />not bolted on
          </h1>
          <p className="text-green-100 text-lg max-w-2xl mb-8">{t('pages_privacyenginepage.peripateticwares_privacy_engine_enforces', 'Peripateticware\'s privacy engine enforces FERPA, COPPA, GDPR, and SOC 2 through a configurable rule system — so every data operation is compliant by default, regardless of which jurisdiction your school operates in.')}</p>
          {activeFrameworks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-green-300 text-sm mr-2 self-center">{t('pages_privacyenginepage.currently_active', 'Currently active:')}</span>
              {activeFrameworks.map(f => (
                <span key={f} className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">{f}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'var(--font-head, "Lora", Georgia, serif)' }}>{t('pages_privacyenginepage.how_it_works', 'How it works')}</h2>
        <p className="text-gray-500 mb-10">{t('pages_privacyenginepage.six_layers_of_privacy_running_automatica', 'Six layers of privacy, running automatically on every request.')}</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-green-700" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Supported frameworks */}
      <div className="bg-white border-t border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'var(--font-head, "Lora", Georgia, serif)' }}>{t('pages_privacyenginepage.supported_frameworks', 'Supported frameworks')}</h2>
          <p className="text-gray-500 mb-8">{t('pages_privacyenginepage.click_any_framework_to_see_the_specific_', 'Click any framework to see the specific rules Peripateticware enforces.')}</p>
          <div className="space-y-3">
            {FRAMEWORKS.map(fw => <FrameworkCard key={fw.id} fw={fw} />)}
          </div>
        </div>
      </div>

      {/* Configurable parameters */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'var(--font-head, "Lora", Georgia, serif)' }}>{t('pages_privacyenginepage.what_institutions_can_configure', 'What institutions can configure')}</h2>
        <p className="text-gray-500 mb-8">{t('pages_privacyenginepage.within_the_bounds_of_the_applicable_law_', 'Within the bounds of the applicable law, institution admins have control over:')}</p>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            ['Data retention window', 'Set how long student records are stored before automatic deletion (within legal maximums).'],
            ['Encryption algorithm', 'Choose AES-256 (default) or ChaCha20-Poly1305 for data at rest.'],
            ['Parent data access', 'Enable or restrict parent visibility into specific activity categories.'],
            ['Monitoring features', 'Toggle session monitoring and field-note visibility per jurisdiction requirements.'],
            ['Profiling & targeting', 'Behavioural profiling is off by default; the engine enforces this cannot be enabled for under-18 accounts.'],
            ['Consent flows', 'Configure whether consent is collected once per school year or per data-collection event.'],
            ['Sharing with third parties', 'Whitelist approved third-party tools; all others are blocked by default.'],
            ['Audit log retention', 'Extend the default 12-month audit log to meet state-level requirements.'],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3 bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <Settings className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 text-sm">{title}</p>
                <p className="text-gray-500 text-sm mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-green-800 text-white">
        <div className="max-w-5xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-head, "Lora", Georgia, serif)' }}>{t('pages_privacyenginepage.questions_about_compliance_for_your_dist', 'Questions about compliance for your district?')}</h3>
            <p className="text-green-200 text-sm">{t('pages_privacyenginepage.our_team_can_walk_you_through_how_the_en', 'Our team can walk you through how the engine maps to your jurisdiction&apos;s requirements.')}</p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <a
              href="mailto:hello@peripateticware.com"
              className="px-5 py-2.5 bg-white text-green-800 font-semibold rounded-lg hover:bg-green-50 transition text-sm"
            >{t('pages_privacyenginepage.contact_us', 'Contact us')}</a>
            <Link
              to="/privacy"
              className="px-5 py-2.5 border border-white/40 text-white font-semibold rounded-lg hover:bg-white/10 transition text-sm"
            >
              Privacy policy
            </Link>
          </div>
        </div>
      </div>

    </div>

  );
}
