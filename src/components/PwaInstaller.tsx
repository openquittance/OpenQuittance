'use client';

import { useEffect } from 'react';

/**
 * v3.5.0-rc1 — enregistre le Service Worker `/sw.js` au mount.
 *
 * Composant invisible (return null). Mount dans `src/app/layout.tsx`
 * pour couverture globale. SW handler minimal (cf. public/sw.js v1
 * sans cache offline).
 *
 * Skip si `serviceWorker` indisponible (IE legacy, navigateurs très
 * anciens) ou si servi en non-HTTPS (sauf localhost).
 */
export default function PwaInstaller() {
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      // Non bloquant — log seulement.
      console.warn('[PwaInstaller] SW registration failed :', e);
    });
  }, []);

  return null;
}
