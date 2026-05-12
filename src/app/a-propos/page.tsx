'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  FileText, Github, Heart, Shield, Server, Cloud, Check, ArrowRight,
} from 'lucide-react';

// Page publique non-authentifiée. Présente l'app, pointe vers le repo et
// Tipeee, et propose une pré-inscription à l'offre managée future.
export default function AProposPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch('/api/public/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'about-page' }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || 'Erreur');
        return;
      }
      setSubmitted(true);
      toast.success(j.alreadyRegistered ? 'Vous êtes déjà inscrit ✓' : 'Inscrit ! On vous tient au courant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg flex items-center gap-2">
            <FileText size={20} className="text-primary" /> OpenQuittance
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">Connexion</Link>
            <Link href="/register" className="btn-primary">S'inscrire</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
            La gestion locative simple, sans cloud tiers.
          </h1>
          <p className="text-lg text-muted-foreground">
            OpenQuittance est une application open source auto-hébergée pour générer
            les quittances de loyer, suivre l'indexation IRL et envoyer
            automatiquement vos documents par email — sans dépendre d'un SaaS.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/register" className="btn-primary">
              Démarrer <ArrowRight size={14} />
            </Link>
            <a
              href="https://github.com/grx14/quittances-app"
              target="_blank" rel="noreferrer"
              className="btn-secondary"
            >
              <Github size={14} /> Code source
            </a>
          </div>
        </section>

        {/* Trois colonnes valeurs */}
        <section className="grid sm:grid-cols-3 gap-4">
          <div className="card text-center space-y-2">
            <Server className="mx-auto text-primary" size={28} />
            <h3 className="font-semibold">Auto-hébergé</h3>
            <p className="text-sm text-muted-foreground">
              Tournez l'app sur votre NAS ou VPS en Docker. Vos données restent chez vous.
            </p>
          </div>
          <div className="card text-center space-y-2">
            <Shield className="mx-auto text-primary" size={28} />
            <h3 className="font-semibold">Sécurisé par défaut</h3>
            <p className="text-sm text-muted-foreground">
              2FA TOTP, chiffrement AES-256-GCM des tokens, audit log complet.
            </p>
          </div>
          <div className="card text-center space-y-2">
            <FileText className="mx-auto text-primary" size={28} />
            <h3 className="font-semibold">Conforme loi 1989</h3>
            <p className="text-sm text-muted-foreground">
              Quittances, avis d'échéance, EDL, courrier IRL — tous les documents
              légaux générés en PDF.
            </p>
          </div>
        </section>

        {/* Liste fonctionnalités */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Tout ce qu'il faut pour gérer un parc locatif</h2>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              'Quittances mensuelles générées en lot',
              'Avis d\'échéance, dépôt de garantie, EDL',
              'Indexation IRL synchronisée avec l\'INSEE',
              'Courrier de révision auto-archivé + suivi recommandé',
              'Envoi par email via Gmail API ou SMTP',
              'Multi-utilisateurs avec rôles (Admin / Member / Viewer)',
              '2FA TOTP optionnel par utilisateur',
              'Archives polymorphes (contrats, DPE, GLI…)',
              'Export comptable PDF + XML',
              'Audit log complet avec export CSV',
              'Mode sombre, mobile-first, drag & drop',
              'Wizard d\'onboarding en 4 étapes',
            ].map(t => (
              <li key={t} className="flex items-start gap-2">
                <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Pré-inscription managé */}
        <section className="card border-primary/40 bg-primary/5 space-y-4">
          <div className="flex items-start gap-3">
            <Cloud className="text-primary shrink-0 mt-1" size={28} />
            <div>
              <h2 className="text-xl font-semibold">Hébergement managé bientôt disponible</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Vous voulez la même app, mais sans gérer le serveur ni les sauvegardes ?
                Une offre managée arrive. Inscrivez-vous pour être notifié au lancement
                (et obtenir un tarif préférentiel).
              </p>
            </div>
          </div>

          {submitted ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 p-3 rounded text-sm flex items-center gap-2">
              <Check size={16} /> Vous êtes inscrit. À très bientôt.
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                className="input flex-1"
                placeholder="votre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <button className="btn-primary sm:w-auto" disabled={loading || !email}>
                {loading ? 'Envoi…' : 'Me prévenir'}
              </button>
            </form>
          )}

          <p className="text-xs text-muted-foreground">
            On ne stocke que votre email + la date d'inscription. Aucun spam, désinscription en 1 clic.
          </p>
        </section>

        {/* Soutien */}
        <section className="text-center space-y-3">
          <Heart className="mx-auto text-rose-500" size={28} />
          <h2 className="text-xl font-semibold">Open-source soutenu par la communauté</h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            OpenQuittance est distribué gratuitement sous licence MIT. Si l'app vous est utile,
            vous pouvez offrir un café à son auteur — ça aide à la maintenir et à ajouter
            de nouvelles fonctionnalités.
          </p>
          <a
            href="https://fr.tipeee.com/grx14/"
            target="_blank" rel="noreferrer"
            className="btn-secondary inline-flex"
          >
            ☕ Tipeee
          </a>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground space-y-1">
        <p>OpenQuittance — application open source · Licence MIT</p>
        <p>
          <a href="https://github.com/grx14/quittances-app" target="_blank" rel="noreferrer"
             className="hover:underline">Code source</a>
          {' · '}
          <Link href="/login" className="hover:underline">Connexion</Link>
          {' · '}
          <a href="https://fr.tipeee.com/grx14/" target="_blank" rel="noreferrer"
             className="hover:underline">Soutenir</a>
        </p>
      </footer>
    </div>
  );
}
