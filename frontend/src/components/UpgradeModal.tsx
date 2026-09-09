// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import { useEffect, useState } from 'react'
import UpgradeCTA from './UpgradeCTA'
import { useTranslation } from 'react-i18next';

// Default self-serve price per feature gate. Homeschool features → the yearly
// Homeschool price; teacher/classroom/school features → the yearly Teacher
// price. (Monthly is only offered via the Plan card's toggle; a mid-flow
// upgrade prompt just uses the headline yearly plan.) Unset env → UpgradeCTA
// falls back to a contact link.
const HS_YEARLY = (import.meta.env.VITE_PADDLE_PRICE_HS_YEARLY as string | undefined) ?? '';
const TEACHER_YEARLY = (import.meta.env.VITE_PADDLE_PRICE_TEACHER_YEARLY as string | undefined) ?? '';

// Map feature → human-readable name and Paddle price ID
const FEATURE_CONFIG: Record<string, { name: string; paddlePriceId: string }> = {
  standards_coverage:          { name: 'Standards Coverage Export',       paddlePriceId: HS_YEARLY },
  standards_compliance_report: { name: 'State Compliance Reports',        paddlePriceId: HS_YEARLY },
  homeschool_children:         { name: 'Additional Children',             paddlePriceId: HS_YEARLY },
  portfolio_export:            { name: 'Portfolio & Report Exports',      paddlePriceId: HS_YEARLY },
  teacher_seats:               { name: 'Additional Teacher Seats',        paddlePriceId: TEACHER_YEARLY },
  classroom_count:             { name: 'Additional Classrooms',           paddlePriceId: TEACHER_YEARLY },
  student_seats:               { name: 'Additional Student Seats',        paddlePriceId: TEACHER_YEARLY },
}

interface UpgradePayload {
  code: string
  feature: string
  required_tier: string
  current_tier: string
  limit?: number
  current?: number
}

export default function UpgradeModal() {
  const { t } = useTranslation('landing');
  const [payload, setPayload] = useState<UpgradePayload | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as UpgradePayload
      if (detail?.code === 'UPGRADE_REQUIRED') setPayload(detail)
    }
    window.addEventListener('upgrade-required', handler)
    return () => window.removeEventListener('upgrade-required', handler)
  }, [])

  if (!payload) return null

  const config = FEATURE_CONFIG[payload.feature]
  if (!config) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => setPayload(null)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
      >
        <button
          onClick={() => setPayload(null)}
          className="float-right text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label={t('components_upgrademodal.aria_label_close', 'Close')}
        >
          ×
        </button>
        <UpgradeCTA
          featureName={config.name}
          requiredTier={payload.required_tier}
          paddlePriceId={config.paddlePriceId}
          currentTier={payload.current_tier}
        />
      </div>
    </div>
  )
}
