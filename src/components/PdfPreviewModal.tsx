'use client';

import { useEffect, useRef } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

// Modale d'aperçu PDF utilisant l'<iframe> natif du navigateur
// (Chrome/Firefox/Safari ont tous un viewer PDF intégré sur
// desktop). Pas de dépendance pdfjs-dist (~1 Mo).
//
// v3.6.1 — fallback mobile : Chrome Android n'a pas de viewer PDF
// natif (page blanche), Safari iOS rend le PDF en largeur fixe non
// responsive. Sur mobile, bypass la modale et download via OS app
// native (Files iOS / Adobe Reader Android / Drive).
//
// v3.6.2 — hardening : on attend `mounted` (hook useIsMobile) AVANT
// de rendre quoi que ce soit. Évite le flash "iframe desktop"
// pendant l'hydration sur mobile (cause v3.6.1 = bug réel reporté
// user iOS/Android). L'iframe ne mount JAMAIS sur mobile.
export default function PdfPreviewModal({
  url,
  filename,
  title,
  onClose,
}: {
  url: string;
  filename: string;
  title?: string;
  onClose: () => void;
}) {
  const { mounted, isMobile } = useIsMobile();
  const downloadTriggered = useRef(false);

  // URL "download-friendly" : retire view=1 / inline=1.
  const downloadUrl = url.replace(/([?&])(?:inline|view)=1(&|$)/g, (_m, p, s) => s ? p : '');

  // v3.6.1 + v3.6.2 — branche mobile : trigger download
  // programmatique au premier render mounted=true, isMobile=true.
  useEffect(() => {
    if (!mounted || !isMobile || downloadTriggered.current) return;
    downloadTriggered.current = true;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.rel = 'noopener';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onClose();
  }, [mounted, isMobile, downloadUrl, filename, onClose]);

  // Desktop only : block scroll + Escape close. Skip si mobile ou
  // pas encore mounted.
  useEffect(() => {
    if (!mounted || isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [mounted, isMobile, onClose]);

  // v3.6.2 — pas de render avant mounted (évite hydration mismatch
  // + évite de mount l'iframe avant que isMobile soit déterminé).
  if (!mounted) return null;
  // Mobile : iframe jamais rendue. Download triggered + onClose
  // dans l'effet ci-dessus.
  if (isMobile) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col" onClick={onClose}>
      <div
        className="flex-1 flex flex-col p-2 sm:p-3 md:p-6 max-w-6xl w-full mx-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 sm:pb-3 text-white">
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate text-sm sm:text-base">{title || 'Aperçu PDF'}</p>
            <p className="text-[10px] sm:text-xs text-white/70 truncate">{filename}</p>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <a
              className="btn-secondary !px-2 !py-1.5 text-xs"
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Ouvrir dans un nouvel onglet"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Onglet</span>
            </a>
            <a
              className="btn-secondary !px-2 !py-1.5 text-xs"
              href={downloadUrl}
              download={filename}
              title="Télécharger"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Télécharger</span>
            </a>
            <button
              className="p-1.5 text-white hover:bg-white/10 rounded"
              onClick={onClose}
              title="Fermer (Echap)"
              aria-label="Fermer"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <iframe
          src={url}
          className="flex-1 w-full bg-white rounded shadow-2xl"
          title={title || filename}
        />
      </div>
    </div>
  );
}
