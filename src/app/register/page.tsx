'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Lock, Sparkles } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<{
    registrationMode: 'INVITATION_ONLY' | 'CLOSED';
    isFirstUser: boolean;
  } | null>(null);

  useEffect(() => {
    fetch('/api/public/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ registrationMode: 'CLOSED', isFirstUser: false }));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || 'Erreur');
        return;
      }
      // Pas de signIn() côté client (CSRF flaky derrière Cloudflare).
      // On redirige vers /login avec l'email pré-rempli pour que l'utilisateur
      // se connecte normalement. Cookie session propre garanti.
      toast.success('Compte créé. Connectez-vous pour continuer.');
      setTimeout(() => {
        window.location.href = `/login?email=${encodeURIComponent(email)}&fromRegister=1`;
      }, 800);
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Chargement…</p></div>;
  }

  if (!config.isFirstUser && config.registrationMode === 'CLOSED') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-md space-y-4 text-center">
          <Lock className="mx-auto text-muted-foreground" size={32} />
          <h1 className="text-xl font-semibold">Inscriptions fermées</h1>
          <p className="text-sm text-muted-foreground">
            L'administrateur de cette instance n'autorise pas les nouvelles inscriptions pour le moment.
          </p>
          <Link href="/login" className="btn-primary inline-flex">Se connecter</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">
            {config.isFirstUser ? 'Bienvenue !' : 'Créer un compte'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {config.isFirstUser
              ? "Première utilisation : créez votre compte pour démarrer"
              : 'Démarrez en 30 secondes'}
          </p>
        </div>

        {config.isFirstUser && (
          <div className="text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 p-3 rounded space-y-1 flex items-start gap-2">
            <Sparkles size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Vous êtes le premier utilisateur</p>
              <p className="text-xs">Vous serez automatiquement <strong>administrateur</strong> de cette instance et pourrez configurer l'app + inviter d'autres collaborateurs.</p>
            </div>
          </div>
        )}

        {!config.isFirstUser && config.registrationMode === 'INVITATION_ONLY' && (
          <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 p-3 rounded">
            <strong>Inscription sur invitation uniquement</strong> — utilisez l'email auquel vous avez reçu une invitation.
          </div>
        )}

        <button
          className="btn-secondary w-full"
          onClick={() => signIn('google', { callbackUrl: '/' })}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          {config.isFirstUser ? "S'inscrire avec Google" : "S'inscrire avec Google"}
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou avec un email</span></div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="label">Nom</label>
            <input className="input" required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Mot de passe (8 caractères min.)</label>
            <input type="password" className="input" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Déjà un compte ? <Link href="/login" className="text-primary hover:underline">Se connecter</Link>
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
