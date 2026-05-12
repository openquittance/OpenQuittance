import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, LogOut } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { brandingVars } from '@/lib/branding';
import PortailLogo from '../PortailLogo';
import QuittancesList, { type QuittanceRow } from './QuittancesList';

// Server Component (cf. /portail/page.tsx). Évite la race useSession()
// 'unauthenticated' au premier rendu qui déclenchait un push vers /portail/login
// puis un rebond middleware vers /portail (boucle silencieuse).
//
// Branding bailleur via variables CSS dérivées (cf. PORTAIL-BRANDING.md).

export default async function PortailQuittancesPage() {
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

  const quittancesDb = await prisma.quittance.findMany({
    where: {
      locataire: {
        tenantUserId: session.user.id,
        portailActif: true,
        partageQuittances: true,
      },
    },
    orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    include: { locataire: { select: { bien: { select: { adresse: true } } } } },
  });

  const quittances: QuittanceRow[] = quittancesDb.map(q => ({
    id: q.id,
    mois: q.mois,
    annee: q.annee,
    montantTotal: q.montantTotal,
    datePaiement: q.datePaiement.toISOString(),
    bienAdresse: q.locataire.bien.adresse,
  }));

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
          <h1 className="text-2xl font-semibold mt-2">Toutes vos quittances</h1>
        </div>

        {quittances.length === 0 ? (
          <div className="card text-center py-10 space-y-2">
            <FileText size={28} className="mx-auto text-muted-foreground" />
            <p className="font-medium">Aucune quittance disponible pour le moment.</p>
            <p className="text-sm text-muted-foreground">
              Vos quittances apparaîtront ici dès qu'elles seront générées par votre bailleur.
            </p>
          </div>
        ) : (
          <QuittancesList quittances={quittances} />
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
