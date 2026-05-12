import { redirect } from 'next/navigation';
import { hasAnyAdmin } from '@/lib/app-config';
import Dashboard from './Dashboard';

/**
 * v3.3.0 GA — Server Component racine.
 *
 * Sur instance vierge (zéro admin), redirect vers le wizard
 * `/install` pour user-friendliness. Sinon délègue au Dashboard
 * Client Component existant (logique authentification gérée par
 * middleware + AppShell).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  let hasAdmin = true;
  try {
    hasAdmin = await hasAnyAdmin();
  } catch (e) {
    // DB inaccessible (premier boot, migration en cours) → laisser
    // le Dashboard tenter de se charger (middleware redirect /login
    // si pas de session). Évite redirect loop si DB temporairement
    // down.
    console.error('[/ page] hasAnyAdmin error :', e);
  }
  if (!hasAdmin) {
    redirect('/install');
  }
  return <Dashboard />;
}
