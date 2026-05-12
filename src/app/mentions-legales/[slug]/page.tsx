/**
 * /mentions-legales/[slug] — page publique LCEN art. 6.
 * v2.8.0 Vague 2. SSR pur, accessible sans auth.
 */
import { prisma } from '@/lib/prisma';
import { buildMentionsLegales, bailleurSlug } from '@/lib/legal-pages';
import LegalPageView from '@/components/LegalPageView';

export const dynamic = 'force-dynamic';

export default async function MentionsLegalesPage({
  params,
}: {
  params: { slug: string };
}) {
  // Pas d'index slug en DB — fetch tous bailleurs actifs et match côté JS.
  // Volume faible (1-10 bailleurs / instance), pas de scaling concern.
  const bailleurs = await prisma.bailleur.findMany({
    where: { actif: true },
    select: {
      id: true, nom: true, rcs: true,
      adresseLigne1: true, adresseLigne2: true, villeSignature: true,
      telephone: true, logoUrl: true, signatureUrl: true,
      pdfCouleur: true, pdfPolice: true, signatureLogoOpacity: true, actif: true,
      raisonSociale: true, formeJuridique: true, siret: true,
      adresseLegale: true, emailRgpd: true, directeurPublication: true,
      hebergeur: true,
      createdAt: true, updatedAt: true,
    },
  });
  const bailleur = bailleurs.find(b => bailleurSlug(b.nom) === params.slug);

  if (!bailleur) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Mentions légales non trouvées</h1>
        <p className="text-sm text-muted-foreground">
          Aucun bailleur ne correspond à ce slug.
        </p>
      </div>
    );
  }

  const sections = buildMentionsLegales(bailleur);
  return (
    <LegalPageView
      bailleurNom={bailleur.nom}
      pageTitle="Mentions légales"
      sections={sections}
    />
  );
}
