import { prisma } from './prisma';

/**
 * Calcule le solde d'avoir restant pour un locataire = somme des trop-perçus
 * passés non encore appliqués sur les quittances suivantes.
 *
 * solde = SUM(surplusLoyer + surplusCharges des quittances passées)
 *       - SUM(avoirAppliqueLoyer + avoirAppliqueCharges des quittances passées)
 *
 * Optionnellement, on peut exclure une quittance précise (utile lors de l'édition).
 */
export async function getAvoirSolde(
  locataireId: string,
  excludeQuittanceId?: string,
): Promise<{ soldeLoyer: number; soldeCharges: number; total: number }> {
  const quittances = await prisma.quittance.findMany({
    where: {
      locataireId,
      ...(excludeQuittanceId ? { id: { not: excludeQuittanceId } } : {}),
    },
    select: {
      surplusLoyer: true,
      surplusCharges: true,
      avoirAppliqueLoyer: true,
      avoirAppliqueCharges: true,
    },
  });

  const soldeLoyer = quittances.reduce(
    (s, q) => s + (q.surplusLoyer ?? 0) - (q.avoirAppliqueLoyer ?? 0),
    0,
  );
  const soldeCharges = quittances.reduce(
    (s, q) => s + (q.surplusCharges ?? 0) - (q.avoirAppliqueCharges ?? 0),
    0,
  );
  return {
    soldeLoyer: +soldeLoyer.toFixed(2),
    soldeCharges: +soldeCharges.toFixed(2),
    total: +(soldeLoyer + soldeCharges).toFixed(2),
  };
}

/**
 * Calcule le total dû d'une quittance compte tenu des avoirs appliqués.
 */
export function computeMontantTotal(
  loyerNu: number,
  charges: number,
  avoirAppliqueLoyer: number,
  avoirAppliqueCharges: number,
): number {
  return +((loyerNu - avoirAppliqueLoyer) + (charges - avoirAppliqueCharges)).toFixed(2);
}

/**
 * Quand l'utilisateur saisit un montant perçu supérieur au montant dû,
 * suggère une répartition par défaut du surplus (sur charges en priorité,
 * puis sur loyer).
 */
export function suggererSurplus(
  montantPercu: number,
  loyerNu: number,
  charges: number,
  avoirAppliqueLoyer: number,
  avoirAppliqueCharges: number,
): { surplusLoyer: number; surplusCharges: number } {
  const total = computeMontantTotal(loyerNu, charges, avoirAppliqueLoyer, avoirAppliqueCharges);
  const surplus = +(montantPercu - total).toFixed(2);
  if (surplus <= 0) return { surplusLoyer: 0, surplusCharges: 0 };
  return { surplusLoyer: 0, surplusCharges: surplus };
}
