// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PrivacyConfirmationPage  —  /privacy-confirmed
 *
 * Shown immediately after a new TEACHER / HOMESCHOOL account is activated
 * (email verified → redirect here).  Displays the privacy frameworks that
 * were automatically detected and applied to their organisation so they
 * know what protections are in place for their students.
 *
 * The page reads the org's privacy_jurisdiction_ids from
 * GET /api/v1/privacy/status (existing endpoint) and renders a friendly
 * summary.  No user action is required — a single "Go to Dashboard" CTA.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, CheckCircle, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useTranslation } from 'react-i18next';

// ── Jurisdiction display metadata ─────────────────────────────────────────────

interface JurisdictionMeta {
  id:          string;
  name:        string;
  shortDesc:   string;
  color:       string;   // Tailwind bg colour class
  textColor:   string;
}

const JURISDICTION_META: Record<string, JurisdictionMeta> = {
  ferpa_us: {
    id: 'ferpa_us', name: 'FERPA',
    shortDesc: 'Protects student education records. Parents and eligible students have the right to access and correct records.',
    color: 'bg-blue-50', textColor: 'text-blue-800',
  },
  coppa_us: {
    id: 'coppa_us', name: 'COPPA',
    shortDesc: "Protects children under 13. No personal data from students under 13 is used for advertising or shared without parental consent.",
    color: 'bg-green-50', textColor: 'text-green-800',
  },
  ccpa_california: {
    id: 'ccpa_california', name: 'CCPA',
    shortDesc: 'California Consumer Privacy Act. California residents have the right to know, delete, and opt-out of the sale of their personal data.',
    color: 'bg-orange-50', textColor: 'text-orange-800',
  },
  gdpr_eu: {
    id: 'gdpr_eu', name: 'GDPR',
    shortDesc: 'EU General Data Protection Regulation. Data is processed lawfully, minimised, and retained only as long as necessary.',
    color: 'bg-indigo-50', textColor: 'text-indigo-800',
  },
  pipeda_canada: {
    id: 'pipeda_canada', name: 'PIPEDA',
    shortDesc: 'Canadian federal privacy law. Personal information is collected, used, and disclosed only with knowledge and consent.',
    color: 'bg-red-50', textColor: 'text-red-800',
  },
  lgpd_brazil: {
    id: 'lgpd_brazil', name: 'LGPD',
    shortDesc: 'Brazilian General Data Protection Law. Personal data is processed with a legal basis and data subject rights are respected.',
    color: 'bg-yellow-50', textColor: 'text-yellow-800',
  },
  pdpa_singapore: {
    id: 'pdpa_singapore', name: 'PDPA',
    shortDesc: 'Singapore Personal Data Protection Act. Personal data is collected, used, and disclosed only for purposes individuals have been notified about.',
    color: 'bg-purple-50', textColor: 'text-purple-800',
  },
};

const FALLBACK_META: Omit<JurisdictionMeta, 'id'> = {
  name: 'Privacy Framework',
  shortDesc: 'A privacy framework has been applied to protect your students.',
  color: 'bg-gray-50', textColor: 'text-gray-800',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrivacyConfirmationPage() {
  const { t } = useTranslation('landing');
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/v1/privacy/status', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // privacy/status may return jurisdictions as an array or nested object
        const ids: string[] =
          data.jurisdiction_ids ??
          data.privacy_jurisdiction_ids ??
          data.jurisdictions ??
          [];
        setJurisdictions(ids);
      } catch (err) {
        setError('Could not load privacy details. Your account is set up correctly — check settings later.');
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const handleContinue = () => {
    const role = user?.role?.toUpperCase();
    if (role === 'TEACHER')     navigate('/teacher/dashboard', { replace: true });
    else if (role === 'HOMESCHOOL') navigate('/homeschool/dashboard', { replace: true });
    else navigate('/dashboard', { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'linear-gradient(135deg, #4a7c59 0%, #6b9e7e 50%, #d4a574 100%)' }}
    >
      <div className="relative z-10 w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <Shield className="w-8 h-8 text-green-700" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('pages_privacyconfirmationpage.privacy_set_up', 'Privacy Set Up')}</h1>
            <p className="text-gray-500 text-sm mt-1">{t('pages_privacyconfirmationpage.weve_automatically_applied_the_right_pro', 'We\'ve automatically applied the right protections for your students based on your location.')}</p>
          </div>

          {/* Jurisdiction list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : jurisdictions.length === 0 ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 mb-4">{t('pages_privacyconfirmationpage.no_specific_frameworks_were_detected_for', 'No specific frameworks were detected for your location. Standard data protection practices apply.')}</div>
          ) : (
            <div className="space-y-3 mb-6">
              {jurisdictions.map(id => {
                const meta = JURISDICTION_META[id] ?? { id, ...FALLBACK_META };
                return (
                  <div key={id} className={`flex gap-3 p-3 rounded-xl border ${meta.color}`}>
                    <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${meta.textColor}`} />
                    <div>
                      <p className={`text-sm font-semibold ${meta.textColor}`}>{meta.name} enabled</p>
                      <p className="text-xs text-gray-600 mt-0.5">{meta.shortDesc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fine print */}
          <p className="text-xs text-gray-400 text-center mb-6">
            You can review and adjust privacy settings at any time in{' '}
            <button type="button" onClick={() => navigate('/admin/privacy')} className="underline cursor-pointer" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', display: 'inline' }}>
              Admin → Privacy
            </button>.
          </p>

          {/* CTA */}
          <button
            onClick={handleContinue}
            className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-6 rounded-xl transition"
          >
            {t('pages_privacyconfirmationpage.go_to_dashboard', 'Go to Dashboard')}
          </button>
        </div>
      </div>
    </div>
  );
}
