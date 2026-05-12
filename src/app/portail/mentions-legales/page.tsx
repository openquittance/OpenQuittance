/**
 * /portail/mentions-legales — version pour locataire connecté.
 * Détecte le bailleur via session.user → locataire → bien → bailleur.
 * v2.8.0 Vague 2.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { buildMentionsLegales } from '@/lib/legal-pages';
import LegalPageView from '@/components/LegalPageView';

export const dynamic = 'force-dynamic';

export default async function PortailMentionsLegalesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portail/login');

  const loc = await prisma.locataire.findFirst({
    where: { tenantUserId: session.user.id, portailActif: true },
    select: { bien: { select: { bailleur: true } } },
  });

  if (!loc?.bien.bailleur) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Mentions légales</h1>
        <p className="text-sm text-muted-foreground">
          Information non disponible — contactez votre bailleur.
        </p>
      </div>
    );
  }

  const sections = buildMentionsLegales(loc.bien.bailleur);
  return (
    <LegalPageView
      bailleurNom={loc.bien.bailleur.nom}
      pageTitle="Mentions légales"
      sections={sections}
      backHref="/portail"
      backLabel="Retour à mon espace"
    />
  );
}
