'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

/**
 * Logo bailleur sur le header portail.
 *
 * - Si `logoUrl` absent/null/empty → icône FileText fallback direct (server-side)
 * - Si `logoUrl` présent → tente <img src="/api/portail/bailleur/logo">
 *   - 404 ou erreur réseau → fallback onError vers FileText
 *   - Defense in depth contre les paths obsolètes post-refactor uploads
 *
 * Composant Client minimal (juste pour onError state). Le reste du
 * header reste Server Component.
 */
export default function PortailLogo({
  hasLogo,
  bailleurNom,
  brandColor,
}: {
  hasLogo: boolean;
  bailleurNom: string;
  brandColor: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!hasLogo || failed) {
    return <FileText size={20} style={{ color: brandColor }} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/api/portail/bailleur/logo"
      alt={bailleurNom}
      className="h-6 w-auto"
      onError={() => setFailed(true)}
    />
  );
}
