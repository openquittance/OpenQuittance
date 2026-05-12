import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { generateEtatDesLieux, type EtatDesLieuxType } from '@/lib/pdf-documents';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  const { searchParams } = req.nextUrl;
  const locataireId = searchParams.get('locataireId');
  const type = searchParams.get('type') as EtatDesLieuxType | null;
  const dateParam = searchParams.get('date');

  if (!locataireId || !type || !['ENTREE', 'SORTIE'].includes(type)) {
    return NextResponse.json({ error: 'Paramètres invalides (locataireId + type=ENTREE|SORTIE requis)' }, { status: 400 });
  }

  try {
    const allowed = allowedBailleurIds(session);
    const locataire = await prisma.locataire.findFirst({
      where: { id: locataireId, bien: { bailleurId: { in: allowed } } },
      include: { bien: { include: { bailleur: true } } },
    });
    if (!locataire) {
      return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
    }

    const date = dateParam
      ? new Date(dateParam)
      : (type === 'ENTREE' ? locataire.dateEntree : (locataire.dateSortie ?? new Date()));

    const buf = await generateEtatDesLieux({
      locataire,
      bien: locataire.bien,
      bailleur: locataire.bien.bailleur,
      type,
      date,
    });

    await logAudit({
      actorId: session.user!.id,
      action: 'document.generate',
      targetType: 'Locataire',
      targetId: locataire.id,
      metadata: { type: 'etat_des_lieux', edlType: type, bailleurId: locataire.bien.bailleurId },
      ip: ipFromRequest(req),
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="etat-des-lieux-${type.toLowerCase()}-${locataire.nom}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
