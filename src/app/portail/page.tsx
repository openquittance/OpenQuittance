import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Eye, Download, ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { formatMontant, moisLabel, formatDateFr } from '@/lib/utils';
import { brandingVars } from '@/lib/branding';
import PortailLogo from './PortailLogo';

// Page d'accueil portail (Lot C). Branding bailleur post-auth.
// Système de variables CSS dérivées (cf. docs/PORTAIL-BRANDING.md) :
// pas d'aplat plein de la couleur ; uniquement bordure 4px header,
// icône, labels uppercase, badge compteur, liens, focus rings.
//
// Le middleware enforce déjà role === 'TENANT'.
export default async function PortailHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portail/login');

  const locataires = await prisma.locataire.findMany({
    where: { tenantUserId: session.user.id, portailActif: true },
    include: { bien: { include: { bailleur: true } } },
  });

  if (locataires.length === 0) {
    // État vide volontairement neutre, sans branding bailleur
    // (cf. docs/PORTAIL-LOCATAIRE.md §5 : on ne sait pas de quel bailleur
    // il s'agit puisqu'aucun lien actif).
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md space-y-3 text-center">
          <h1 className="font-semibold">Aucun bail actif.</h1>
          <p className="text-sm text-muted-foreground">
            Contactez votre bailleur.
          </p>
        </div>
      </div>
    );
  }

  const bailleur = locataires[0]!.bien.bailleur;
  const vars = brandingVars(bailleur.pdfCouleur);

  // Récupère les 3 dernières quittances pour la card "VOS QUITTANCES"
  const quittances = await prisma.quittance.findMany({
    where: {
      locataire: {
        tenantUserId: session.user.id,
        portailActif: true,
        partageQuittances: true,
      },
    },
    orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    take: 3,
    include: { locataire: { select: { bien: { select: { adresse: true } } } } },
  });
  const totalQuittances = await prisma.quittance.count({
    where: {
      locataire: {
        tenantUserId: session.user.id,
        portailActif: true,
        partageQuittances: true,
      },
    },
  });

  // Section "Mes documents" : 3 derniers Archives visibles selon les
  // toggles + count total (cf. /api/portail/documents pour la logique
  // de filtrage). Mapping catégorie ↔ toggle dupliqué.
  const CAT_TOGGLE: Record<string, 'partageEtatDesLieux' | 'partageBail'> = {
    'edl-entree': 'partageEtatDesLieux',
    'edl-sortie': 'partageEtatDesLieux',
    bail: 'partageBail',
    contrat: 'partageBail',
  };
  const locIds = locataires.map(l => l.id);
  const togglesByLoc = new Map(locataires.map(l => [l.id, l]));
  const archivesAll = await prisma.archive.findMany({
    where: { ownerType: 'Locataire', ownerId: { in: locIds } },
    orderBy: { createdAt: 'desc' },
  });
  const documentsVisibles = archivesAll.filter(a => {
    const loc = togglesByLoc.get(a.ownerId);
    if (!loc) return false;
    const tk = a.category ? CAT_TOGGLE[a.category] : undefined;
    if (tk) return loc[tk];
    return a.visibleLocataire;
  });
  const totalDocuments = documentsVisibles.length;
  const recentDocuments = documentsVisibles.slice(0, 3);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        ['--brand' as string]: vars.brand,
        ['--brand-pale' as string]: vars.brandPale,
        ['--brand-text-on-brand' as string]: vars.textOnBrand,
      }}
    >
      <header style={{ borderBottom: '4px solid var(--brand)' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PortailLogo
              hasLogo={!!bailleur.logoUrl}
              bailleurNom={bailleur.nom}
              brandColor={vars.brand}
            />
            <span className="font-semibold">{bailleur.nom}</span>
          </div>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/portail/login' }); }}>
            <button type="submit" className="btn-ghost text-sm">
              <LogOut size={14} /> Déconnexion
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8 w-full space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Bonjour {locataires[0]!.prenom}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bienvenue sur votre espace locataire.
          </p>
        </div>

        {/* VOS BAUX : 1 carte par bail si multi-bail */}
        <section className="space-y-2">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--brand)' }}
          >
            {locataires.length > 1 ? 'Vos baux' : 'Votre bail'}
          </p>
          <div className="space-y-2">
            {locataires.map(l => (
              <div key={l.id} className="card">
                <h2 className="font-semibold text-base">{l.bien.adresse}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {l.bien.codePostal} {l.bien.ville} · loyer {formatMontant(l.loyerNu)} + charges {formatMontant(l.charges)} ·
                  bail démarré le {formatDateFr(l.dateEntree)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* VOS QUITTANCES */}
        <section className="space-y-2">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--brand)' }}
          >
            Vos quittances
          </p>
          {totalQuittances === 0 ? (
            <div className="card text-center py-6">
              <p className="font-medium">Aucune quittance disponible pour le moment.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Vos quittances apparaîtront ici dès qu'elles seront générées par votre bailleur.
              </p>
            </div>
          ) : (
            <div className="card space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--brand)',
                    color: 'var(--brand-text-on-brand)',
                  }}
                >
                  {totalQuittances} disponible{totalQuittances > 1 ? 's' : ''}
                </span>
                {quittances[0] && (
                  <span className="text-sm text-muted-foreground">
                    dernier loyer payé : <strong className="text-foreground">{moisLabel(quittances[0].mois)} {quittances[0].annee}</strong>
                    {' '}({formatMontant(quittances[0].montantTotal)})
                  </span>
                )}
              </div>
              <ul className="divide-y divide-border">
                {quittances.map(q => (
                  <li key={q.id} className="py-2.5 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{moisLabel(q.mois)} {q.annee}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMontant(q.montantTotal)} · payé le {formatDateFr(q.datePaiement)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <a
                        className="btn-ghost p-1.5"
                        href={`/api/portail/quittances/${q.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Visualiser"
                        title="Visualiser"
                      >
                        <Eye size={14} />
                      </a>
                      <a
                        className="btn-ghost p-1.5"
                        href={`/api/portail/quittances/${q.id}/pdf?download=1`}
                        aria-label="Télécharger"
                        title="Télécharger"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/portail/quittances"
                className="text-sm hover:underline inline-flex items-center gap-1"
                style={{ color: 'var(--brand)' }}
              >
                {totalQuittances > 3 ? 'Voir toutes les quittances' : 'Voir la liste complète'} <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </section>

        {/* MES DOCUMENTS */}
        {totalDocuments > 0 && (
          <section className="space-y-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--brand)' }}
            >
              Mes documents
            </p>
            <div className="card space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--brand)',
                    color: 'var(--brand-text-on-brand)',
                  }}
                >
                  {totalDocuments} disponible{totalDocuments > 1 ? 's' : ''}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {recentDocuments.map(d => (
                  <li key={d.id} className="py-2.5 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{d.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.category ?? 'Document'} · ajouté le {formatDateFr(d.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <a
                        className="btn-ghost p-1.5"
                        href={`/api/portail/archives/${d.id}?view=1`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Visualiser"
                        title="Visualiser"
                      >
                        <Eye size={14} />
                      </a>
                      <a
                        className="btn-ghost p-1.5"
                        href={`/api/portail/archives/${d.id}`}
                        aria-label="Télécharger"
                        title="Télécharger"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/portail/documents"
                className="text-sm hover:underline inline-flex items-center gap-1"
                style={{ color: 'var(--brand)' }}
              >
                {totalDocuments > 3 ? 'Voir tous les documents' : 'Voir la liste complète'} <ArrowRight size={12} />
              </Link>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground space-x-2">
        <a href="/portail/mentions-legales" className="hover:underline">Mentions légales</a>
        <span>·</span>
        <a href="/portail/politique-confidentialite" className="hover:underline">Politique de confidentialité</a>
        <span>·</span>
        <span>Propulsé par <a href="https://github.com/grx14/quittances-app" className="hover:underline">OpenQuittance</a></span>
      </footer>
    </div>
  );
}
