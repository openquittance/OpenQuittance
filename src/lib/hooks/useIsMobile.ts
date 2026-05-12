'use client';

import { useEffect, useState } from 'react';

// v3.6.1 — détection mobile via matchMedia (max-width: 767px).
// v3.6.2 — hardening : retourne { mounted, isMobile } pour que les
// callers puissent attendre l'hydration AVANT de render. Évite le
// flash "desktop puis mobile" qui faisait rendre l'iframe PDF
// avant que le bypass ne s'applique (cf. hotfix v3.6.2 §1).
//
// SSR-safe : `mounted` reste false côté serveur ET sur le premier
// render client (hydration match), puis true après useEffect. Les
// callers gates leur rendu sur `mounted` pour éviter mismatch
// hydration + render prématuré.
//
// Détection combine matchMedia (viewport CSS) + pointer:coarse
// fallback (touch screens dont le viewport CSS est mal détecté
// dans certains contextes — iframe imbriquée, devtools emulation).
export interface MobileState {
  mounted: boolean;
  isMobile: boolean;
}

export function useIsMobile(maxWidthPx: number = 767): MobileState {
  const [state, setState] = useState<MobileState>({ mounted: false, isMobile: false });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      setState({ mounted: true, isMobile: false });
      return;
    }
    const apply = () => setState({ mounted: true, isMobile: detect(maxWidthPx) });
    apply();
    const mql = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    mql.addEventListener('change', apply);
    window.addEventListener('resize', apply);
    return () => {
      mql.removeEventListener('change', apply);
      window.removeEventListener('resize', apply);
    };
  }, [maxWidthPx]);

  return state;
}

function detect(maxWidthPx: number): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.(`(max-width: ${maxWidthPx}px)`).matches) return true;
  // Fallback : touch + viewport tablette (iPad portrait 768, etc.).
  if (window.matchMedia?.('(pointer: coarse)').matches
    && window.matchMedia?.('(max-width: 1024px)').matches) return true;
  return false;
}
