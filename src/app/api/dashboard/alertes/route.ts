import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';
import { locatairesEligiblesRevision } from '@/lib/irl';

export const dynamic = 'force-dynamic';

export type Alerte =
  | {
      type: 'bail_expire';
      severity: 'info' | 'warning';
      locataireId: string;
      label: string;
      detail: string;
      dateRef: string;
      action: { label: string; href: string };
    }
  | {
      type: 'revision_irl';
      severity: 'info';
      locataireId: string;
      label: string;
      detail: string;
      action: { label: string; href: string };
    }
  | {
      type: 'quittance_manquante';
      severity: 'warning';
      locataireId: string;
      label: string;
      detail: string;
      action: { label: string; href: string };
    };

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  let bailleurId: string;
  try {
    ({ bailleurId } = withBailleurScope(
      session,
      req.nextUrl.searchParams.get('bailleurId'),
    ));
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }

  const today = new Date();
  const moisCourant = today.getMonth() + 1;
  const anneeCourante = today.getFullYear();

  // Délai d'alerte expiration de bail (en jours, configurable via AppConfig
  // — pour l'instant fixé à 90j, peut devenir un setting plus tard).
  const DELAI_BAIL_JOURS = 90;
  const limiteBail = new Date(today);
  limiteBail.setDate(limiteBail.getDate() + DELAI_BAIL_JOURS);

  // ── 1) Baux arrivant à expiration ──
  const baux = await prisma.locataire.findMany({
    where: {
      actif: true,
      bien: { bailleurId },
      dateSortie: { not: null, gte: today, lte: limiteBail },
    },
    select: { id: true, nom: true, prenom: true, dateSortie: true },
  });

  const alertesBail: Alerte[] = baux.map(l => {
    const joursRestants = Math.ceil(
      (l.dateSortie!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      type: 'bail_expire',
      severity: joursRestants <= 30 ? 'warning' : 'info',
      locataireId: l.id,
      label: `Bail ${l.prenom} ${l.nom} expire dans ${joursRestants} j`,
      detail: `Date de sortie : ${l.dateSortie!.toLocaleDateString('fr-FR')}`,
      dateRef: l.dateSortie!.toISOString(),
      action: { label: 'Voir le locataire', href: `/locataires#${l.id}` },
    };
  });

  // ── 2) Révisions IRL disponibles ──
  // locatairesEligiblesRevision() retourne tous les locataires (toutes
  // bailleurs confondus) — on filtre ici via les biens du bailleur courant.
  const eligibles = await locatairesEligiblesRevision();
  const biensDuBailleur = await prisma.bien.findMany({
    where: { bailleurId },
    select: { id: true },
  });
  const bienIds = new Set(biensDuBailleur.map(b => b.id));
  const alertesIRL: Alerte[] = eligibles
    .filter(e => bienIds.has(e.locataire.bienId))
    .map(e => ({
      type: 'revision_irl',
      severity: 'info',
      locataireId: e.locataire.id,
      label: `Révision IRL pour ${e.locataire.prenom} ${e.locataire.nom}`,
      detail: `${e.calcul.ancienLoyer.toFixed(2)} € → ${e.calcul.nouveauLoyer.toFixed(2)} € `
            + `(${e.calcul.variation >= 0 ? '+' : ''}${e.calcul.variation.toFixed(2)}%)`,
      action: { label: 'Voir', href: '/parametres/irl' },
    }));

  // ── 3) Locataires sans quittance pour le mois courant ──
  const locataires = await prisma.locataire.findMany({
    where: { actif: true, bien: { bailleurId } },
    select: { id: true, nom: true, prenom: true },
  });
  const quittances = await prisma.quittance.findMany({
    where: {
      mois: moisCourant,
      annee: anneeCourante,
      locataire: { bien: { bailleurId } },
    },
    select: { locataireId: true },
  });
  const avecQuittance = new Set(quittances.map(q => q.locataireId));
  const alertesQuittance: Alerte[] = locataires
    .filter(l => !avecQuittance.has(l.id))
    .map(l => ({
      type: 'quittance_manquante',
      severity: 'warning',
      locataireId: l.id,
      label: `Quittance manquante : ${l.prenom} ${l.nom}`,
      detail: `Aucune quittance générée pour ${moisCourant.toString().padStart(2, '0')}/${anneeCourante}`,
      action: { label: 'Générer', href: `/quittances?bailleurId=${bailleurId}` },
    }));

  return NextResponse.json({
    alertes: [...alertesBail, ...alertesIRL, ...alertesQuittance],
    counts: {
      bail_expire: alertesBail.length,
      revision_irl: alertesIRL.length,
      quittance_manquante: alertesQuittance.length,
    },
  });
}
