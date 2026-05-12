import Link from 'next/link';
import { AlertCircle, Mail, RefreshCw } from 'lucide-react';
import { peekMagicLink } from '@/lib/portail-magic';
import VerifyClient from './VerifyClient';

// Server Component "verify" pour le portail locataire (Phase 3 — D.1).
//
// Pré-Phase 3, l'email d'invitation pointait vers /api/portail/login/verify
// qui consommait + redirigeait. UX dégradée : un round-trip de redirect
// visible dans la barre d'URL au lieu d'une vraie page.
//
// Maintenant : la page lit ?token= côté server, peek son état (sans
// consommer), et :
//   - 'valid'    → mount VerifyClient qui appelle signIn() côté client
//   - 'consumed' → "Lien déjà utilisé. [Demander un nouveau lien]"
//   - 'expired'  → "Lien expiré (15 min). [Demander un nouveau lien]"
//   - 'invalid'  → "Lien invalide. [Saisir mon email]"

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? '';
  const state = token ? await peekMagicLink(token) : 'invalid';

  if (state === 'valid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full">
          <VerifyClient token={token} />
        </div>
      </div>
    );
  }

  // États d'erreur — UI dédiée par cas (state ∈ consumed|expired|invalid ici)
  const config: Record<'consumed' | 'expired' | 'invalid', { title: string; body: string; action: { href: string; label: string; icon: typeof Mail } }> = {
    consumed: {
      title: 'Lien déjà utilisé',
      body: 'Ce lien d\'activation a déjà servi à se connecter. Pour vous reconnecter, demandez un nouveau lien.',
      action: { href: '/portail/login', label: 'Demander un nouveau lien', icon: RefreshCw },
    },
    expired: {
      title: 'Lien expiré',
      body: 'Ce lien a expiré (les liens sont valides 15 minutes). Demandez un nouveau lien.',
      action: { href: '/portail/login', label: 'Demander un nouveau lien', icon: RefreshCw },
    },
    invalid: {
      title: 'Lien invalide',
      body: 'Ce lien d\'activation n\'est pas reconnu. Saisissez votre email pour en recevoir un nouveau.',
      action: { href: '/portail/login', label: 'Saisir mon email', icon: Mail },
    },
  };
  const c = config[state];
  const Icon = c.action.icon;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-md w-full space-y-4 text-center">
        <AlertCircle size={32} className="mx-auto text-amber-600" />
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <p className="text-sm text-muted-foreground">{c.body}</p>
        <Link href={c.action.href} className="btn-primary inline-flex items-center gap-2">
          <Icon size={14} /> {c.action.label}
        </Link>
      </div>
    </div>
  );
}
