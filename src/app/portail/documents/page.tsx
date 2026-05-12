import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, LogOut, Download, Eye, FileBox } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { brandingVars } from '@/lib/branding';
import { formatDateFr } from '@/lib/utils';
import PortailLogo from '../PortailLogo';

// Server Component "Mes documents" (Phase 1 Lot D).
// Source de vérité : /api/portail/documents (créé S1) — mais ici on lit
// directement la DB pour le rendu SSR initial. La logique de filtre est
// dupliquée + commentée pour rester cohérente.
// Cf. docs/PORTAIL-LOCATAIRE.md Phase 1 + tests T31-T33.

const CATEGORY_TOGGLE: Record<string, 'partageEtatDesLieux' | 'partageBail'> = {
  'edl-entree': 'partageEtatDesLieux',
  'edl-sortie': 'partageEtatDesLieux',
  bail: 'partageBail',
  contrat: 'partageBail',
};

const CATEGORY_LABEL: Record<string, string> = {
  'edl-entree': 'État des lieux d\'entrée',
  'edl-sortie': 'État des lieux de sortie',
  bail: 'Bail / Contrat',
  contrat: 'Bail / Contrat',
  'courrier-revision-irl': 'Courrier de révision de loyer',
  'preuve-depot-recommande': 'Preuve de dépôt recommandé',
};

export default async function PortailDocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portail/login');

  const locataires = await prisma.locataire.findMany({
    where: { tenantUserId: session.user.id, portailActif: true },
    include: { bien: { include: { bailleur: true } } },
  });

  if (locataires.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md space-y-3 text-center">
          <h1 className="font-semibold">Aucun bail actif.</h1>
          <p className="text-sm text-muted-foreground">Contactez votre bailleur.</p>
        </div>
      </div>
    );
  }

  const bailleur = locataires[0]!.bien.bailleur;
  const vars = brandingVars(bailleur.pdfCouleur);

  const locIds = locataires.map(l => l.id);
  const archivesAll = await prisma.archive.findMany({
    where: { ownerType: 'Locataire', ownerId: { in: locIds } },
    orderBy: { createdAt: 'desc' },
  });

  const togglesByLoc = new Map(locataires.map(l => [l.id, l]));
  const documents = archivesAll.filter(a => {
    const loc = togglesByLoc.get(a.ownerId);
    if (!loc) return false;
    const toggleKey = a.category ? CATEGORY_TOGGLE[a.category] : undefined;
    if (toggleKey) return loc[toggleKey];
    return a.visibleLocataire;
  });

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
          <Link
            href="/portail"
            className="text-sm hover:underline inline-flex items-center gap-1"
            style={{ color: 'var(--brand)' }}
          >
            <ArrowLeft size={14} /> Retour
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Mes documents</h1>
        </div>

        {documents.length === 0 ? (
          <div className="card text-center py-10 space-y-2">
            <FileBox size={28} className="mx-auto text-muted-foreground" />
            <p className="font-medium">Aucun document disponible pour le moment.</p>
            <p className="text-sm text-muted-foreground">
              Votre bailleur n'a pas encore partagé de document via le portail.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-border p-0 overflow-hidden">
            {documents.map(d => (
              <li key={d.id} className="px-4 py-3 flex items-center gap-3">
                <FileText size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{d.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.category && (CATEGORY_LABEL[d.category] ?? d.category)} · ajouté le {formatDateFr(d.createdAt)}
                  </p>
                </div>
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
              </li>
            ))}
          </ul>
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
