import { prisma } from './prisma';
import type { Locataire } from '@prisma/client';

// Indexation des loyers selon l'IRL (Indice de Référence des Loyers, INSEE).
//
// Formule de révision (loi du 6 juillet 1989, article 17-1) :
//
//   nouveau_loyer = loyer_initial × (IRL_courant / IRL_référence)
//
// Le bailleur peut appliquer la révision à la date anniversaire du bail
// (ou à toute date convenue dans le contrat), au plus tôt à la publication
// de l'IRL du trimestre de référence.

export interface IRLCalculResult {
  ancienLoyer: number;
  nouveauLoyer: number;
  variation: number; // % : (nouveau - ancien) / ancien * 100
  irlReference: number;
  irlNouveau: number;
  trimestre: number;
}

export function calculerRevisionIRL(opts: {
  loyerActuel: number;
  irlReference: number;
  irlNouveau: number;
  trimestre: number;
}): IRLCalculResult {
  const ratio = opts.irlNouveau / opts.irlReference;
  const nouveauLoyer = Math.round(opts.loyerActuel * ratio * 100) / 100;
  return {
    ancienLoyer: opts.loyerActuel,
    nouveauLoyer,
    variation: ((nouveauLoyer - opts.loyerActuel) / opts.loyerActuel) * 100,
    irlReference: opts.irlReference,
    irlNouveau: opts.irlNouveau,
    trimestre: opts.trimestre,
  };
}

export function periodeId(annee: number, trimestre: number): number {
  return annee * 10 + trimestre;
}

/**
 * Cherche le dernier IRL publié pour le trimestre donné, jusqu'à une année
 * limite incluse. Retourne null si aucun n'est saisi.
 */
export async function dernierIRLPourTrimestre(
  trimestre: number,
  anneeMax: number,
): Promise<{ valeur: number; annee: number; trimestre: number } | null> {
  const indice = await prisma.indiceIRL.findFirst({
    where: { trimestre, annee: { lte: anneeMax } },
    orderBy: [{ annee: 'desc' }],
  });
  if (!indice) return null;
  return { valeur: indice.valeur, annee: indice.annee, trimestre: indice.trimestre };
}

/**
 * Détermine la prochaine date de révision pour un locataire, en partant de
 * `dateRevisionAnnuelle` (ou `dateEntree`) et en avançant d'un an à la fois
 * jusqu'à dépasser `dernieresRevision?.dateEffet ?? dateEntree`.
 */
export function prochaineDateRevision(loc: Locataire, dernieresRevision?: Date | null): Date {
  const start = loc.dateRevisionAnnuelle ?? loc.dateEntree;
  const base = dernieresRevision ?? start;
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * Liste les locataires éligibles à une révision IRL :
 *   - irlTrimestre + irlValeurReference renseignés
 *   - prochaine date de révision <= aujourd'hui
 *   - un IRL existe pour ce trimestre à une année <= année courante
 */
/**
 * @param bailleurIds Optional scope. Si fourni, ne retourne que les
 *   locataires dont le bien.bailleurId est dans la liste. Si null/omis,
 *   tous les bailleurs (réservé au cron INSEE / admin app).
 */
export async function locatairesEligiblesRevision(
  bailleurIds?: string[],
): Promise<Array<{
  locataire: Locataire & { revisionsIRL: { dateEffet: Date }[] };
  prochaineDate: Date;
  calcul: IRLCalculResult;
}>> {
  const today = new Date();
  const locataires = await prisma.locataire.findMany({
    where: {
      actif: true,
      irlTrimestre: { not: null },
      irlValeurReference: { not: null },
      ...(bailleurIds ? { bien: { bailleurId: { in: bailleurIds } } } : {}),
    },
    include: {
      revisionsIRL: {
        where: { statut: 'APPLIED' },
        orderBy: { dateEffet: 'desc' },
        take: 1,
        select: { dateEffet: true },
      },
    },
  });

  const out: Array<{
    locataire: Locataire & { revisionsIRL: { dateEffet: Date }[] };
    prochaineDate: Date;
    calcul: IRLCalculResult;
  }> = [];

  for (const loc of locataires) {
    const dernieresRevision = loc.revisionsIRL[0]?.dateEffet ?? null;
    const prochaineDate = prochaineDateRevision(loc, dernieresRevision);
    if (prochaineDate > today) continue;

    const irl = await dernierIRLPourTrimestre(loc.irlTrimestre!, today.getFullYear());
    if (!irl) continue;
    if (irl.valeur === loc.irlValeurReference) continue; // pas de variation

    const calcul = calculerRevisionIRL({
      loyerActuel: loc.loyerNu,
      irlReference: loc.irlValeurReference!,
      irlNouveau: irl.valeur,
      trimestre: loc.irlTrimestre!,
    });
    out.push({ locataire: loc, prochaineDate, calcul });
  }

  return out;
}
