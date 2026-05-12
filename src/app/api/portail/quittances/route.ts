import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Liste des quittances accessibles au TENANT loggué.
 *
 * Sécurité critique : filtre composite niveau Prisma — récupère uniquement
 * les Quittance dont locataire.tenantUserId === session.user.id ET
 * locataire.portailActiveLe IS NOT NULL. Pas de filtrage post-fetch.
 *
 * Cas multi-bail : un TENANT lié à N locataires du même bailleur voit
 * les quittances de tous ses baux (cf. test 22). Cas TENANT orphan
 * (sans bail actif) : retourne quittances=[] (pas d'erreur).
 *
 * Le middleware enforce déjà role === 'TENANT' sur /api/portail/*.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // Phase 1 doc sharing : portailActif=true ET partageQuittances=true.
  // Si l'un est false → retourne liste vide (Q7 cadrage : pas d'oracle, 200 + []).
  const quittances = await prisma.quittance.findMany({
    where: {
      locataire: {
        tenantUserId: session.user.id,
        portailActif: true,
        partageQuittances: true,
      },
    },
    orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    include: {
      locataire: {
        select: {
          id: true,
          bien: { select: { adresse: true, codePostal: true, ville: true } },
        },
      },
    },
  });

  await logAudit({
    actorId: session.user.id,
    action: 'tenant.quittances_list',
    metadata: { count: quittances.length },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({
    quittances: quittances.map(q => ({
      id: q.id,
      mois: q.mois,
      annee: q.annee,
      loyerNu: q.loyerNu,
      charges: q.charges,
      montantTotal: q.montantTotal,
      datePaiement: q.datePaiement,
      dateEmission: q.dateEmission,
      emailEnvoye: q.emailEnvoye,
      locataire: q.locataire,
    })),
  });
}
