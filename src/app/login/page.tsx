import { redirect } from 'next/navigation';
import { hasAnyAdmin } from '@/lib/app-config';
import LoginPageClient from './LoginForm';

/**
 * v3.3.0 GA — Server Component login.
 *
 * Sur instance vierge (zéro admin), redirect vers `/install` pour
 * que l'user soit acheminé vers le wizard plutôt qu'un login vide
 * sans compte possible. Sinon render le formulaire login client
 * existant.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  let hasAdmin = true;
  try {
    hasAdmin = await hasAnyAdmin();
  } catch (e) {
    console.error('[/login page] hasAnyAdmin error :', e);
  }
  if (!hasAdmin) {
    redirect('/install');
  }
  return <LoginPageClient />;
}
