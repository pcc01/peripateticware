import React, { createContext, useContext, useState } from 'react';
import type { AgeBand } from './copy';

interface BandContextValue {
  band: AgeBand;
  setBand: (b: AgeBand) => void;
}

const BandContext = createContext<BandContextValue | null>(null);

export function BandProvider({ children }: { children: React.ReactNode }) {
  // Default to 7–12; set at account level in production
  const [band, setBand] = useState<AgeBand>('m712');
  return (
    <BandContext.Provider value={{ band, setBand }}>
      {children}
    </BandContext.Provider>
  );
}

export function useBand(): BandContextValue {
  const ctx = useContext(BandContext);
  if (!ctx) throw new Error('useBand must be used within BandProvider');
  return ctx;
}
