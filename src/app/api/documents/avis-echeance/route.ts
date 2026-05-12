import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { generateAvisEcheance } from '@/lib/pdf-documents';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  const { searchParams } = req.nextUrl;
  const locataireId = searchParams.get('locataireId');
  const mois = parseInt(searchParams.get('mois') || '0', 10);
  const annee = parseInt(searchParams.get('annee') || '0', 10);
  const dateEcheanceParam = searchParams.get('dateEcheance');

  if (!locataireId || mois < 1 || mois > 12 || annee < 2000) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
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

    const dateEcheance = dateEcheanceParam
      ? new Date(dateEcheanceParam)
      : new Date(Date.UTC(annee, mois - 1, 1));

    const buf = await generateAvisEcheance({
      locataire,
      bien: locataire.bien,
      bailleur: locataire.bien.bailleur,
      mois,
      annee,
      dateEcheance,
    });

    await logAudit({
      actorId: session.user!.id,
      action: 'document.generate',
      targetType: 'Locataire',
      targetId: locataire.id,
      metadata: {
        type: 'avis_echeance',
        mois, annee,
        bailleurId: locataire.bien.bailleurId,
      },
      ip: ipFromRequest(req),
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="avis-echeance-${locataire.nom}-${mois}-${annee}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
