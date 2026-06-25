// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * useGeoHint
 *
 * Calls GET /api/v1/geo/hint on mount and returns the inferred country code,
 * country name, and whether subdivision (state/province) selection is relevant.
 *
 * The backend endpoint uses MaxMind GeoLite2-Country.  On any failure (local IP,
 * missing DB, VPN, etc.) it returns all nulls — this hook surfaces that gracefully.
 *
 * Usage:
 *   const { countryCode, countryName, subdivisionSupport, isLoading } = useGeoHint();
 */

import { useEffect, useState } from 'react';

export interface GeoHint {
  countryCode:        string | null;
  countryName:        string | null;
  subdivisionSupport: boolean;
  isLoading:          boolean;
  error:              string | null;
}

const EMPTY: GeoHint = {
  countryCode:        null,
  countryName:        null,
  subdivisionSupport: false,
  isLoading:          false,
  error:              null,
};

export function useGeoHint(): GeoHint {
  const [state, setState] = useState<GeoHint>({ ...EMPTY, isLoading: true });

  useEffect(() => {
    let cancelled = false;

    const fetchHint = async () => {
      try {
        // /api/v1/geo/hint → proxied by Vite /api rule (no rewrite) → backend /api/v1/geo/hint
        const res = await fetch('/api/v1/geo/hint', { credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setState({
            countryCode:        data.country_code ?? null,
            countryName:        data.country_name ?? null,
            subdivisionSupport: !!data.subdivision_support,
            isLoading:          false,
            error:              null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ ...EMPTY, isLoading: false, error: String(err) });
        }
      }
    };

    fetchHint();
    return () => { cancelled = true; };
  }, []);

  return state;
}
