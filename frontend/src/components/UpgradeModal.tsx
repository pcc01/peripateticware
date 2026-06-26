// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import { useEffect, useState } from 'react'
import UpgradeCTA from './UpgradeCTA'

// Map feature → human-readable name and Paddle price ID
const FEATURE_CONFIG: Record<string, { name: string; paddlePriceId: string }> = {
  standards_coverage: {
    name: 'Standards Coverage Export',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_HOMESCHOOL_FAMILY ?? '',
  },
  teacher_seats: {
    name: 'Additional Teacher Seats',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_SCHOOL ?? '',
  },
  homeschool_children: {
    name: 'Additional Children',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_HOMESCHOOL_FAMILY ?? '',
  },
  portfolio_export: {
    name: 'Portfolio & Report Exports',
    paddlePriceId: import.meta.env.VITE_PADDLE_PRICE_HOMESCHOOL_FAMILY ?? '',
  },
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
          aria-label="Close"
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
