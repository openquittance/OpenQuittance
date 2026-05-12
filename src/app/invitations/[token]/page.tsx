'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { toast } from 'sonner';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Mail } from 'lucide-react';

interface InvitationInfo {
  email: string;
  appName: string;
  inviterName: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  expiresAt: string;
  accepted: boolean;
  expired: boolean;
}

const ROLE_LABEL: Record<InvitationInfo['role'], string> = {
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
  VIEWER: 'Lecteur (consultation)',
};

export default function AcceptInvitationPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { data: session, status } = useSession();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${params.token}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) setError(j.error || 'Erreur');
        else setInfo(j);
      })
      .finally(() => setLoading(false));
  }, [params.token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const r = await fetch(`/api/invitations/${params.token}`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success('Invitation acceptée !');
      router.push('/');
      router.refresh();
    } finally { setAccepting(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center p-4"><p className="text-muted-foreground">Chargement…</p></div>;
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <AlertTriangle className="mx-auto text-destructive" size={32} />
          <h1 className="text-xl font-semibold">Invitation invalide</h1>
          <p className="text-sm text-muted-foreground">{error || 'Ce lien est invalide ou expiré.'}</p>
        </div>
      </div>
    );
  }

  if (info.expired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <AlertTriangle className="mx-auto text-amber-600" size={32} />
          <h1 className="text-xl font-semibold">Invitation expirée</h1>
          <p className="text-sm text-muted-foreground">Demandez une nouvelle invitation à {info.inviterName}.</p>
        </div>
      </div>
    );
  }

  if (info.accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <CheckCircle2 className="mx-auto text-emerald-600" size={32} />
          <h1 className="text-xl font-semibold">Déjà acceptée</h1>
          <Link href="/" className="btn-primary inline-flex">Aller au tableau de bord</Link>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full space-y-5">
          <div className="text-center space-y-1">
            <Mail className="mx-auto text-primary" size={32} />
            <h1 className="text-xl font-semibold">Vous êtes invité·e</h1>
            <p className="text-sm text-muted-foreground">
              <strong>{info.inviterName}</strong> vous invite à rejoindre <strong>{info.appName}</strong>
              {' '}en tant que <strong>{ROLE_LABEL[info.role]}</strong>.
            </p>
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 p-3 rounded">
            Connectez-vous (ou inscrivez-vous) avec l'email <strong>{info.email}</strong> pour accepter.
          </div>
          <button
            className="btn-secondary w-full"
            onClick={() => signIn('google', { callbackUrl: `/invitations/${params.token}` })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continuer avec Google
          </button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href={`/register?callbackUrl=${encodeURIComponent('/invitations/' + params.token)}`} className="text-primary hover:underline">
              Créer un compte avec email
            </Link>
            {' · '}
            <Link href={`/login?callbackUrl=${encodeURIComponent('/invitations/' + params.token)}`} className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const userEmail = session?.user?.email?.toLowerCase();
  const emailMatch = userEmail === info.email.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-md w-full space-y-5">
        <div className="text-center space-y-1">
          <Mail className="mx-auto text-primary" size={32} />
          <h1 className="text-xl font-semibold">Invitation à rejoindre</h1>
          <p className="text-lg font-semibold text-primary">{info.appName}</p>
          <p className="text-sm text-muted-foreground">
            par <strong>{info.inviterName}</strong> · rôle <strong>{ROLE_LABEL[info.role]}</strong>
          </p>
        </div>
        {!emailMatch && (
          <div className="text-xs text-amber-800 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 p-3 rounded space-y-1">
            <p className="font-medium">⚠ Email du compte différent</p>
            <p>Invitation pour <strong>{info.email}</strong>, vous êtes connecté·e avec <strong>{userEmail}</strong>.</p>
          </div>
        )}
        <button className="btn-primary w-full" onClick={accept} disabled={accepting || !emailMatch}>
          {accepting ? 'Acceptation…' : 'Accepter l\'invitation'}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">Retour au tableau de bord</Link>
        </p>
      </div>
    </div>
  );
}
