'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Briefcase, User, Check, ChevronRight, AlertTriangle, Sparkles } from 'lucide-react';
import { LogoHorizontal } from '@/components/Logo';

/**
 * v3.3.0-rc1 — wizard install 3 étapes.
 *
 * 1. Compte administrateur (name + email + password)
 * 2. Premier bailleur (4 champs minimum requis)
 * 3. C'est prêt ! → signin auto + redirect /
 */

interface WeakSecrets {
  weak: boolean;
  reasons: string[];
}

interface AdminForm {
  name: string;
  email: string;
  password: string;
}

interface BailleurForm {
  nom: string;
  adresseLigne1: string;
  adresseLigne2: string;
  villeSignature: string;
}

type Step = 1 | 2 | 3;

export default function InstallWizard({ weakSecrets }: { weakSecrets: WeakSecrets }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [admin, setAdmin] = useState<AdminForm>({ name: '', email: '', password: '' });
  const [bailleur, setBailleur] = useState<BailleurForm>({
    nom: '', adresseLigne1: '', adresseLigne2: '', villeSignature: '',
  });
  const [submitting, setSubmitting] = useState(false);
  // v3.3.0 — flag : admin créé en DB, en attente d'une signin réussie.
  // Si POST admin OK mais signin auto fail, on ne re-POST pas (403
  // "Instance déjà installée"). On propose de re-tenter signin OU
  // signin manuelle via /login.
  const [adminCreatedPendingSignin, setAdminCreatedPendingSignin] = useState(false);

  const submitAdmin = async () => {
    if (!admin.name || !admin.email || admin.password.length < 8) {
      toast.error('Nom, email et mot de passe (≥ 8 caractères) requis');
      return;
    }
    setSubmitting(true);
    try {
      // Skip POST admin si déjà créé (cas retry post-signin échoué).
      if (!adminCreatedPendingSignin) {
        const r = await fetch('/api/install/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(admin),
        });
        if (!r.ok) {
          const j = await r.json();
          toast.error(j.error || 'Échec création admin');
          return;
        }
        setAdminCreatedPendingSignin(true);
      }
      // Auto signin pour pouvoir créer le bailleur (gating API ADMIN session)
      const result = await signIn('credentials', {
        email: admin.email,
        password: admin.password,
        redirect: false,
      });
      if (result?.error) {
        toast.error(
          'Compte créé, mais erreur de connexion automatique. '
          + 'Réessayez ou utilisez /login manuellement.',
        );
        return;
      }
      setStep(2);
      toast.success('Compte administrateur créé');
    } finally {
      setSubmitting(false);
    }
  };

  const submitBailleur = async () => {
    if (!bailleur.nom || !bailleur.adresseLigne1 || !bailleur.adresseLigne2 || !bailleur.villeSignature) {
      toast.error('Tous les champs sont requis');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch('/api/install/bailleur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bailleur),
      });
      if (!r.ok) {
        const j = await r.json();
        toast.error(j.error || 'Échec création bailleur');
        return;
      }
      // Marquer setupCompleted
      await fetch('/api/install/complete', { method: 'POST' });
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  };

  const finish = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          {/* v3.7.0 — inline SVG : visible en dark mode (currentColor). */}
          <LogoHorizontal className="h-12 w-auto mx-auto mb-4 text-foreground" />
          <h1 className="text-2xl font-semibold flex items-center justify-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-500" />
            Installation
          </h1>
          <p className="text-muted-foreground mt-2">
            Configuration initiale en 3 étapes
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step === n
                    ? 'bg-foreground text-background'
                    : step > n
                      ? 'bg-green-600 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {step > n ? <Check className="w-4 h-4" /> : n}
              </div>
              {n < 3 && (
                <div
                  className={`w-12 h-0.5 ${step > n ? 'bg-green-600' : 'bg-muted'}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 — Admin */}
        {step === 1 && (
          <div className="card space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Compte administrateur</h2>
            </div>
            {adminCreatedPendingSignin && (
              <div className="rounded border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950/30 p-3 text-sm">
                <p className="font-semibold text-orange-800 dark:text-orange-300">
                  ⚠️ Compte créé, connexion automatique échouée
                </p>
                <p className="text-orange-700 dark:text-orange-200 mt-1 text-xs">
                  Cliquez sur "Continuer" pour réessayer la connexion, ou{' '}
                  <Link href="/login" className="underline">
                    connectez-vous manuellement
                  </Link>
                  .
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Cette personne pourra inviter d'autres utilisateurs et configurer
              tous les paramètres de l'instance.
            </p>
            <div>
              <label className="label">Nom</label>
              <input
                className="input"
                value={admin.name}
                onChange={e => setAdmin({ ...admin, name: e.target.value })}
                placeholder="Jean Dupont"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={admin.email}
                onChange={e => setAdmin({ ...admin, email: e.target.value })}
                placeholder="admin@exemple.com"
              />
            </div>
            <div>
              <label className="label">Mot de passe (minimum 8 caractères)</label>
              <input
                className="input"
                type="password"
                value={admin.password}
                onChange={e => setAdmin({ ...admin, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                className="btn-primary"
                onClick={submitAdmin}
                disabled={submitting}
              >
                {submitting ? 'Création…' : 'Continuer'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Bailleur */}
        {step === 2 && (
          <div className="card space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Premier bailleur</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Le bailleur représente l'entité juridique qui émet les quittances.
              Vous pourrez compléter les informations légales (SIRET, raison
              sociale, etc.) plus tard depuis Paramètres &gt; Bailleurs.
            </p>
            <div>
              <label className="label">Nom commercial *</label>
              <input
                className="input"
                value={bailleur.nom}
                onChange={e => setBailleur({ ...bailleur, nom: e.target.value })}
                placeholder="SCI Beauregard"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Adresse *</label>
              <input
                className="input"
                value={bailleur.adresseLigne1}
                onChange={e => setBailleur({ ...bailleur, adresseLigne1: e.target.value })}
                placeholder="12 rue de la République"
              />
            </div>
            <div>
              <label className="label">Code postal + ville *</label>
              <input
                className="input"
                value={bailleur.adresseLigne2}
                onChange={e => setBailleur({ ...bailleur, adresseLigne2: e.target.value })}
                placeholder="75001 Paris"
              />
            </div>
            <div>
              <label className="label">Ville pour &quot;Fait à …&quot; *</label>
              <input
                className="input"
                value={bailleur.villeSignature}
                onChange={e => setBailleur({ ...bailleur, villeSignature: e.target.value })}
                placeholder="Paris"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                className="btn-primary"
                onClick={submitBailleur}
                disabled={submitting}
              >
                {submitting ? 'Création…' : 'Continuer'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className="card space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-semibold">C&apos;est prêt !</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="w-4 h-4" /> Compte administrateur créé
              </div>
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="w-4 h-4" /> Premier bailleur créé
              </div>
            </div>

            {/* Warning secrets faibles */}
            {weakSecrets.weak && (
              <div className="rounded border-l-4 border-red-500 bg-red-50 dark:bg-red-950/30 p-3 text-sm">
                <p className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Secrets de chiffrement faibles détectés
                </p>
                <ul className="text-red-700 dark:text-red-200 mt-2 list-disc pl-5 text-xs">
                  {weakSecrets.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                <p className="text-red-700 dark:text-red-200 mt-2 text-xs">
                  Pour une instance publique, régénérez ces clés via
                  <code className="mx-1">openssl rand -hex 32</code>
                  puis redémarrez le container. Cf.{' '}
                  <a href="https://github.com/grx14/quittances-app/blob/main/docs/INSTALL.md" target="_blank" rel="noopener noreferrer" className="underline">
                    docs/INSTALL.md
                  </a>.
                </p>
              </div>
            )}

            <div className="rounded border border-border p-3 text-sm space-y-1">
              <p className="font-medium">Prochaines étapes (optionnelles) :</p>
              <ul className="text-muted-foreground text-xs list-disc pl-5">
                <li>
                  <Link href="/parametres/integrations" className="underline">
                    Configurer Google OAuth
                  </Link>
                  {' '}(login Google + envoi quittances Gmail API)
                </li>
                <li>
                  <Link href="/parametres/backup" className="underline">
                    Configurer le backup automatique
                  </Link>
                  {' '}(S3-compatible ou Google Drive)
                </li>
                <li>
                  <Link href="/parametres/irl" className="underline">
                    Configurer l&apos;API INSEE
                  </Link>
                  {' '}(récupération automatique IRL pour révisions)
                </li>
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button type="button" className="btn-primary" onClick={finish}>
                Accéder à mon tableau de bord
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
