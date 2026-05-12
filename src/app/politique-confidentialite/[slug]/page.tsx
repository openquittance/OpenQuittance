/**
 * /politique-confidentialite/[slug] — page publique RGPD art. 13.
 * v2.8.0 Vague 2.
 */
import { prisma } from '@/lib/prisma';
import { buildPolitiqueConfidentialite, bailleurSlug } from '@/lib/legal-pages';
import LegalPageView from '@/components/LegalPageView';

export const dynamic = 'force-dynamic';

export default async function PolitiqueConfidentialitePage({
  params,
}: {
  params: { slug: string };
}) {
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
        <h1 className="text-2xl font-semibold">Politique de confidentialité non trouvée</h1>
        <p className="text-sm text-muted-foreground">
          Aucun bailleur ne correspond à ce slug.
        </p>
      </div>
    );
  }

  const sections = buildPolitiqueConfidentialite(bailleur);
  return (
    <LegalPageView
      bailleurNom={bailleur.nom}
      pageTitle="Politique de confidentialité"
      sections={sections}
    />
  );
}
