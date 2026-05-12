import { redirect } from 'next/navigation';
import { hasAnyAdmin } from '@/lib/app-config';
import InstallWizard from './InstallWizard';

/**
 * v3.3.0-rc1 — page d'installation initiale.
 *
 * Server Component qui :
 *  1. Vérifie `hasAnyAdmin()` côté DB.
 *     - Si `true` → instance déjà installée, redirect `/login`.
 *     - Si `false` → render le wizard 3 étapes.
 *  2. Détecte secrets faibles côté serveur (NEXTAUTH_SECRET +
 *     UPLOADS_ENCRYPTION_KEY) pour warning étape Done.
 *
 * Pas d'auth requise — instance vierge, premier utilisateur à créer.
 */
export const dynamic = 'force-dynamic';

function detectWeakSecrets(): { weak: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const trivialPatterns = [
    'changeme', 'replace-with', 'secret', 'password', '0000',
    '1234', 'admin', 'default',
  ];

  const nextSecret = process.env.NEXTAUTH_SECRET ?? '';
  if (nextSecret.length < 32) {
    reasons.push(`NEXTAUTH_SECRET trop court (${nextSecret.length} chars, minimum 32)`);
  }
  if (trivialPatterns.some(p => nextSecret.toLowerCase().includes(p))) {
    reasons.push('NEXTAUTH_SECRET contient un pattern trivial');
  }

  const uploadsKey = process.env.UPLOADS_ENCRYPTION_KEY ?? '';
  if (uploadsKey.length < 20) {
    reasons.push(`UPLOADS_ENCRYPTION_KEY trop court (${uploadsKey.length} chars)`);
  }
  if (trivialPatterns.some(p => uploadsKey.toLowerCase().includes(p))) {
    reasons.push('UPLOADS_ENCRYPTION_KEY contient un pattern trivial');
  }

  const encSecret = process.env.ENCRYPTION_SECRET ?? '';
  if (encSecret.length < 32) {
    reasons.push(`ENCRYPTION_SECRET trop court (${encSecret.length} chars, minimum 32)`);
  }
  if (trivialPatterns.some(p => encSecret.toLowerCase().includes(p))) {
    reasons.push('ENCRYPTION_SECRET contient un pattern trivial');
  }

  return { weak: reasons.length > 0, reasons };
}

export default async function InstallPage() {
  let hasAdmin = false;
  try {
    hasAdmin = await hasAnyAdmin();
  } catch (e) {
    // DB inaccessible (premier boot, migration en cours). On laisse
    // afficher le wizard — les endpoints API gating refuseront si
    // race condition. Évite redirect loop si DB temporairement down.
    console.error('[install/page] hasAnyAdmin error :', e);
  }

  if (hasAdmin) {
    redirect('/login');
  }

  const weakSecrets = detectWeakSecrets();

  return <InstallWizard weakSecrets={weakSecrets} />;
}
