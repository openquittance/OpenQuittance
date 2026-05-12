import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { generateCourrierRevision } from '@/lib/pdf-documents';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Génère le PDF du courrier de révision IRL.
 * Si une révision (DRAFT ou APPLIED) existe pour le locataire, on prend les
 * valeurs de la dernière. Sinon on attend les paramètres en query string.
 */
export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  const { searchParams } = req.nextUrl;
  const revisionId = searchParams.get('revisionId');
  const locataireId = searchParams.get('locataireId');

  try {
    const allowed = allowedBailleurIds(session);
    let revision = null;
    if (revisionId) {
      revision = await prisma.revisionIRL.findFirst({
        where: { id: revisionId, locataire: { bien: { bailleurId: { in: allowed } } } },
        include: { locataire: { include: { bien: { include: { bailleur: true } } } } },
      });
    } else if (locataireId) {
      revision = await prisma.revisionIRL.findFirst({
        where: { locataireId, locataire: { bien: { bailleurId: { in: allowed } } } },
        orderBy: { appliedAt: 'desc' },
        include: { locataire: { include: { bien: { include: { bailleur: true } } } } },
      });
    }

    if (!revision) {
      return NextResponse.json({ error: 'Aucune révision trouvée pour ce locataire' }, { status: 404 });
    }

    const buf = await generateCourrierRevision({
      locataire: revision.locataire,
      bien: revision.locataire.bien,
      bailleur: revision.locataire.bien.bailleur,
      ancienLoyer: revision.ancienLoyer,
      nouveauLoyer: revision.nouveauLoyer,
      irlReference: revision.irlReference,
      irlNouveau: revision.irlNouveau,
      trimestre: revision.trimestre,
      anneeIRL: revision.dateEffet.getFullYear(),
      dateEffet: revision.dateEffet,
    });

    await logAudit({
      actorId: session.user!.id,
      action: 'document.generate',
      targetType: 'Locataire',
      targetId: revision.locataireId,
      metadata: {
        type: 'courrier_revision',
        revisionId: revision.id,
        bailleurId: revision.locataire.bien.bailleurId,
      },
      ip: ipFromRequest(req),
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="revision-loyer-${revision.locataire.nom}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
