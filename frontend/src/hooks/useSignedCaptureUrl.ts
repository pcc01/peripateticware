// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useEffect, useState } from 'react'
import { audioApi } from '../services/phase7Api'

/**
 * Resolve a short-lived, signed stream URL for a capture (audio/photo/video).
 *
 * The backend stream endpoint no longer accepts a raw JWT in the query string;
 * it requires a signed media token (?mt=) minted via POST /captures/{id}/media-token.
 * This hook fetches that token and returns a ready-to-use src, so <img>/<video>/
 * <audio> tags work without leaking the session token into URLs/logs.
 *
 * Returns `undefined` until resolved (render a placeholder meanwhile).
 */
export function useSignedCaptureUrl(captureId: string | undefined | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    if (!captureId) {
      setUrl(undefined)
      return
    }
    audioApi
      .getMediaStreamUrl(captureId)
      .then((u) => { if (!cancelled) setUrl(u) })
      .catch(() => { if (!cancelled) setUrl(undefined) })
    return () => { cancelled = true }
  }, [captureId])

  return url
}
