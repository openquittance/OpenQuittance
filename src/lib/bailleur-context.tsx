'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

export interface BailleurLite {
  id: string;
  nom: string;
  pdfCouleur: string;
  logoUrl: string | null;
}

interface Ctx {
  bailleurs: BailleurLite[];
  active: BailleurLite | null;
  setActiveId: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const BailleurContext = createContext<Ctx | null>(null);

export function useBailleurs() {
  const ctx = useContext(BailleurContext);
  if (!ctx) throw new Error('useBailleurs must be used within BailleurProvider');
  return ctx;
}

const STORAGE_KEY = 'activeBailleurId';

export function BailleurProvider({ children }: { children: ReactNode }) {
  const [bailleurs, setBailleurs] = useState<BailleurLite[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/bailleurs');
      if (!r.ok) return;
      const list: BailleurLite[] = await r.json();
      setBailleurs(list);
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const found = list.find(b => b.id === stored);
      const next = found?.id ?? list[0]?.id ?? null;
      setActiveIdState(next);
      if (next && typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const active = bailleurs.find(b => b.id === activeId) ?? null;

  return (
    <BailleurContext.Provider value={{ bailleurs, active, setActiveId, refresh, loading }}>
      {children}
    </BailleurContext.Provider>
  );
}
