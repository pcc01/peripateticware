// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useEffect } from 'react'

/**
 * Honour the Global Privacy Control (GPC) browser signal (CPRA requirement).
 *
 * When the visitor's browser sets `navigator.globalPrivacyControl === true`,
 * we record a Do-Not-Sell/Share opt-out automatically — once per session so we
 * don't spam the endpoint. The backend also reads the `Sec-GPC` header on
 * /dsr/opt-out; this hook is the client-side complement that fires the request.
 */
export function useGlobalPrivacyControl(): void {
  useEffect(() => {
    try {
      const gpc = (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl
      if (!gpc) return
      if (sessionStorage.getItem('gpc_opt_out_sent') === '1') return

      const authToken = localStorage.getItem('auth_token')
      void fetch('/api/v1/dsr/opt-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Sec-GPC': '1',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ scope: 'all' }),
      })
        .then(() => sessionStorage.setItem('gpc_opt_out_sent', '1'))
        .catch(() => { /* non-blocking */ })
    } catch {
      /* navigator/sessionStorage unavailable — ignore */
    }
  }, [])
}
