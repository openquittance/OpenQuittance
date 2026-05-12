'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Mail, Check } from 'lucide-react';

// Page de demande de magic link pour le portail locataire.
// Volontairement neutre (pas de branding bailleur ici, cf. docs §5) pour
// éviter la fuite d'info sur "qui est locataire de qui" avant authentification.

function LoginForm() {
  const params = useSearchParams();
  const errorParam = params.get('error');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Erreur affichée INLINE dans la carte (sous le bouton). Pour les
  // utilisateurs non-tech, un toast détaché en haut à droite est trop facile
  // à manquer. Le toast en complément existe quand même via sonner.
  const [inlineError, setInlineError] = useState<string | null>(null);

  const errorMsg = (() => {
    if (!errorParam) return null;
    if (errorParam === 'invalid_token') return 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau ci-dessous.';
    if (errorParam === 'missing_token') return 'Lien invalide. Saisissez votre email pour en recevoir un nouveau.';
    return 'Une erreur est survenue. Réessayez.';
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);
    setLoading(true);
    try {
      const r = await fetch('/api/portail/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (r.status === 429) {
        const j = await r.json();
        const msg = j.error || 'Trop de tentatives. Réessayez plus tard.';
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      if (!r.ok && r.status !== 200) {
        const j = await r.json().catch(() => ({}));
        setInlineError(j.error || 'Une erreur est survenue. Réessayez.');
        return;
      }
      // 200 : message uniforme (anti-énumération)
      setSent(true);
    } catch {
      setInlineError('Impossible de joindre le serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          <FileText className="mx-auto text-primary" size={36} />
          <h1 className="text-xl font-semibold">Espace locataire</h1>
          <p className="text-sm text-muted-foreground">
            Recevez un lien de connexion par email pour accéder à vos quittances.
          </p>
        </div>

        {errorMsg && (
          <div className="text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 p-3 rounded">
            {errorMsg}
          </div>
        )}

        {sent ? (
          <div className="text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <Check size={26} className="text-emerald-600" />
            </div>
            <p className="font-medium">Email envoyé</p>
            <p className="text-sm text-muted-foreground">
              Si cette adresse a accès à un espace locataire, vous allez recevoir un email
              avec un lien de connexion (valable 15 minutes). Pensez à vérifier votre dossier
              de courriers indésirables.
            </p>
            <button
              className="btn-secondary w-full"
              onClick={() => { setSent(false); setInlineError(null); }}
              type="button"
            >
              <Mail size={14} /> Renvoyer un lien
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">Votre email</label>
              <input
                type="email"
                className="input"
                required
                autoFocus
                placeholder="adresse@exemple.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading || !email}>
              <Mail size={14} /> {loading ? 'Envoi…' : 'Recevoir le lien'}
            </button>
            {inlineError && (
              <div
                role="alert"
                className="text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded border border-red-200 dark:border-red-800"
              >
                {inlineError}
              </div>
            )}
          </form>
        )}

        <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
          <p>
            Vous êtes administrateur ? <Link href="/login" className="text-primary hover:underline">Connexion staff</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PortailLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
