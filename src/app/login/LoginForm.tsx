'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

/**
 * v2.8.0 quick win sécu : valide callbackUrl côté client pour éviter
 * open redirect. Accepte UNIQUEMENT les chemins internes commençant par
 * "/" SANS être "//..." (protocol-relative URL) ou "/\..." (Windows path).
 * Tout le reste → fallback "/".
 *
 * Vector mitigé : `?callbackUrl=https://evil.com` après login redirige
 * vers domaine attaquant (phishing).
 */
function safeCallbackUrl(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'));
  const fromSetup = params.get('fromSetup') === '1';
  const prefilledEmail = params.get('email') || '';
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  // step = 'creds' (saisie email/password) ou 'totp' (saisie 2nd facteur)
  const [step, setStep] = useState<'creds' | 'totp'>('creds');
  const [useBackup, setUseBackup] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (extra: { totpToken?: string; backupCode?: string } = {}) => {
    setLoading(true);
    try {
      const r = await signIn('credentials', {
        email,
        password,
        ...extra,
        redirect: false,
        callbackUrl,
      });
      if (r?.error) {
        // NextAuth v5 expose le code custom via r.code
        if (r.code === 'totp_required') {
          setStep('totp');
          return;
        }
        if (r.code === 'totp_invalid') {
          toast.error('Code invalide');
          return;
        }
        if (r.code === 'rate_limited') {
          toast.error('Trop de tentatives, réessayez dans 15 minutes');
          return;
        }
        toast.error('Email ou mot de passe incorrect');
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const onSubmitCreds = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onSubmitTotp = (e: React.FormEvent) => {
    e.preventDefault();
    submit(useBackup ? { backupCode } : { totpToken });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Connexion</h1>
          <p className="text-sm text-muted-foreground">Accédez à vos quittances</p>
        </div>

        {fromSetup && (
          <div className="text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 p-3 rounded space-y-1">
            <p className="font-medium">✓ Votre compte est prêt</p>
            <p className="text-xs">Connectez-vous avec le mot de passe que vous venez de définir pour accéder au tableau de bord.</p>
          </div>
        )}

        <button
          className="btn-secondary w-full"
          onClick={() => signIn('google', { callbackUrl })}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Continuer avec Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou</span></div>
        </div>

        {step === 'creds' && (
          <form onSubmit={onSubmitCreds} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <input type="password" className="input" required value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={onSubmitTotp} className="space-y-3">
            <div className="text-sm bg-muted p-3 rounded">
              <p className="font-medium">Authentification à deux facteurs</p>
              <p className="text-xs text-muted-foreground mt-1">
                {useBackup
                  ? 'Saisissez l\'un de vos codes de secours (à usage unique).'
                  : 'Saisissez le code à 6 chiffres de votre app TOTP.'}
              </p>
            </div>
            {!useBackup ? (
              <div>
                <label className="label">Code TOTP</label>
                <input
                  className="input text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                  required
                  autoFocus
                  value={totpToken}
                  onChange={e => setTotpToken(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            ) : (
              <div>
                <label className="label">Code de secours</label>
                <input
                  className="input font-mono"
                  required
                  autoFocus
                  placeholder="XXXXX-XXXXX"
                  value={backupCode}
                  onChange={e => setBackupCode(e.target.value.toUpperCase())}
                />
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Vérification…' : 'Valider'}
            </button>
            <div className="flex justify-between text-xs">
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() => { setStep('creds'); setTotpToken(''); setBackupCode(''); }}
              >
                ← Annuler
              </button>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => { setUseBackup(!useBackup); setTotpToken(''); setBackupCode(''); }}
              >
                {useBackup ? 'Utiliser un code TOTP' : 'Utiliser un code de secours'}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Pas encore de compte ? <Link href="/register" className="text-primary hover:underline">S'inscrire</Link>
        </p>

        <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border space-y-1">
          <p>Application open-source pour la gestion de quittances de loyer.</p>
          <p>
            Si elle vous est utile, vous pouvez offrir un café à son auteur sur{' '}
            <a href="https://fr.tipeee.com/grx14/" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Tipeee ☕
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
