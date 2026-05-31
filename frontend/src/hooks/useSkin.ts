/**
 * useSkin — global skin / colour-direction hook
 *
 * Skins map to the `body[data-direction="..."]` CSS selectors in design-system.css.
 * Names shown to users come from SKIN_LABELS.
 *
 * Usage:
 *   const { skin, setSkin, skins } = useSkin()
 */
import { useCallback, useEffect, useState } from 'react'

export type Skin = 'field-guide' | 'terrain' | 'atmosphere'

export const SKIN_LABELS: Record<Skin, string> = {
  'field-guide': 'Field Guide',   // green + warm beige (default)
  'terrain':     'Terrain',       // orange + light beige
  'atmosphere':  'Atmosphere',    // purple + dark
}

const STORAGE_KEY = 'ppw_skin'
const DEFAULT_SKIN: Skin = 'field-guide'

function applyToDOM(skin: Skin) {
  document.body.setAttribute('data-direction', skin)
}

export function useSkin() {
  const [skin, _setSkin] = useState<Skin>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Skin | null
    return saved && saved in SKIN_LABELS ? saved : DEFAULT_SKIN
  })

  // Apply to DOM whenever skin changes
  useEffect(() => {
    applyToDOM(skin)
  }, [skin])

  // Also apply on mount (handles page reload)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Skin | null
    if (saved && saved in SKIN_LABELS) {
      _setSkin(saved)
      applyToDOM(saved)
    } else {
      applyToDOM(DEFAULT_SKIN)
    }
  }, [])

  const setSkin = useCallback((next: Skin) => {
    localStorage.setItem(STORAGE_KEY, next)
    _setSkin(next)
    applyToDOM(next)
  }, [])

  return { skin, setSkin, skins: Object.keys(SKIN_LABELS) as Skin[] }
}
