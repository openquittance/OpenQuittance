'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Building2, FileText, Euro, AlertTriangle, Mail, Briefcase, ArrowRight } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import DashboardAlertes from '@/components/DashboardAlertes';
import { SkeletonCards, SkeletonTable } from '@/components/Skeleton';
import { useBailleurs } from '@/lib/bailleur-context';
import { formatMontant, moisLabel, formatDateFr } from '@/lib/utils';

interface DashboardData {
  locActifs: number; biensCount: number; quittancesMois: number;
  revenusMensuels: number; sansEmail: number; nonEnvoyees: number;
  mois: number; annee: number;
  dernieres: {
    id: string; mois: number; annee: number; montantTotal: number;
    dateEmission: string; emailEnvoye: boolean;
    locataire: { nom: string; prenom: string; bien: { bailleur: { nom: string } } };
  }[];
}

interface Parametres {
  gmailConnected: boolean;
  smtpPassConfigured: boolean;
  emailMethod: 'gmail_api' | 'smtp';
  smtpUser: string | null;
}

function DashboardContent() {
  const { active } = useBailleurs();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<Parametres | null>(null);

  useEffect(() => {
    fetch('/api/parametres').then(r => r.json()).then(setParams).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    fetch(`/api/dashboard?bailleurId=${active.id}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [active]);

  const emailNotConfigured = params && !params.gmailConnected && !(params.emailMethod === 'smtp' && params.smtpPassConfigured);

  if (!active) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Bienvenue 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pour démarrer, configurez votre activité de location en quelques étapes.
          </p>
        </div>

        <Link href="/onboarding" className="card border-primary/50 bg-primary/5 hover:bg-primary/10 transition flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary text-primary-foreground"><Briefcase size={20} /></div>
            <div>
              <p className="font-semibold">Démarrage rapide guidé</p>
              <p className="text-sm text-muted-foreground">
                Wizard 4 étapes : bailleur → bien → locataire → première quittance.
              </p>
            </div>
          </div>
          <ArrowRight className="text-primary" size={20} />
        </Link>

        <p className="text-sm text-muted-foreground text-center">— ou configurez manuellement —</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/bailleurs" className="card hover:shadow-md transition group">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-primary/10 text-primary"><Briefcase size={20} /></div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">ÉTAPE 1</p>
                <p className="font-semibold mt-1">Votre entreprise de location</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Renseignez le nom, l'adresse, les infos légales (RCS), uploadez votre logo et signature.
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-primary mt-3 group-hover:underline">
                  Configurer mon bailleur <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </Link>

          <Link href="/biens" className="card hover:shadow-md transition group">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-primary/10 text-primary"><Building2 size={20} /></div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">ÉTAPE 2</p>
                <p className="font-semibold mt-1">Vos logements</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Ajoutez chaque bien que vous mettez en location (adresse, complément, ville).
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-primary mt-3 group-hover:underline">
                  Ajouter un logement <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </Link>

          <Link href="/locataires" className="card hover:shadow-md transition group">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-primary/10 text-primary"><Users size={20} /></div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">ÉTAPE 3 — optionnel</p>
                <p className="font-semibold mt-1">Vos locataires</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Reliez un locataire à chaque logement occupé. Un logement peut rester sans locataire (vacant, travaux…).
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-primary mt-3 group-hover:underline">
                  Ajouter un locataire <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </Link>
        </div>

        <div className="text-xs text-muted-foreground text-center pt-4">
          Une fois ces étapes réalisées, vous pourrez générer et envoyer des quittances en un clic.
        </div>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-48 bg-muted animate-pulse rounded mb-2" />
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        </div>
        <SkeletonCards count={4} />
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  const cards = [
    { label: 'Locataires actifs', value: data.locActifs, icon: Users },
    { label: 'Biens', value: data.biensCount, icon: Building2 },
    { label: `Quittances ${moisLabel(data.mois)}`, value: data.quittancesMois, icon: FileText },
    { label: 'Revenus mensuels', value: formatMontant(data.revenusMensuels), icon: Euro },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground mt-1">{active.nom} — {moisLabel(data.mois)} {data.annee}</p>
        </div>
        <Link href="/quittances" className="btn-primary">
          Générer les quittances du mois
        </Link>
      </div>

      {emailNotConfigured && (
        <div className="card border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
          <Mail className="text-amber-600 shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-medium">Configurez votre email</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sans email configuré, vous ne pourrez ni envoyer les quittances par email, ni inviter des collaborateurs.
            </p>
          </div>
          <Link href="/parametres/email" className="btn-primary text-sm">Configurer →</Link>
        </div>
      )}

      <DashboardAlertes bailleurId={active.id} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-2">{value}</p>
              </div>
              <Icon className="text-primary" size={22} />
            </div>
          </div>
        ))}
      </div>

      {(data.sansEmail > 0 || data.nonEnvoyees > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.sansEmail > 0 && (
            <div className="card border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
              <AlertTriangle className="text-amber-600" size={20} />
              <div className="flex-1">
                <p className="text-sm font-medium">{data.sansEmail} locataire(s) sans email</p>
                <p className="text-xs text-muted-foreground">Renseignez leur email pour envoyer automatiquement les quittances.</p>
              </div>
              <Link href="/locataires" className="text-sm text-primary hover:underline">→</Link>
            </div>
          )}
          {data.nonEnvoyees > 0 && (
            <div className="card border-blue-500/30 bg-blue-500/5 flex items-start gap-3">
              <Mail className="text-blue-600" size={20} />
              <div className="flex-1">
                <p className="text-sm font-medium">{data.nonEnvoyees} quittance(s) non envoyée(s) ce mois</p>
                <p className="text-xs text-muted-foreground">Pensez à les expédier aux locataires.</p>
              </div>
              <Link href="/quittances" className="text-sm text-primary hover:underline">→</Link>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Dernières quittances</h2>
          <Link href="/quittances" className="text-sm text-primary hover:underline">Tout voir →</Link>
        </div>
        {data.dernieres.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aucune quittance pour le moment.</p>
        ) : (
          <>
            {/* Desktop ≥ md : table classique */}
            <div className="hidden md:block">
              <table className="table-base">
                <thead>
                  <tr><th>Locataire</th><th>Période</th><th>Montant</th><th>Émise</th><th>Email</th></tr>
                </thead>
                <tbody>
                  {data.dernieres.map(q => (
                    <tr key={q.id}>
                      <td>{q.locataire.nom} {q.locataire.prenom}</td>
                      <td>{moisLabel(q.mois)} {q.annee}</td>
                      <td className="font-medium">{formatMontant(q.montantTotal)}</td>
                      <td>{formatDateFr(q.dateEmission)}</td>
                      <td>{q.emailEnvoye ? <span className="badge-ok">Envoyé</span> : <span className="badge-off">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* v3.6.2 mobile < md : cards lisibles, pas de scroll horizontal */}
            <ul className="md:hidden space-y-2">
              {data.dernieres.map(q => (
                <li key={q.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-medium truncate">{q.locataire.nom} {q.locataire.prenom}</p>
                    <p className="font-semibold shrink-0">{formatMontant(q.montantTotal)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {moisLabel(q.mois)} {q.annee} · émise {formatDateFr(q.dateEmission)}
                  </p>
                  <div className="mt-1">
                    {q.emailEnvoye ? <span className="badge-ok">Envoyé</span> : <span className="badge-off">Email non envoyé</span>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
